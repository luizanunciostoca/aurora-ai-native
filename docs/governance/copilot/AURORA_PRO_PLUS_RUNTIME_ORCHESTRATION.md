# Aurora Pro+ Runtime Orchestration

Status: `PROGRAM_CONTROL_RUNTIME_GOVERNANCE_CANDIDATE`

This document defines the runtime control layer that turns the accepted Pro+ parallel-development policy into capability-gated execution. It never overrides live `main`, exact-SHA evidence, owning wave governance, Risk Gates, reviews or post-merge acceptance.

## State model

Aurora separates three facts:

1. **Pro+ governance active** — the coordinator may plan dynamic isolated sessions and bounded intra-task fleets.
2. **Pro+ runtime capability proven** — the current environment has positively observed plan, execution backend, isolated-session, CI and AI-credit capacity.
3. **Canonical BUILD authority** — still derives only from accepted dependencies, ownership/path fences and the normal Aurora acceptance chain.

A higher plan or a larger fleet never grants authority.

## Runtime capability discovery

`tools/copilot/runtime-capacity.mjs` consumes explicit runtime signals. Unknown signals fail closed.

For `PRO_PLUS_CLOUD_AGENT`, all of the following must be positively observed before additional BUILD capacity exists:

- cloud-agent availability;
- account plan observation;
- isolated-session capacity;
- CI parallel capacity;
- AI-credit slot budget.

Fleet/subagent capacity is reported separately and cannot increase canonical BUILD issue count.

## Dynamic safe BUILD capacity

Aurora computes capacity as the minimum safe dimension:

`min(configured ceiling, available isolated sessions, CI capacity, AI-credit slot budget, BUILD_READY count, path-independent count)`

Running/dispatched leases consume an execution session. A canonical PR that is merely open retains its write lock but does not consume an execution session.

## Session and writer lease registry

`tools/copilot/session-lease-registry.mjs` projects active ownership from live GitHub issues plus canonical task metadata.

A lease locks both:

- `allowedPaths`;
- `sharedWriteSurfaces`.

A conflicting BUILD candidate is deferred before worker dispatch. Stale or ambiguous leases fail closed until Program Control reconciles them; they are never silently expired into a second writer.

## Fleet orchestration

Fleet/subagent concurrency is an intra-task acceleration signal only. The parent task/session remains the sole branch/PR integrator.

Recommended roles remain differentiated:

- read-only contract/explore;
- bounded implementation;
- bounded tests/failure analysis on disjoint paths;
- read-only red-team/review.

Fleet consensus, model confidence or speed cannot satisfy acceptance.

## Telemetry and economics

`tools/copilot/pro-plus-telemetry.mjs` emits `aurora.pro_plus.development_telemetry.v1` with runtime availability, safe BUILD capacity, active leases, selected/deferred BUILD counts, fleet cap and CI/credit capacity.

The record is operational evidence only (`canonicalAuthority=false`).

Program-level optimization should trend toward accepted capability throughput per safe critical-path time, not raw agent count.

## Activation rule

The repository intentionally remains in `FREE_ACTIONS_CLI` until a real runtime proves the required Pro+ signals. Switching the JSON flag alone is insufficient and must never be treated as proof that cloud-agent capacity exists.

When those signals become observable, Program Control may review a normal execution-mode change to `PRO_PLUS_CLOUD_AGENT`; the controller then computes the usable BUILD frontier dynamically instead of inheriting the historical two-slot Free ceiling.
