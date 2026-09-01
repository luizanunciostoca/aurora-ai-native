# Aurora AI-Native — Current Program Status & Document Authority

Status: `ACTIVE_CURRENT_PROGRAM_STATE_ON_ACCEPTED_MAIN`  
W03-00 baseline main: `ad664f32949256ccc5751fe1fb88047b66c2d247`  
Audit date: 2026-09-01

## Authority order

1. GitHub `main` is implementation/code authority.
2. Accepted PR/exact-SHA evidence governs implementation and publication acceptance.
3. Google Drive `AURORA_AI_NATIVE_DEVELOPMENT_GOVERNANCE` is live operational governance/evidence authority.
4. Developer Manual v0.5 Audit-Consolidated, accepted ADRs and owning-wave governance define architecture/scope.
5. Risk & Architecture Validation Framework v1.0 is mandatory for W03+.
6. Historical/superseded/salvage material is provenance/reference only.

No prompt, task node, draft PR, agent output or reference artifact can release a dependency by itself.

## Accepted program state

- W00: `COMPLETE_ACCEPTED`.
- W01: `COMPLETE_ACCEPTED`.
- W02: `COMPLETE_ACCEPTED / REALITY_GATE_1_AUTHORITY_VERIFIED`.
- W02-00/A/B/C/D/E/F/G: `COMPLETE_ACCEPTED_MERGED`.
- PB1-PB5: `COMPLETE_RELEASED / ACCEPTED` as applicable.
- W03: released for its coordination/ownership/risk freeze.
- W04: readiness/reference mining only until accepted W03 dependencies release it.
- W05-W20: dependency-gated except readiness/reference work explicitly allowed by accepted program governance.

## W02 final evidence

PB5 canonical PR #73 merged after exact HEAD `bd9b5d7495bd3c49ca24781c41238be7fda3dbdc` passed Quality `33462240393`, Test Build `33462240427` and Security `33462240798`. PB5 merge/release main is `ad664f32949256ccc5751fe1fb88047b66c2d247`; exact-main Quality/Test Build/Security all succeeded. Issue #71 is closed with `aurora:accepted`. Drive records `W02-PB5-001`, `CHG-W02-PB5-001`, `EVD-W02-PB5-001`, `ACC-W02-PB5-001` are canonical.

W02-G Reality Gate remains immutable evidence: PR #68, exact accepted HEAD `ee2572d09392f6ee06014fb9d8335d2e9b6fd758`, Quality `33460989349`, Test Build `33460989330`, Security `33460989658`, merge `4df704ae787947d2138658cae984726470f7633d`, post-merge gates successful, S01-S20 accepted with zero real external side effects.

## W03-00 publication semantics

This file is updated by the W03-00 coordination-freeze candidate. **While that PR is unmerged, W03-A remains gated.** When this exact W03-00 candidate is independently accepted, passes Quality/Test Build/Security on one exact HEAD, `main` is revalidated, merges, post-merge main is verified and Drive records converge, the effective state becomes:

- W03-00: `COMPLETE_ACCEPTED_MERGED_VERIFIED_ON_MAIN`.
- W03-A: `RELEASED_FOR_IMPLEMENTATION`.
- W03-B/C/D/E/F: remain dependency-gated according to the accepted W03 dependency matrix.

Canonical W03 Drive folder: `W03_PERSISTENCE_EVENT_BACKBONE_DURABLE_WORKFLOW` / `1ZO73FVedMQM77dtfRtWF9wm54eulBkXc`.

Drive freeze documents:
- `W03_WAVE_CHARTER` / `1amZXFhfGCf_RYhqNWFokTT658Y4msIkzHQsrJn0RNyY`.
- `W03_DEPENDENCY_MATRIX` / `1cq4M71-J_aWi2ZBJPUk21CnyGlvV4yl19Fw4Pal0khs`.
- `W03_OWNERSHIP_MATRIX` / `1zeJVIkEx_KlkKC0Wap8TTnJvRMD446xQGPMUJ8oB5SU`.
- `W03_ACCEPTANCE_MATRIX_AND_REALITY_GATE` / `18pfgf3TqWB9J4n581pdjpK0v6S2gr7i0H6ZjULoaUIE`.
- `W03_RISK_REGISTER_AND_PREMORTEM` / `1YSg6iAgnuLOan37eQCYOAlx7jwGyTo0qYGFyjEqCxuo`.

## W03 frozen DAG

`W03-00 -> W03-A -> (W03-B || W03-C) -> (W03-D || W03-E) -> W03-F`

D/E require accepted B+C. F requires accepted D+E. Downstream release requires `aurora:accepted` plus canonical exact-SHA/Drive evidence.

## W03 architecture boundaries

W03 owns durable Postgres/event/outbox/inbox/idempotency/replay/DLQ/timers/leases/durable-workflow primitives. It reuses W01 canonical EventEnvelope/IDs/context/versioning and W02 tenant/identity/policy/authority boundaries.

W03 does not implement W04 Capability Registry/GoalGraph/planning scheduler/lanes, W05 agents, W07 side-effect Executor, W08 providers, W09 n8n business logic, W14 device gateway/session/trust, W15 Android runtime, W17 production telemetry/DR or W18 adaptive learning.

Reliable state transitions are event-driven by default. Polling is bounded claim/reconciliation/recovery fallback only. Replay/history never grants authority. Duplicate/replayed work must not duplicate irreversible side effects.

## Development execution fabric

`FREE_ACTIONS_CLI` remains accepted. Code workers may execute at most two dependency-satisfied code tasks per batch. Coordinator/governance/acceptance tasks remain Program Control-owned. Workers cannot auto-merge/self-accept; generated outputs are filtered and canonical open PR ownership blocks duplicate candidates.

## Acceptance discipline

W03+ uses separate Risk Gates A Correctness, B Safety/Authority, C Performance/Economics and D Failure/Recoverability. Release blockers independent of score remain authority bypass, cross-tenant breach, uncontrolled duplicate irreversible side effect, secret exposure and irreversible execution without valid authority.

No stale CI satisfies acceptance. Before every merge/downstream release, revalidate current main, exact candidate HEAD, official gates, PR state, Drive task/change/evidence/acceptance/deprecation registries and active ownership/dependency documents.
