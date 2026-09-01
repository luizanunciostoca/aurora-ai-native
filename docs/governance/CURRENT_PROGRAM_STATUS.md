# Aurora AI-Native — Current Program Status & Document Authority

Status: `ACTIVE_CURRENT_PROGRAM_STATE_W04_00_ACCEPTED`
Audit date: 2026-09-01
Current accepted main: `8ae384809fa25ddf7dd78511d12c021874fd6a6b`

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
- W03-00/A/B/C/D/E/F: accepted according to canonical exact-SHA/Drive evidence; W03-F issue #88 is closed with `aurora:accepted`.
- W04-00: `COMPLETE_ACCEPTED / W04_COORDINATION_FREEZE_VERIFIED`.
- W04-A, W04-B and W04-F: dependency-ready after W04-00 acceptance; current `FREE_ACTIONS_CLI maxParallelTasks=2` allows two simultaneous code BUILD nodes, with critical-path default W04-A + W04-B and W04-F immediately next-ready.
- W04-C/D/E/G/H: dependency-gated by the W04 matrix.
- W05-W20: dependency-gated except PREBUILD/readiness explicitly allowed by accepted Puzzle governance.

## W02 final evidence

PB5 canonical PR #73 merged after exact HEAD `bd9b5d7495bd3c49ca24781c41238be7fda3dbdc` passed Quality `33462240393`, Test Build `33462240427` and Security `33462240798`. PB5 release main is `ad664f32949256ccc5751fe1fb88047b66c2d247`; exact-main gates succeeded. Issue #71 is closed with `aurora:accepted`.

W02-G Reality Gate immutable evidence: PR #68, exact accepted HEAD `ee2572d09392f6ee06014fb9d8335d2e9b6fd758`, candidate Quality `33460989349`, Test Build `33460989330`, Security `33460989658`, merge `4df704ae787947d2138658cae984726470f7633d`, successful post-merge gates, S01-S20 accepted with zero real external side effects.

## W03 final evidence

W03 final outcome: `DURABLE_EVENT_DELIVERY_VERIFIED`.

Canonical W03-F / Reality Gate evidence:
- PR #126 — `test(w03-f): integrated Reality Gate and recovery validation`.
- Base main `c5343528219f21761a8171cf5ae14fd1b6e4e55c`.
- Exact accepted candidate HEAD `8108a9259823e27064ca3254785978982d382c2e`.
- Candidate Quality `33476434872`, Test Build `33476434863`, Security `33476435285`: SUCCESS.
- Exact-head PostgreSQL Reality Gate `33476470808`: SUCCESS with explicit checkout/provenance assertion of the candidate SHA.
- Merge/main `76ba0db1bf399c21d08e2190915213ceb8f4eb02`.
- Post-merge Quality `33476605969`, Test Build `33476605936`, Security `33476606422`: SUCCESS.
- Risk Gates A/B/C/D: PASS for W03 acceptance scope.
- R01-R20 applicable scenarios: PASS via normal CI + PostgreSQL gate + recovery runbook.
- Issue #88: closed `completed` with `aurora:accepted`.

Canonical W03 Drive folder: `W03_PERSISTENCE_EVENT_BACKBONE_DURABLE_WORKFLOW` / `1ZO73FVedMQM77dtfRtWF9wm54eulBkXc`.

## W04-00 final evidence

W04-00 is governance/control-plane freeze only; it does not implement runtime feature semantics.

Canonical acceptance evidence:
- PR #128 — `docs(w04): freeze control-core ownership, DAG and risk gates`.
- Base accepted main `76ba0db1bf399c21d08e2190915213ceb8f4eb02`.
- Exact accepted candidate HEAD `475e4eda3e13f14519621e09cbc21504b2d3e8b3`.
- Candidate Aurora Puzzle Validation `33478965459`: SUCCESS.
- Candidate Aurora Copilot Fabric Validation `33478965512`: SUCCESS.
- Candidate Quality `33478965521`: SUCCESS.
- Candidate Test Build `33478965531`: SUCCESS.
- Candidate Security `33478966351`: SUCCESS.
- Merge/current accepted main `8ae384809fa25ddf7dd78511d12c021874fd6a6b`.
- Post-merge Aurora Puzzle Validation `33479274060`: SUCCESS.
- Post-merge Aurora Copilot Fabric Validation `33479274049`: SUCCESS.
- Post-merge Quality `33479274084`: SUCCESS.
- Post-merge Test Build `33479274081`: SUCCESS.
- Post-merge Security `33479274671`: SUCCESS.
- Risk Gate A / Correctness: PASS.
- Risk Gate B / Safety & Authority: PASS.
- Risk Gate C / Performance & Economics: `PASS_FOR_GOVERNANCE_SCOPE_ONLY`.
- Risk Gate D / Failure & Recoverability: `PASS_FOR_GOVERNANCE_SCOPE_ONLY`.
- Drive acceptance evidence: `W04-00_ACCEPTANCE_EVIDENCE_2026-09-01` / `1fXfgev71f69dcmWyI77033wQTtgdEvWWEGl1YlsA0X0`.

Canonical W04 Drive folder: `W04_CONTROL_CORE_CAPABILITY_PLANNING_GOAL_GRAPH` / `1Vz45N4p5zhubQvBFAf_zFinkhCFZcQdp`.

Canonical W04 governance set:
- `W04_WAVE_CHARTER` / `1EuaCojwIjkQDo7_tOEFaR5BClXLQ-R8hA2KKnK6uxQw`.
- `W04_DEPENDENCY_MATRIX` / `1sziPj4DVg-_L0DzP0eR0y2Hl7RB8-L6ANJFVPkZpsgs`.
- `W04_OWNERSHIP_MATRIX` / `1Zf5kSHfYim2xbuiRkZNG-ZRZ13itcw9npe8Jj_oLRxc`.
- `W04_ACCEPTANCE_MATRIX_AND_RISK_GATES` / `1Qg99cyjU8hjeaUutRGRp4LsW6re4jBQldcUtNDPNwbI`.
- `W04_RISK_REGISTER_AND_PREMORTEM` / `1BmzxMUpU-k3mlVeEvyzxiDjoQZq0zYjw4YyHqNAAIio`.
- `W04_CAPABILITY_SEED_ADJUDICATION_RULES` / `1u-gr7xVon_xIFGkIt_VeiFj-UQD37IfyaQA3J2iRLFw`.

## W04 canonical DAG and ready frontier

`W04-00 -> (W04-A || W04-B || W04-F)`

`W04-A + W04-B -> (W04-C || W04-E || W04-G)`

`W04-C + W04-F -> W04-D`

`W04-D + W04-E + W04-G -> W04-H`

Current dependency-ready frontier after W04-00 acceptance is `{ W04-A, W04-B, W04-F }`. With current execution capacity, Program Control should dispatch W04-A + W04-B first and keep W04-F next-ready unless live ownership/shared-write reconciliation reduces the safe frontier.

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
