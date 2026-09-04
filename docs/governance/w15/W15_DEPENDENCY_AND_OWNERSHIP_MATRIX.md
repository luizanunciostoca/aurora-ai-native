# W15 — Dependency and Ownership Matrix

Status: `CANDIDATE_FREEZE_W15_00`
Candidate base / reconciled main snapshot: `8d2f4498983c04921ad18512fc02e759c244ff3a`

## Internal dependency matrix

| Node | Hard predecessors | Primary output | Release rule |
| --- | --- | --- | --- |
| W15-00 | W02-PB5, W03-F, W04-H, W07-H, W14-H | W15 ownership/DAG/risk/publication freeze | governance-only; accepted before runtime work |
| W15-A | W15-00 | Android application foundation, presence/lifecycle | no native side-effect authority |
| W15-B | W15-A | W14-compatible device registration/session client + Android Keystore boundary | no second device identity; Keystore possession is not authority |
| W15-C | W15-B | native capability bridge | maps W04 capabilities; availability != permission != authority |
| W15-E | W15-B | local permission/consent precondition broker | OS permission/consent state never substitutes W02 authority |
| W15-D | W15-C, W15-E | installed-app integration layer | governed precedence; no silent Accessibility fallback |
| W15-F | W15-C, W15-E | concrete W07-compatible DEVICE executor | native side effects only here/owned descendant adapters; W07 outcome semantics preserved |
| W15-G | W15-C, W15-E | voice/wake/presence fast path | speech/intent confidence never grants authority |
| W15-I | W15-C, W15-E | optional Device Owner/Launcher profile | optional; privilege cannot bypass policy |
| W15-H | W15-D, W15-F, W15-G | offline-safe reconnect/dedupe/reconciliation orchestration | W03 durability + W07 uncertain/retry rules preserved |
| W15-J | W15-H, W15-I | physical-device integration/security/performance acceptance | closes W15 physical gate only; W19/W20 remain downstream |

No issue may be promoted to BUILD_READY solely because a sibling is accepted. Program Control must re-evaluate every hard predecessor, live `main`, active ownership and canonical PR state at promotion time.

## Path ownership freeze

### W15 exclusive runtime surface

`apps/aurora-android/**` is W15-owned after W15-00 acceptance, subject to the per-node semantic leaves below. A descendant should extend the existing Android application surface instead of creating parallel mobile applications/services unless live main and the issue explicitly require otherwise.

| Surface / semantic leaf | W15 owner |
| --- | --- |
| app/build/environment/lifecycle/presence/process restart | W15-A |
| Android-side W14 registration/session client and local secret/Keystore use | W15-B |
| native capability discovery/binding/compatibility/freshness | W15-C |
| installed-app/deep-link/intent/governed adapter integration | W15-D |
| Android runtime permission/local consent precondition broker | W15-E |
| concrete DEVICE executor and native-action execution boundary | W15-F |
| voice/wake/presence deterministic fast path | W15-G |
| local offline/reconnect/dedupe orchestration | W15-H |
| optional dedicated-device/Device Owner/Launcher profile | W15-I |
| physical Android integration evidence and W15 wave acceptance | W15-J |

### Canonical cross-wave owners that W15 must not absorb

| Concern | Canonical owner | W15 rule |
| --- | --- | --- |
| tenant/actor/subject/correlation primitives | W01 | consume only |
| policy/current action authority/approval | W02 | never derive from device/local state |
| generic event durability, outbox/inbox, idempotency/replay | W03 | local orchestration must reuse/align |
| target-neutral Capability Registry/CapabilityPlan | W04 | map availability; do not fork taxonomy |
| generic execution target/outcome/uncertainty/reconciliation/retry authority | W07 | concrete DEVICE executor conforms |
| provider-specific adapters/credentials/write transport | W08 | no device bypass |
| DeviceId/DeviceRef, gateway/session/trust/revoke/receipt ingress | W14 | consume accepted DP3 contracts |
| production telemetry/SLO | W17 | W15 produces evidence, not global production claim |
| device security hardening | W19 | hand off unresolved threat-hardening items |
| final release/physical rollout acceptance | W20 | W15-J is not Release 1.0 |

## Device executor integration freeze

W15-F is the only W15 node authorized to establish the concrete Android DEVICE executor boundary. W15-C/D/E/G/H/I may provide capability adapters, preconditions, orchestration or optional deployment facilities but must not execute a side effect directly from planner/model/transport input.

The Device Executor must, immediately before a native/app action where required by the accepted W07 contract:

1. bind the current W14 device/session target;
2. verify the request is a W07-compatible governed execution request, not a raw planner/model command;
3. revalidate capability availability/freshness and local OS preconditions;
4. enforce cancellation/kill/revocation/current-authority requirements owned by upstream contracts;
5. execute a bounded native/app operation;
6. return receipt/evidence/readback without promoting local acknowledgements to verified external truth;
7. classify ambiguity as `EXECUTION_UNCERTAIN` and defer retry/reconciliation authority to W07 semantics.

## Secret and privilege boundary

- Android Keystore key material, private keys, auth/session secrets and biometric material stay local and non-serializable.
- Public/cross-wave records may carry only opaque references or non-secret metadata explicitly required by accepted contracts.
- Biometric or device-unlock success may unlock local key use but cannot generate PolicyToken/OwnerDecision/approval.
- Device Owner/Launcher/elevated Android privileges are deployment capabilities, not Aurora authority.

## Namespace locks

1. W14 `DeviceId` / `DeviceRef` is the sole canonical device identity/reference pair consumed by W15.
2. W04 capability identifiers remain target-neutral canonical definitions; W15 adds Android bindings rather than parallel business capability names.
3. W07 `ExecutionTargetReference(kind=DEVICE)` and generic executor outcome taxonomy remain canonical.
4. W15-local permission/status enums must remain local precondition vocabulary and cannot masquerade as W02 authority decisions.
5. W15 receipts/evidence must remain compatible with W07/W14 evidence semantics and must not redefine success truth.