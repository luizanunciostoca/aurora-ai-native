# Aurora AI-Native — Current Program Status & Document Authority

Status: `ACTIVE_CURRENT_PROGRAM_STATE_W05_IMPLEMENTATION_FRONTIER_READY_W07_00_COMPLETE_ACCEPTED_W07_A_READY`
Audit date: 2026-09-01
Accepted implementation/governance baseline before this convergence publication: `ebcf5c3117963755962903fa45403f9155808443`

## Authority order

1. GitHub `main` is implementation/code authority.
2. Accepted PR/exact-SHA/post-merge evidence governs implementation and publication acceptance.
3. Google Drive `AURORA_AI_NATIVE_DEVELOPMENT_GOVERNANCE` is live operational governance/evidence authority.
4. Developer Manual v0.5 Audit-Consolidated, accepted ADRs and owning-wave governance define architecture/scope.
5. Risk & Architecture Validation Framework v1.0 is mandatory for W03+.
6. Historical/superseded/salvage material is provenance/reference only.

No prompt, task node, PREBUILD artifact, draft PR, agent output, green CI on a stale SHA or reference source releases a dependency by itself. Historical detail omitted from this compact current-status summary remains preserved in Git history and owning-wave acceptance/evidence records and is not superseded by omission.

## Accepted program state

- W00: `COMPLETE_ACCEPTED`.
- W01: `COMPLETE_ACCEPTED`.
- W02: `COMPLETE_ACCEPTED / REALITY_GATE_1_AUTHORITY_VERIFIED`.
- W03: `COMPLETE_ACCEPTED / REALITY_GATE_DURABLE_EVENT_DELIVERY_VERIFIED`.
- W04: `COMPLETE_ACCEPTED / W04_CONTROL_CORE_VERIFIED`.
- W05-00: `COMPLETE_ACCEPTED_MERGED / POST_MERGE_EXACT_MAIN_VERIFIED`.
- W05-A/C/D/E/F: `DEPENDENCY_READY`; implementation remains subject to exact ownership/shared-surface controls and the accepted `FREE_ACTIONS_CLI` two-code-task batch ceiling.
- W05-B: gated on accepted W05-A + W05-C + W05-D + W05-E.
- W05-G: gated on accepted W05-B + W05-F.
- W05-H: gated on accepted W05-G.
- W06: gated on accepted W05-H.
- W07-00: `COMPLETE_ACCEPTED_MERGED / POST_MERGE_EXACT_MAIN_VERIFIED`.
- W07-A: `DEPENDENCY_READY` after this convergence publication is accepted.
- W07-B/C/D/E: gated on accepted W07-A.
- W07-F/G: gated on accepted W07-B + W07-C + W07-D + W07-E.
- W07-H: gated on accepted W07-F + W07-G.
- W08-W20 remain dependency-gated except PREBUILD/readiness explicitly allowed by accepted Puzzle governance.
- W15-00 remains additionally dependent on W02-PB5, W03-F, W07-H and W14-H; W04-H alone never releases it.

## Compact accepted baseline evidence

### W02

PB5 canonical PR #73 accepted exact candidate `bd9b5d7495bd3c49ca24781c41238be7fda3dbdc`; Quality `33462240393`, Test Build `33462240427`, Security `33462240798`: SUCCESS. PB5 release main: `ad664f32949256ccc5751fe1fb88047b66c2d247`.

W02-G Reality Gate accepted candidate `ee2572d09392f6ee06014fb9d8335d2e9b6fd758`; merge `4df704ae787947d2138658cae984726470f7633d`; S01-S20 accepted with zero real external side effects.

### W03

Final outcome: `DURABLE_EVENT_DELIVERY_VERIFIED`.

W03-F / Reality Gate PR #126 accepted candidate `8108a9259823e27064ca3254785978982d382c2e`; candidate Quality `33476434872`, Test Build `33476434863`, Security `33476435285`; PostgreSQL Reality Gate `33476470808`; merge/main `76ba0db1bf399c21d08e2190915213ceb8f4eb02`; post-merge Quality `33476605969`, Test Build `33476605936`, Security `33476606422`: SUCCESS.

Canonical Drive folder: `W03_PERSISTENCE_EVENT_BACKBONE_DURABLE_WORKFLOW` / `1ZO73FVedMQM77dtfRtWF9wm54eulBkXc`.

### W04

Final outcome: `W04_CONTROL_CORE_VERIFIED`.

W04-H PR #151 accepted candidate `b4de1097b03a4b94bc81ac38f6cbe0019244724b`; candidate Quality `33506852902`, Test Build `33506852889`, Security `33506853276`; controlled merge/main `fcc26c1065961ec6ca52019195108f3562c33365`; post-merge Quality `33507711472`, Test Build `33507711290`, Security `33507712325`: SUCCESS.

