// Private, inactive preparation boundary. This file does not install, import,
// authorize, or automatically load a model. The Kotlin caller verifies the
// allowlisted model digest on the same open descriptor before invoking JNI.
// llama.cpp is pinned by the owning CMake/workflow, not resolved at runtime.

#include <jni.h>
#include "llama.h"

#include <fcntl.h>
#include <sys/stat.h>
#include <time.h>
#include <unistd.h>

#include <algorithm>
#include <atomic>
#include <cstdint>
#include <cstdio>
#include <cstring>
#include <limits>
#include <memory>
#include <mutex>
#include <string>
#include <utility>
#include <vector>

namespace {

enum class Status : jint {
    SUCCESS_EOG = 0,
    CANCELLED = 1,
    DEADLINE = 2,
    INVALID_INPUT = 3,
    UNAVAILABLE = 4,
    FAILURE = 5,
    LIMIT_REACHED = 6,
};

constexpr jsize MAX_INPUT_BYTES = 8192;
constexpr jint MIN_CONTEXT_TOKENS = 256;
constexpr jint MAX_CONTEXT_TOKENS = 2048;
constexpr jint MAX_OUTPUT_TOKENS = 256;
constexpr jint MAX_OUTPUT_BYTES = 32768;
constexpr int32_t MAX_FORMATTED_BYTES = 32768;
constexpr size_t MAX_TEMPLATE_BYTES = 65536;
constexpr int32_t MAX_VOCAB_TOKENS = 1000000;
constexpr int32_t BATCH_TOKENS = 128;
constexpr jlong MAX_BUDGET_NANOS = 30000000000LL;
constexpr off_t EXPECTED_MODEL_BYTES = 1280835840LL;

enum class Phase { RESERVED, RUNNING, FINISHED };

struct Session {
    explicit Session(jlong value) : id(value) {}
    const jlong id;
    std::atomic<bool> cancelled{false};
    std::atomic<bool> cleanup_failed{false};
    // Worker-owned; used again after native teardown before exposing success.
    int64_t deadline_nanos = 0;
    // Only accessed under session_mutex. This is private resource ownership,
    // not a second product session, capability registry, or authority source.
    Phase phase = Phase::RESERVED;
};

std::mutex session_mutex;
std::shared_ptr<Session> reserved_session;
jlong next_session_id = 1;

struct Outcome {
    Status status = Status::FAILURE;
    std::string output;
    jint input_tokens = 0;
    jint output_tokens = 0;
};

Outcome failed(Status status, jint input_tokens = 0, jint output_tokens = 0) {
    return {status, {}, input_tokens, output_tokens};
}

bool monotonic_nanos(int64_t & value) noexcept {
    timespec time{};
    if (clock_gettime(CLOCK_MONOTONIC, &time) != 0 || time.tv_sec < 0 ||
        time.tv_nsec < 0 || time.tv_nsec >= 1000000000L) {
        return false;
    }
    constexpr int64_t billion = 1000000000LL;
    const auto seconds = static_cast<uint64_t>(time.tv_sec);
    if (seconds > static_cast<uint64_t>(std::numeric_limits<int64_t>::max() / billion)) {
        return false;
    }
    const int64_t whole = static_cast<int64_t>(seconds) * billion;
    if (whole > std::numeric_limits<int64_t>::max() - time.tv_nsec) {
        return false;
    }
    value = whole + time.tv_nsec;
    return true;
}

struct Control {
    Session & session;
    int64_t deadline_nanos;

