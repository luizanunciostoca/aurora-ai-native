# Aurora AI-Native — Current Program Status & Document Authority

Status: `ACTIVE_CURRENT_PROGRAM_STATE_W04_COMPLETE_ACCEPTED_W05_W07_READY`
Audit date: 2026-09-01
Current accepted feature baseline before this governance-status publication: `fcc26c1065961ec6ca52019195108f3562c33365`

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
- W03-00/A/B/C/D/E/F: accepted according to canonical exact-SHA/Drive evidence.
- W04: `COMPLETE_ACCEPTED / W04_CONTROL_CORE_VERIFIED`.
- W04-00/A/B/C/D/E/F/G/H: `COMPLETE_ACCEPTED_MERGED` according to exact-SHA, post-merge and Drive evidence below.
- W05-00: `DEPENDENCY_READY` because its direct graph dependency W04-H is accepted; BUILD still requires its own coordination freeze and live publication barriers.
- W07-00: `DEPENDENCY_READY` because its direct graph dependency W04-H is accepted; BUILD still requires its own coordination freeze and live publication barriers.
- W05/W07 descendants and W06/W08-W20 remain dependency-gated except PREBUILD/readiness explicitly allowed by accepted Puzzle governance.
- W15-00 is not released by W04-H alone; it remains additionally dependent on W02-PB5, W03-F, W07-H and W14-H.

## W02 final evidence

PB5 canonical PR #73 merged after exact HEAD `bd9b5d7495bd3c49ca24781c41238be7fda3dbdc` passed Quality `33462240393`, Test Build `33462240427` and Security `33462240798`. PB5 release main is `ad664f32949256ccc5751fe1fb88047b66c2d247`; exact-main gates succeeded. Issue #71 is closed with `aurora:accepted`.

W02-G Reality Gate immutable evidence: PR #68, exact accepted HEAD `ee2572d09392f6ee06014fb9d8335d2e9b6fd758`, candidate Quality `33460989349`, Test Build `33460989330`, Security `33460989658`, merge `4df704ae787947d2138658cae984726470f7633d`, successful post-merge gates, S01-S20 accepted with zero real external side effects.

## W03 final evidence

W03 final outcome: `DURABLE_EVENT_DELIVERY_VERIFIED`.

Canonical W03-F / Reality Gate evidence:
- PR #126 — `test(w03-f): integrated Reality Gate and recovery validation`.
- Exact accepted candidate HEAD `8108a9259823e27064ca3254785978982d382c2e`.
- Candidate Quality `33476434872`, Test Build `33476434863`, Security `33476435285`: SUCCESS.
- Exact-head PostgreSQL Reality Gate `33476470808`: SUCCESS.
- Merge/main `76ba0db1bf399c21d08e2190915213ceb8f4eb02`.
- Post-merge Quality `33476605969`, Test Build `33476605936`, Security `33476606422`: SUCCESS.
- Risk Gates A/B/C/D: PASS for W03 acceptance scope.

Canonical W03 Drive folder: `W03_PERSISTENCE_EVENT_BACKBONE_DURABLE_WORKFLOW` / `1ZO73FVedMQM77dtfRtWF9wm54eulBkXc`.

## W04 accepted evidence

Canonical W04 Drive folder: `W04_CONTROL_CORE_CAPABILITY_PLANNING_GOAL_GRAPH` / `1Vz45N4p5zhubQvBFAf_zFinkhCFZcQdp`.

