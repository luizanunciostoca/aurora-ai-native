# W04 ACCEPTANCE MATRIX & RISK GATES

Date: 2026-09-01  
Status: `COMPLETE_ACCEPTED / W04_CONTROL_CORE_VERIFIED`  
Target: `W04_CONTROL_CORE_VERIFIED`

## Global acceptance invariants

- Capability != authority.
- Plan/GoalGraph/lane/budget/template != execution permission.
- W04 cannot bypass W02 current authority or W07 execution validation.
- W04 consumes W03 durability and must not create a competing durable-workflow source of truth.
- Capability planning is target-neutral and capability-first.
- Only one Capability Registry exists.
- Legacy/TOCA capability vocabulary starts as `SEED_ONLY_NOT_CANONICAL` until W04-B explicitly adjudicates it.
- No external provider/device side effect is part of W04 acceptance.

## W04-00 coordination freeze acceptance

Required evidence:
1. `W04_WAVE_CHARTER.md`, Dependency Matrix, Ownership Matrix, this Acceptance Matrix and Risk Register agree.
2. `docs/governance/copilot/tasks/W04.json` is schema v2 and represents the same DAG/ownership/readiness rules.
3. `CURRENT_PROGRAM_STATUS.md` records W03 final acceptance and correct W04 release semantics.
4. Repository audit demonstrates no competing Capability Registry/control-core runtime requiring migration.
5. Legacy 69-seed and TOCA capability inputs remain planning/reference-only until adjudicated.
6. Device DP1 and cross-wave locks are represented without W14/W15 leakage.
7. No runtime feature implementation is introduced by W04-00.
8. Official candidate gates pass on one exact final HEAD; merge/post-merge/Drive/GitHub convergence follows.

W04-00 was accepted and released only W04-A, W04-B and W04-F according to the dependency matrix.

## Subwave acceptance

### W04-A — Objective / Goal / Task Lifecycle
Must prove explicit states/transitions, valid/invalid terminal transitions, cancellation/supersession, tenant/correlation/evidence references and deterministic conflict semantics. No agent/model implementation details embedded in lifecycle primitives.

### W04-B — Capability Registry + CapabilityPlan
Must prove one target-neutral registry, deterministic capability identity/metadata, compatibility/availability/freshness semantics, capability-plan selection independent of executor/provider/agent, seed adjudication/provenance and negative tests proving availability/permission metadata is not authority. Must satisfy Device DP1 without Android business logic.

### W04-C — GoalGraph DAG
Must prove valid DAG construction, cycle rejection, dependency/join/fan-in semantics, terminal/failure propagation, cancellation and bounded graph shape. GoalGraph cannot silently mutate from model output and cannot replace W03 durable workflow.

### W04-D — Parallel Scheduler
Must prove only dependency-ready nodes run, concurrency/fan-out bounded, deterministic joins, fairness/backpressure/cancellation, no starvation within declared policy, and W03 lease/timer primitives are reused when durability is required rather than duplicated.

### W04-E — Fast / Governed Lane Resolver
Must prove deterministic lane reasons and safety invariants. Fast Lane cannot skip Policy/Authority/Executor, and Governed Lane cannot manufacture approval/authority. Lane result is planning metadata only.

### W04-F — ExecutionBudget
Must prove latency/cost/reasoning/tool-call/concurrency budgets, propagation, exhaustion and degradation/stop behavior. Safety and authority checks are non-negotiable even when budget is exhausted.

### W04-G — Curated PlanTemplate / PlanBinding
Must prove version/hash/provenance/compatibility/invalidation, deterministic binding and safe known-plan reuse. No adaptive self-promotion or learning in W04.

### W04-H — Integration / Performance / Contract Gate
Must prove a target-neutral mock objective selects required capabilities, builds/validates a GoalGraph, selects lane/budget/template as applicable, runs independent nodes in bounded parallel order and produces reconstructable evidence without external side effects.

## Risk Gate A — Correctness

PASS requires evidence for:
- deterministic lifecycle/graph/lane/budget/template state transitions;
- graph cycle/invalid-edge rejection;
- capability identity/metadata and registry uniqueness;
- canonical ID/tenant/correlation/version use;
- deterministic joins/cancellation/supersession;
- public consumer compilation and source-of-truth consistency.

Final W04 decision: `PASS`.

## Risk Gate B — Safety / Authority

PASS requires evidence that:
- capability availability, compatibility, freshness or target presence cannot authorize execution;
- lane, budget, template, confidence or plan cannot mint/widen authority;
- Fast Lane cannot bypass current Policy/Authority/Executor;
- cross-tenant plans/registry entries cannot satisfy another tenant where tenant scoping applies;
- no W04 test invokes real provider/device side effects;
- no secret/provider credential/device secret enters planning artifacts by architecture default.