    Status stop_status() const noexcept {
        if (session.cancelled.load(std::memory_order_acquire)) {
            return Status::CANCELLED;
        }
        int64_t now = 0;
        if (!monotonic_nanos(now)) {
            return Status::FAILURE;
        }
        return now >= deadline_nanos ? Status::DEADLINE : Status::SUCCESS_EOG;
    }
};

bool load_progress(float, void * opaque) noexcept {
    return static_cast<Control *>(opaque)->stop_status() == Status::SUCCESS_EOG;
}

bool abort_decode(void * opaque) noexcept {
    return static_cast<Control *>(opaque)->stop_status() != Status::SUCCESS_EOG;
}

void discard_native_log(ggml_log_level, const char *, void *) noexcept {
    // Upstream metadata/token logging is intentionally not exposed to logcat.
}

class RunningScope {
public:
    explicit RunningScope(std::shared_ptr<Session> session) : session_(std::move(session)) {}
    RunningScope(const RunningScope &) = delete;
    RunningScope & operator=(const RunningScope &) = delete;
    ~RunningScope() {
        // Declared before model/file resources, so RUNNING remains true until
        // their destructors have completed, including on C++ exceptions.
        std::lock_guard<std::mutex> lock(session_mutex);
        session_->phase = Phase::FINISHED;
    }
private:
    std::shared_ptr<Session> session_;
};

class OwnedFd {
public:
    OwnedFd(int fd, Session & session) : fd_(fd), session_(session) {}
    OwnedFd(const OwnedFd &) = delete;
    OwnedFd & operator=(const OwnedFd &) = delete;
    ~OwnedFd() {
        if (fd_ >= 0 && close(fd_) != 0) {
            session_.cleanup_failed.store(true, std::memory_order_release);
        }
    }
    int get() const noexcept { return fd_; }
    int release() noexcept {
        const int value = fd_;
        fd_ = -1;
        return value;
    }
private:
    int fd_;
    Session & session_;
};

class OwnedFile {
public:
    OwnedFile(FILE * file, Session & session) : file_(file), session_(session) {}
    OwnedFile(const OwnedFile &) = delete;
    OwnedFile & operator=(const OwnedFile &) = delete;
    ~OwnedFile() {
        if (file_ != nullptr && std::fclose(file_) != 0) {
            // Never retry close on an uncertain fd: it might already have
            // been reused. Keep the reservation quarantined instead.
            session_.cleanup_failed.store(true, std::memory_order_release);
        }
    }
    FILE * get() const noexcept { return file_; }
private:
    FILE * file_;
    Session & session_;
};

class BackendScope {
public:
    BackendScope() = default;
    void start() {
        llama_log_set(discard_native_log, nullptr);
        started_ = true;
        llama_backend_init();
    }
    BackendScope(const BackendScope &) = delete;
    BackendScope & operator=(const BackendScope &) = delete;
    ~BackendScope() { if (started_) { llama_backend_free(); } }
private:
    bool started_ = false;
};

class BatchScope {
public:
    BatchScope() : value(llama_batch_init(BATCH_TOKENS, 0, 1)) {}
    BatchScope(const BatchScope &) = delete;
    BatchScope & operator=(const BatchScope &) = delete;
    ~BatchScope() { llama_batch_free(value); }
    llama_batch value;
};

// Strict UTF-8, not JNI's modified UTF-8. NUL is excluded because the model
// template API consumes C strings. No replacement decoding or truncation.
bool valid_utf8(const std::string & text) noexcept {
    for (size_t i = 0; i < text.size();) {
        const auto first = static_cast<unsigned char>(text[i]);
        if (first == 0) { return false; }
        if (first < 0x80) { ++i; continue; }
        size_t length = 0;
        uint32_t value = 0;
        uint32_t minimum = 0;
        if (first >= 0xc2 && first <= 0xdf) {
            length = 2; value = first & 0x1fU; minimum = 0x80;
        } else if (first >= 0xe0 && first <= 0xef) {
            length = 3; value = first & 0x0fU; minimum = 0x800;
        } else if (first >= 0xf0 && first <= 0xf4) {
            length = 4; value = first & 0x07U; minimum = 0x10000;
        } else {
            return false;
        }
        if (length > text.size() - i) { return false; }
        for (size_t j = 1; j < length; ++j) {
            const auto next = static_cast<unsigned char>(text[i + j]);
            if ((next & 0xc0U) != 0x80U) { return false; }
            value = (value << 6U) | (next & 0x3fU);
        }
        if (value < minimum || value > 0x10ffffU ||
            (value >= 0xd800U && value <= 0xdfffU)) {
            return false;
        }
        i += length;
    }
    return true;
}

bool usable_model_fd(int fd, struct stat & before) noexcept {
    const int flags = fcntl(fd, F_GETFL);
    return flags >= 0 && (flags & O_ACCMODE) == O_RDONLY &&
        fstat(fd, &before) == 0 && S_ISREG(before.st_mode) &&
        before.st_uid == getuid() && before.st_size == EXPECTED_MODEL_BYTES &&
        (before.st_mode & (S_IWGRP | S_IWOTH)) == 0;
}

bool unchanged_model_fd(int fd, const struct stat & before) noexcept {
    struct stat after{};
    return fstat(fd, &after) == 0 &&
        after.st_dev == before.st_dev && after.st_ino == before.st_ino &&
        after.st_uid == before.st_uid && after.st_mode == before.st_mode &&
        after.st_size == before.st_size &&
        after.st_mtim.tv_sec == before.st_mtim.tv_sec &&
        after.st_mtim.tv_nsec == before.st_mtim.tv_nsec &&
        after.st_ctim.tv_sec == before.st_ctim.tv_sec &&
        after.st_ctim.tv_nsec == before.st_ctim.tv_nsec;
}

Status plain_user_message(const llama_vocab * vocab, const std::string & text,
                          Control & control) {
    const int32_t count = llama_vocab_n_tokens(vocab);
    if (count <= 0 || count > MAX_VOCAB_TOKENS) { return Status::UNAVAILABLE; }
    // Formatting later requires parse_special=true for the trusted template.
    // Reject matching model-defined special/control markers in the untrusted
    // user text first; this is not a general prompt-injection/DLP guarantee.
    constexpr int forbidden = LLAMA_TOKEN_ATTR_CONTROL | LLAMA_TOKEN_ATTR_USER_DEFINED |
                              LLAMA_TOKEN_ATTR_UNKNOWN;
    for (llama_token token = 0; token < count; ++token) {
        if ((token & 255) == 0) {
            const Status stop = control.stop_status();
            if (stop != Status::SUCCESS_EOG) { return stop; }
        }
        if ((static_cast<int>(llama_vocab_get_attr(vocab, token)) & forbidden) == 0) { continue; }
        const char * marker = llama_vocab_get_text(vocab, token);
        if (marker == nullptr) { return Status::UNAVAILABLE; }
        const size_t length = strnlen(marker, text.size() + 1);
        if (length > 0 && length <= text.size() && text.find(marker, 0, length) != std::string::npos) {
            return Status::INVALID_INPUT;
        }
    }
    return control.stop_status();
}

Status decode_batch(llama_context * context, llama_batch & batch, Control & control) {
    Status stop = control.stop_status();
    if (stop != Status::SUCCESS_EOG) { return stop; }
    const int32_t result = llama_decode(context, batch);
    stop = control.stop_status();
    if (stop != Status::SUCCESS_EOG) { return stop; }
    if (result == 0) { return Status::SUCCESS_EOG; }
    if (result == 1) { return Status::LIMIT_REACHED; }
    // rc2 is abort, not EOG. If neither our cancel nor deadline explains it,
    // keep it an engine failure rather than accepting a partial response.
    return Status::FAILURE;
}

Outcome run_generation(JNIEnv * env, Session & session, jint model_fd,
                       jbyteArray prompt_utf8, jint max_output_tokens,
                       jint max_output_bytes, jint context_tokens,
                       jlong remaining_budget_nanos) {
    if (prompt_utf8 == nullptr || model_fd < 0 ||
        max_output_tokens < 1 || max_output_tokens > MAX_OUTPUT_TOKENS ||
        max_output_bytes < 1 || max_output_bytes > MAX_OUTPUT_BYTES ||
        context_tokens < MIN_CONTEXT_TOKENS || context_tokens > MAX_CONTEXT_TOKENS ||
        remaining_budget_nanos <= 0 || remaining_budget_nanos > MAX_BUDGET_NANOS) {
        return failed(Status::INVALID_INPUT);
    }
    int64_t now = 0;
    if (!monotonic_nanos(now) ||
        now > std::numeric_limits<int64_t>::max() - remaining_budget_nanos) {
        return failed(Status::FAILURE);
    }
    session.deadline_nanos = now + remaining_budget_nanos;
    Control control{session, session.deadline_nanos};
    Status stop = control.stop_status();
    if (stop != Status::SUCCESS_EOG) { return failed(stop); }
    const jsize input_size = env->GetArrayLength(prompt_utf8);
    if (env->ExceptionCheck()) { return failed(Status::FAILURE); }
    if (input_size < 1 || input_size > MAX_INPUT_BYTES) { return failed(Status::INVALID_INPUT); }
    std::string input(static_cast<size_t>(input_size), '\0');
    env->GetByteArrayRegion(prompt_utf8, 0, input_size, reinterpret_cast<jbyte *>(input.data()));
    if (env->ExceptionCheck()) { return failed(Status::FAILURE); }
    if (!valid_utf8(input)) { return failed(Status::INVALID_INPUT); }

    // Duplicate the verified open file, never re-open its pathname. dup shares
    // the file offset, so the caller keeps exclusive worker ownership of the
    // original descriptor until this call and subsequent release complete.
    OwnedFd duplicate(fcntl(model_fd, F_DUPFD_CLOEXEC, 0), session);
    struct stat model_before{};
    if (duplicate.get() < 0 || !usable_model_fd(duplicate.get(), model_before)) {
        return failed(Status::INVALID_INPUT);
    }
    FILE * stream = fdopen(duplicate.get(), "rb");
    if (stream == nullptr) { return failed(Status::FAILURE); }
    duplicate.release();
    OwnedFile file(stream, session);
    if (fseeko(file.get(), 0, SEEK_SET) != 0) { return failed(Status::FAILURE); }
    stop = control.stop_status();
    if (stop != Status::SUCCESS_EOG) { return failed(stop); }

    BackendScope backend;
    backend.start();
    auto model_params = llama_model_default_params();
    model_params.n_gpu_layers = 0;
    model_params.load_mode = LLAMA_LOAD_MODE_MMAP;
    model_params.lazy_mode = LLAMA_LAZY_MODE_OFF;
    model_params.progress_callback = load_progress;
    model_params.progress_callback_user_data = &control;
    using Model = std::unique_ptr<llama_model, decltype(&llama_model_free)>;
    Model model(llama_model_load_from_file_ptr(file.get(), model_params), llama_model_free);
    stop = control.stop_status();
    if (stop != Status::SUCCESS_EOG) { return failed(stop); }
    if (!model) { return failed(Status::UNAVAILABLE); }
    if (!unchanged_model_fd(fileno(file.get()), model_before)) { return failed(Status::FAILURE); }

    const llama_vocab * vocab = llama_model_get_vocab(model.get());
    if (vocab == nullptr || llama_model_has_encoder(model.get()) ||
        !llama_model_has_decoder(model.get())) { return failed(Status::UNAVAILABLE); }
    stop = plain_user_message(vocab, input, control);
    if (stop != Status::SUCCESS_EOG) { return failed(stop); }
    const char * model_template = llama_model_chat_template(model.get(), nullptr);
    if (model_template == nullptr ||
        strnlen(model_template, MAX_TEMPLATE_BYTES + 1) > MAX_TEMPLATE_BYTES) {
        return failed(Status::UNAVAILABLE);
    }
    // llama_chat_apply_template accepts known builtin templates only. Unknown
    // or absent templates are refused; never supply nullptr (ChatML fallback).
    const llama_chat_message message{"user", input.c_str()};
    std::vector<char> formatted_storage(static_cast<size_t>(MAX_FORMATTED_BYTES));
    const int32_t formatted_size = llama_chat_apply_template(
        model_template, &message, 1, true, formatted_storage.data(), MAX_FORMATTED_BYTES);
    if (formatted_size <= 0) { return failed(Status::UNAVAILABLE); }
    if (formatted_size > MAX_FORMATTED_BYTES) { return failed(Status::LIMIT_REACHED); }
    const std::string formatted(formatted_storage.data(), static_cast<size_t>(formatted_size));
    if (!valid_utf8(formatted)) { return failed(Status::UNAVAILABLE); }
    std::vector<llama_token> tokens(static_cast<size_t>(context_tokens));
    const int32_t input_tokens = llama_tokenize(vocab, formatted.data(), formatted_size,
                                               tokens.data(), context_tokens, true, true);
    if (input_tokens < 0) { return failed(Status::LIMIT_REACHED); }
    if (input_tokens == 0) { return failed(Status::UNAVAILABLE); }
    if (input_tokens > context_tokens - max_output_tokens) {
        return failed(Status::LIMIT_REACHED, input_tokens);
    }
    stop = control.stop_status();
    if (stop != Status::SUCCESS_EOG) { return failed(stop, input_tokens); }

    auto context_params = llama_context_default_params();
    context_params.n_ctx = static_cast<uint32_t>(context_tokens);
    context_params.n_batch = BATCH_TOKENS;
    context_params.n_ubatch = BATCH_TOKENS;
    context_params.n_seq_max = 1;
    context_params.n_threads = 2;
    context_params.n_threads_batch = 2;
    context_params.offload_kqv = false;
    context_params.op_offload = false;
    context_params.no_perf = true;
    context_params.abort_callback = abort_decode;
    context_params.abort_callback_data = &control;
    using Context = std::unique_ptr<llama_context, decltype(&llama_free)>;
    Context context(llama_init_from_model(model.get(), context_params), llama_free);
    stop = control.stop_status();
    if (stop != Status::SUCCESS_EOG) { return failed(stop, input_tokens); }
    if (!context) { return failed(Status::UNAVAILABLE, input_tokens); }
    using Sampler = std::unique_ptr<llama_sampler, decltype(&llama_sampler_free)>;
    Sampler sampler(llama_sampler_init_greedy(), llama_sampler_free);
    if (!sampler) { return failed(Status::UNAVAILABLE, input_tokens); }
    BatchScope batch;
    if (batch.value.token == nullptr || batch.value.pos == nullptr ||
        batch.value.n_seq_id == nullptr || batch.value.seq_id == nullptr ||
        batch.value.logits == nullptr) {
        return failed(Status::FAILURE, input_tokens);
    }
    for (int32_t i = 0; i < BATCH_TOKENS; ++i) {
        if (batch.value.seq_id[i] == nullptr) { return failed(Status::FAILURE, input_tokens); }
    }
    for (int32_t start = 0; start < input_tokens; start += BATCH_TOKENS) {
        const int32_t count = std::min(BATCH_TOKENS, input_tokens - start);
        batch.value.n_tokens = count;
        for (int32_t i = 0; i < count; ++i) {
            batch.value.token[i] = tokens[static_cast<size_t>(start + i)];
            batch.value.pos[i] = start + i;
            batch.value.n_seq_id[i] = 1;
            batch.value.seq_id[i][0] = 0;
            batch.value.logits[i] = (start + i == input_tokens - 1);
        }
        stop = decode_batch(context.get(), batch.value, control);
        if (stop != Status::SUCCESS_EOG) { return failed(stop, input_tokens); }
    }

    std::string output;
    output.reserve(static_cast<size_t>(max_output_bytes));
    std::vector<char> piece_storage(static_cast<size_t>(max_output_bytes));
    for (jint generated = 0; generated < max_output_tokens; ++generated) {
        stop = control.stop_status();
        if (stop != Status::SUCCESS_EOG) { return failed(stop, input_tokens, generated); }
        // llama_sampler_sample already accepts the token. Do not double-accept.
        const llama_token token = llama_sampler_sample(sampler.get(), context.get(), -1);
        if (token < 0 || token >= llama_vocab_n_tokens(vocab)) {
            return failed(Status::FAILURE, input_tokens, generated);
        }
        if (llama_vocab_is_eog(vocab, token)) {
            stop = control.stop_status();
            if (stop != Status::SUCCESS_EOG) { return failed(stop, input_tokens, generated); }
            if (!unchanged_model_fd(fileno(file.get()), model_before) ||
                output.empty() || !valid_utf8(output)) {
                return failed(Status::FAILURE, input_tokens, generated);
            }
            return {Status::SUCCESS_EOG, std::move(output), input_tokens, generated};
        }
        if (llama_vocab_is_control(vocab, token)) {
            return failed(Status::FAILURE, input_tokens, generated);
        }
        const int32_t piece_size = llama_token_to_piece(vocab, token, piece_storage.data(),
                                                       max_output_bytes, 0, false);
        if (piece_size < 0 || static_cast<size_t>(piece_size) >
                static_cast<size_t>(max_output_bytes) - output.size()) {
            return failed(Status::LIMIT_REACHED, input_tokens, generated);
        }
        output.append(piece_storage.data(), static_cast<size_t>(piece_size));
        // Explicit positions and loop count: no context shifting, replay,
        // silent prompt truncation, or extra budget based on prompt length.
        batch.value.n_tokens = 1;
        batch.value.token[0] = token;
        batch.value.pos[0] = input_tokens + generated;
        batch.value.n_seq_id[0] = 1;
        batch.value.seq_id[0][0] = 0;
        batch.value.logits[0] = true;
        stop = decode_batch(context.get(), batch.value, control);
        if (stop != Status::SUCCESS_EOG) { return failed(stop, input_tokens, generated + 1); }
    }
    return failed(Status::LIMIT_REACHED, input_tokens, max_output_tokens);
}

jobject result_object(JNIEnv * env, Outcome outcome) {
    if (env->ExceptionCheck()) { return nullptr; }
    if (outcome.status != Status::SUCCESS_EOG) { outcome.output.clear(); }
    jclass result_class = env->FindClass("ai/aurora/device/inference/NativeGenerationResult");
    if (result_class == nullptr) { return nullptr; }
    jmethodID constructor = env->GetMethodID(result_class, "<init>", "(I[BII)V");
    if (constructor == nullptr) {
        env->DeleteLocalRef(result_class);
        return nullptr;
    }
    jbyteArray bytes = env->NewByteArray(static_cast<jsize>(outcome.output.size()));
    if (bytes == nullptr) {
        env->DeleteLocalRef(result_class);
        return nullptr;
    }
    if (!outcome.output.empty()) {
        env->SetByteArrayRegion(bytes, 0, static_cast<jsize>(outcome.output.size()),
                               reinterpret_cast<const jbyte *>(outcome.output.data()));
    }
    jobject result = nullptr;
    if (!env->ExceptionCheck()) {
        result = env->NewObject(result_class, constructor, static_cast<jint>(outcome.status),
                                bytes, outcome.input_tokens, outcome.output_tokens);
    }
    env->DeleteLocalRef(bytes);
    env->DeleteLocalRef(result_class);
    return result;
}

}  // namespace

