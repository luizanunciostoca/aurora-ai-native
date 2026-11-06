// Explicit, host-only engine stub for the native currentness regression harness.
// This is NOT llama.cpp, a model loader, an inference implementation, or a
// production header. The harness links these declarations to deterministic
// test functions and includes the complete, unmodified production JNI source.
#ifndef AURORA_NATIVE_CURRENTNESS_TEST_LLAMA_H
#define AURORA_NATIVE_CURRENTNESS_TEST_LLAMA_H

#include <cstddef>
#include <cstdint>
#include <cstdio>

enum ggml_log_level { GGML_LOG_LEVEL_NONE = 0 };
using llama_token = int32_t;
using llama_pos = int32_t;
using llama_seq_id = int32_t;
enum llama_token_attr {
    LLAMA_TOKEN_ATTR_UNDEFINED = 0,
    LLAMA_TOKEN_ATTR_UNKNOWN = 1,
    LLAMA_TOKEN_ATTR_CONTROL = 8,
    LLAMA_TOKEN_ATTR_USER_DEFINED = 16,
};
enum llama_load_mode { LLAMA_LOAD_MODE_MMAP = 1 };
enum llama_lazy_mode { LLAMA_LAZY_MODE_OFF = 0 };
struct llama_model {};
struct llama_vocab {};
struct llama_context {};
struct llama_sampler {};
struct llama_model_params {
    int32_t n_gpu_layers = 0;
    llama_load_mode load_mode = LLAMA_LOAD_MODE_MMAP;
    llama_lazy_mode lazy_mode = LLAMA_LAZY_MODE_OFF;
    bool (*progress_callback)(float, void *) = nullptr;
    void * progress_callback_user_data = nullptr;
};
struct llama_context_params {
    uint32_t n_ctx = 0;
    uint32_t n_batch = 0;
    uint32_t n_ubatch = 0;
    uint32_t n_seq_max = 0;
    int32_t n_threads = 0;
    int32_t n_threads_batch = 0;
    bool offload_kqv = false;
    bool op_offload = false;
    bool no_perf = false;
    bool (*abort_callback)(void *) = nullptr;
    void * abort_callback_data = nullptr;
};
struct llama_chat_message { const char * role; const char * content; };
struct llama_batch {
    int32_t n_tokens = 0;
    llama_token * token = nullptr;
    float * embd = nullptr;
    llama_pos * pos = nullptr;
    int32_t * n_seq_id = nullptr;
    llama_seq_id ** seq_id = nullptr;
    int8_t * logits = nullptr;
};

extern "C" {
void llama_log_set(void (*callback)(ggml_log_level, const char *, void *), void * data);
void llama_backend_init();
void llama_backend_free();
llama_model_params llama_model_default_params();
llama_model * llama_model_load_from_file_ptr(FILE * file, llama_model_params params);
void llama_model_free(llama_model * model);
const llama_vocab * llama_model_get_vocab(const llama_model * model);
bool llama_model_has_encoder(const llama_model * model);
bool llama_model_has_decoder(const llama_model * model);
int32_t llama_vocab_n_tokens(const llama_vocab * vocab);
llama_token_attr llama_vocab_get_attr(const llama_vocab * vocab, llama_token token);
const char * llama_vocab_get_text(const llama_vocab * vocab, llama_token token);
const char * llama_model_chat_template(const llama_model * model, const char * name);
int32_t llama_chat_apply_template(const char * tmpl, const llama_chat_message * messages,
                                size_t count, bool add_assistant, char * output, int32_t size);
int32_t llama_tokenize(const llama_vocab * vocab, const char * text, int32_t text_length,
                      llama_token * tokens, int32_t capacity, bool add_special, bool parse_special);
llama_context_params llama_context_default_params();
llama_context * llama_init_from_model(llama_model * model, llama_context_params params);
void llama_free(llama_context * context);
llama_sampler * llama_sampler_init_greedy();
void llama_sampler_free(llama_sampler * sampler);
llama_batch llama_batch_init(int32_t capacity, int32_t embeddings, int32_t sequences);
void llama_batch_free(llama_batch batch);
int32_t llama_decode(llama_context * context, llama_batch batch);
llama_token llama_sampler_sample(llama_sampler * sampler, llama_context * context, int32_t index);
bool llama_vocab_is_eog(const llama_vocab * vocab, llama_token token);
bool llama_vocab_is_control(const llama_vocab * vocab, llama_token token);
int32_t llama_token_to_piece(const llama_vocab * vocab, llama_token token,
                            char * output, int32_t capacity, int32_t lstrip, bool special);
}

#endif
