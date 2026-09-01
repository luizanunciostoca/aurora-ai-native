# Aurora Full-Wave Parallel Execution Standard

Status: `CANDIDATE_FOR_ACCEPTANCE`  
Activation scope: W03 remaining nodes after activation and all later waves  
Execution objective: `MINIMUM_SAFE_CRITICAL_PATH`

## Authority

This standard is operational execution governance. It does not override accepted `main`, exact-SHA evidence, `CURRENT_PROGRAM_STATUS.md`, Developer Manual, accepted ADRs, owning-wave governance, Risk Gates or Drive acceptance records. Any disagreement among those sources fails closed.

## Core rule

Aurora does not optimize for the largest number of agents. Aurora optimizes for the shortest safe critical path.

At every accepted state transition Program Control must:

1. reconstruct the live DAG;
2. classify nodes as accepted, running, ready or blocked;
3. calculate the maximum safe READY frontier;
4. dispatch all safe nodes allowed by the active execution-mode parallelism limit;
5. independently validate each candidate;
6. release successors only after complete acceptance and publication convergence;
7. repeat until the wave Reality Gate is accepted or a real blocker remains.

## READY frontier

A node belongs to the implementation READY frontier only when every graph dependency is accepted according to live canonical evidence. A draft, generated patch, branch, PR, green CI result or merge without required publication/reconciliation does not satisfy a dependency.

When more READY nodes exist than execution slots, selection is:

1. explicit dispatch priority;
2. longest remaining DAG path;
3. deterministic wave/task ordering.

This prevents low-value side work from consuming a slot needed by the critical path.

## Safe parallelism

Independent READY tasks execute in parallel unless they declare the same `sharedWriteSurfaces` value. A shared-write collision is fail-closed: one task is selected and the other is deferred for Program Control reconciliation.

Task metadata may include:

- `allowedPaths` — path hints that narrow, but never widen, live ownership;
- `sharedWriteSurfaces` — semantic surfaces that cannot be written concurrently;
- `coordinatorSurfaces` — root/shared/publication surfaces retained by Program Control;
- `laneHint` — stable lane reuse hint;
- `dispatchPriority` — explicit critical-path scheduling priority;
- `readinessPolicy` — permitted blocked-node preparation;
- `handoffFormat` — compact machine-oriented handoff format.

The owning wave's Ownership Matrix remains authoritative when metadata and prose differ.

## Blocked-node readiness

Blocked nodes may use `READ_ONLY_WHILE_BLOCKED` readiness only. Permitted preparation includes repository reconnaissance, dependency/interface mapping, conflict prediction, test-plan preparation, risk/acceptance checklists and reference mining.

Blocked-node readiness must not create runtime code, schemas, migrations, PRs or any artifact that falsely materializes an unreleased dependency.

## Lane model

Program Control should reuse a small number of stable lanes rather than create one chat/worker context per task. Lane count follows DAG width and execution-mode capacity.

For W03 under `FREE_ACTIONS_CLI`:

- Foundation: W03-A;
- Lane 1: W03-B then W03-D;
- Lane 2: W03-C then W03-E;
- Convergence: W03-F.

The W03 DAG remains authoritative: `W03-A -> (W03-B || W03-C) -> (W03-D || W03-E) -> W03-F`.

## Shared-surface barrier

Root workspace configuration, lockfiles, root build/TypeScript configuration, CI/workflows, CODEOWNERS, shared/public exports and other coordinator-owned publication surfaces are never opportunistically edited by parallel leaf workers.

If a leaf candidate needs such a surface it reports `SHARED_SURFACE_RECONCILIATION_REQUIRED`; Program Control owns the reconciliation.

## Candidate and acceptance pipeline

Each implementation node remains:

`DEPENDENCY VERIFIED -> READY -> CLAIM -> IMPLEMENT -> TARGETED TEST -> ISOLATED CANDIDATE -> PR -> EXACT-HEAD QUALITY/TEST BUILD/SECURITY -> RISK GATES -> REVIEW -> MERGE -> POST-MERGE VALIDATION -> DRIVE CONVERGENCE -> ACCEPTED -> RELEASE SUCCESSORS`

Parallelism never weakens acceptance. CI jobs that are independent should run concurrently against the same exact HEAD.

## Compact handoff

Implementation workers use `AURORA_COMPACT_V1` and return verifiable facts only:

- TASK
- BASE_SHA
- BRANCH
- PR
- EXACT_HEAD
- CHANGED_PATHS
- TESTS
- CI_RUNS
- RISKS
- KNOWN_LIMITATIONS
- BLOCKERS
- DOWNSTREAM_CONSUMERS
- SHARED_SURFACE_TOUCHES
- RECOMMENDED_ACCEPTANCE_STATE

GitHub and Drive remain the shared canonical memory; chat summaries are not source of truth.

## Activation and running-task compatibility

Activation is `NON_RETROACTIVE` for a task that was already legitimately running before this standard reached accepted `main`. Such a task keeps the base and execution contract under which it was claimed. The standard applies to the next READY frontier after activation.

This prevents a governance improvement from invalidating a legitimate in-flight candidate and avoids avoidable rebases/rework.

## Execution modes

The scheduler is independent of the model/provider execution mechanism. `FREE_ACTIONS_CLI` currently limits implementation to two task slots. A future paid/cloud mode may raise the slot count only through reviewed execution-mode governance; dependency, shared-write and acceptance rules remain unchanged.

## Required wave-freeze behavior from W04 onward

Every wave coordination freeze must reconcile its machine-readable `docs/governance/copilot/tasks/WNN.json` with the accepted Dependency and Ownership matrices before implementation fan-out. At minimum, implementation nodes should define lane/priority and any known shared-write surfaces. Exact path metadata should be added when canonical ownership is sufficiently concrete and must never be guessed to create false exclusivity.

## Success metric

The governing optimization target is:

`minimum safe critical-path duration`

not:

`maximum simultaneous agents`.
