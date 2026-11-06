# Private native inference preparation — not an activated Aurora runtime

This slice implements an internal text-only Android/JNI leaf and prepares an APK with it **disabled**. The owner authorization and bounded claim are recorded in [#575, comment 6685491189](https://github.com/luizanunciostoca/aurora-ai-native/issues/575#issuecomment-6685491189). It extends the readiness contract in #583; it is not W15-J acceptance, a replacement for #413, or permission to install.

## Exact lineage and ownership

- Android foundation: #413 r13, `cfc6f21ea0009b358a96e1d1b470ebf3c37363f2`, version `0.17.0-dev.1` / code 4.
- Normal preparation-branch merge of #587 `49824b11f04d22bfbc0bbe5d23303b3f1ea84c68`, including current main `c03d99016aef3087727a64f1bd3733ab28581c6a`. The 15 inherited governance/dependency paths are preserved unchanged; the dependency remains unaccepted.
- No #588 TypeScript composition is imported. No voice, application, manifest, session, executor, permission, release or acceptance wiring is changed.
- This branch is stacked on #413. It does not mutate that branch or merge anything to main.
- W15-A/C preparation only. W15-B/G/J session, voice and physical acceptance authority remain separate.

## Default-off boundary

`BuildConfig.AURORA_NATIVE_INFERENCE_ENABLED` is a literal `false` in all variants, with **no environment/property activation override**. The production factory returns unavailable before opening a model, starting a worker, resolving a prompt or loading JNI. There is no caller in Aurora application/voice/session composition.

`-PauroraNativePreparation=true` opts into **packaging**, not activation. It sets `AURORA_NATIVE_COMPONENT_PACKAGED=true`, includes the CPU library, and permits only `localDebug`. It refuses persistent physical-signing environment variables. Ordinary foundation builds keep the native component unpackaged and inactive.

The future input seam is `NativePublicPromptSource.resolveCurrent`. Its default is not composed. A caller cannot supply an `approved=true` assertion, model path, model hash or arbitrary action. A future authorized W05/W06 composition must resolve currently permitted PUBLIC material. Model output is non-authoritative text; this leaf has no Android-action, shell, network, tool or policy-granting port.

## Pinned dependencies and model boundary

| Item | Pin / rule |
| --- | --- |
| llama.cpp | `8642541b255bfb5dc39cd351a178be09013a55d6` |
| NDK | `30.0.16248370` — official r30 LTS, stable channel |
| CMake | `3.31.6` |
| Existing Android build | AGP `9.2.0`, Gradle `9.4.1`, Java 17 |
| Native ABI/backend | `arm64-v8a`, baseline ARMv8-A, CPU, two inference threads |
| Existing app API contract | minSdk 26, target/compile 36 |
| Private model-store requirement | Android API 27+ for nanosecond file identity; API 26 fails unavailable |
| Model expected later | `Qwen3.5-2B-Q4_K_M.gguf`, 1,280,835,840 bytes |
| Model SHA-256 | `aaf42c8b7c3cab2bf3d69c355048d4a0ee9973d48f16c731c0520ee914699223` |

The [official NDK release listing](https://github.com/android/ndk/wiki) identifies r30 as the supported 2026 LTS release. Google's [SDK package metadata](https://dl.google.com/android/repository/repository2-3.xml) lists `ndk;30.0.16248370` in `channel-0`, without a preview revision, using `android-sdk-license`. The stable substitution is authorized in [#575, comment 6686220828](https://github.com/luizanunciostoca/aurora-ai-native/issues/575#issuecomment-6686220828). The previous `29.0.13113456` Preview attempt, [run 42225949609](https://github.com/luizanunciostoca/aurora-ai-native/actions/runs/42225949609), failed before tests because its Preview license was not accepted; it produced no APK. That failure remains historical evidence, not a passed build. The workflow uses only the stable channel and closed stdin; a new license requirement must stop the job, never be auto-accepted or bypassed.

CMake and artifact verification require the exact stable package revision and reject preview suffixes or a mismatched revision. CMake requires an exact clean upstream checkout and does not fetch dependencies. The engine is statically linked into a private `libaurora_llama.so`; archive symbols are hidden, with four checked JNI exports. Its MIT license is retained in APK assets. `libc++_shared.so` is the only additional packaged native library. There is no server, dynamic backend, GPU, common tool runner or model downloader.

No model is downloaded, bundled, copied, imported or used by this preparation. The private store uses a fixed app-private identity, readonly/no-follow open, SHA-256 and metadata checks. JNI duplicates the **same held descriptor**, uses `fdopen` and `llama_model_load_from_file_ptr`, and keeps it alive until the model is freed. This avoids reopening a path after verification. It does not claim protection against a malicious same-UID writer altering that same inode; no importer or in-place writer is added here.

The C API requires a model-provided supported template; absence/unsupported syntax fails unavailable. The pinned C API recognizes built-in template families, not arbitrary Jinja. This preparation does **not** establish Qwen thinking/template parity with the earlier separate sample. Such behavior still needs exact-model runtime validation.

## Bounded work and cancellation

- Input: at most 8,192 UTF-8 bytes. Context: 256–2,048 tokens. Requested output: 1–256 tokens and at most 32,768 bytes.
- One native operation per process. The native layer owns opaque IDs, atomic cancellation and RAII cleanup; no pointer handle is exposed.
- The budget is positive and at most 30 seconds, including admission, hashing, load and generation. Kotlin uses an injected monotonic clock; JNI receives a remaining duration and establishes its own monotonic deadline.
- Cancellation/deadline can settle the caller without waiting for non-cooperative native work. **BUSY/quarantine remains until real native exit, teardown, release and descriptor close.** There is no unsafe kill/free while native work still uses memory.
- Progress/decode callbacks are cooperative. A timeout is not a promise that an uninterruptible allocation, I/O or native load has physically stopped within 30 seconds. Native fatal errors/OOM are not fully containable in this same-process leaf.
- Genuine end-of-generation with nonempty valid UTF-8 is required for success. Invalid input, cancellation, deadline, unavailable backend, failure or budget exhaustion returns no text. Reaching token/context/byte limits is not silently reported as success.
- No prompt, model content, token stream or credential logging is added. Special model delimiters are rejected before template tokenization; this is not claimed as a general prompt-injection defense.

## Kotlin prompt-currentness checkpoints

The continuation allocated in [#575, comment 6688856373](https://github.com/luizanunciostoca/aurora-ai-native/issues/575#issuecomment-6688856373) changes only the private Kotlin runtime, its regression tests and this document. It is a normal single-parent continuation of the existing disabled preparation, not a merge, new authority owner or activation.

The runtime reuses the same `NativePublicPromptSource.resolveCurrent` port after model verification/reservation, immediately before JNI `generate`, and after native release and descriptor closure, before publishing successful text. JNI library loading/reservation can already have occurred; this checkpoint prevents generation, not reservation. Each checkpoint requires the original opaque request reference and valid bounded UTF-8 with the original content identity. A private content digest identifies the captured prompt; it is not consent, a session attestation or an execution grant. An observed unavailable/changed/mismatched source or failed read denies that attempt permanently. Restoring the source cannot revive the denied call.

Potentially blocking source reads run on the worker lane, outside the runtime lock. The independent cancellation/deadline lane can still settle the caller; the single-flight slot remains occupied until outstanding work returns. Runtime-owned temporary byte copies are cleared. The unchanged shipping factory remains disabled and does not call this port, open a model or instantiate JNI.

**Limit:** model loading and decode are both inside the opaque JNI `generate` call. These Kotlin checks do not establish a fresh policy/session/consent check between model load and first decode, or continuous revocation during generation. This internal gap remains an activation gate. No JNI/C++ contract is changed by this continuation.

**Host dependency gate:** core #588 contains concrete private W02/W05/W06 preparation consumers, but their authentic current policy/consent/purpose, routing and PUBLIC-source producers are not composed in the audited Host #462. Its DP5 policy is for local device control, not model data processing. W03 storage and W06 Memory Fabric do not themselves create that missing authority. The native prompt port is also still uncomposed: repeated reads in software tests do not establish an actual eleven-field W14 session binding or real consent. No fixture is promoted to production truth.

## Reproducible preparation and assertions

Use the existing **Android Foundation** workflow. It checks out the exact PR head, runs the existing three-flavor foundation build/unit tests, checks out the engine pin separately, then builds the opt-in `localDebug` preparation. No new orchestrator or parallel release workflow is introduced.

For an equivalent build on a trusted development environment with the pinned tools and clean engine checkout:

```bash
export AURORA_ANDROID_SHA="<exact-candidate-commit>"
export AURORA_HOST_SHA=UNBOUND_NATIVE_PREPARATION
export AURORA_RELEASE_TUPLE_ID=NATIVE_PREPARATION_NO_PHYSICAL_TUPLE
export AURORA_LLAMA_SOURCE_DIR="<absolute-path-to-clean-pinned-llama-checkout>"
gradle --no-daemon --console=plain --max-workers=2 -p apps/aurora-android \
  -PauroraNativePreparation=true :app:testLocalDebugUnitTest :app:assembleLocalDebug
python3 -m unittest discover -s apps/aurora-android/verification \
  -p 'test_native_preparation_artifact.py' -v
```

These commands build/test only; they do not install or enable anything. Artifact verification additionally checks the actual APK:

1. Reads `BuildConfig` static values directly from packaged DEX: exact source, LOCAL/debug identity, packaged flag true and inference flag false. Source/metadata alone is insufficient.
2. Requires only the two intended `arm64-v8a` libraries; checks ELF64/AArch64 load alignment for 16 KiB and APK alignment with Android `zipalign`.
3. Checks exactly the four JNI exports and requires all three native-boundary JVM test suites, with nonzero test counts and no failure, error or skipped case; those tests include the Kotlin/DTO signature contract.
4. Verifies the APK signature and records its certificate digest with `apksigner`.
5. Confirms the inherited app ID/version/minSdk/targetSdk and retained engine license.
6. Rejects bundled `.gguf` files and renamed files starting with GGUF magic.
7. Emits `BUILD_IDENTITY.json`, APK/library digests, certificate/manifest evidence and `SHA256SUMS.txt` only after assertions pass. The upload is labelled preparation-only.

The Python packaging tests use synthetic APK/DEX/ELF fixtures and deliberate negative cases. Kotlin runtime tests use injected fakes for bounded lifecycle/guard behavior. Neither is real-model inference or physical proof. A real NDK build proves linking/packaging, not native execution. CI status, exact run/artifact IDs and independent review must be read back before declaring this preparation complete.

## Explicitly remaining gates

The artifact uses **DEBUG_FALLBACK**, not the device's persistent physical-development signing key. It is **not authorized for installation** and must not be used to replace an installed candidate implicitly. Do not uninstall Aurora to work around a signature mismatch.

Still separate and unproven: stable signing/installation approval for exact bytes; approved app-private model import with license/integrity checks; real native model load/generation and cancellation under Android; Córtex/Host/PUBLIC-context/session binding; policy/consent/capability-mediated Android actions; voice integration; the eight applicable W15-J first-experience cases; reliability and final certification. No boot or Termux service changes belong to this slice.

Rollback before any future installation is simply to keep using the existing r13 candidate; it has not been changed here. A rollback after future installation will need its own exact signed artifact and device/session plan. Never restore an old snapshot automatically.
