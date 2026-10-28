# Local model connection — Program Control publication readiness

**State:** `READINESS_ONLY / NO_PUBLIC_CONTRACT / NO_RUNTIME_ACTIVATION`  
**Decision record:** [#575](https://github.com/luizanunciostoca/aurora-ai-native/issues/575)  
**Baseline verified 2026-10-28:** `main@c03d99016aef3087727a64f1bd3733ab28581c6a`  
**Blocking dependency:** W15-J [#344](https://github.com/luizanunciostoca/aurora-ai-native/issues/344), OPEN/not accepted; W16 remains PREBUILD.

This is a coordinator-owned **compatibility and release hold**, not a transport protocol, published runtime interface, accepted integration, endpoint advertisement, or permission to merge. Its purpose is to make the next implementation path reviewable without bypassing the active wave DAG or the other agent performing W15-J physical acceptance.

## What has actually been demonstrated

1. Samsung SM-X820, isolated Termux Node/llama.cpp: the **W05-F draft client** generated a non-authoritative response from real `Qwen3.5-2B-Q4_K_M.gguf`, CPU-only, via `127.0.0.1:18080` in [Termux #3139](https://github.com/luizanunciostoca/morro-termux-control/issues/3139); final clean port/process/boot readback [#3140](https://github.com/luizanunciostoca/morro-termux-control/issues/3140). This is a physically observed **laboratory client↔model** exchange, not a deployed Aurora-app path.
2. Draft/unmerged candidates at this baseline: [W05-F #576](https://github.com/luizanunciostoca/aurora-ai-native/pull/576), [W05-E #577](https://github.com/luizanunciostoca/aurora-ai-native/pull/577), [W06-C #578](https://github.com/luizanunciostoca/aurora-ai-native/pull/578), and stacked [W05-F/W06 gate #579](https://github.com/luizanunciostoca/aurora-ai-native/pull/579). Source/CI green in a draft **does not publish a dependency**.
3. The accepted W14 `GatewaySessionManager`, `DeviceSessionTrustManager`, and `GatewayHttpNetworkTransport` already provide authenticated per-socket session, device binding, bounded request lifecycle and cancellation, in the existing `services/mobile-gateway/**`. The Android W15 client already has a `PersistentGatewayHttpChannel`. Reuse these surfaces; never establish another gateway/authenticator.
4. The scoped W14 **candidate** `gateway-auth/local-model-session-admission.ts` (separate draft PR) checks a *server-derived* authenticated socket binding against current W14 gateway/device-session records, and reserves a bounded request ID. It issues only information-only admission metadata. It has **no HTTP route, model invocation, attestation of the model process, Android consumer or published root export**.

## Compatibility path and semantic owners

| Stage | Authoritative owner | Integration responsibility | Explicitly not owned |
| --- | --- | --- | --- |
| Android request/session | W15-B | Use accepted W14 registration/authenticated session/Keystore client on current application channel, with current W15-J experience gate | Trusting localhost or selecting model from the APK |
| Network identity and request lifecycle | W14 | On an **already-authenticated W14 socket**, obtain tenant/actor/correlation/device binding from the server, re-read gateway/device trust, reserve/deadline/cancel request | W05 reasoning, W06 memory, W07 authorization, raw model serving |
| Strategy selection | W05-B/E | Select existing MODEL strategy via canonical registry; require actual verified health/budget source, not caller-supplied booleans | A new model strategy registry or policy engine |
| Context minimization | W06-C | Produce a READY informational PUBLIC prompt for exact tenant/correlation; enforce consent/source boundaries upstream | W14 authentication, bypassing data classifications |
| Inference | W05-F | Only after above gates, use a pinned, measured local model through the candidate read-only client; bound time/input/tokens/cancel/response | Shell, tool execution, Android effect, W07 policy authority |
| Publication, compatibility and gates | Program Control | Decide the single owner of any shared adapter/export and the exact accepted dependency heads; review cross-wave tests and physical claims | Silently accepting PRs or activating W16 |

**Held topology (design proposal; not deployed):**

`W15-B app → existing authenticated W14 channel → W14 information-only admission → accepted W05-B/E and W06-C → W05-F pinned model client → verified Termux model process → candidate text → W15 UI`

The branch from a candidate into a side effect remains **separate**: W02/W07 authority validation → W15 device executor → real receipt/readback. Model output never directly crosses that boundary as authorization.

## Non-negotiable security requirements for the next owning BUILD

1. **Two independent peers must be authenticated.** The existing W14 session authenticates the Android **caller** to the W14 gateway. It does **not** authenticate the **Termux llama.cpp process** to W05-F, nor prevent another Android app from reaching a raw TCP listener on shared `127.0.0.1`. A future owner must design and physically prove host/process peer identity, model/executable integrity freshness, lifecycle, secret isolation, replay protection and revocation. `endpointIdentityVerified` and `modelIntegrityVerified` flags from a caller are **not** cryptographic proof.
2. Request body at the W14 admission gate contains **only** `deviceSessionId`, `requestId`, `deadlineMs`. Session/tenant/actor/correlation, server time and socket connection ID are derived exclusively from the authenticated gateway; client `credential`, `policyToken`, `ActionIntent`, modelHost, arbitrary prompts, `authorizesExecution` and `canInvokeTools` are forbidden at this gate. The actual W05/W06 request shape remains unpublished until compatibility review.
3. W14 admission depends on an existing *current* device-session trust snapshot, but is **not sufficient by itself** to prove the latest registration/attestation revocation in external stores. The final W14 network route owner must revalidate current authoritative device registry and attestation state before dispatch; rejection, cancellation, timeout, duplicate request and reconnect must fail closed. Do not consume a client-supplied trust snapshot.
4. W06-C PUBLIC-only projection is informative; without authenticated W06 producer/source/consent provenance it is still a structural draft. Do not allow unclassified, SECRET, raw credentials, private reasoning or private source references into model prompts, logs or issue evidence.
5. W05-F must be invoked **only** after W04 budget and W05 router/registry checks; negative results (unavailable, timeout, cancellation, thermal/battery/memory pressure, offline) abstain or return safe fallback. No autonomous coding commits, uncontrolled loops, tools or unbounded retries.
6. All responses are **untrusted informational text**. Neither model strategy selection, W14 admission, W06 READY, model-generated JSON, nor a health flag confers W07/Android permission or proves an effect.
7. Protect exact endpoint configuration and release manifest through the correct owning task. Do not change launcher, Termux:Boot, package signatures, shared root barrels, Android main app, production defaults or live APK under a readiness PR.

## Ordered promotion checklist — blocked until separately authorized

| Gate | Evidence required | Present status |
| --- | --- | --- |
| P1 — Owner/paths | W14 leaf and Program Control allocation recorded in #575; W15-B/W05/W06 owners acknowledged, no shared-file collision | Allocation recorded; cross-wave publication pending |
| P2 — Source contracts | Owner-reviewed accepted W05-B/E/F + W06-C exact commits, W14 admission leaf; no new registry/DeviceRef/authority primitive | Four W05/W06 PRs still draft, W14 admission draft candidate |
| P3 — Deterministic failure tests | Tenant/actor/correlation mismatch, expired/revoked gateway/device, replay/deadline, forbidden fields, origin/provenance, injected tool calls, bounded cancellation | W14 admission unit gate available; cross-wave/authenticated producer and peer tests pending |
| P4 — Real model identity | A W14/host owner certifies actual process, binary/model digest and fresh endpoint binding against bypass/spoof/other-app access; rejection after crash/restart | **NOT PROVEN**; lab hash and loopback alone insufficient |
| P5 — Android app path | Current W15 app authenticated via existing W14 session to model-mediated informational response; same device/build/correlation; no `adb reverse` assumptions | **NOT PROVEN**; W15-J #344 OPEN |
| P6 — Physical coexistence | W15-J independent 8/8 PASS evidence; actual RAM/thermal/battery/display-off/recovery and voice cancellation, no boot/Termux Agent V3 regressions | **BLOCKED** pending owning physical gate and measurements |
| P7 — Acceptance | Exact-head Quality/Test Build/Security + independent review; Risk Gates A–D; owner-authorized merge; post-merge main readback and dependency release | **NOT AUTHORIZED** by this readiness request |

## Recommended next implementation slice after dependency release

The owning coordinator should, **after accepted upstream heads and W15-J authority review**, allocate one small feature-gated network adapter in the **existing W14 HTTP transport** that consumes the admitted W14 request and invokes an injected *information-only* W05 application port. This adapter must have integration tests that run an actual authenticated HTTP socket and explicitly reject anonymous/replayed/cross-device requests. The W05 application port must receive a W06-minimized PUBLIC projection and return candidate text only. Separately certify the host/model process peer before the flag can ever be enabled outside an isolated lab.

No API route name, JSON schema beyond the internal W14 preflight body, root barrel export, `DeviceId`, Android permission or deployment setting is published by this document. Their specification belongs to the review of the actual owner/compatibility PR, not this readiness proposal.

## Rollback and decision status

- Closing the two **draft** PRs abandons the candidates; production and `main` remain unchanged. Do not delete another worker's branch or W15-J evidence.
- Scope remains `TASK: PARTIAL / READINESS_ONLY`, `AUTHORIZATION: AUTHORIZED_FOR_DRAFTS_ONLY`. Local W05-F↔Qwen laboratory is `PHYSICALLY_PROVEN`; W14 eligibility tests are `IMPLEMENTED / TESTED_IN_ISOLATION`; Android app↔authenticated W14↔verified model peer and production are `NOT_PROVEN`.
- Physical acceptance (the W15-J owner's 8/8 gate) and certification (cross-wave Risk Gates A–D, exact-head/merge/post-merge) are **distinct** and neither is asserted here.
