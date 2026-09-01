# W07 WAVE CHARTER — EXECUTOR PLANE / SIDE-EFFECT SAFETY

Date: 2026-09-01  
Status: `W07_00_COORDINATION_FREEZE_CANDIDATE`  
Coordination base main: `b502bfa7e97291086c09cc85cd71040f96d3b036`  
Owner: AURORA PROGRAM CONTROL / W07-00

## 1. Mission

Build Aurora's deterministic generic execution boundary for governed side effects:

`ActionIntent -> current Policy/Authority validation -> target resolution -> idempotency/preconditions/quotas/deadline -> execute -> readback -> Receipt/Evidence -> reconcile uncertainty`.

W07 owns generic target-neutral executor semantics, including failure containment, circuit breaker and kill switch. It does not own provider adapters, Android runtime, n8n workflow runtime or business decisions.

## 2. Prerequisites and release basis

W07-00 is dependency-eligible because W04-H is accepted. Canonical upstream state at this freeze:
- W02: `COMPLETE_ACCEPTED / REALITY_GATE_1_AUTHORITY_VERIFIED`, including deterministic policy, authority validation and informational-only precheck semantics.
- W03: `COMPLETE_ACCEPTED / REALITY_GATE_DURABLE_EVENT_DELIVERY_VERIFIED`, including durable idempotency/event/replay/timer/lease/workflow primitives.
- W04: `COMPLETE_ACCEPTED / W04_CONTROL_CORE_VERIFIED`, including target-neutral Capability Registry/CapabilityPlan, lane and ExecutionBudget constraints.
- W04-H PR #151 exact candidate `b4de1097b03a4b94bc81ac38f6cbe0019244724b`; controlled merge `fcc26c1065961ec6ca52019195108f3562c33365`; post-merge Quality `33507711472`, Test Build `33507711290`, Security `33507712325`: SUCCESS.
- Final W04 governance convergence main: `b502bfa7e97291086c09cc85cd71040f96d3b036`.

No W07 descendant is released merely by this candidate. W07-00 must itself pass exact-head acceptance and convergence first.

## 3. Canonical inputs

- live GitHub `main`, exact accepted SHA/PR/CI evidence and `CURRENT_PROGRAM_STATUS.md`;
- Developer Manual v0.5 sections 12, 26, 29, 31-34;
- Action Plan v0.4.1 Device/Edge amendment;
- accepted ADR-002 execution-target direction;
- W02 accepted policy/authority contracts/runtime;
- W03 accepted idempotency/durability/event primitives;
- W04 accepted target-neutral capability/control outputs;
- Device Plane cross-wave ownership/dependency matrix;
- TOCA MCP executor/approval/readback/failure-containment patterns as reference-only inputs, never inherited authority/runtime.

## 4. Live repository audit

At coordination base `b502bfa7...`:
- `services/executors/STATUS.md` is a scaffold explicitly assigned to W07; no generic executor runtime is implemented there.
- canonical W01 `ActionIntent` at `packages/contracts/src/actions/action-intent.ts` is provider-oriented through optional `providerBinding` and has no first-class execution-target reference.
- canonical `Receipt` at `packages/contracts/src/receipts/receipt.ts` requires a provider reference, which cannot represent DEVICE/WORKFLOW/LOCAL_SERVICE without a fake provider.
- canonical `Evidence` supports generic executor/system sources but retains provider-specific types/readback vocabulary that requires compatibility-safe target-neutral evolution.
- W04 Capability Registry is target-neutral and must remain planning metadata, not execution authority.
- W03 already owns durable idempotency/replay primitives; W07 must integrate rather than duplicate them.
- W07 machine graph exists at `docs/governance/copilot/tasks/W07.json` as schema v1 and needs schema-v2 path/ownership/readiness locks.

## 5. Architectural invariants

1. **ActionIntent-only execution boundary.** Generic executor paths consume a governed canonical ActionIntent; planners/models/agents do not call target adapters directly.
2. **Current authority wins.** When operation semantics require authority, W07 validates current policy/authority at execution time. Stale precheck/cache/lane/confidence/template/strategy outputs never authorize execution.
3. **Deny by default.** Missing, malformed, expired, revoked, wrong-tenant, wrong-subject, wrong-scope, incompatible-policy-version or constraint-invalid authority fails closed.
4. **Target resolution is not authority.** Discovering an available compatible provider/device/workflow/local service cannot grant permission.
5. **No fake provider identity.** DEVICE, WORKFLOW and LOCAL_SERVICE are first-class target kinds; they must not populate synthetic provider IDs just to satisfy legacy Receipt fields.
6. **Compatibility-safe contract evolution.** W01 remains the canonical contract family. W07-A may introduce versioned/additive target-neutral evolution and migration adapters/tests; it may not create a competing ActionIntent/Receipt/Evidence source of truth.
7. **Idempotency before external call.** Duplicate detection/precondition fencing occurs before any irreversible side effect.
8. **Replay/reconnect cannot duplicate irreversible side effects.** W03 durability and W07 idempotency/reconciliation compose explicitly.
9. **EXECUTION_UNCERTAIN != FAILED.** If a side effect may have occurred, reconcile-before-retry is mandatory; blind retry is prohibited.
10. **Readback outranks acknowledgement.** A target acknowledgement/receipt is not proof of intended external state; verified result requires target-appropriate readback/evidence when semantics require it.
11. **Kill switch is non-bypassable.** Model/router/agent outputs, Fast Lane and budget cannot override kill/circuit/failure-containment state.
12. **Safety is outside degradable budget.** ExecutionBudget may limit optional strategy/time/attempts but cannot suppress mandatory authority, idempotency, precondition or uncertainty checks.
13. **Secrets never enter public execution evidence.** Credentials remain referenced by governed secret/adapter layers; receipts/evidence carry safe references only.
14. **Generic executor remains target-neutral.** W08 owns provider adapters; W09 owns n8n fabric; W14 owns device registration/session/trust; W15 owns Android/native device executor implementation.

