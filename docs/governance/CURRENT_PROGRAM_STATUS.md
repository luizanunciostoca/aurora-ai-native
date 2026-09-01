# Aurora AI-Native — Current Program Status & Document Authority

Status: `ACTIVE_CURRENT_PROGRAM_STATE_W04_00_CANDIDATE`  
Current accepted main before W04-00: `76ba0db1bf399c21d08e2190915213ceb8f4eb02`  
Audit date: 2026-09-01

## Authority order

1. GitHub `main` is implementation/code authority.
2. Accepted PR/exact-SHA evidence governs implementation and publication acceptance.
3. Google Drive `AURORA_AI_NATIVE_DEVELOPMENT_GOVERNANCE` is live operational governance/evidence authority.
4. Developer Manual v0.5 Audit-Consolidated, accepted ADRs and owning-wave governance define architecture/scope.
5. Risk & Architecture Validation Framework v1.0 is mandatory for W03+.
6. Historical/superseded/salvage material is provenance/reference only.

No prompt, task node, PREBUILD artifact, draft PR, agent output or reference source can release a dependency by itself.

## Accepted program state

- W00: `COMPLETE_ACCEPTED`.
- W01: `COMPLETE_ACCEPTED`.
- W02: `COMPLETE_ACCEPTED / REALITY_GATE_1_AUTHORITY_VERIFIED`.
- W02-00/A/B/C/D/E/F/G: `COMPLETE_ACCEPTED_MERGED`.
- PB1-PB5: `COMPLETE_RELEASED / ACCEPTED` as applicable.
- W03: `COMPLETE_ACCEPTED / REALITY_GATE_DURABLE_EVENT_DELIVERY_VERIFIED`.
- W03-00/A/B/C/D/E/F: accepted according to their canonical exact-SHA/Drive evidence; W03-F issue #88 is closed with `aurora:accepted`.
- W04-00: `RELEASED_FOR_COORDINATION_IMPLEMENTATION / BUILD_READY`; current coordination candidate branch is `wave/04-00-coordination-freeze` from accepted main `76ba0db1...`.
- W04-A/B/F: remain implementation-gated until W04-00 itself is independently accepted/merged/post-merge verified/Drive-converged and issue #89 receives `aurora:accepted`.
- W04-C/D/E/G/H: dependency-gated by the W04 matrix.
- W05-W20: dependency-gated except PREBUILD/readiness work explicitly allowed by accepted Puzzle governance.

## W02 final evidence

PB5 canonical PR #73 merged after exact HEAD `bd9b5d7495bd3c49ca24781c41238be7fda3dbdc` passed Quality `33462240393`, Test Build `33462240427` and Security `33462240798`. PB5 release main is `ad664f32949256ccc5751fe1fb88047b66c2d247`; exact-main gates succeeded. Issue #71 is closed with `aurora:accepted`.

W02-G Reality Gate remains immutable evidence: PR #68, exact accepted HEAD `ee2572d09392f6ee06014fb9d8335d2e9b6fd758`, candidate Quality `33460989349`, Test Build `33460989330`, Security `33460989658`, merge `4df704ae787947d2138658cae984726470f7633d`, successful post-merge gates, S01-S20 accepted with zero real external side effects.

## W03 final evidence

W03 final outcome: `DURABLE_EVENT_DELIVERY_VERIFIED`.

Canonical W03-F / Reality Gate evidence:
- PR #126 — `test(w03-f): integrated Reality Gate and recovery validation`.
- Base main `c5343528219f21761a8171cf5ae14fd1b6e4e55c`.
- Exact accepted candidate HEAD `8108a9259823e27064ca3254785978982d382c2e`.
- Candidate Quality `33476434872`, Test Build `33476434863`, Security `33476435285`: SUCCESS.
- Exact-head PostgreSQL Reality Gate `33476470808`: SUCCESS with explicit checkout/provenance assertion of the candidate SHA.
- Merge/current accepted main `76ba0db1bf399c21d08e2190915213ceb8f4eb02`.
- Post-merge Quality `33476605969`, Test Build `33476605936`, Security `33476606422`: SUCCESS.
- Risk Gates A/B/C/D: PASS for W03 acceptance scope.
- R01-R20 applicable scenarios: PASS via normal CI + PostgreSQL gate + recovery runbook.
- Issue #88: closed `completed` with `aurora:accepted`.

W03 performance/failure evidence includes 10,016 bounded modeled deliveries, 1,500-objective scale, real PostgreSQL 1,500-row durable backlog, bounded claim batches, rollback, committed-outbox survival, claim ownership/reclaim/stale-owner rejection, cross-tenant isolation, timer race, deterministic restart/resume and DB-unavailable fail-closed.

Canonical W03 Drive folder: `W03_PERSISTENCE_EVENT_BACKBONE_DURABLE_WORKFLOW` / `1ZO73FVedMQM77dtfRtWF9wm54eulBkXc`.

