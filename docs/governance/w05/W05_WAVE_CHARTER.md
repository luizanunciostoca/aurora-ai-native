# W05 WAVE CHARTER — INTELLIGENCE RUNTIME / ROUTING / REASONING

Date: 2026-09-01  
Status: `W05_00_COORDINATION_FREEZE_CANDIDATE`  
Coordination base main: `b502bfa7e97291086c09cc85cd71040f96d3b036`  
Owner: AURORA PROGRAM CONTROL / W05-00

## 1. Mission

Build Aurora's intelligence runtime without weakening the already accepted control, policy, durability or executor boundaries. W05 owns task classification, Intelligence Router, ReasoningLevel L0-L5, confidence decomposition, one strategy registry, bounded generic agent-worker runtime, bounded inspect/repair loops and routing evaluation.

W05 answers **which reasoning/strategy is sufficient for this task and when should intelligence escalate or abstain?** It never answers **may this side effect execute?** and never performs external side effects.

## 2. Prerequisites and release basis

W05-00 is dependency-eligible because W04-H is accepted. Canonical upstream state at this freeze:
- W02: `COMPLETE_ACCEPTED / REALITY_GATE_1_AUTHORITY_VERIFIED`; current policy/precheck/authority boundaries are available.
- W03: `COMPLETE_ACCEPTED / REALITY_GATE_DURABLE_EVENT_DELIVERY_VERIFIED`; durable event/idempotency/lease/workflow foundations are available.
- W04: `COMPLETE_ACCEPTED / W04_CONTROL_CORE_VERIFIED`.
- W04-H PR #151 exact candidate `b4de1097b03a4b94bc81ac38f6cbe0019244724b`; merge/main `fcc26c1065961ec6ca52019195108f3562c33365`; post-merge Quality `33507711472`, Test Build `33507711290`, Security `33507712325`: SUCCESS.
- Final W04 governance convergence main: `b502bfa7e97291086c09cc85cd71040f96d3b036`.

No descendant W05 node is released merely by this candidate. W05-00 itself must be independently accepted first.

## 3. Canonical inputs

- GitHub `main`, accepted PR/exact-SHA evidence and `docs/governance/CURRENT_PROGRAM_STATUS.md`.
- Developer Manual v0.5 Audit-Consolidated.
- Action Plan v0.4.1 Device/Edge amendment.
- Risk & Architecture Validation Framework v1.0.
- W02 accepted Policy/Authority and informational precheck APIs.
- W03 accepted durable event/idempotency/timer/lease/workflow primitives.
- W04 accepted lifecycle, Capability Registry/CapabilityPlan, GoalGraph, lanes, ExecutionBudget, templates and scheduler.
- Legacy Manus/Aurora orchestrators and TOCA structured-decision/model-adapter material as reference/eval input only, never runtime authority.

## 4. Live repository audit

At coordination base `b502bfa7...`:
- `services/agent-runtime/STATUS.md` is a dependency-gated scaffold and explicitly places future bounded agent runtime under W05.
- preserved `services/agent-runtime/legacy-manus-reference/**` is non-authoritative provenance.
- there is no canonical `packages/intelligence/**` runtime yet.
- `packages/registries/src/capabilities/**` is the single accepted W04 Capability Registry and MUST NOT be duplicated by W05.
- W05 machine graph exists at `docs/governance/copilot/tasks/W05.json` but is schema v1 and lacks the ownership/path/readiness controls established by W04.
- no competing accepted Intelligence Router, Confidence Engine, ReasoningLevel runtime or strategy registry was found on live `main`.

Therefore W05 may create its owned intelligence surfaces only after this coordination freeze is accepted.

## 5. Architectural invariants

1. **Intelligence is not authority.** Classification, reasoning level, confidence, strategy selection, model output and agent output cannot mint, widen or substitute `PolicyToken`, `OwnerDecision` or current authority validation.
2. **No-AI is a first-class route.** Deterministic/template/service routes are preferred whenever they are sufficient.
3. **Lowest-sufficient reasoning.** Escalate compute only when quality/risk/uncertainty evidence justifies it; expensive/frontier reasoning is not the default.
4. **Multi-agent is not the default.** Agent/team creation must pass the over-agentification gate and solve a concrete iterative/coordination problem that deterministic functions/services cannot solve more safely or cheaply.
5. **Capability Registry remains W04-owned.** Strategy availability/compatibility is distinct from capability availability and cannot create a second capability registry.
6. **W03 durability remains canonical.** W05 worker leases/heartbeats/reclaim may consume W03 durable primitives; W05 cannot create a second durable lease/timer/workflow source of truth.
7. **W04 control remains canonical.** W05 consumes lifecycle, GoalGraph, lane, CapabilityPlan, template and budget outputs; it does not reimplement them as an agent orchestrator.
8. **W06 owns context runtime.** W05 may consume a context interface later; it cannot create semantic cache, memory or retrieval source-of-truth in this wave.
9. **W07 owns execution.** No W05 router/agent/tool loop may call provider/device/workflow/local side effects directly. Tool choice is planning evidence only until W07 validates and executes governed ActionIntent.
10. **W18 owns adaptive promotion.** W05 exposes calibration/eval interfaces and observations, but no production self-learning, self-promotion or online strategy mutation.
11. **Bounded iteration only.** Every adaptive loop has max iterations, elapsed time, model/tool-call and budget bounds plus explicit break/escalation/abstention states.
12. **Evidence without private chain-of-thought.** Persist strategy/routing reasons, inputs/references, confidence decomposition and outcomes sufficient for audit; never require private reasoning traces.