Canonical Drive folder: `W04_CONTROL_CORE_CAPABILITY_PLANNING_GOAL_GRAPH` / `1Vz45N4p5zhubQvBFAf_zFinkhCFZcQdp`.

## W05-00 accepted evidence and frontier

Original draft PR #155 was superseded only because the connector ready-for-review mutation failed on an invalid GitHub GraphQL field. Canonical replacement PR #157 used the same branch and exact candidate HEAD `17f70459ec7f3d2a61e42857f286434ca2b0499c`; no semantic/content change was introduced by replacement.

Candidate exact-head gates: Quality `33514457038`, Test Build `33514457065`, Security `33514457830`, Aurora Puzzle Validation `33514457106`, Aurora Copilot Fabric Validation `33514457133`: SUCCESS.

Independent Program Control review #157 id `5079379932`: ACCEPT. Controlled merge/main: `0d1895644760be8ed74661ab72756ebf4d81340e`.

Post-merge exact-main Quality `33520579295`, Test Build `33520579206`, Security `33520580008`, Puzzle `33520579450`, Copilot Fabric `33520579396`, Copilot Orchestrator `33520579339`: SUCCESS.

Status/evidence convergence PR #158 accepted candidate `f2873e83066c050da87aebbb7c23437f4473d6dd`; review id `5079474478`; merge/main `37ead27f549b51b2b5322b0f45e72f5a95cc2584`; post-merge Quality `33521448642`, Test Build `33521448356`, Security `33521449205`: SUCCESS.

Drive acceptance evidence: `W05_00_ACCEPTANCE_EVIDENCE_2026-09-01` / `156ni-zWA_ko21_SWFM0KJtYpOaWP-N9TV4am5kPZHzM`.
Drive readiness-only PREBUILD: `W05_PARALLEL_READINESS_PREBUILD_2026-09-01` / `1FMkKuEKixC1SXZCylnUOUIqWEYIyNP2EHSn-Om4x8tE`.

Accepted W05 DAG:

`W05-00 -> (W05-A || W05-C || W05-D || W05-E || W05-F)`

`W05-A + W05-C + W05-D + W05-E -> W05-B`

`W05-B + W05-F -> W05-G -> W05-H`

Logical implementation frontier is `{ W05-A, W05-C, W05-D, W05-E, W05-F }`, but `FREE_ACTIONS_CLI` limits each execution batch to at most two dependency-satisfied code tasks.

Shared-surface controls:

- `packages/intelligence/**` publication/bootstrap surfaces are Program Control-owned and must be reconciled once rather than independently by multiple leaves.
- W05-A owns classifier leaf semantics.
- W05-C owns ReasoningLevel L0-L5 and consumes W04 ExecutionBudget rather than redefining it.
- W05-D owns decomposed confidence/uncertainty/abstention; confidence is never authority.
- W05-E owns intelligence Strategy Registry and must remain separate from W04 Capability Registry.
- W05-F owns bounded generic worker/agent semantics and must compose W03 lease/heartbeat/expiry/reclaim durability rather than create a second durability truth.
- Root manifests/barrels/workspace config/lockfiles/CI/CODEOWNERS/cross-package public exports remain Program Control shared surfaces.

## W07-00 accepted evidence and frontier

Original draft PR #156 exact candidate HEAD `ee11c003ab13b8bdea5ea449634a0c18250cbc56` had Quality `33514731437`, Test Build `33514731718`, Security `33514732318`, Puzzle `33514731330`, Copilot Fabric `33514731317`: SUCCESS, but became stale when accepted main advanced through W05. It was closed without merge and retained as provenance only.

Canonical current-main replacement PR #159 preserved the seven substantive reviewed W07-00 governance blobs byte-for-byte and added `W07_00_CURRENT_MAIN_RECONCILIATION.md` to audit base drift. Replacement base: `37ead27f549b51b2b5322b0f45e72f5a95cc2584`; exact candidate HEAD: `da5a0f31d0f914842c60a25fbdf5520250fa7e03`.

Fresh exact-head candidate gates on #159: Quality `33521702070`, Test Build `33521702157`, Security `33521703028`, Aurora Puzzle Validation `33521702106`, Aurora Copilot Fabric Validation `33521702131`: SUCCESS.

Independent Program Control review #159 id `5079527834`: ACCEPT. Controlled merge/main: `ebcf5c3117963755962903fa45403f9155808443`.

Post-merge exact-main gates on `ebcf5c3117963755962903fa45403f9155808443`: Quality `33521973917`, Test Build `33521973597`, Security `33521974872`, Puzzle `33521973567`, Copilot Fabric `33521973675`, Copilot Orchestrator `33521973533`: SUCCESS. Observed `security-gate` and `materialize-puzzle-frontier` checks also succeeded.

