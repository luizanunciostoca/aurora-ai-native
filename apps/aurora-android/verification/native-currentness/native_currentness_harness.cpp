// Host regression harness, not a JVM, Android runtime, or inference test.
// Compile the COMPLETE production translation unit against the real jni.h ABI.
// Only the JNI function table and the llama engine are deterministic test doubles.
// The optional source override belongs exclusively to this harness and lets a
// reviewer compile an exact old source blob for a RED regression demonstration.
#ifndef AURORA_CURRENTNESS_SOURCE
#define AURORA_CURRENTNESS_SOURCE "../../app/src/main/cpp/aurora_llama_jni.cpp"
#endif
#include AURORA_CURRENTNESS_SOURCE

#include <chrono>
#include <condition_variable>
#include <cstdarg>
#include <exception>
#include <functional>
#include <iostream>
#include <stdexcept>
#include <thread>
#include <type_traits>

namespace harness {

int assertion_count = 0;

void require(bool condition, const std::string & message) {
    ++assertion_count;
    if (!condition) { throw std::runtime_error(message); }
}

struct Bytes : _jbyteArray { std::vector<jbyte> value; };
struct Result : _jobject {
    jint status = -1;
    std::string output;
    jint input_tokens = 0;
    jint output_tokens = 0;
};

class Gate {
public:
    void block() {
        std::unique_lock<std::mutex> lock(mutex_);
        entered_ = true;
        changed_.notify_all();
        changed_.wait(lock, [&] { return opened_; });
    }
    bool await_entry() {
        std::unique_lock<std::mutex> lock(mutex_);
        return changed_.wait_for(lock, std::chrono::seconds(3), [&] {
            return entered_ || completed_;
        }) && entered_;
    }
    void open() {
        std::lock_guard<std::mutex> lock(mutex_);
        opened_ = true;
        changed_.notify_all();
    }
    void completed() {
        std::lock_guard<std::mutex> lock(mutex_);
        completed_ = true;
        changed_.notify_all();
    }
private:
    std::mutex mutex_;
    std::condition_variable changed_;
    bool entered_ = false;
    bool opened_ = false;
    bool completed_ = false;
};

struct State {
    std::thread::id owner;
    std::atomic<int> jni_calls{0};
    std::atomic<int> wrong_thread_jni{0};
    std::atomic<int> callback_calls{0};
    std::atomic<int> callback_method_lookups{0};
    std::atomic<int> exception_clears{0};
    std::atomic<int> exception_describes{0};
    std::atomic<int> backend_starts{0};
    std::atomic<int> loads{0};
    std::atomic<int> decodes{0};
    std::atomic<int> samples{0};
    std::atomic<int> progress_calls{0};
    std::atomic<int> abort_calls{0};
    std::atomic<int> teardown_calls{0};
    std::atomic<int> premature_finished{0};
    std::atomic<bool> stopped{false};
    std::atomic<bool> stop_once{false};
    std::atomic<bool> throw_once{false};
    std::atomic<bool> pending_exception{false};
    std::atomic<bool> backend_freed{false};
    bool missing_method = false;
    bool native_thread_callbacks = false;
    std::function<void()> during_load;
    std::function<void()> before_first_decode;
    std::function<void()> during_decode;
    std::function<void()> during_eog;
    std::function<void()> during_model_free;
    std::function<void()> during_callback;
    _jobject currentness;
    _jclass currentness_class;
    _jclass result_class;
    char currentness_method = 0;
    char result_constructor = 0;
    llama_vocab vocab;
    llama_context_params context_params;
    std::vector<std::unique_ptr<Bytes>> arrays;
    std::vector<std::unique_ptr<Result>> results;
};

State * active = nullptr;

bool on_owner_thread() {
    active->jni_calls.fetch_add(1);
    if (std::this_thread::get_id() == active->owner) { return true; }
    active->wrong_thread_jni.fetch_add(1);
    return false;
}

jboolean JNICALL exception_check(JNIEnv *) {
    return !on_owner_thread() || active->pending_exception.load() ? JNI_TRUE : JNI_FALSE;
}
void JNICALL exception_clear(JNIEnv *) {
    if (!on_owner_thread()) { return; }
    active->exception_clears.fetch_add(1);
    active->pending_exception.store(false);
}
void JNICALL exception_describe(JNIEnv *) {
    on_owner_thread();
    active->exception_describes.fetch_add(1);
}
jclass JNICALL get_object_class(JNIEnv *, jobject object) {
    if (!on_owner_thread()) { return nullptr; }
    if (object != &active->currentness) {
        active->pending_exception.store(true);
        return nullptr;
    }
    return &active->currentness_class;
}
jclass JNICALL find_class(JNIEnv *, const char * name) {
    if (!on_owner_thread()) { return nullptr; }
    if (std::strcmp(name, "ai/aurora/device/inference/NativeGenerationResult") == 0) {
        return &active->result_class;
    }
    active->pending_exception.store(true);
    return nullptr;
}
jmethodID JNICALL get_method_id(JNIEnv *, jclass type, const char * name, const char * signature) {
    if (!on_owner_thread()) { return nullptr; }
    if (type == &active->currentness_class && std::strcmp(name, "isStopped") == 0 &&
        std::strcmp(signature, "()Z") == 0) {
        active->callback_method_lookups.fetch_add(1);
        if (!active->missing_method) {
            return reinterpret_cast<jmethodID>(&active->currentness_method);
        }
    } else if (type == &active->result_class && std::strcmp(name, "<init>") == 0 &&
               std::strcmp(signature, "(I[BII)V") == 0) {
        return reinterpret_cast<jmethodID>(&active->result_constructor);
    }
    active->pending_exception.store(true);
    return nullptr;
}
jboolean JNICALL call_boolean_v(JNIEnv *, jobject object, jmethodID method, va_list) {
    if (!on_owner_thread()) { return JNI_TRUE; }
    if (object != &active->currentness ||
        method != reinterpret_cast<jmethodID>(&active->currentness_method)) {
        active->pending_exception.store(true);
        return JNI_FALSE;
    }
    active->callback_calls.fetch_add(1);
    if (active->during_callback) { active->during_callback(); }
    if (active->throw_once.exchange(false)) {
        active->pending_exception.store(true);
        return JNI_FALSE;  // A throwing callback must NOT be treated as allow.
    }
    if (active->stop_once.exchange(false)) { return JNI_TRUE; }
    return active->stopped.load() ? JNI_TRUE : JNI_FALSE;
}
void JNICALL delete_local_ref(JNIEnv *, jobject) { on_owner_thread(); }
jsize JNICALL get_array_length(JNIEnv *, jarray array) {
    if (!on_owner_thread() || array == nullptr) { return 0; }
    return static_cast<jsize>(static_cast<Bytes *>(array)->value.size());
}
void JNICALL get_byte_array_region(JNIEnv *, jbyteArray array, jsize start, jsize length, jbyte * output) {
    if (!on_owner_thread()) { return; }
    const auto & bytes = static_cast<Bytes *>(array)->value;
    if (start < 0 || length < 0 || static_cast<size_t>(start + length) > bytes.size()) {
        active->pending_exception.store(true);
        return;
    }
    std::memcpy(output, bytes.data() + start, static_cast<size_t>(length));
}
jbyteArray JNICALL new_byte_array(JNIEnv *, jsize size) {
    if (!on_owner_thread() || size < 0) { return nullptr; }
    auto bytes = std::make_unique<Bytes>();
    bytes->value.resize(static_cast<size_t>(size));
    auto * result = bytes.get();
    active->arrays.push_back(std::move(bytes));
    return result;
}
void JNICALL set_byte_array_region(JNIEnv *, jbyteArray array, jsize start, jsize length, const jbyte * input) {
    if (!on_owner_thread()) { return; }
    auto & bytes = static_cast<Bytes *>(array)->value;
    if (start < 0 || length < 0 || static_cast<size_t>(start + length) > bytes.size()) {
        active->pending_exception.store(true);
        return;
    }
    std::memcpy(bytes.data() + start, input, static_cast<size_t>(length));
}
jobject JNICALL new_object_v(JNIEnv *, jclass type, jmethodID method, va_list arguments) {
    if (!on_owner_thread()) { return nullptr; }
    if (type != &active->result_class || method != reinterpret_cast<jmethodID>(&active->result_constructor)) {
        active->pending_exception.store(true);
        return nullptr;
    }
    auto result = std::make_unique<Result>();
    result->status = va_arg(arguments, jint);
    auto * bytes = static_cast<Bytes *>(va_arg(arguments, jbyteArray));
    result->output.assign(bytes->value.begin(), bytes->value.end());
    result->input_tokens = va_arg(arguments, jint);
    result->output_tokens = va_arg(arguments, jint);
    auto * pointer = result.get();
    active->results.push_back(std::move(result));
    return pointer;
}

// Compile the unmodified old nine-argument JNI entrypoint as well as the fixed
// mandatory-currentness entrypoint. This adapter exists ONLY in this test TU.
template <typename Generate>
jobject invoke_generation(Generate generate, JNIEnv * env, jlong id, jint fd,
                          jbyteArray prompt, jlong budget, jobject currentness) {
    if constexpr (std::is_invocable_v<Generate, JNIEnv *, jclass, jlong, jint,
                  jbyteArray, jint, jint, jint, jlong, jobject>) {
        return generate(env, nullptr, id, fd, prompt, 8, 128, 256, budget, currentness);
    } else {
        static_assert(std::is_invocable_v<Generate, JNIEnv *, jclass, jlong, jint,
                      jbyteArray, jint, jint, jint, jlong>, "Unexpected production JNI ABI");
        return generate(env, nullptr, id, fd, prompt, 8, 128, 256, budget);
    }
}

struct Fixture {
    explicit Fixture(const char * path) {
        active = &state;
        state.owner = std::this_thread::get_id();
        table.ExceptionCheck = exception_check;
        table.ExceptionClear = exception_clear;
        table.ExceptionDescribe = exception_describe;
        table.GetObjectClass = get_object_class;
        table.FindClass = find_class;
        table.GetMethodID = get_method_id;
        table.CallBooleanMethodV = call_boolean_v;
        table.DeleteLocalRef = delete_local_ref;
        table.GetArrayLength = get_array_length;
        table.GetByteArrayRegion = get_byte_array_region;
        table.NewByteArray = new_byte_array;
        table.SetByteArrayRegion = set_byte_array_region;
        table.NewObjectV = new_object_v;
        env.functions = &table;
        prompt.value = {'h', 'e', 'l', 'l', 'o'};
        fd = open(path, O_RDONLY | O_CLOEXEC | O_NOFOLLOW);
        struct stat metadata{};
        require(fd >= 0 && fstat(fd, &metadata) == 0, "fixture must be an existing read-only file");
        require(S_ISREG(metadata.st_mode) && metadata.st_uid == getuid() &&
                metadata.st_size == EXPECTED_MODEL_BYTES && metadata.st_blocks == 0 &&
                (metadata.st_mode & (S_IWUSR | S_IRWXG | S_IRWXO)) == 0,
                "fixture must be private, read-only, entirely sparse and contain no model data");
        id = Java_ai_aurora_device_inference_NativeLlamaBindings_reserve(&env, nullptr);
        require(id > 0, "native reservation must succeed");
    }
    ~Fixture() {
        if (fd >= 0) { close(fd); }
        active = nullptr;
    }
    Result * generate(jlong budget = 30000000000LL, bool null_currentness = false) {
        state.owner = std::this_thread::get_id();
        return static_cast<Result *>(invoke_generation(
            Java_ai_aurora_device_inference_NativeLlamaBindings_generate,
            &env, id, fd, &prompt, budget, null_currentness ? nullptr : &state.currentness));
    }
    void expect(Result * result, Status status, bool success = false) {
        require(result != nullptr, "native entrypoint must return a sanitized result DTO");
        require(result->status == static_cast<jint>(status),
                "unexpected status: " + std::to_string(result->status) +
                " expected: " + std::to_string(static_cast<jint>(status)));
        require(success ? result->output == "ok" : result->output.empty(),
                "only current, complete EOG output may escape; failures must discard all output");
    }
    void assert_busy() {
        require(Java_ai_aurora_device_inference_NativeLlamaBindings_release(&env, nullptr, id) == JNI_FALSE,
                "release must stay false while callback or native cleanup owns the running session");
        require(Java_ai_aurora_device_inference_NativeLlamaBindings_reserve(&env, nullptr) == 0,
                "a second reservation must remain BUSY while the first worker is running");
    }
    void finish() {
        require(state.wrong_thread_jni.load() == 0, "engine helper threads must never use worker JNIEnv");
        require(state.exception_describes.load() == 0, "callback exception details must not be logged");
        require(!state.pending_exception.load(), "sanitized result must not retain callback exception");
        require(state.premature_finished.load() == 0, "RUNNING must cover every native RAII destructor");
        require(Java_ai_aurora_device_inference_NativeLlamaBindings_release(&env, nullptr, id) == JNI_TRUE,
                "completed, safely cleaned session must be releasable");
        const jlong fresh = Java_ai_aurora_device_inference_NativeLlamaBindings_reserve(&env, nullptr);
        require(fresh > id, "resource reservation must recover only after cleanup and explicit release");
        require(Java_ai_aurora_device_inference_NativeLlamaBindings_release(&env, nullptr, fresh) == JNI_TRUE,
                "unused follow-up reservation must release");
    }
    State state;
    JNINativeInterface_ table{};
    JNIEnv env{};
    Bytes prompt;
    int fd = -1;
    jlong id = 0;
};

void teardown_observation() {
    active->teardown_calls.fetch_add(1);
    std::lock_guard<std::mutex> lock(session_mutex);
    if (!reserved_session || reserved_session->phase != Phase::RUNNING) {
        active->premature_finished.fetch_add(1);
    }
}

void assert_throws_closed(Fixture & fixture) {
    Result * result = fixture.generate();
    fixture.expect(result, Status::FAILURE);
    require(fixture.state.loads.load() == 0 && fixture.state.decodes.load() == 0,
            "callback contract failure must not start the model or decode");
    require(fixture.state.exception_clears.load() == 1,
            "callback exception must be cleared exactly once without permissive retry");
    // A failing callback would return false on a later read. The same session
    // must still be consumed: neither a retry nor re-entry can resurrect it.
    fixture.expect(fixture.generate(), Status::INVALID_INPUT);
    require(fixture.state.callback_calls.load() <= 1,
            "throw/missing callback must be sticky, not retried as fresh authority");
}

void blocked_callback(Fixture & fixture, bool deadline, bool after_cleanup) {
    Gate gate;
    fixture.state.during_callback = [&] {
        if (!after_cleanup || fixture.state.backend_freed.load()) { gate.block(); }
    };
    Result * result = nullptr;
    std::exception_ptr worker_failure;
    std::thread worker([&] {
        try { result = fixture.generate(deadline ? 250000000LL : 30000000000LL); }
        catch (...) { worker_failure = std::current_exception(); }
        gate.completed();
    });
    const bool entered = gate.await_entry();
    try {
        require(entered, "generation must enter the mandatory currentness callback");
        fixture.assert_busy();
        if (deadline) {
            // Deliberately exceed the complete 250 ms generation budget while
            // holding the callback. Its later false cannot refresh that budget.
            std::this_thread::sleep_for(std::chrono::milliseconds(300));
        } else {
            require(Java_ai_aurora_device_inference_NativeLlamaBindings_cancel(
                        &fixture.env, nullptr, fixture.id) == JNI_TRUE,
                    "cancellation must remain available while the owner callback blocks");
        }
        fixture.assert_busy();
        if (after_cleanup) {
            require(fixture.state.teardown_calls.load() == 5 && fixture.state.backend_freed.load(),
                    "final owner callback must run after all five engine RAII destructors");
        }
    } catch (...) {
        gate.open();
        worker.join();
        throw;
    }
    gate.open();
    worker.join();
    if (worker_failure) { std::rethrow_exception(worker_failure); }
    fixture.expect(result, deadline ? Status::DEADLINE : Status::CANCELLED);
    if (!after_cleanup) {
        require(fixture.state.loads.load() == 0 && fixture.state.decodes.load() == 0,
                "late false after blocked callback must not enter the engine");
        require(fixture.state.callback_calls.load() == 1,
                "cancelled/expired callback result must not be reread to regain authority");
    }
}

void blocked_teardown(Fixture & fixture) {
    Gate gate;
    fixture.state.during_model_free = [&] { gate.block(); };
    Result * result = nullptr;
    std::exception_ptr worker_failure;
    std::thread worker([&] {
        try { result = fixture.generate(); }
        catch (...) { worker_failure = std::current_exception(); }
        gate.completed();
    });
    const bool entered = gate.await_entry();
    try {
        require(entered, "model teardown barrier must be reached");
        require(fixture.state.teardown_calls.load() == 4,
                "model teardown must follow batch, sampler and context cleanup");
        fixture.assert_busy();
    } catch (...) {
        gate.open();
        worker.join();
        throw;
    }
    gate.open();
    worker.join();
    if (worker_failure) { std::rethrow_exception(worker_failure); }
    fixture.expect(result, Status::SUCCESS_EOG, true);
    require(fixture.state.teardown_calls.load() == 5,
            "all engine RAII destructors must complete before native release");
}

void run(const std::string & scenario, Fixture & fixture) {
    State & state = fixture.state;
    if (scenario == "current_success") {
        fixture.expect(fixture.generate(), Status::SUCCESS_EOG, true);
        require(state.callback_calls.load() >= 7, "currentness must span load, every decode and final output");
        require(state.callback_method_lookups.load() == 1, "method lookup must be cached only within this call");
        require(state.decodes.load() == 2 && state.samples.load() == 2,
                "baseline must exercise prompt decode, generated-token decode and EOG");
    } else if (scenario == "revoke_during_load") {
        state.native_thread_callbacks = true;
        state.during_load = [&] { state.stopped.store(true); };
        fixture.expect(fixture.generate(), Status::CANCELLED);
        require(state.loads.load() == 1 && state.decodes.load() == 0,
                "revocation during load must be reread before any decode");
        require(state.progress_calls.load() == 1, "load progress must be exercised from an engine thread");
    } else if (scenario == "revoke_before_decode") {
        state.before_first_decode = [&] { state.stopped.store(true); };
        fixture.expect(fixture.generate(), Status::CANCELLED);
        require(state.loads.load() == 1 && state.decodes.load() == 0,
                "currentness lost after context creation must stop the first decode");
    } else if (scenario == "revoke_after_decode") {
        state.during_decode = [&] { state.stopped.store(true); };
        fixture.expect(fixture.generate(), Status::CANCELLED);
        require(state.decodes.load() == 1 && state.samples.load() == 0,
                "revocation during decode must be checked before sampling/output");
    } else if (scenario == "revoke_at_eog") {
        state.during_eog = [&] { state.stopped.store(true); };
        fixture.expect(fixture.generate(), Status::CANCELLED);
        require(state.decodes.load() == 2 && state.samples.load() == 2,
                "EOG test must first generate a nonempty speculative response");
    } else if (scenario == "revoke_during_cleanup") {
        state.during_model_free = [&] { state.stopped.store(true); };
        fixture.expect(fixture.generate(), Status::CANCELLED);
        require(state.backend_freed.load() && state.teardown_calls.load() == 5,
                "post-cleanup revocation must discard success after native RAII completes");
    } else if (scenario == "callback_null") {
        fixture.expect(fixture.generate(30000000000LL, true), Status::INVALID_INPUT);
        require(state.backend_starts.load() == 0 && state.loads.load() == 0 && state.decodes.load() == 0,
                "missing currentness must not be a permissive default");
    } else if (scenario == "callback_missing_method") {
        state.missing_method = true;
        assert_throws_closed(fixture);
        require(state.callback_calls.load() == 0 && state.callback_method_lookups.load() == 1,
                "missing isStopped()Z must fail at the exact callback contract");
    } else if (scenario == "callback_throws_sticky") {
        state.throw_once.store(true);
        assert_throws_closed(fixture);
        require(state.callback_calls.load() == 1,
                "throwing callback must execute exactly once, with no successful retry");
    } else if (scenario == "callback_stop_sticky") {
        state.during_load = [&] { state.stop_once.store(true); };
        fixture.expect(fixture.generate(), Status::CANCELLED);
        require(!state.stop_once.load() && !state.stopped.load(),
                "test callback must already be capable of returning false again");
        require(state.callback_calls.load() == 2 && state.decodes.load() == 0,
                "a transient stop must latch and cannot be cleared by rereading authority");
        fixture.expect(fixture.generate(), Status::INVALID_INPUT);
        require(state.callback_calls.load() == 2, "re-entry must not resurrect stopped generation");
    } else if (scenario == "blocked_callback_cancel") {
        blocked_callback(fixture, false, false);
    } else if (scenario == "blocked_callback_deadline") {
        blocked_callback(fixture, true, false);
    } else if (scenario == "blocked_final_callback_cancel") {
        blocked_callback(fixture, false, true);
    } else if (scenario == "engine_threads_no_jni") {
        state.native_thread_callbacks = true;
        fixture.expect(fixture.generate(), Status::SUCCESS_EOG, true);
        require(state.progress_calls.load() == 1 && state.abort_calls.load() == 2,
                "load and both decode callbacks must execute on real std::threads");
        require(state.callback_calls.load() >= 7 && state.wrong_thread_jni.load() == 0,
                "only the generation owner may call JNI currentness; engine threads use atomics/deadline");
    } else if (scenario == "raii_running_until_cleanup") {
        blocked_teardown(fixture);
    } else {
        throw std::runtime_error("unknown bounded harness scenario");
    }
    fixture.finish();
    std::cout << "{\"scenario\":\"" << scenario << "\",\"result\":\"PASS\",\"assertions\":"
              << assertion_count << ",\"native_source\":\"complete-production-translation-unit\""
              << ",\"engine\":\"explicit-stub-no-inference\",\"jni\":\"official-header-fake-table\""
              << ",\"fixture\":\"sparse-readonly-no-model-content\",\"callback_calls\":"
              << state.callback_calls.load() << ",\"decode_calls\":" << state.decodes.load()
              << ",\"engine_progress_threads\":" << state.progress_calls.load()
              << ",\"engine_abort_threads\":" << state.abort_calls.load()
              << ",\"wrong_thread_jni\":" << state.wrong_thread_jni.load()
              << ",\"teardown_calls\":" << state.teardown_calls.load() << "}\n";
}

}  // namespace harness

