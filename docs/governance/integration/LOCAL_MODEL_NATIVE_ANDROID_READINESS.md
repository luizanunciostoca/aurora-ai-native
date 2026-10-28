# Native Android local inference — no-Termux readiness option

**State:** `READINESS_ONLY / DRAFT / NO_ANDROID_BUILD / NO_RUNTIME_ACTIVATION`  
**Decision authority:** [Program Control #575](https://github.com/luizanunciostoca/aurora-ai-native/issues/575)  
**Baseline checked 2026-10-28:** `main@c03d99016aef3087727a64f1bd3733ab28581c6a`  
**Blocking physical gate:** [W15-J #344](https://github.com/luizanunciostoca/aurora-ai-native/issues/344), OPEN.  
**Related unmerged readiness:** [W05-F #582](https://github.com/luizanunciostoca/aurora-ai-native/pull/582), [W14 #580](https://github.com/luizanunciostoca/aurora-ai-native/pull/580), [Program Control #581](https://github.com/luizanunciostoca/aurora-ai-native/pull/581).

## Decision and limits

The preferred *candidate* for a future product that runs local Qwen **without Termux** is a native Android inference component in the **existing Aurora APK**. It loads a verified GGUF model from Aurora's own app-private storage and invokes a pinned `llama.cpp` Android library via Kotlin/Android NDK/JNI. Initially use CPU only; consider acceleration only after the same-device benchmark and risk review.

The local model is a bounded **information-only** engine. It is not an Android executor, W02 permission engine, W14 gateway, W05 registry, W06 context store or self-directed coding agent. No model text, confidence or tool-call-shaped output can authorize Android action. W02/W07 remain the action-authority path; W15-F remains the concrete DEVICE executor.

This document **does not** allocate Android implementation paths, implement a new APK, publish any interface, install an APK, copy a Termux-owned model, remove Termux, change boot/service settings, or certify operation on the Samsung tablet. The Termux Agent V3 can remain an independent development/recovery channel without becoming a dependency of Aurora's product runtime.

## Distinguish the two independent connections

| Concern | Proposed product path without Termux | Authority and caveat |
| --- | --- | --- |
| Backend Aurora → tablet | Existing W14 authenticated device/gateway session → W15 Android app | W14 authenticates caller/session/device; neither transport possession nor device trust grants W07 action authority. The present Android LOCAL bootstrap uses development `adb reverse` facilities; independent physical networking is not yet proven. |
| Tablet Aurora → local Qwen | W15 app → private in-app Kotlin inference adapter → pinned NDK/JNI `llama.cpp` → app-private GGUF | No localhost HTTP listener, transient HTTP bearer or separate Termux model process is necessary *inside the same app*. Android app identity replaces that specific localhost boundary, but not source integrity, native-code safety or upstream authority checks. |
| Candidate → native action | W02 current policy/authority → W07 governed request → W15-F DEVICE executor → receipt/readback | Remains separate from both model and gateway. A local model cannot emit an executable authorization. |

An **offline local reply** does not automatically make all Aurora capabilities offline: missing W02/W14/W03 authoritative state must fail closed or use an explicitly accepted offline-safe path, never be recreated by the on-device model.

## Proposed native component — design only, not a published contract

1. **Provenance and model import:** select a reviewed upstream `llama.cpp` commit and its Android example; record source license, reproducible NDK version, ABI, binary hashes and software bill of materials. Import/download Qwen into Aurora-owned private storage using an Android-supported user-approved mechanism. Check free space, complete length, SHA-256, model format and consent before making it available. Never bypass Android app sandboxing to read Termux private files.
2. **Native inference boundary:** a *private*, non-exported Kotlin component, initially called only in response to a user-visible bounded request, loads the model on a non-UI thread. The Kotlin/NDK integration must support a fixed GGUF identity, context/token/input budgets, one inference at a time, absolute deadline and cancellation; promptly unload resources on teardown. Starting a server on `127.0.0.1` is not the preferred same-app route.
3. **Information-only W05/W06 composition:** a future owner-reviewed adapter passes only a W06-minimized, authorized-for-local-use PUBLIC prompt and a bounded correlation/deadline after the accepted W05 strategy/budget gate. No raw private context, device credential, `PolicyToken`, `ActionIntent`, shell tool or Android permission is exposed to JNI/model. The model returns *untrusted text*, never an authority verdict.
4. **Android process and lifecycle:** decide under W15-A and W15-C whether the native worker shares the app process or uses a private bound service/process after measuring crash and memory behavior. If a service is required, choose a documented, valid Android service/foreground type and explicit lifecycle; never assume unrestricted background/boot execution. A separate APK, externally exported service and third-party binder interface are out of scope without an explicit W15 owner decision.
5. **Existing network ownership:** W15-B continues consuming accepted W14 device/session/Keystore contracts for backend connectivity. This native model does not replace W14 authentication or create another gateway; W15-H/W03 handle approved offline/reconnect semantics, and W07 continues to own effect/receipt/reconcile behavior.

Official implementation references (examples, **not** release-authorized dependencies):

- [`llama.cpp` Android documentation and `examples/llama.android`](https://github.com/ggml-org/llama.cpp/blob/master/docs/android.md) — Android Studio binding, GGUF in app-private storage and Android NDK build guidance.
- [Android private app storage](https://developer.android.com/training/data-storage/app-specific) — process sandbox, scoped file access and free-space checks.
- [Android bound services](https://developer.android.com/develop/background-work/services/bound-services) and [background service restrictions](https://developer.android.com/develop/background-work/services) — deliberate lifecycle rather than persistent unauthorized daemon.

## Verified input and explicit unknowns

| Input | Evidence | Do not infer |
| --- | --- | --- |
| Samsung SM-X820 ARM64 and Qwen3.5-2B-Q4_K_M GGUF | Isolated [Termux #3150](https://github.com/luizanunciostoca/morro-termux-control/issues/3150): model size `1,280,835,840` bytes, SHA-256 `aaf42c8b7c3cab2bf3d69c355048d4a0ee9973d48f16c731c0520ee914699223`, real reply; independently clean [#3153](https://github.com/luizanunciostoca/morro-termux-control/issues/3153). | JNI can load that same GGUF in Aurora, native speed, thermals, available app heap or display-off continuity. |
| Existing Android W15 application | `apps/aurora-android/app/build.gradle.kts`, manifest, `SecureDeviceSessionClient`, `DeviceExecutorRuntime`, native wake/voice files on current `main`. | The APK already embeds an Android NDK inference engine. It does **not**. |
| Existing W05-F keyed client | [DRAFT #582](https://github.com/luizanunciostoca/aurora-ai-native/pull/582) with CPU/Termux real-model proof. | Node/HTTP transport can be reused unchanged as Kotlin/JNI, or its bearer proves a native process. |
| Android SDK/NDK/ADB on the current orchestration host | Read-only toolchain inventory on 2026-10-28: Java present; Android SDK, NDK, ADB, CMake and Gradle commands not found. | Any native APK was compiled, signed, installed or physically accepted from this host. |

The initial *lab* configuration should be conservative and measured on the actual device: one request/worker, CPU-only, short context, bounded output and timeout. Termux's roughly 4.6 GiB available RAM at the earlier probe is a point-in-time observation, **not** an Android-app memory guarantee. Never ship numerical thresholds from a single measurement without thermal/pressure tests.

## Isolated proof gates (no interference with W15-J)

| Gate | Required observation | Current result |
| --- | --- | --- |
| N0 — Ownership and source | Program Control allocates exact **new W15-owned** laboratory/test paths after the W15-J owner acknowledges no overlap; acceptable upstream licenses/SHAs and Android NDK build are pinned. No change to W15-J APK or accepted W15 runtime. | `PENDING` |
| N1 — Native binary | A separately signed, non-production Android lab package or W15-owner-approved instrumentation test builds `arm64-v8a` native engine at exact source/build SHA; SHA and model import are read back. Avoid creating a second canonical Aurora application. | `NOT_PROVEN` |
| N2 — Physical local reply | On SM-X820 the **Android** process, not Termux, loads exact GGUF and returns an actual bounded answer; record Android PID/UID, APK digest, model digest, response latency, peak RAM, CPU/battery and logs free of secrets. | `NOT_PROVEN` |
| N3 — Negative and lifecycle | Missing/wrong/truncated model SHA, cross-app file access, cancellation, timeout, concurrent requests, OOM/thermal pressure, crash/restart, screen-off/background limits, untrusted tool request all fail safely; no unrequested daemon/autostart. | `NOT_PROVEN` |
| N4 — Governed Aurora composition | Only after owner-reviewed W05/W06/W14/W15 bridge and acceptance dependencies: public prompt → local text; backend↔W14↔Android peer proven on same physical tuple without relying on Termux/`adb reverse`; W02/W07 negative execution test remains denied. | `BLOCKED` |
| N5 — Product promotion | W15-J independent physical 8/8 acceptance, exact-head Quality/Test Build/Security, Risk Gates A–D, reviewer/owner approval, controlled merge and post-merge readback; separate W20-H full DP5/DP7 certification. | `BLOCKED` |

There is no mandate that N1–N3 wait for W15-J **if** the W15-J owner explicitly allocates an independent lab path and proves non-interference. N4/N5 cannot bypass their own dependency gates; a successful lab APK cannot be reused as W15-J evidence or treated as an Aurora production release.

### Failure and evidence matrix

Record, with exact app/engine/model/device identity, at least: valid public prompt; inaccessible app-private model from foreign UID; corrupt/truncated GGUF; low free disk/RAM; missing native library/unsupported ABI; cancellation before and during generation; request timeout; simultaneous requests; model crash and clean unload; screen-off/relaunch/thermal throttling; re-import/reinstall; model-generated fake action/permission; offline behavior; secret/PII redaction. The test harness must collect observable **effects**, not only success flags or mock assertions.

## Owner allocation and promotion hold

- **Program Control** owns this planning document, proposed dependency order, native implementation ownership review and release decision. This file does not change any accepted ownership matrix.
- **W15-A** owns app build/runtime/lifecycle and any future Gradle/manifest/native packaging modifications; **W15-C** owns device capability/ABI readiness; **W15-B** owns Android W14 session and Keystore use; **W15-J** owns its ongoing physical acceptance and must not be displaced.
- **W05-B/E/F** own model routing/strategy/worker semantics; **W06** owns prompt source, classification, consent and minimization; **W14** owns backend peer authentication; **W02/W07** retain action-authority/execution boundaries; **W19/W20** retain threat and final-release gates.
- Any implementation route spanning those surfaces needs an explicit exact-path allocation and dependency decision in [#575](https://github.com/luizanunciostoca/aurora-ai-native/issues/575). Do not silently write into `apps/aurora-android/**`, edit existing Android build/manifest, create a parallel shipping APK, export an API, change boot, install new native code or stop the Termux agent from this readiness artifact.

**Risk gates:** A — information-only intent `PASS_DESIGN_ONLY`; B — classified prompt/provenance and private file/data flow `PENDING`; C — pinned native binary/model/Android process identity and threat hardening `NOT_PROVEN`; D — physical native and W15-J product experience `NOT_PROVEN`. **Physical acceptance and certification are separate.**

**Rollback:** close this single-document DRAFT without merging. Main, all W15-J candidates, APK, model files, Termux Agent V3, boot and production endpoints remain unchanged. If a later lab artifact is provisioned, it requires a separate owner-approved installation/removal and post-action readback plan.

**Verdict:** `TASK: PARTIAL / READINESS_ONLY`; `CAPABILITY: DOCUMENTED`; `AUTHORIZATION: AUTHORIZED_FOR_PLANNING_ONLY`; `ANDROID_NATIVE_QWEN: NOT_PROVEN`; `W15_J: NOT_ACCEPTED`.