Drive acceptance evidence: `W07_00_ACCEPTANCE_EVIDENCE_2026-09-01` / `1vJtJ0BpqH6B1xSodCVZ1MyGvYNiqJYShIs8UMi8d2Xs`.
Drive W07-A readiness-only PREBUILD: `W07_A_CONTRACT_READINESS_PREBUILD_2026-09-01` / `15dKLolojLmeT7JhIyR8nc_gvyPv77ay38ljUp9hAO2g`.

Final W07-00 outcome: `COMPLETE_ACCEPTED / POST_MERGE_EXACT_MAIN_VERIFIED`.

Accepted W07 DAG:

`W07-00 -> W07-A -> (W07-B || W07-C || W07-D || W07-E)`

`W07-B + W07-C + W07-D + W07-E -> (W07-F || W07-G)`

`W07-F + W07-G -> W07-H`

After acceptance of this status-convergence publication, W07-A is the only W07 BUILD-ready descendant.

W07-A contract compatibility requirements remain:

- evolve the same canonical ActionIntent/Receipt/Evidence family; no parallel truth;
- introduce target-neutral compatibility for PROVIDER, DEVICE, WORKFLOW and LOCAL_SERVICE;
- preserve existing provider fixtures/version migration explicitly;
- never fabricate provider identity for DEVICE/WORKFLOW/LOCAL_SERVICE;
- target identity/availability is not authority;
- no W14 DeviceId/DeviceRef ownership is pulled into W07-A;
- no provider/device/workflow runtime is implemented in W07-A.

## Architecture boundaries retained

W03 owns durable event/outbox/inbox/replay/DLQ/timers/leases/workflow truth.

W04 owns Objective/Goal/Task lifecycle, target-neutral Capability Registry/CapabilityPlan, logical GoalGraph, bounded planner scheduler, Fast/Governed lane planning, ExecutionBudget and curated PlanTemplate/PlanBinding foundations.

W05 owns intelligence classification, reasoning levels, confidence, strategy/routing and bounded agent-worker semantics only. W05 does not own authority, execution, context runtime, provider/device runtime, production adaptive promotion or a second control/durability/capability source of truth.

W06 owns context runtime.

W07 owns generic deterministic execution safety, current authority validation integration, generic target resolution, readback/reconciliation and failure containment. W07 does not own concrete provider/device/workflow runtimes.

W08 owns provider adapters/credentials/provider-specific transport. W09 owns workflow fabric/bindings. W14 owns DeviceId/DeviceRef, registration, session/trust/attestation/realtime gateway. W15 owns Android/native capability bridge, app integration, permission broker and Device Executor implementation. W17 owns production telemetry/SLO/DR. W18 owns adaptive learning/promotion governance. W19 owns final security hardening.

Core invariants:

- Intelligence != Authority != Execution.
- Capability != Authority.
- Plan/Lane/Budget/Template/Strategy/Confidence != Authority.
- Fast Lane may optimize strategy but cannot bypass current Policy/Authority/Executor validation.
- Target availability, model confidence, worker ownership or route selection cannot mint execution permission.
- DEVICE capability binding may be target-neutral before W14/W15 but cannot contain Android business logic, DeviceId/session/trust or execution semantics.
- Receipt/acknowledgement is not verified external state.
- `EXECUTION_UNCERTAIN` requires reconcile-before-retry semantics.

## Legacy / TOCA input status

Legacy capability register remains `ACTIVE_CANONICAL_PLANNING_INPUT` for accepted W04 adjudication provenance. W04-B completed explicit adjudication of all 69 deduplicated capability seeds without direct legacy runtime import.

TOCA MCP salvage remains reference-only at audited commit `8a6cfe055be9b34e498cfbdb481e8232dc51df05`. Capability catalog/IDs/lifecycle/resolution/validation-evidence are semantic references only. TOCA Approval/Autonomy/route/business bindings cannot become parallel Aurora authority.

## Development execution fabric

Puzzle/READY_FRONTIER governance remains active. `FREE_ACTIONS_CLI` permits at most two dependency-satisfied code tasks per batch. Program Control owns coordination/acceptance/shared-surface reconciliation. PREBUILD is read-only/non-authoritative and cannot satisfy dependencies. Workers cannot self-accept or auto-merge.

For maximum safe throughput, keep independent BUILD leaves isolated, use the two-task batch ceiling, and reconcile shared/publication surfaces once per convergence boundary rather than allowing workers to race on manifests/barrels/root configuration.

## Acceptance discipline

W03+ uses separate Risk Gates A Correctness, B Safety/Authority, C Performance/Economics and D Failure/Recoverability. Release blockers independent of score remain authority bypass, cross-tenant breach, uncontrolled duplicate irreversible side effect, secret exposure and irreversible execution without valid authority.

No stale CI satisfies acceptance. Before every merge or downstream release, revalidate current `main`, exact candidate HEAD, official gates, PR state, Drive task/change/evidence/acceptance records and active ownership/dependency documents.