// Engine test doubles. They never read the sparse fixture, tokenize a real
// model, call a JVM, access Android, import weights, or execute inference.
extern "C" {
void llama_log_set(void (*)(ggml_log_level, const char *, void *), void *) {}
void llama_backend_init() { harness::active->backend_starts.fetch_add(1); }
void llama_backend_free() {
    harness::teardown_observation();
    harness::active->backend_freed.store(true);
}
llama_model_params llama_model_default_params() { return {}; }
llama_model * llama_model_load_from_file_ptr(FILE *, llama_model_params params) {
    auto & state = *harness::active;
    state.loads.fetch_add(1);
    if (state.during_load) { state.during_load(); }
    if (state.native_thread_callbacks) {
        bool keep_loading = false;
        std::thread worker([&] {
            state.progress_calls.fetch_add(1);
            keep_loading = params.progress_callback(0.5F, params.progress_callback_user_data);
        });
        worker.join();
        if (!keep_loading) { return nullptr; }
    }
    return new llama_model;
}
void llama_model_free(llama_model * model) {
    harness::teardown_observation();
    if (harness::active->during_model_free) { harness::active->during_model_free(); }
    delete model;
}
const llama_vocab * llama_model_get_vocab(const llama_model *) { return &harness::active->vocab; }
bool llama_model_has_encoder(const llama_model *) { return false; }
bool llama_model_has_decoder(const llama_model *) { return true; }
int32_t llama_vocab_n_tokens(const llama_vocab *) { return 3; }
llama_token_attr llama_vocab_get_attr(const llama_vocab *, llama_token) { return LLAMA_TOKEN_ATTR_UNDEFINED; }
const char * llama_vocab_get_text(const llama_vocab *, llama_token) { return "stub"; }
const char * llama_model_chat_template(const llama_model *, const char *) { return "explicit-test-template"; }
int32_t llama_chat_apply_template(const char *, const llama_chat_message *, size_t, bool, char * output, int32_t size) {
    if (size < 5) { return -1; }
    std::memcpy(output, "hello", 5);
    return 5;
}
int32_t llama_tokenize(const llama_vocab *, const char *, int32_t, llama_token * tokens, int32_t capacity, bool, bool) {
    if (capacity < 1) { return -1; }
    tokens[0] = 0;
    return 1;
}
llama_context_params llama_context_default_params() { return {}; }
llama_context * llama_init_from_model(llama_model *, llama_context_params params) {
    harness::active->context_params = params;
    return new llama_context;
}
void llama_free(llama_context * context) { harness::teardown_observation(); delete context; }
llama_sampler * llama_sampler_init_greedy() { return new llama_sampler; }
void llama_sampler_free(llama_sampler * sampler) { harness::teardown_observation(); delete sampler; }
llama_batch llama_batch_init(int32_t capacity, int32_t, int32_t) {
    llama_batch batch;
    batch.token = new llama_token[static_cast<size_t>(capacity)]{};
    batch.pos = new llama_pos[static_cast<size_t>(capacity)]{};
    batch.n_seq_id = new int32_t[static_cast<size_t>(capacity)]{};
    // A test-only trailing null sentinel permits bounded cleanup; production
    // sees only the requested sequence pointers, not an altered engine API.
    batch.seq_id = new llama_seq_id *[static_cast<size_t>(capacity) + 1]{};
    for (int32_t i = 0; i < capacity; ++i) { batch.seq_id[i] = new llama_seq_id[1]{}; }
    batch.logits = new int8_t[static_cast<size_t>(capacity)]{};
    if (harness::active->before_first_decode) { harness::active->before_first_decode(); }
    return batch;
}
void llama_batch_free(llama_batch batch) {
    harness::teardown_observation();
    for (size_t i = 0; batch.seq_id[i] != nullptr; ++i) { delete[] batch.seq_id[i]; }
    delete[] batch.token;
    delete[] batch.pos;
    delete[] batch.n_seq_id;
    delete[] batch.seq_id;
    delete[] batch.logits;
}
int32_t llama_decode(llama_context *, llama_batch) {
    auto & state = *harness::active;
    state.decodes.fetch_add(1);
    if (state.during_decode) { state.during_decode(); }
    if (state.native_thread_callbacks) {
        bool aborted = false;
        std::thread worker([&] {
            state.abort_calls.fetch_add(1);
            aborted = state.context_params.abort_callback(state.context_params.abort_callback_data);
        });
        worker.join();
        if (aborted) { return 2; }
    }
    return 0;
}
llama_token llama_sampler_sample(llama_sampler *, llama_context *, int32_t) {
    return harness::active->samples.fetch_add(1) == 0 ? 1 : 2;
}
bool llama_vocab_is_eog(const llama_vocab *, llama_token token) {
    if (token != 2) { return false; }
    if (harness::active->during_eog) { harness::active->during_eog(); }
    return true;
}
bool llama_vocab_is_control(const llama_vocab *, llama_token) { return false; }
int32_t llama_token_to_piece(const llama_vocab *, llama_token, char * output, int32_t capacity, int32_t, bool) {
    if (capacity < 2) { return -1; }
    std::memcpy(output, "ok", 2);
    return 2;
}
}

int main(int argc, char ** argv) {
    if (argc != 3) {
        std::cerr << "Usage: native_currentness_harness SCENARIO SPARSE_READONLY_FIXTURE\n";
        return 2;
    }
    try {
        harness::Fixture fixture(argv[2]);
        harness::run(argv[1], fixture);
        return 0;
    } catch (const std::exception & error) {
        std::cerr << "FAIL " << argv[1] << ": " << error.what() << '\n';
        return 1;
    }
}
