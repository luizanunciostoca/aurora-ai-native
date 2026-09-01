# Aurora Copilot Execution Modes

Status: `PUZZLE_EXECUTION_GOVERNANCE_CANDIDATE`

This document describes how Aurora maps the global Puzzle scheduler onto available execution mechanisms. It is operational governance only and never overrides live `main`, exact-SHA acceptance evidence, `CURRENT_PROGRAM_STATUS.md`, Developer Manual, accepted ADRs, wave ownership/dependency documents, Risk Gates or Drive acceptance evidence.

The execution mechanism and scheduler are separate concerns.

Every execution mode uses `PUZZLE_FRONTIER` and optimizes for `MINIMUM_SAFE_CRITICAL_PATH`.

## Two capacity controls

### `physicalBuildSlots`

Maximum canonical BUILD workers that may execute simultaneously under the active execution mechanism.

Only tasks whose dependencies are fully accepted may compete for these slots.

### `maxLogicalLanes`

Maximum concurrently materialized Puzzle PREBUILD/READINESS lanes.

Logical lanes do not grant execution authority and are intentionally decoupled from current Copilot worker count.

A Free configuration can therefore have 2 physical BUILD slots while maintaining dozens of future-wave logical lanes.

## PUZZLE_FRONTIER scheduler

The scheduler computes two independent frontiers.

### Canonical BUILD frontier

- dependencies must be `aurora:accepted` and supported by live canonical evidence;
- explicit `dispatchPriority` wins first when slots are scarce;
- longest remaining DAG path breaks scheduling pressure next;
- shared-write/path conflicts fail closed;
- only BUILD_READY issues can be claimed by implementation workers.

### Logical Puzzle frontier

- may span multiple future waves;
- prioritizes wave coordination seeds and lower speculation depth;
- may prepare READINESS or governed PREBUILD artifacts while dependencies remain unavailable;
- cannot open a canonical PR or satisfy a dependency;
- ISOLATED_PATCH is allowed only with explicit `prebuildAllowedPaths`;
- every PREBUILD artifact requires reconciliation after upstream acceptance.

The full policy is defined by `AURORA_PUZZLE_MASSIVELY_PARALLEL_EXECUTION_STANDARD.md`.

## FREE_ACTIONS_CLI

Current mode.

- `physicalBuildSlots = 2`.
- `maxParallelTasks = 2` remains a compatibility alias for existing workflows.
- `maxLogicalLanes = 32` by current governance.
- Copilot cloud agent remains disabled.
- Copilot CLI BUILD execution is allowed through the existing governed Actions worker when quota is available.
- The BUILD worker receives read-only repository authority; deterministic publisher logic handles candidate publication.
- PREBUILD automatic AI workers are disabled by default. Logical lanes remain available to Program Control, dedicated engineering contexts and future worker mechanisms.
- Copilot quota exhaustion may reduce physical AI execution throughput but does not collapse the logical Puzzle program or change acceptance authority.
- No PREBUILD or BUILD candidate is automatically accepted or merged.

The two-slot Free cap is therefore a **physical execution limit**, not a two-lane architecture limit.

## PRO_PLUS_CLOUD_AGENT

Planned upgrade mode.

- activate only through normal reviewed governance;
- enable cloud-agent execution;
- increase `physicalBuildSlots` only after observing repository/integration capacity;
- reuse the same already-materialized Puzzle lanes;
- never widen ownership, dependency or authority because additional compute is available.

The main acceleration benefit of an upgraded plan is that already prepared/reconciled pieces can fill more physical slots immediately.

## Invariants across all modes

1. Logical preparation is not canonical authority.
2. A task graph node does not satisfy its own dependencies.
3. `aurora:accepted` plus live canonical evidence is required for canonical dependency release.
4. PREBUILD artifacts always declare `canonicalAuthority: false` and `requiresReconciliation: true`.
5. No speculative runtime patch exists without an explicit path fence.
6. Shared/root/publication surfaces remain Program Control-owned unless explicitly transferred.
7. Intelligence is not Authority and neither is Execution.
8. No implementation/PREBUILD agent self-accepts or self-merges.
9. Main drift requires reconciliation and new exact-head evidence.
10. W03+ Risk Gates remain mandatory at their canonical acceptance points.
11. Increasing worker count never authorizes unsafe fan-out.
12. The optimization target is minimum safe end-to-end program duration, not maximum agent count or speculative code volume.

## Current switch file

`docs/governance/copilot/AURORA_COPILOT_EXECUTION_MODE.json`

The switch file is validated by `tools/copilot/validate-execution-mode.mjs`, the existing Aurora Fabric gate, and the dedicated Aurora Puzzle Validation workflow.
