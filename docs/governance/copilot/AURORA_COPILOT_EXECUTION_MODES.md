# Aurora Copilot Execution Modes

Status: `PUZZLE_EXECUTION_GOVERNANCE_CANDIDATE`

This document describes how Aurora maps the global Puzzle scheduler onto available execution mechanisms. It is operational governance only and never overrides live `main`, exact-SHA acceptance evidence, `CURRENT_PROGRAM_STATUS.md`, Developer Manual, accepted ADRs, wave ownership/dependency documents, Risk Gates or Drive acceptance evidence.

The execution mechanism and scheduler are separate concerns. Every execution mode uses `PUZZLE_FRONTIER` and optimizes for `MINIMUM_SAFE_CRITICAL_PATH`.

## Pro+ governance versus runtime activation

The Pro+ parallel-development governance introduced by #422 is active on `main`: Program Control may reason about dynamic independent BUILD sessions, intra-task fleets and parallel validation.

Physical Pro+ execution is a separate runtime fact. The current switch remains `FREE_ACTIONS_CLI` until the runtime positively proves the required plan, execution-backend, isolated-session, CI and AI-credit signals. Merely editing the switch cannot prove that capacity exists.

The detailed runtime contract is defined in `AURORA_PRO_PLUS_RUNTIME_ORCHESTRATION.md`.

## Capacity controls

### Canonical BUILD capacity

The current Free mode keeps a compatibility ceiling of two physical BUILD slots. The runtime controller subtracts already-running session leases and may therefore return fewer than two slots.

When a reviewed Pro+ mode is activated, BUILD capacity is no longer a fixed historical number. It is computed as the minimum safe dimension across observed runtime/session capacity, CI capacity, AI-credit budget, BUILD_READY count and path/semantic independence.

### `maxLogicalLanes`

Logical PREBUILD/READINESS capacity remains independent from canonical BUILD execution. Logical lanes do not grant execution authority and may greatly exceed the number of physical workers.

## PUZZLE_FRONTIER scheduler

### Canonical BUILD frontier

- dependencies must be `aurora:accepted` and supported by live canonical evidence;
- explicit `dispatchPriority` wins first when slots are scarce;
- longest remaining DAG path breaks scheduling pressure next;
- active writer leases and shared-write/path conflicts fail closed;
- only BUILD_READY issues can be claimed by implementation workers.

### Logical Puzzle frontier

- may span multiple future waves;
- prioritizes wave coordination seeds and lower speculation depth;
- may prepare READINESS or governed PREBUILD artifacts while dependencies remain unavailable;
- cannot open a canonical PR or satisfy a dependency;
- ISOLATED_PATCH is allowed only with explicit `prebuildAllowedPaths`;
- every PREBUILD artifact requires reconciliation after upstream acceptance.

## FREE_ACTIONS_CLI

Current physical execution mode.

- compatibility ceiling: `physicalBuildSlots = 2`;
- dynamic controller subtracts active running/dispatched leases;
- `maxLogicalLanes = 32`;
- Copilot cloud agent remains disabled;
- Actions CLI BUILD execution is allowed through the governed worker when quota is available;
- worker candidates remain path-fenced and Program Control retains protected/shared surfaces;
- no PREBUILD or BUILD candidate is automatically accepted or merged.

## PRO_PLUS_CLOUD_AGENT

Capability-gated upgrade target.

It may be activated only through reviewed governance and only when runtime discovery positively observes all required signals. Unknown cloud-agent, isolated-session, CI or AI-credit capacity resolves to zero additional BUILD capacity.

Increasing compute never widens ownership, dependency, authority or acceptance policy.

## Session and writer leases

Live GitHub issue/task state is projected into a fail-closed lease registry.

- running/dispatched work locks its `allowedPaths` and `sharedWriteSurfaces` and consumes a physical session;
- an open canonical PR keeps the same writer lock but does not consume a worker slot;
- a colliding candidate is deferred before dispatch;
- stale/ambiguous leases remain locked until explicit reconciliation.

## Intra-task fleets

A fleet is an accelerator inside one canonical issue/branch/PR. It is not a way to claim multiple canonical issues.

The parent remains the sole branch/PR integrator. Prefer differentiated roles for read-only exploration, bounded implementation, disjoint test work and read-only red-team review. Fleet consensus never substitutes for exact-head acceptance.

## Development telemetry

Program Control emits `aurora.pro_plus.development_telemetry.v1`, including runtime readiness, safe BUILD capacity, session/writer leases, selected/deferred work, CI capacity, credit-slot budget and fleet cap when observable.

Telemetry is explicitly non-authoritative. Optimize accepted capability throughput and safe critical-path duration rather than raw agent count.

## Invariants across all modes

1. Logical preparation is not canonical authority.
2. A task graph node does not satisfy its own dependencies.
3. `aurora:accepted` plus live canonical evidence is required for canonical dependency release.
4. PREBUILD artifacts declare `canonicalAuthority: false` and require reconciliation.
5. No speculative runtime patch exists without an explicit path fence.
6. Shared/root/publication surfaces remain Program Control-owned unless explicitly transferred.
7. Intelligence is not Authority and neither is Execution.
8. No implementation/PREBUILD agent self-accepts or self-merges.
9. Main drift requires reconciliation and new exact-head evidence.
10. W03+ Risk Gates remain mandatory at their canonical acceptance points.
11. Increasing worker count never authorizes unsafe fan-out.
12. Unknown Pro+ runtime capacity fails closed.
13. One semantic surface has one writer lease at a time.
14. The optimization target is minimum safe end-to-end program duration, not maximum agent count.

## Current switch

`docs/governance/copilot/AURORA_COPILOT_EXECUTION_MODE.json`

The switch is validated by `tools/copilot/validate-execution-mode.mjs`, the Aurora Fabric gate and Aurora Puzzle Validation.
