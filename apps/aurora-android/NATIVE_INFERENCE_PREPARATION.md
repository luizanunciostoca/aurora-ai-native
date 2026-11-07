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

## Kotlin prompt-currentness checkpoints and lineage

The continuation allocated in [#575, comment 6688856373](https://github.com/luizanunciostoca/aurora-ai-native/issues/575#issuecomment-6688856373) changes only the private Kotlin runtime, its regression tests and this document. It is a normal single-parent continuation of the existing disabled preparation, not a merge, new authority owner or activation.

The runtime reuses the same `NativePublicPromptSource.resolveCurrent` port after model verification/reservation, immediately before JNI `generate`, and after native release and descriptor closure, before publishing successful text. JNI library loading/reservation can already have occurred; this checkpoint prevents generation, not reservation. Each checkpoint requires the original opaque request reference and valid bounded UTF-8 with the original content identity. A private content digest identifies the captured prompt; it is not consent, a session attestation or an execution grant. An observed unavailable/changed/mismatched source or failed read denies that attempt permanently. Restoring the source cannot revive the denied call.

Potentially blocking source reads run on the worker lane, outside the runtime lock. The independent cancellation/deadline lane can still settle the caller; the single-flight slot remains occupied until outstanding work returns. Runtime-owned temporary byte copies are cleared. The unchanged shipping factory remains disabled and does not call this port, open a model or instantiate JNI.

That Kotlin-only continuation did not change JNI/C++ and could not check the source between native model load and first decode. The next private continuation below addresses those explicit native boundaries; it does not turn the source port into an authority producer or establish continuous revocation.

**Host dependency gate:** core #588 contains concrete private W02/W05/W06 preparation consumers, but their authentic current policy/consent/purpose, routing and PUBLIC-source producers are not composed in the audited Host #462. Its DP5 policy is for local device control, not model data processing. W03 storage and W06 Memory Fabric do not themselves create that missing authority. The native prompt port is also still uncomposed: repeated reads in software tests do not establish an actual eleven-field W14 session binding or real consent. No fixture is promoted to production truth.

## Native prompt-currentness checkpoints

The continuation allocated in [#575, comment 6689923691](https://github.com/luizanunciostoca/aurora-ai-native/issues/575#issuecomment-6689923691) is a normal single-parent descendant of `c5914860216c081654899583b50a42340581ff97` on the same Draft #589. It changes the private Kotlin/JNI contract, implementation, focused tests and this document. It does not merge or activate any dependency, mutate main/#413/#588/#462, change the toolchain/workflow, or create another policy owner.

`NativeTextOperation.generate`, its adapter and the native entry now require the existing `NativeStopSignal` as a same-call currentness query. There is no permissive default or caller-supplied approval. Its closure reuses the original flight's `NativePublicPromptSource.resolveCurrent`, original opaque request reference and captured content identity. An unavailable/changed/failed source permanently stops that flight with `PROMPT_UNAVAILABLE`; later recovery cannot revive it. The callback window closes when the synchronous generation call returns. A retained query cannot read a later flight. The same held model descriptor and original deadline are checked again **after** a potentially blocking owner read.

The JNI entry thread polls this query before and after model loading, before and after each decode batch, and after native model/context/backend/file cleanup before successful output can escape. The final query remains within native `RUNNING` ownership: cancellation or a blocked source cannot make `release` report quiescence early. Missing callback/method, Java exception or a stop observation fails closed and is sticky; callback exception text is not logged or returned. The native DTO/export count remains unchanged, but the private generation signature changes, so this source requires a newly built APK. The preceding artifact does not certify this ABI.

`JNIEnv`, method lookup and local references remain on the entering worker thread and outside the native ownership mutex. Engine progress and decode-abort callbacks remain atomic/deadline-only; they never call Java or an authority provider on an engine thread. Independent cancellation/deadline can settle the caller while the worker is blocked; BUSY/quarantine and resources remain until actual work and teardown finish.

**Limit:** these are cooperative checkpoints, not instantaneous or continuous revocation inside an opaque model load, tokenization, decode or provider read. They cannot create missing current policy/consent/routing/session/PUBLIC-source producers. The shipping factory is still literally disabled, and there is still no application/voice/session caller of this leaf.

## Original-call teardown observation

The continuation allocated in [#575/6699625822](https://github.com/luizanunciostoca/aurora-ai-native/issues/575#issuecomment-6699625822)
adds a private observation to the **original `NativeInferenceCall`**, independently
of its logical result. It extends this existing leaf; it creates no second
session, registry, executor or authenticated route, and changes no JNI/C++ ABI.

`pollQuiescence()` returns `PENDING`, `QUIESCENT` or `UNCERTAIN` for that call only.
`awaitQuiescence(timeout, unit)` is a non-UI wait: an expired wait returns null,
without cancelling the call or asserting that resources were released. Neither
`cancel()`, `pollResult()` nor `awaitResult()` proves teardown. A later call's BUSY
or IDLE state cannot overwrite the original call's terminal observation.

Only the owning runtime may move PENDING to QUIESCENT after the original worker
and cancellation work, native release, descriptor close, final current-source
check and flight detachment have finished. A known no-work refusal can be
QUIESCENT immediately, including the unchanged shipping factory's DISABLED
result. That says nothing about a different call's resources. Indeterminate
ownership/release/executor behavior moves the original call to sticky UNCERTAIN,
never to a successful teardown or an automatic retry permission.

This closes an observability gap needed by a future lifecycle adapter: a bounded
logical CANCELLED result can coexist with PENDING cleanup. It does **not** install
that adapter, supply current policy/consent/source owners, load a model or prove
the native library's behavior on the tablet. The factory remains OFF and the
newly compiled APK, if its existing checks pass, remains preparation-only and
unauthorized for installation. Previous APK bytes do not include this change.

## Bounded real-provider discovery

A single metadata-only Native Termux Agent V3 probe, [morro-termux-control #3680](https://github.com/luizanunciostoca/morro-termux-control/issues/3680#issuecomment-6690018115), was read back on 2026-11-06 at 16:36:32 UTC. Its canonical request SHA-256 was `9d19cae530023311458fa470579aa3bb9a90ddf80c8a956d12f154a9ae9a3206`, matching preflight and result. It confirmed the expected boot/session on an SM-X820, aarch64, Android API 36, then read only three previously identified provider metadata files. It did not import/execute the provider, read credentials, start a service, install anything, load a model, grant consent or change boot.

- `config/trusted-w15j-provider.mjs`: stable read; SHA-256 `a82741cebeac9917fdda9d3e0affb3a00cac9ebeb0d7a6f35e0bdfd330e8ef53`, byte-identical to the known DP5 local-device wrapper.
- `config/w15j-dp5-material.json`: stable read, known DP5 material shape, expired; its non-authority flags remained false.
- `state/dp5-effect-consent.json`: absent at observation time.

This confirms the state of those three files only. It is not a broad search proving that no other provider exists, not a runtime invocation, and not current model-data authority. The expired DP5 material is not renewed or reinterpreted as IA consent. Real model-data producers and their current W14 binding remain a separate, unresolved composition gate.

**Transport is also uncomposed:** core #588 at `36ad77e04fe0061a04e15d7a370585c5eb7f3567` exposes `createSessionBoundKeyedLocalModel` for the existing keyed HTTP client, explicitly not JNI (`services/agent-runtime/src/runtime/session-bound-local-model.ts`). Host #462 at `790049ae133035db3ed1517b31d9110d7f20d9a4` validates exact operator dependency keys without a model-source port (`services/mobile-gateway/src/physical-host/local-physical-host-operator.ts`). Adding fields to the external DP5 provider or flipping a native flag cannot complete this chain. An owner-reviewed extension of the existing composition and authenticated W14-to-native adapter is still required; it must preserve session identity, revocation, cancellation and non-authoritative model output. No second HTTP server, grant store or transport bypass is introduced here.

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

The Python module preserves the original synthetic APK/DEX/ELF packaging cases and also compiles the integral production C++ translation unit into a host-side currentness harness. It uses real JDK JNI headers, an explicit fake JNI table, an explicit fake llama engine and a sparse readonly descriptor fixture; it does not load a GGUF model or run a Java VM/Android. Set `AURORA_TEST_JNI_INCLUDE` only for an equivalent trusted JNI include directory when `JAVA_HOME/include` is unavailable. Missing compiler/headers fail the harness rather than skipping it. The unchanged existing workflow invokes this same test module.

The harness checks revoke-during-load, pre/post-decode invalidation, exceptions/missing callback, sticky refusal, blocked callbacks with cancellation/deadline, ownership/release, callback thread affinity and the final post-cleanup checkpoint. Its regression can be exercised against the unchanged `c5914860` C++ source with the test-only `AURORA_CURRENTNESS_SOURCE` include override; that override belongs only to the harness and is not a production bypass.

Kotlin runtime tests use injected fakes for bounded lifecycle/guard behavior. The C++ harness proves behavior of the compiled production control flow against explicit doubles, not compatibility or inference with the real model. Neither suite is physical proof. A real NDK build proves linking/packaging, not native execution on the tablet. CI status, exact run/artifact IDs and independent review must be read back before declaring this preparation complete.

## Explicitly remaining gates

The artifact uses **DEBUG_FALLBACK**, not the device's persistent physical-development signing key. It is **not authorized for installation** and must not be used to replace an installed candidate implicitly. Do not uninstall Aurora to work around a signature mismatch.

Still separate and unproven: stable signing/installation approval for exact bytes; approved app-private model import with license/integrity checks; real native model load/generation and cancellation under Android; Córtex/Host/PUBLIC-context/session binding; policy/consent/capability-mediated Android actions; voice integration; the eight applicable W15-J first-experience cases; reliability and final certification. No boot or Termux service changes belong to this slice.

Rollback before any future installation is simply to keep using the existing r13 candidate; it has not been changed here. A rollback after future installation will need its own exact signed artifact and device/session plan. Never restore an old snapshot automatically.