## 6. Namespace and ownership direction

Canonical W07 semantic surfaces:
- `services/executors/src/sdk/**` — W07-B current validation/executor boundary.
- `services/executors/src/safeguards/**` — W07-C idempotency/preconditions/quotas/deadlines.
- `services/executors/src/target-resolution/**` — W07-D generic target resolver.
- `services/executors/src/readback/**` — W07-E target-neutral readback/Receipt/Evidence production runtime.
- `services/executors/src/reconciliation/**` — W07-F EXECUTION_UNCERTAIN state machine.
- `services/executors/src/failure-containment/**` — W07-G circuit breaker/kill switch/cancellation/degraded state.
- W07-H integration/fault-injection tests and `docs/governance/w07/**`.

W07-A owns narrowly allocated execution-target contracts/schemas plus compatibility-reviewed evolution of existing ActionIntent/Receipt/Evidence files. Public/root barrels/export maps and package manifests remain Program Control-controlled publication surfaces.

Exact allocations are frozen in `W07_OWNERSHIP_MATRIX.md` and migration semantics in `W07_EXECUTION_TARGET_COMPATIBILITY_FREEZE.md`.

## 7. Internal DAG

`W07-00 -> W07-A`

`W07-A -> (W07-B || W07-C || W07-D || W07-E)`

`W07-B + W07-C + W07-D + W07-E -> (W07-F || W07-G)`

`W07-F + W07-G -> W07-H`

Every edge requires accepted predecessor evidence, not draft code, PREBUILD or green CI alone.

## 8. Publication barriers

- **X0:** W07-00 coordination/ownership/risk/compatibility freeze accepted.
- **X1:** W07-A ExecutionTargetReference + compatibility-safe ActionIntent/Receipt/Evidence evolution accepted.
- **X2:** W07-B current policy/authority validation boundary accepted.
- **X3:** W07-C idempotency/preconditions/quotas/deadlines accepted.
- **X4:** W07-D target resolver accepted.
- **X5:** W07-E target-neutral Receipt/Evidence/readback semantics accepted.
- **X6:** W07-F uncertainty/reconcile-before-retry accepted.
- **X7:** W07-G circuit breaker/kill switch/failure containment accepted.
- **X8:** W07-H integration/fault-injection/consumer publication accepted.

W08/W09/W14/W15 cannot infer release from a partial barrier; each owning live dependency matrix must be satisfied.

## 9. Consumer boundaries

### W08 Provider Adapters
May implement provider-specific binding/credentials/rate-limit/readback only after required W07 public surfaces are accepted. Provider adapter never decides business authority.

### W09 n8n Fabric
May bind governed workflows after target contracts/executor boundaries exist. n8n never becomes policy/authority/source of truth.

### W14 Device Gateway
Owns DeviceId/DeviceRef decision, registration, tenant/identity binding, session/trust/attestation, reconnect/revoke transport. W07 must not invent these identifiers.

### W15 Android & Device Plane
Owns native capability bridge, local permissions/consent brokerage and Device Executor implementation. It consumes W07 target/executor contracts after required W07/W14 barriers.

## 10. Hard boundaries

W07 MUST NOT implement:
- provider-specific adapters/credentials or paid-media/social business rules (W08/verticals);
- n8n workflow runtime/business automation (W09);
- DeviceId/session/trust/gateway transport (W14);
- Android/native app integration or local permission UI (W15);
- W17 production telemetry/SLO platform;
- W19 final threat-hardening program;
- PolicyToken/OwnerDecision issuance or a second Policy Engine.

## 11. Acceptance target for W07-00

W07-00 is accepted only when:
- charter, dependency, ownership, acceptance, risk and compatibility artifacts agree;
- `docs/governance/copilot/tasks/W07.json` is schema v2 with the same DAG, exact leaf paths and shared-publication locks;
- the provider-centric W01 contract debt is explicitly mapped to a no-fake-provider, versioned migration strategy without modifying runtime in this coordination node;
- no provider/device/workflow/local runtime is implemented by W07-00;
- candidate Quality, Test Build and Security pass on one exact final HEAD;
- independent acceptance occurs; the author does not self-merge/self-accept;
- controlled merge, post-merge verification, Drive evidence and GitHub state converge before W07-A is released.

Until W07-00 itself is accepted, W07-A remains implementation-gated.