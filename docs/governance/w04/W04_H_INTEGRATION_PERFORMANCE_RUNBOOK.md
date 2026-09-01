# W04-H Integration / Performance / Contract Gate Runbook

Date: 2026-09-01  
Status: `COMPLETE_ACCEPTED / W04_CONTROL_CORE_VERIFIED`  
Task: `W04-H` / issue `#97`  
Canonical BUILD base: `48ed0e59b289cf835a5feb23eeadbed35a335b59`  
Exact accepted candidate HEAD: `b4de1097b03a4b94bc81ac38f6cbe0019244724b`  
Accepted merge/main: `fcc26c1065961ec6ca52019195108f3562c33365`

## Scope and authority

W04-H is the final W04 convergence gate. It owns integration, benchmark and contract-test evidence only. It does not introduce new runtime semantics, provider/device execution, authority, adaptive learning, production telemetry or a second durable-workflow source of truth.

The accepted candidate changed only:

- `packages/control/test/w04h-integration-performance.test.ts`
- `docs/governance/w04/W04_H_INTEGRATION_PERFORMANCE_RUNBOOK.md`

No root/package publication surface, contract/schema, W03 durability, W05 intelligence, W07 executor/current-authority, W17 telemetry or W18 adaptive-learning surface was changed.

## Exact-head acceptance evidence

Candidate exact HEAD `b4de1097b03a4b94bc81ac38f6cbe0019244724b`:

- Quality `33506852902` — SUCCESS.
- Test Build `33506852889` — SUCCESS.
- Security `33506853276` — SUCCESS.

Independent Program Control review was recorded on PR #151 against that exact candidate. The controlled exact-head merge produced `main fcc26c1065961ec6ca52019195108f3562c33365`.

Post-merge verification on that exact `main`:

- Quality `33507711472` — SUCCESS.
- Test Build `33507711290` — SUCCESS.
- Security `33507712325` — SUCCESS.

Canonical Drive evidence: `W04_H_ACCEPTANCE_EVIDENCE` / `145hSgYYiwTmSFqFe_BRyH-ZTfZGIbidV1ce-nx-Afjs`.

Issue #97 is closed with `aurora:accepted`.

## Integrated test surface

Primary W04-H test: `packages/control/test/w04h-integration-performance.test.ts`.

The gate composes already-accepted W04 A-G surfaces and proves:

- lifecycle -> target-neutral Capability Registry/CapabilityPlan -> GoalGraph -> lane -> ExecutionBudget -> curated template binding -> bounded scheduler planning;
- independent dependency-ready nodes are selected together under bounded concurrency while their join remains blocked until predecessors succeed;
- all planning artifacts remain `authorizesExecution: false` and retain current Policy/Authority/Executor validation barriers;
- reconstructable tenant/correlation/version/template/scheduler evidence without provider/device credentials or identifiers;
- cycle rejection and the canonical 256-node graph bound;
- bounded pressure behavior, deterministic round-robin fairness, cancellation and explicit backpressure;
- curated template hit avoids frontier-replan fallback, while a stale content hash deterministically falls back;
- target-neutral bindings remain implementation-neutral;
- budget exhaustion cannot weaken mandatory safety validation;
- evidence-driven p50/p95/p99 measurements are emitted for graph validation, capability planning, scheduler planning, template binding and budget accounting without inventing production SLO thresholds.

No test invokes a provider, Android/device runtime, network side effect or executor action.

## Reality scenario coverage

W04-H closes the integration gaps in the W04 acceptance matrix while relying on accepted A-G unit/contract evidence for leaf semantics:

- R01-R02: lifecycle transition, cancellation/supersession semantics — accepted W04-A tests plus integrated lifecycle chain.
- R03-R07: registry uniqueness, freshness/authority separation, target-neutral CapabilityPlan and DEVICE neutrality — accepted W04-B tests plus W04-H target-neutral assertions.
- R08-R10: cycle rejection, concurrent roots, dependency join/failure semantics — accepted W04-C/D tests plus W04-H integrated graph/scheduler rounds.
- R11-R12: concurrency/fan-out bounds, fairness/backpressure/no-starvation — accepted W04-D tests plus 256-node pressure and deterministic rotation fixture.
- R13-R14: FAST/GOVERNED lane reason and no-authority invariant — accepted W04-E tests plus integrated mandatory-validation assertions.
- R15: budget exhaustion preserves mandatory validation — accepted W04-F tests plus integrated over-budget constraint assertion.
- R16: curated template hit and stale/incompatible fallback — accepted W04-G tests plus W04-H hit/fallback fixture.
- R17: reconstructable tenant/correlation/evidence chain — W04-H integrated evidence-chain assertion.
- R18: W03 remains durable coordination authority — scheduler plan asserts `W03_WHEN_REQUIRED`; no W04 durable subsystem is introduced.
- R19: no legacy/TOCA executable wrapper/authority model is promoted — W04-H fixtures use Aurora-native target-neutral descriptors only.
- R20: no external provider/device side effect — W04-H is pure in-process planning/test code.

## Performance evidence — test scope only

Observed p50/p95/p99 control-plane overhead from exact-candidate Test Build `33506852889`:

| Measurement | p50 ms | p95 ms | p99 ms |
| --- | ---: | ---: | ---: |
| Graph validation | 0.088912 | 0.181339 | 0.983061 |
| Capability plan | 0.005428 | 0.011998 | 0.298013 |
| Scheduler | 0.010015 | 0.025628 | 0.236171 |
| Template hit | 0.003815 | 0.028181 | 0.113729 |
| Budget accounting | 0.003114 | 0.024687 | 0.227498 |

These are observed integration-test measurements only. W04-H does not infer or invent production SLOs from them.

## Cleanup / source-of-truth audit

Exact-head Test Build cleanup audit reported zero zero-byte files and zero canonical broken relative references. Existing duplicate groups/broken references are generated/reference/legacy material and were not introduced by the two-file W04-H diff. No second Capability Registry, policy engine, executor boundary, durable workflow foundation or planning source of truth was introduced.

## Final Risk Gate disposition

### Gate A — Correctness

`PASS`. Integrated composition is deterministic, graph cycles fail closed, joins do not run early, bounds are explicit, fairness is deterministic and evidence links remain reconstructable.

### Gate B — Safety / Authority

`PASS`. Capability/plan/graph/lane/budget/template/scheduler artifacts never authorize execution. Current Policy, Authority and Executor checks remain mandatory. No side-effect path is added.

### Gate C — Performance / Economics

`PASS_FOR_TEST_SCOPE`. The accepted benchmark records observed p50/p95/p99 control-plane overhead, bounded concurrency/fan-out and fairness/backpressure behavior. No unsupported production threshold is asserted.

### Gate D — Failure / Recoverability

`PASS_FOR_W04_SCOPE`. The integrated test exercises cycles, graph over-bound rejection, cancellation, pressure/backpressure, stale template fallback and budget exhaustion. Durable restart/recovery remains delegated to accepted W03 primitives rather than duplicated in W04.

## Final decision

`ACCEPT / COMPLETE_ACCEPTED / W04_CONTROL_CORE_VERIFIED`.

W04-H may satisfy downstream dependency edges. Direct task-graph consumers W05-00 and W07-00 still require their own live coordination freeze, publication barriers, exact-head acceptance and Program Control convergence before later nodes are released. W15-00 remains additionally gated by its other declared dependencies.