## 6. Namespace and ownership direction

W05 semantic surfaces are allocated under:
- `packages/intelligence/**` — classifier, ReasoningLevel, confidence and Intelligence Router semantics.
- `packages/registries/src/strategies/**` — the single W05 strategy registry, explicitly distinct from W04 capabilities.
- `services/agent-runtime/src/runtime/**` — W05-F generic worker/runtime semantics.
- `services/agent-runtime/src/loop/**` — W05-G bounded Observe/Plan/Inspect/Repair/Validate control loop; it never owns external execution.
- matching W05-prefixed tests plus `docs/governance/w05/**`.

Root workspace/lockfiles, package manifests, tsconfig/build config, package/service barrels/public export maps, CODEOWNERS, CI and cross-package publication remain Program Control-owned shared surfaces unless explicitly transferred.

Exact leaf ownership is frozen in `W05_OWNERSHIP_MATRIX.md`.

## 7. Internal DAG

`W05-00 -> (W05-A || W05-C || W05-D || W05-E || W05-F)`

`W05-A + W05-C + W05-D + W05-E -> W05-B`

`W05-B + W05-F -> W05-G`

`W05-G -> W05-H`

The true dependency-ready frontier after accepted W05-00 is `{W05-A, W05-C, W05-D, W05-E, W05-F}`. These nodes are semantically disjoint at their leaf paths, but actual dispatch must respect live shared-write locks and available execution capacity.

## 8. Cross-wave interfaces

### W04 -> W05
W05 consumes task/lifecycle identity, CapabilityPlan, lane metadata, ExecutionBudget, templates and GoalGraph context. Lane/budget/template/capability outputs constrain intelligence strategy but do not grant authority.

### W05 -> W06
W05 defines what intelligence needs from context at interface level only. W06 owns retrieval, trust/freshness, MinimalContextPackage, memory and cache implementation.

### W05 -> W07
W05 may emit strategy/tool-choice/planning evidence. W07 alone consumes governed ActionIntent and performs current execution authority validation, target resolution and side effects.

### W05 -> W17/W18
W05-H defines evaluation measurements and emits stable routing evidence fields. W17 owns production telemetry/SLOs. W18 owns calibration learning, strategy optimization and any shadow/canary promotion.

## 9. Publication barriers

- **I0:** W05-00 coordination/ownership/risk/eval freeze accepted.
- **I1:** W05-A task classifier accepted.
- **I2:** W05-C ReasoningLevel resolver accepted.
- **I3:** W05-D Confidence Engine interface accepted; W18 may consume only after its own dependencies.
- **I4:** W05-E Strategy Registry accepted without creating a second Capability Registry.
- **I5:** W05-F generic runtime accepted and proven to reuse W03 durability where required.
- **I6:** W05-B Intelligence Router accepted after A/C/D/E.
- **I7:** W05-G bounded adaptive loop accepted after B/F.
- **I8:** W05-H routing benchmark/eval gate accepted; final W05 consumers may release only through their own live dependency matrices.

No publication barrier bypasses W02 current policy or future W07 execution validation.

## 10. Hard boundaries

W05 MUST NOT implement:
- a Policy Engine, token issuance, approval authority or executable authorization;
- W03 outbox/inbox/replay/timer/lease/workflow replacements;
- a second Capability Registry or W04 GoalGraph/scheduler/lane/budget/template source of truth;
- W06 retrieval/cache/memory runtime;
- W07 Executor, target resolver, readback/reconciliation/circuit breaker/kill switch;
- W08 provider adapters, W09 n8n runtime, W14 device session/trust or W15 Android runtime;
- W17 production telemetry platform or W18 adaptive production promotion.

## 11. Acceptance target for W05-00

W05-00 is accepted only when:
- charter, dependency, ownership, acceptance, risk and over-agentification/eval artifacts agree;
- `docs/governance/copilot/tasks/W05.json` is reconciled to schema v2 with the same DAG, exact leaf paths, shared locks and readiness semantics;
- no competing intelligence/capability/control/durability/executor source of truth is introduced;
- W04-H and current `main` are revalidated immediately before final exact-head gating;
- candidate Quality, Test Build and Security pass on the same exact final HEAD;
- an independent reviewer accepts the freeze; this branch author does not self-merge or self-accept;
- merge, post-merge verification, Drive evidence and GitHub status converge before descendants are labeled accepted/ready.

Until W05-00 itself is accepted, W05-A/C/D/E/F remain implementation-gated.