Key W03 Drive evidence:
- `W03_WAVE_CHARTER` / `1amZXFhfGCf_RYhqNWFokTT658Y4msIkzHQsrJn0RNyY`.
- `W03_DEPENDENCY_MATRIX` / `1cq4M71-J_aWi2ZBJPUk21CnyGlvV4yl19Fw4Pal0khs`.
- `W03_OWNERSHIP_MATRIX` / `1zeJVIkEx_KlkKC0Wap8TTnJvRMD446xQGPMUJ8oB5SU`.
- `W03_ACCEPTANCE_MATRIX_AND_REALITY_GATE` / `18pfgf3TqWB9J4n581pdjpK0v6S2gr7i0H6ZjULoaUIE` — `COMPLETE_ACCEPTED / DURABLE_EVENT_DELIVERY_VERIFIED`.
- `W03_RISK_REGISTER_AND_PREMORTEM` / `1YSg6iAgnuLOan37eQCYOAlx7jwGyTo0qYGFyjEqCxuo` — final controls closed/transferred.
- `W03-F_ACCEPTANCE_EVIDENCE_2026-09-01` / `18cblmxaKykVIRPn6WxV_vvG60I_63Ywp4dQoOv0jmY0`.

## W04-00 publication semantics

W03-F acceptance satisfies the sole W04-00 graph dependency. Issue #89 is now `aurora:puzzle-build-ready`.

W04-00 is a Program Control coordination freeze, not a runtime feature task. Its candidate must freeze:
- control-core architecture and W04 hard boundaries;
- internal W04 DAG and publication barriers;
- one target-neutral Capability Registry ownership;
- exact semantic leaf ownership/shared-surface rules;
- Risk Gates / pre-mortem / W04 final Reality Gate scenarios;
- machine-readable `W04.json` schema-v2 metadata;
- legacy/TOCA capability-seed handling and Device DP1 boundary.

While the W04-00 candidate is unaccepted:
- W04-A/B/F may perform only allowed readiness/PREBUILD work, not canonical runtime BUILD.
- W04-C/D/E/G/H remain dependency-gated.
- W05/W07/W14/W15 are not released by inference.

After W04-00 is independently accepted, official gates pass on one exact HEAD, it merges, post-merge main is verified, Drive records converge and #89 receives `aurora:accepted`, the first true W04 READY set becomes:

`{ W04-A, W04-B, W04-F }`

Under current `FREE_ACTIONS_CLI maxParallelTasks=2`, only two code BUILD nodes execute simultaneously. Critical-path priority normally selects W04-A + W04-B first; W04-F stays immediately next-ready unless live ownership/shared-write reconciliation changes the safe frontier.

## W04 architecture boundaries

W04 owns Objective/Goal/Task lifecycle, target-neutral Capability Registry/CapabilityPlan, logical GoalGraph, bounded planner scheduler, Fast/Governed lane planning, ExecutionBudget and curated PlanTemplate/PlanBinding foundations.

W04 does **not** own:
- W03 durable event/outbox/inbox/replay/DLQ/timers/leases/workflow truth;
- W05 intelligence router/reasoning/confidence/agent runtime;
- W07 side-effect executor/target resolution/current execution authority/readback/reconciliation;
- W08 providers;
- W14 DeviceId/session/trust/gateway;
- W15 Android/native Device Executor/runtime;
- W17 production telemetry/DR;
- W18 adaptive learning/promotion.

Core invariants:
- Intelligence != Authority != Execution.
- Capability != Authority.
- Plan/Lane/Budget/Template != Authority.
- Fast Lane may optimize strategy but cannot bypass current Policy/Authority/Executor validation.
- DEVICE capability binding may be target-neutral for DP1 but cannot contain Android business logic, DeviceId/session/trust or execution semantics.

## Legacy / TOCA W04 input status

Legacy capability register remains `ACTIVE_CANONICAL_PLANNING_INPUT`: 541 files classified, 69 deduplicated capability seeds, every seed `SEED_ONLY_NOT_CANONICAL` and `NO_DIRECT_RUNTIME_IMPORT` by default.

TOCA MCP salvage remains reference-only at audited commit `8a6cfe055be9b34e498cfbdb481e8232dc51df05`. Capability catalog/IDs/lifecycle/resolution/validation-evidence are semantic references only. TOCA Approval/Autonomy/route/business bindings cannot become parallel Aurora authority.

## Development execution fabric

Puzzle/READY_FRONTIER governance remains active. `FREE_ACTIONS_CLI` permits at most two dependency-satisfied code tasks per batch. Program Control owns coordination/acceptance/shared-surface reconciliation. PREBUILD is read-only/non-authoritative and cannot satisfy dependencies. Workers cannot self-accept or auto-merge.

## Acceptance discipline

W03+ uses separate Risk Gates A Correctness, B Safety/Authority, C Performance/Economics and D Failure/Recoverability. Release blockers independent of score remain authority bypass, cross-tenant breach, uncontrolled duplicate irreversible side effect, secret exposure and irreversible execution without valid authority.

No stale CI satisfies acceptance. Before every merge/downstream release, revalidate current main, exact candidate HEAD, official gates, PR state, Drive task/change/evidence/acceptance records and active ownership/dependency documents.
