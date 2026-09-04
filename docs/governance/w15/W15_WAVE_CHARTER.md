# W15 — Android Device Plane Wave Charter

Status: `CANDIDATE_COORDINATION_FREEZE_W15_00`
Task: `W15-00`
Issue: `#115`
Candidate base / reconciled main snapshot: `8d2f4498983c04921ad18512fc02e759c244ff3a`

## Authority and dependency proof

W15-00 is a governance-only coordination node. Live `main`, accepted exact-SHA/PR evidence, current program status, accepted ADRs and owning-wave governance remain superior authority.

At the candidate base the W15 graph prerequisites are accepted:

- W02-PB5 — issue `#71` accepted: policy/action authority remains outside Android/runtime possession.
- W03-F — issue `#88` accepted: durable/idempotency/replay semantics remain W03-owned.
- W04-H — issue `#97` accepted: target-neutral Capability Registry/CapabilityPlan remains W04-owned.
- W07-H — issue `#140` accepted: executor outcome, uncertainty, reconciliation and retry authority remain W07-owned.
- W14-H — issue `#265`, PR `#384`, accepted merge `8d2f4498983c04921ad18512fc02e759c244ff3a`: DP3 is open and W14 gateway/session/trust/receipt-ingress contracts may be consumed by W15.

## Mission

Implement the Android device execution plane without converting device presence, authentication, Keystore possession, Android permission state, local capability availability or transport acknowledgements into Aurora business/action authority.

W15 owns the native/mobile realization of already-governed DEVICE-target work: application lifecycle, secure local device/session handling, native capability bindings, permission/consent preconditions, installed-app integration, concrete Device Executor execution, voice/presence fast paths, offline-safe orchestration, optional dedicated-device profile and physical-device acceptance.

## Canonical internal DAG

`W15-00 -> W15-A`

`W15-A -> W15-B`

`W15-B -> (W15-C || W15-E)`

`W15-C + W15-E -> (W15-D || W15-F || W15-G || W15-I)`

`W15-D + W15-F + W15-G -> W15-H`

`W15-H + W15-I -> W15-J`

Acceptance of W15-00 releases only W15-A. Descendants become BUILD_READY only when every explicit predecessor is `aurora:accepted` and live ownership/race checks are clean.

## Cross-wave authority boundaries

- **W01** owns tenant, identity, actor/subject, correlation and classification primitives.
- **W02** owns current policy/action authority, approvals and authority-bearing decisions/tokens. Android permission, biometric success, local consent UI, app installation, device trust and session authentication are preconditions/evidence only.
- **W03** owns generic durability, inbox/outbox, idempotency and replay semantics. W15 may coordinate local/offline delivery state but cannot create a second generic durability authority.
- **W04** owns target-neutral capability definitions/plans. W15 maps them to Android availability/preconditions; local discovery never grants execution authority.
- **W07** owns generic executor lifecycle, current-authority validation contract, execution outcome, `EXECUTION_UNCERTAIN`, reconciliation-before-retry and retry eligibility. W15-F is a concrete DEVICE executor and must conform to, not redefine, W07.
- **W08** owns provider adapters/credentials and remains separate from Android native capability execution. W15 cannot use device transport to bypass W08 governed provider writes.
- **W14** owns DeviceId/DeviceRef registration namespace, authenticated gateway/session correlation, trust/attestation reference state, reconnect/session delivery coordination and receipt/evidence ingress. W15 consumes these contracts and never creates competing device identity or gateway authority.
- **W17** owns production telemetry/SLO claims; **W19** owns downstream device-security hardening; **W20** owns final physical/release acceptance beyond W15's wave gate.

## W15-owned implementation surface

After W15-00 acceptance, `apps/aurora-android/**` is the canonical W15 Android/runtime surface unless a descendant issue explicitly authorizes another path after live reconciliation. Cross-wave shared contracts, root manifests, generic executor semantics and publication surfaces remain Program Control/owning-wave governed.

W15-00 itself is governance-only and may change only `docs/governance/w15/**`.

## Non-negotiable invariants

1. `Policy/action authority != Android permission != session authentication != session trust != Keystore possession != biometric success != execution`.
2. W15 must consume W14 `DeviceId` / `DeviceRef`; it must never publish `TabletId`, `PhoneId`, app-install ID, hardware serial or advertising ID as a competing canonical Aurora device identity.
3. No planner/model/voice transcript may invoke a native side effect directly. Native execution must enter through the governed W07-compatible DEVICE executor boundary.
4. Local capability discovery and OS permission state are preconditions only; both may become stale and must be revalidated at the execution boundary where required.
5. Ambiguous native/app outcomes are `EXECUTION_UNCERTAIN`; reconcile/read back before any retry allowed by W07 semantics.
6. Reconnect/process restart/offline queues must preserve W03 idempotency and must not blindly replay uncertain, expired-authority, revoked-session or cancelled commands.
7. Raw secrets, private keys, refresh/session tokens, biometric material and Android Keystore key material must never enter logs, evidence, semantic cache or governance fixtures.
8. Accessibility/computer-use/UI automation is never a convenience fallback; any use requires explicit high-risk governance, bounded scope, current authority and negative-path acceptance evidence.
9. Optional Device Owner/Launcher privilege cannot become a prerequisite for standard-app correctness and cannot bypass Aurora policy.
10. Physical-device performance, battery/resource and production SLO claims require measured evidence; emulator/unit evidence cannot be relabelled as physical or production evidence.

## W15-00 acceptance scope

Acceptance requires exact-final-HEAD Quality, Test Build and Security; cleanup/duplicate/source-of-truth/scope-leak audit; Risk Gates A-D; live-main race check immediately before expected-head protected merge; and post-merge exact-main Q/TB/S before W15-00 is marked `aurora:accepted` and W15-A is released.