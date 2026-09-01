# W04-H Integration / Performance / Contract Gate Runbook

Date: 2026-09-01  
Status: `CANDIDATE_NOT_ACCEPTED`  
Task: `W04-H` / issue `#97`  
Canonical base at BUILD start: `48ed0e59b289cf835a5feb23eeadbed35a335b59`

## Scope and authority

W04-H is the final W04 convergence gate. It owns integration, benchmark and contract-test evidence only. It does not introduce new runtime semantics, provider/device execution, authority, adaptive learning, production telemetry or a second durable-workflow source of truth.

This candidate must not be treated as accepted until one exact final HEAD passes Quality + Test Build + Security, independent source-of-truth/scope review, controlled merge, post-merge verification and Drive/GitHub evidence convergence.

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

W04-H directly closes the integration gaps in the W04 acceptance matrix while relying on accepted A-G unit/contract evidence for leaf semantics:

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

## Risk Gate candidate disposition

### Gate A — Correctness

Candidate PASS subject to official exact-head CI. Integrated composition is deterministic, graph cycles fail closed, joins do not run early, bounds are explicit, fairness is deterministic and evidence links remain reconstructable.

### Gate B — Safety / Authority

Candidate PASS subject to official exact-head CI and independent review. Capability/plan/graph/lane/budget/template/scheduler artifacts never authorize execution. Current Policy, Authority and Executor checks remain mandatory where declared. No side-effect path is added.

### Gate C — Performance / Economics

Candidate PASS_FOR_TEST_SCOPE subject to official exact-head CI. The benchmark emits observed p50/p95/p99 control-plane overhead and a deterministic planning-round parallelism ratio. No production SLO is asserted because W04 governance requires thresholds to be evidence-driven rather than invented.

### Gate D — Failure / Recoverability

Candidate PASS subject to official exact-head CI. The integrated test exercises cycles, graph over-bound rejection, cancellation, pressure/backpressure, stale template fallback and budget exhaustion. Durable recovery remains delegated to accepted W03 primitives rather than duplicated in W04.

## Acceptance procedure

1. Freeze the exact final W04-H candidate HEAD.
2. Run official Quality, Test Build and Security on that same SHA.
3. Review changed paths for ownership, duplicates, source-of-truth drift and scope leakage.
4. Confirm no runtime/provider/device/authority/shared-surface implementation was introduced.
5. Record benchmark output from the exact candidate CI run.
6. Obtain independent acceptance decision; do not self-accept.
7. Merge only with exact-head fencing after acceptance conditions are satisfied.
8. Run post-merge Quality, Test Build and Security on resulting `main`.
9. Create canonical Drive W04-H acceptance evidence and converge `CURRENT_PROGRAM_STATUS.md` only after merge/post-merge verification.
10. Only then release downstream W05-00/W07-00 dependencies that require accepted W04-H.

## Current decision

`CANDIDATE_NOT_ACCEPTED` — implementation/evidence candidate exists, but exact final HEAD CI, independent review, controlled merge, post-merge gates and Drive/GitHub convergence are still mandatory.