Canonical W04 governance set:
- `W04_WAVE_CHARTER` / `1EuaCojwIjkQDo7_tOEFaR5BClXLQ-R8hA2KKnK6uxQw`.
- `W04_DEPENDENCY_MATRIX` / `1sziPj4DVg-_L0DzP0eR0y2Hl7RB8-L6ANJFVPkZpsgs`.
- `W04_OWNERSHIP_MATRIX` / `1Zf5kSHfYim2xbuiRkZNG-ZRZ13itcw9npe8Jj_oLRxc`.
- `W04_ACCEPTANCE_MATRIX_AND_RISK_GATES` / `1Qg99cyjU8hjeaUutRGRp4LsW6re4jBQldcUtNDPNwbI`.
- `W04_RISK_REGISTER_AND_PREMORTEM` / `1BmzxMUpU-k3mlVeEvyzxiDjoQZq0zYjw4YyHqNAAIio`.
- `W04_CAPABILITY_SEED_ADJUDICATION_RULES` / `1u-gr7xVon_xIFGkIt_VeiFj-UQD37IfyaQA3J2iRLFw`.

### W04-00

- PR #128 — `docs(w04): freeze control-core ownership, DAG and risk gates`.
- Exact accepted candidate HEAD `475e4eda3e13f14519621e09cbc21504b2d3e8b3`.
- Candidate Puzzle/Copilot/Quality/Test Build/Security: SUCCESS.
- Merge/main `8ae384809fa25ddf7dd78511d12c021874fd6a6b` with required post-merge verification SUCCESS.
- Risk Gate A/B: PASS; C/D: `PASS_FOR_GOVERNANCE_SCOPE_ONLY`.
- Drive evidence `W04-00_ACCEPTANCE_EVIDENCE_2026-09-01` / `1fXfgev71f69dcmWyI77033wQTtgdEvWWEGl1YlsA0X0`.

### W04-A

- PR #135 — deterministic Objective/Goal/Task lifecycle.
- Candidate `b5a6a9ee56c26858cae0fc9544c804ef87075d91`; Quality `33485742600`, Test Build `33485742585`, Security `33485743047`: SUCCESS.
- Merge/main `ddea4dfb8b50ed9f1d833b614c303d0f7d10be9b` with post-merge acceptance verification completed.
- Drive evidence `W04_A_ACCEPTANCE_EVIDENCE` / `1pIAw_uVQvRO9Sw5znzaombTvPQ2o-S4o8mWA-hAqOSw`; issue #90 closed with `aurora:accepted`.

### W04-B

- PR #136 — target-neutral Capability Registry and CapabilityPlan.
- Candidate `887e021b596b7d515d1b9ad710b3c12b94f31507`; Quality `33488395342`, Test Build `33488395172`, Security `33488395983`: SUCCESS.
- Merge/main `4bb1feaba290a4a108c5ad95c95033392f305caf`; post-merge Quality `33488589748`, Test Build `33488589739`, Security `33488590573`: SUCCESS.
- All 69 legacy capability seeds were adjudicated exactly once without direct legacy runtime import.
- Drive evidence `W04_B_ACCEPTANCE_EVIDENCE` / `15-0ZeBNXPtOnFQyqjxrOtn59R_jRthVpe3oYSKh0x4o`; issue #91 closed with `aurora:accepted`.

### W04-C

- PR #142 — deterministic bounded GoalGraph DAG semantics.
- Candidate `f37e01e897fc339b55a2595a557652a05288a919`; Quality `33494595596`, Test Build `33494595609`, Security `33494596214`: SUCCESS.
- Merge/main `5ce8edf479035d9d0a5ec1ee469ecd1f09e35776`; post-merge Quality `33495213692`, Test Build `33495213723`, Security `33495214310`: SUCCESS.
- Drive evidence `W04_C_ACCEPTANCE_EVIDENCE` / `18q4-EQ9c9-3nthRuwjf0hGS-Icbf1Y0860-Y3rJKXtM`; issue #92 closed with `aurora:accepted`.

### W04-D