Independent release blockers remain authority bypass, cross-tenant breach, capability-as-authority, hidden execution path, secret exposure, or external irreversible side effect without current authority.

Final W04 decision: `PASS`.

## Risk Gate C — Performance / Economics

Measured at W04-H:
- plan/graph validation p50/p95/p99;
- registry/capability-plan selection overhead;
- scheduler ready-frontier/dispatch overhead;
- fairness/starvation behavior;
- fan-out/concurrency cap behavior;
- template-hit path versus fallback replanning;
- budget accounting/exhaustion overhead;
- bounded task-pressure behavior.

Observed exact-candidate Test Build `33506852889` p50/p95/p99:

| Measurement | p50 ms | p95 ms | p99 ms |
| --- | ---: | ---: | ---: |
| Graph validation | 0.088912 | 0.181339 | 0.983061 |
| Capability plan | 0.005428 | 0.011998 | 0.298013 |
| Scheduler | 0.010015 | 0.025628 | 0.236171 |
| Template hit | 0.003815 | 0.028181 | 0.113729 |
| Budget accounting | 0.003114 | 0.024687 | 0.227498 |

These are observed integration-test measurements only. No production SLO is inferred or invented.

Final W04 decision: `PASS_FOR_TEST_SCOPE`.

## Risk Gate D — Failure / Recoverability

Verified as applicable:
- malformed/invalid graph metadata and cycles fail closed;
- graph over-bound is rejected;
- cancelled tasks do not dispatch;
- pressure triggers bounded backpressure rather than unbounded expansion;
- template incompatibility/hash staleness falls back deterministically;
- budget exhaustion preserves mandatory validation;
- restart/recovery ownership remains W03 and is not duplicated by W04.

Final W04 decision: `PASS_FOR_W04_SCOPE`.

## Final W04 Reality/Integration scenarios

- R01 lifecycle accepts valid transition and rejects invalid terminal resurrection.
- R02 supersession/cancellation resolves deterministically.
- R03 one capability ID cannot silently represent incompatible semantics.
- R04 unavailable/stale capability cannot be treated as current availability.
- R05 capability availability/permission metadata cannot authorize execution.
- R06 CapabilityPlan is independent of agent/provider/device implementation.
- R07 DEVICE binding remains target-neutral and contains no Android business logic.
- R08 invalid/cyclic GoalGraph fails closed.
- R09 independent graph nodes become runnable concurrently; dependent node does not run early.
- R10 join/fan-in waits for declared predecessors and normalizes failure propagation.
- R11 scheduler respects concurrency/fan-out bound under pressure.
- R12 fairness/backpressure avoids unbounded task explosion/starvation within tested policy.
- R13 Fast Lane selects a cheaper/deterministic planning path without bypassing Policy/Authority/Executor.
- R14 Governed Lane reason/evidence is explicit and does not itself issue approval.
- R15 budget exhaustion stops/degrades optional strategy but preserves mandatory validation.
- R16 curated valid template can bypass unnecessary replanning while stale/incompatible template is rejected.
- R17 tenant/correlation/evidence remains reconstructable across lifecycle → plan → graph → lane/budget/template → scheduler decisions.
- R18 W03 durable workflow primitives remain the only durable workflow foundation; W04 introduces no competing outbox/lease/timer/replay source of truth.
- R19 no legacy/TOCA executable wrapper/authority model is promoted by seed inheritance.
- R20 no external provider/device side effect occurs in the W04 Reality Gate.

## Final decision

Allowed decision vocabulary: `ACCEPT | ACCEPT_WITH_RECORDED_RISK | REJECT | BLOCKED`.

W04-H accepted candidate:
- PR #151.
- exact candidate HEAD `b4de1097b03a4b94bc81ac38f6cbe0019244724b`.
- candidate Quality `33506852902`, Test Build `33506852889`, Security `33506853276`: SUCCESS.
- controlled merge/main `fcc26c1065961ec6ca52019195108f3562c33365`.
- post-merge Quality `33507711472`, Test Build `33507711290`, Security `33507712325`: SUCCESS.
- independent scope/source-of-truth review: PASS.
- Drive evidence `W04_H_ACCEPTANCE_EVIDENCE` / `145hSgYYiwTmSFqFe_BRyH-ZTfZGIbidV1ce-nx-Afjs`.
- issue #97: closed with `aurora:accepted`.

Decision: `ACCEPT / COMPLETE_ACCEPTED / W04_CONTROL_CORE_VERIFIED`.

W04 is complete. W05-00 and W07-00 are direct W04-H dependency consumers, but each must pass its own coordination freeze, publication barriers, exact-head acceptance and Program Control convergence before later nodes are released.