extern "C" JNIEXPORT jlong JNICALL
Java_ai_aurora_device_inference_NativeLlamaBindings_reserve(JNIEnv *, jclass) {
    try {
        std::lock_guard<std::mutex> lock(session_mutex);
        if (reserved_session || next_session_id == std::numeric_limits<jlong>::max()) { return 0; }
        auto session = std::make_shared<Session>(next_session_id);
        ++next_session_id;
        reserved_session = std::move(session);
        return reserved_session->id;
    } catch (...) {
        return 0;
    }
}

extern "C" JNIEXPORT jobject JNICALL
Java_ai_aurora_device_inference_NativeLlamaBindings_generate(
        JNIEnv * env, jclass, jlong id, jint model_fd, jbyteArray prompt_utf8,
        jint max_output_tokens, jint max_output_bytes, jint context_tokens,
        jlong remaining_budget_nanos) {
    std::shared_ptr<Session> session;
    Outcome outcome;
    try {
        {
            std::lock_guard<std::mutex> lock(session_mutex);
            if (id > 0 && reserved_session && reserved_session->id == id &&
                reserved_session->phase == Phase::RESERVED) {
                session = reserved_session;
                session->phase = Phase::RUNNING;
            }
        }
        // Never allocate Java objects or invoke a constructor under the
        // native ownership mutex: class initialization can re-enter JNI.
        if (!session) { return result_object(env, failed(Status::INVALID_INPUT)); }
        {
            RunningScope running(session);
            outcome = run_generation(env, *session, model_fd, prompt_utf8, max_output_tokens,
                                     max_output_bytes, context_tokens, remaining_budget_nanos);
        }
        if (session->cleanup_failed.load(std::memory_order_acquire)) {
            outcome = failed(Status::FAILURE, outcome.input_tokens, outcome.output_tokens);
        } else if (session->cancelled.load(std::memory_order_acquire)) {
            outcome = failed(Status::CANCELLED, outcome.input_tokens, outcome.output_tokens);
        } else if (outcome.status == Status::SUCCESS_EOG) {
            int64_t after_cleanup = 0;
            if (!monotonic_nanos(after_cleanup) || session->deadline_nanos <= 0) {
                outcome = failed(Status::FAILURE, outcome.input_tokens, outcome.output_tokens);
            } else if (after_cleanup >= session->deadline_nanos) {
                outcome = failed(Status::DEADLINE, outcome.input_tokens, outcome.output_tokens);
            }
        }
    } catch (...) {
        // C++ exceptions never cross JNI. Process-fatal signals/OOM inside
        // upstream are not falsely represented as caught or physically proven.
        outcome = failed(Status::FAILURE);
    }
    try {
        return result_object(env, std::move(outcome));
    } catch (...) {
        return nullptr;
    }
}

extern "C" JNIEXPORT jboolean JNICALL
Java_ai_aurora_device_inference_NativeLlamaBindings_cancel(JNIEnv *, jclass, jlong id) {
    try {
        std::lock_guard<std::mutex> lock(session_mutex);
        if (id <= 0 || !reserved_session || reserved_session->id != id) { return JNI_FALSE; }
        // This does not close/free a model, context or descriptor on the
        // cancelling thread. Pre-generation cancellation is never reset.
        reserved_session->cancelled.store(true, std::memory_order_release);
        return JNI_TRUE;
    } catch (...) {
        return JNI_FALSE;
    }
}

extern "C" JNIEXPORT jboolean JNICALL
Java_ai_aurora_device_inference_NativeLlamaBindings_release(JNIEnv *, jclass, jlong id) {
    try {
        std::lock_guard<std::mutex> lock(session_mutex);
        if (id <= 0 || !reserved_session || reserved_session->id != id ||
            reserved_session->phase == Phase::RUNNING ||
            reserved_session->cleanup_failed.load(std::memory_order_acquire)) {
            return JNI_FALSE;
        }
        reserved_session.reset();
        return JNI_TRUE;
    } catch (...) {
        return JNI_FALSE;
    }
}