- PR #146 — deterministic bounded-parallel scheduler planning.
- Candidate `8942d24a9a109ec4792daa39620b0bbbf9d8a407`; Quality `33498894230`, Test Build `33498894296`, Security `33498894696`: SUCCESS.
- Merge/main `2ea645f262c39c6cd53802568b501cfaa83f135e`; post-merge Quality `33502700810`, Test Build `33502700792`, Security `33502701222`: SUCCESS.
- W03 remains durable coordination authority; `authorizesExecution` remains false.
- Drive evidence `W04_D_ACCEPTANCE_EVIDENCE` / `1K6vwChKqN-3v6NsPMzlUNGtfpvNAe1V-pVoCDoHyGmc`; issue #93 closed with `aurora:accepted`.

### W04-E

- PR #143 — deterministic Fast/Governed lane resolver.
- Candidate `7b2c283d36e23054ebdeabbd8a009dd229355277`; Quality `33493769716`, Test Build `33493769717`, Security `33493770320`: SUCCESS.
- Merge/main `1b3d777b51fac6a281778a9045fd8525b8c79ca0`; post-merge Quality `33495229415`, Test Build `33495229356`, Security `33495230035`: SUCCESS.
- Fast/Governed metadata never bypasses current Policy/Authority/Executor validation.
- Drive evidence `W04_E_ACCEPTANCE_EVIDENCE` / `1ANOEKaYQ617umDceEP51eECTBnuuFRTx37ahqNfrWvI`; issue #94 closed with `aurora:accepted`.

### W04-F

- PR #137 — deterministic ExecutionBudget contract.
- Candidate `b93adf37973fe7828d760a049c003d8fe659f0de`; Quality `33488535098`, Test Build `33488535086`, Security `33488535582`: SUCCESS.
- Merge/main `5fac1a0c317b060f2da11545066f2dfffe3eceb7`; post-merge Quality `33488826903`, Test Build `33488826823`, Security `33488827621`: SUCCESS.
- Budget exhaustion cannot weaken mandatory safety validation or mint authority.
- Drive evidence `W04_F_ACCEPTANCE_EVIDENCE` / `1sKxZhQjhDQGpPxZzayX7ZmT3s6NjvpjcaepMOg29zCQ`; issue #95 closed with `aurora:accepted`.

### W04-G

- Canonical PR #148 — curated PlanTemplate/PlanBinding reconciled onto accepted W04-D main; stale-base PR #144 was closed without merge.
- Candidate `3c39d0ff2f03412063068e5ce08753d106dfab89`; Quality `33502809690`, Test Build `33502809897`, Security `33502810454`: SUCCESS.
- Merge/main `e914a0dbf02b026efbeeaa42480c82851da6b06c`; post-merge Quality `33503108260`, Test Build `33503108287`, Security `33503108756`: SUCCESS.
- Version/hash/provenance/compatibility/invalidation are fail-closed; `authorizesExecution: false`; `adaptivePromotion: false`.
- Drive evidence `W04_G_ACCEPTANCE_EVIDENCE` / `1Bluh6slZP63L5r7V157v9lJofKpQ9lEwsdiV_ya5B0U`; issue #96 closed with `aurora:accepted`.

### W04-H / final W04 Reality Gate

- PR #151 — `test(w04-h): integrated control-core reality gate`.
- Exact accepted candidate HEAD `b4de1097b03a4b94bc81ac38f6cbe0019244724b` on accepted base `48ed0e59b289cf835a5feb23eeadbed35a335b59`.
- Candidate Quality `33506852902`, Test Build `33506852889`, Security `33506853276`: SUCCESS.
- Independent Program Control review verified two-file W04-H convergence scope only, integrated R01-R20 evidence, zero new authority/executor/durability source of truth and zero external provider/device side effect.
- Controlled merge/main `fcc26c1065961ec6ca52019195108f3562c33365`.
- Post-merge Quality `33507711472`, Test Build `33507711290`, Security `33507712325`: SUCCESS on that exact main SHA.
- Risk Gate A: PASS.
- Risk Gate B: PASS.
- Risk Gate C: `PASS_FOR_TEST_SCOPE`; p50/p95/p99 evidence is observed test-scope data, not a production SLO.
- Risk Gate D: `PASS_FOR_W04_SCOPE`; failure paths are deterministic while durable restart/recovery remains W03-owned.
- Drive evidence `W04_H_ACCEPTANCE_EVIDENCE` / `145hSgYYiwTmSFqFe_BRyH-ZTfZGIbidV1ce-nx-Afjs`.
- Issue #97 is closed with `aurora:accepted`.
- Final W04 outcome: `W04_CONTROL_CORE_VERIFIED`.

