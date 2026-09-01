# W05 DEPENDENCY MATRIX

Date: 2026-09-01  
Status: `W05_00_COORDINATION_FREEZE_CANDIDATE`  
Base main: `b502bfa7e97291086c09cc85cd71040f96d3b036`

## Dependency authority

An edge is satisfied only by accepted canonical evidence: exact final HEAD + required gates + controlled merge + post-merge verification + Drive/GitHub convergence. PREBUILD, branch code, open PR, model/agent output or green CI alone never releases a node.

## W05 DAG

| Node | Hard dependencies | Unlocks | Owned semantic surface |
|---|---|---|---|
| W05-00 | W04-H accepted; W02/W03 accepted foundations | A, C, D, E, F | governance freeze only |
| W05-A | W05-00 | B | task classification |
| W05-C | W05-00 | B | ReasoningLevel L0-L5 |
| W05-D | W05-00 | B; later W18 calibration consumer | confidence decomposition/interface |
| W05-E | W05-00 | B | strategy registry |
| W05-F | W05-00 | G | bounded generic worker runtime |
| W05-B | A + C + D + E | G | Intelligence Router |
| W05-G | B + F | H | bounded adaptive inspect/repair loop |
| W05-H | G | W05 final consumers | routing benchmarks/evals |

Canonical graph:

`W04-H -> W05-00 -> (A || C || D || E || F)`

`A + C + D + E -> B`

`B + F -> G -> H`

## First READY frontier after W05-00 acceptance

`{W05-A, W05-C, W05-D, W05-E, W05-F}`.

These are dependency-independent but not automatically safe to dispatch concurrently if a live diff touches a Program Control shared surface. Shared manifests/barrels/export maps remain convergence barriers.

## Cross-wave dependencies

- W05 consumes W02 policy/precheck as information and current authority boundaries as immutable safety constraints; W05 never authorizes.
- W05 consumes W03 durable lease/workflow/event foundations where runtime durability is required; no duplicate lease/timer/workflow source of truth.
- W05 consumes W04 CapabilityPlan/lane/budget/template/GoalGraph; no second Capability Registry or scheduler.
- W06 context runtime may be developed according to its own live matrix; W05 cannot silently materialize W06 context/cache surfaces.
- W07 executor is a hard side-effect boundary. W05 outputs cannot bypass it.
- W17 owns production telemetry and W18 owns learned strategy/calibration promotion.

## Fail-closed release rules

1. Confidence/route/agent output never satisfies authority.
2. Strategy registry never satisfies capability availability or execution permission.
3. W05-F/G cannot create direct provider/device/workflow/local side effects.
4. If W03 durability is unavailable for a use case requiring durable worker ownership, W05 fails closed rather than inventing an in-memory authoritative lease.
5. A missing/ambiguous strategy may cause deterministic fallback, escalation or abstention; it may not cause hidden execution.
6. Descendant nodes remain gated until their exact predecessors are accepted.

## PREBUILD policy

Blocked nodes may perform read-only readiness/eval-fixture analysis only when permitted by Puzzle governance. PREBUILD cannot modify runtime source, create authority, satisfy an edge or become canonical by existence.