# W04 DEPENDENCY MATRIX

Date: 2026-09-01  
Status: `W04_00_COORDINATION_FREEZE_CANDIDATE`  
Base main: `76ba0db1bf399c21d08e2190915213ceb8f4eb02`

## Dependency authority

A dependency is satisfied only by canonical acceptance: accepted exact-SHA evidence + merge + required post-merge verification + Drive convergence + owning GitHub task labeled `aurora:accepted` where the Puzzle graph uses that label.

Draft code, a branch, open/merged PR without acceptance convergence, worker output, PREBUILD artifact or green CI alone does not satisfy an edge.

Any disagreement among GitHub `main`, `CURRENT_PROGRAM_STATUS`, exact-SHA evidence, Drive acceptance records, ownership documents and this matrix fails closed.

## W04 DAG

| Node | Hard dependencies | Unlocks | Parallel notes |
|---|---|---|---|
| W04-00 | W03-F accepted / final W03 Reality Gate | A, B, F | Program Control only |
| W04-A | W04-00 | C, E, G | May run with B and F if shared surfaces are reconciled |
| W04-B | W04-00 | C, E, G; DP1 foundation | May run with A and F if shared surfaces are reconciled |
| W04-F | W04-00 | D | May run with A/B; Free slot limit can defer it |
| W04-C | W04-A + W04-B | D | May run with E/G |
| W04-E | W04-A + W04-B | H | May run with C/G |
| W04-G | W04-A + W04-B | H | May run with C/E |
| W04-D | W04-C + W04-F | H | May overlap E/G if their owned leaves remain disjoint |
| W04-H | W04-D + W04-E + W04-G | W04 final acceptance consumers | Convergence/integration node |

Canonical graph:

`W03-F -> W04-00 -> (A || B || F)`

`A + B -> (C || E || G)`

`C + F -> D`

`D + E + G -> H`

## First READY frontier after W04-00 acceptance

True dependency-satisfied set: `W04-A`, `W04-B`, `W04-F`.

Under current `FREE_ACTIONS_CLI maxParallelTasks=2`, at most two BUILD nodes may be active. Critical-path depth makes A+B the default first dispatch because both jointly release C/E/G. F remains next-ready and may occupy a slot as soon as one becomes available, unless live ownership/shared-surface reconciliation changes the safe frontier.

This is scheduling policy, not authority; the scheduler may never dispatch a node whose dependencies are not accepted.

## Publication barriers

### W05
W05 implementation remains gated on the W04 completion/public interfaces required by its live matrix. W04-00 alone does not release W05 runtime.

### W07
W07 execution-target/executor work must consume accepted W04 target-neutral capability outputs. Capability or lane metadata is not executable authority.

### W14/W15 Device Plane
Device Plane DP1 requires accepted W04-B target-neutral Capability Registry contracts. W04 may describe a future DEVICE target kind/binding, but W14 owns device identity/session/trust and W15 owns Android/native execution.

### W17/W18
W04-F budget fields should expose inputs needed by later telemetry/optimizer work, but W17 owns production telemetry/SLO evidence and W18 owns adaptive optimization/promotion.

## Cross-wave fail-closed rules

1. W04 lifecycle/GoalGraph cannot satisfy W03 durability by replacing it; W03 remains the durable event/workflow foundation.
2. W04 capability availability cannot satisfy W02 authority or W07 execution validation.
3. W04 Fast Lane cannot bypass Policy/Authority/Executor.
4. W04 templates cannot self-promote or create executable permission.
5. W04-B acceptance may satisfy DP1 only; it does not satisfy DP2-DP7.
6. No later-wave task is globally released by final W04 acceptance; each owning dependency matrix must be evaluated.

## PREBUILD policy

Blocked W04 and downstream nodes may perform read-only readiness/specification work within their Puzzle policy. PREBUILD cannot edit runtime source, open canonical implementation PRs, satisfy dependencies or create authority.
