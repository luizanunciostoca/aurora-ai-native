# W07 DEPENDENCY MATRIX

Date: 2026-09-01  
Status: `W07_00_COORDINATION_FREEZE_CANDIDATE`  
Base main: `b502bfa7e97291086c09cc85cd71040f96d3b036`

## Dependency authority

A dependency is satisfied only by canonical acceptance: exact final HEAD evidence, required CI/Risk Gates, controlled merge, post-merge verification and Drive/GitHub convergence. Draft code, open PR, PREBUILD, model/agent output or green CI alone does not satisfy an edge.

## W07 DAG

| Node | Hard dependencies | Unlocks | Owned semantic surface |
|---|---|---|---|
| W07-00 | W04-H accepted + W02/W03 accepted foundations | A | governance/compatibility freeze only |
| W07-A | W07-00 | B, C, D, E | execution-target contract family + compatibility evolution |
| W07-B | W07-A | F, G | Executor SDK + current policy/authority validation |
| W07-C | W07-A | F, G | idempotency/preconditions/quotas/deadlines |
| W07-D | W07-A | F, G | target-neutral resolution |
| W07-E | W07-A | F, G | Receipt/Evidence/readback semantics/runtime |
| W07-F | B + C + D + E | H | EXECUTION_UNCERTAIN/reconciliation |
| W07-G | B + C + D + E | H | circuit breaker/kill switch/failure containment |
| W07-H | F + G | W08/W09/W14/W15 consumers per their matrices | integration/fault injection/publication |

Canonical graph:

`W04-H -> W07-00 -> A -> (B || C || D || E)`

`B + C + D + E -> (F || G)`

`F + G -> H`

## READY frontiers

After accepted W07-00: `{W07-A}` only.

After accepted W07-A: `{W07-B, W07-C, W07-D, W07-E}`. They may execute in parallel only if public/shared contract changes are already frozen and leaf diffs remain disjoint.

After accepted B/C/D/E: `{W07-F, W07-G}`.

## Cross-wave prerequisites and consumers

- W02 owns policy/authority issuance/evaluation; W07 consumes current validation surfaces and fails closed where required.
- W03 owns durable idempotency/event/replay/timer/lease/workflow foundations; W07 composes them rather than creating a second ledger/backbone.
- W04 owns Capability Registry/CapabilityPlan/lane/budget; these inform target requirements/limits but never authorize execution.
- W08 consumes accepted W07 target/executor surfaces for provider adapters.
- W09 consumes accepted W07 workflow-target/executor surfaces; n8n remains execution fabric only.
- W14 consumes/publishes device identity/session/trust around W07 generic DEVICE target semantics according to its own matrix.
- W15 depends on accepted W07 generic executor/target contracts plus W14 device gateway/session/trust before Android device execution.

## Fail-closed rules

1. Informational precheck never satisfies W07-B current execution validation.
2. Capability/target availability never satisfies authority.
3. Duplicate/replayed commands must be fenced before external execution.
4. Ambiguous outcome is `EXECUTION_UNCERTAIN`/reconcile-required, not ordinary retryable failure.
5. Missing/stale/ambiguous target binding produces a canonical non-execution result.
6. Kill switch/circuit-open state cannot be overridden by intelligence output or ExecutionBudget.
7. Provider/device/workflow/local adapter work remains gated to owner waves even after W07-A.
8. Any disagreement between accepted contracts, current main, Drive governance and this matrix fails closed.

## PREBUILD policy

Blocked nodes may perform read-only source/consumer audits and test-plan preparation when allowed. PREBUILD cannot modify runtime, satisfy a dependency, create an execution target binding or perform a side effect.