## W04 final performance evidence — test scope

Observed exact-candidate Test Build `33506852889` p50/p95/p99 overhead:

| Measurement | p50 ms | p95 ms | p99 ms |
| --- | ---: | ---: | ---: |
| Graph validation | 0.088912 | 0.181339 | 0.983061 |
| Capability plan | 0.005428 | 0.011998 | 0.298013 |
| Scheduler | 0.010015 | 0.025628 | 0.236171 |
| Template hit | 0.003815 | 0.028181 | 0.113729 |
| Budget accounting | 0.003114 | 0.024687 | 0.227498 |

These values are integration-test evidence only and do not define production SLOs.

## W04 canonical DAG — closed

`W04-00 -> (W04-A || W04-B || W04-F)`

`W04-A + W04-B -> (W04-C || W04-E || W04-G)`

`W04-C + W04-F -> W04-D`

`W04-D + W04-E + W04-G -> W04-H`

Accepted nodes: `{ W04-00, W04-A, W04-B, W04-C, W04-D, W04-E, W04-F, W04-G, W04-H }`.

W04 internal dependency-ready frontier: `{ }` — W04 is complete.

## Current program frontier

Direct machine-graph consumers of accepted W04-H:

- W05-00 / issue #98 — Coordination / Intelligence Boundaries — direct dependency `W04-H`.
- W07-00 / issue #106 — Executor Plane Coordination & Boundary Freeze — direct dependency `W04-H`.

Both are now dependency-eligible at the program graph level, but their existing PREBUILD artifacts remain non-authoritative. Before either BUILD publication begins, Program Control must revalidate current `main`, issue labels/materialization, owning-wave sources and their wave-specific coordination/ownership/dependency/acceptance/risk freeze. Their later descendants are not released by inference.

## W04 architecture boundaries retained

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

Legacy capability register remains `ACTIVE_CANONICAL_PLANNING_INPUT`: 541 files classified, 69 deduplicated capability seeds, every seed originally `SEED_ONLY_NOT_CANONICAL` and `NO_DIRECT_RUNTIME_IMPORT` by default. W04-B completed explicit adjudication of all 69 seeds into accepted/rejected/decomposed canonical registry vocabulary without direct legacy runtime import.

TOCA MCP salvage remains reference-only at audited commit `8a6cfe055be9b34e498cfbdb481e8232dc51df05`. Capability catalog/IDs/lifecycle/resolution/validation-evidence are semantic references only. TOCA Approval/Autonomy/route/business bindings cannot become parallel Aurora authority.

## Development execution fabric

Puzzle/READY_FRONTIER governance remains active. `FREE_ACTIONS_CLI` permits at most two dependency-satisfied code tasks per batch. Program Control owns coordination/acceptance/shared-surface reconciliation. PREBUILD is read-only/non-authoritative and cannot satisfy dependencies. Workers cannot self-accept or auto-merge.

## Acceptance discipline

W03+ uses separate Risk Gates A Correctness, B Safety/Authority, C Performance/Economics and D Failure/Recoverability. Release blockers independent of score remain authority bypass, cross-tenant breach, uncontrolled duplicate irreversible side effect, secret exposure and irreversible execution without valid authority.

No stale CI satisfies acceptance. Before every merge/downstream release, revalidate current main, exact candidate HEAD, official gates, PR state, Drive task/change/evidence/acceptance records and active ownership/dependency documents.