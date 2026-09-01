# Aurora Full-Wave Parallel Execution Standard

Status: `SUPERSEDED_ON_ACCEPTANCE_BY_AURORA_PUZZLE_MASSIVELY_PARALLEL_EXECUTION_STANDARD`

This document records the previous full-wave execution model that introduced the safe canonical `READY_FRONTIER`, critical-path scheduling, path fences, shared-surface conflict detection, exact-head acceptance and non-retroactive activation.

Its safety properties are **retained**, not removed.

The successor is:

`docs/governance/copilot/AURORA_PUZZLE_MASSIVELY_PARALLEL_EXECUTION_STANDARD.md`

## Retained canonical BUILD rules

The old `READY_FRONTIER` becomes the **canonical BUILD frontier** inside the Puzzle model.

A task may enter canonical BUILD only when every graph dependency is accepted by live canonical evidence.

When BUILD_READY tasks exceed physical slots, selection remains:

1. explicit dispatch priority;
2. longest remaining DAG path;
3. deterministic task ordering.

Shared semantic-write collisions and overlapping owned paths remain fail-closed.

Root workspace config, lockfiles, build config, CI/workflows, CODEOWNERS, migrations/publication allocation and shared public barrels remain Program Control surfaces unless explicitly transferred.

Canonical candidate acceptance remains:

`DEPENDENCIES ACCEPTED -> BUILD_READY -> CLAIM -> IMPLEMENT/RECONCILE -> TARGETED TEST -> ISOLATED CANDIDATE -> PR -> EXACT-HEAD FABRIC/QUALITY/TEST BUILD/SECURITY -> RISK GATES -> REVIEW -> MERGE -> POST-MERGE VALIDATION -> DRIVE CONVERGENCE -> ACCEPTED`

## What the Puzzle successor adds

The old standard equated blocked dependencies with read-only readiness and effectively tied useful lane count to canonical execution width.

The Puzzle successor separates:

- **physical BUILD slots** — authority-gated canonical implementation capacity;
- **logical PREBUILD/READINESS lanes** — non-authoritative future-wave preparation capacity.

This permits many future puzzle pieces to be prepared while preserving every canonical BUILD/acceptance gate above.

PREBUILD artifacts can never satisfy dependencies or merge directly. They require explicit reconciliation against accepted upstream contracts before BUILD promotion.

## Compatibility

Existing legitimate tasks already running when the successor activates remain governed by `NON_RETROACTIVE` activation.

No previous accepted implementation is invalidated solely because the scheduler governance evolves.

The optimization target remains:

`MINIMUM_SAFE_CRITICAL_PATH`
