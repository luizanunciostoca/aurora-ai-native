# Aurora AI-Native — Current Program Status & Document Authority

Status: `ACTIVE_CURRENT_PROGRAM_STATE_W05_00_COMPLETE_ACCEPTED_W05_IMPLEMENTATION_FRONTIER_READY_W07_00_RECONCILIATION_REQUIRED`
Audit date: 2026-09-01
Current accepted implementation/governance baseline before this status-convergence publication: `0d1895644760be8ed74661ab72756ebf4d81340e`

## Authority order

1. GitHub `main` is implementation/code authority.
2. Accepted PR/exact-SHA evidence governs implementation and publication acceptance.
3. Google Drive `AURORA_AI_NATIVE_DEVELOPMENT_GOVERNANCE` is live operational governance/evidence authority.
4. Developer Manual v0.5 Audit-Consolidated, accepted ADRs and owning-wave governance define architecture/scope.
5. Risk & Architecture Validation Framework v1.0 is mandatory for W03+.
6. Historical/superseded/salvage material is provenance/reference only.

No prompt, task node, PREBUILD artifact, draft PR, agent output or reference source can release a dependency by itself. Historical detail omitted from this current-status summary remains preserved in Git history and owning-wave acceptance/evidence records; omission from this summary does not supersede accepted evidence.

## Accepted program state

- W00: `COMPLETE_ACCEPTED`.
- W01: `COMPLETE_ACCEPTED`.
- W02: `COMPLETE_ACCEPTED / REALITY_GATE_1_AUTHORITY_VERIFIED`.
- W02-00/A/B/C/D/E/F/G: `COMPLETE_ACCEPTED_MERGED`.
- PB1-PB5: `COMPLETE_RELEASED / ACCEPTED` as applicable.
- W03: `COMPLETE_ACCEPTED / REALITY_GATE_DURABLE_EVENT_DELIVERY_VERIFIED`.
- W03-00/A/B/C/D/E/F: accepted according to canonical exact-SHA/Drive evidence.
- W04: `COMPLETE_ACCEPTED / W04_CONTROL_CORE_VERIFIED`.
- W04-00/A/B/C/D/E/F/G/H: `COMPLETE_ACCEPTED_MERGED` according to canonical exact-SHA, post-merge and Drive evidence.
- W05-00: `COMPLETE_ACCEPTED_MERGED / POST_MERGE_EXACT_MAIN_VERIFIED`.
- W05-A/C/D/E/F: `DEPENDENCY_READY` after this status-convergence publication is accepted; implementation remains subject to ownership/shared-surface controls and `FREE_ACTIONS_CLI` batch limits.
- W05-B: gated on accepted W05-A + W05-C + W05-D + W05-E.
- W05-G: gated on accepted W05-B + W05-F.
- W05-H: gated on accepted W05-G.
- W06: gated on accepted W05-H.
- W07-00: `DEPENDENCY_READY_BUT_CANDIDATE_RECONCILIATION_REQUIRED`; the previously reviewed candidate was based on pre-W05 main and must be regenerated/revalidated on current main before merge.
- W07 descendants and W08-W20 remain dependency-gated except PREBUILD/readiness explicitly allowed by accepted Puzzle governance.
- W15-00 is not released by W04-H alone; it remains additionally dependent on W02-PB5, W03-F, W07-H and W14-H.

## Compact accepted baseline evidence

### W02

PB5 canonical PR #73 merged after exact HEAD `bd9b5d7495bd3c49ca24781c41238be7fda3dbdc` passed Quality `33462240393`, Test Build `33462240427` and Security `33462240798`. PB5 release main is `ad664f32949256ccc5751fe1fb88047b66c2d247`; exact-main gates succeeded.

W02-G Reality Gate accepted candidate `ee2572d09392f6ee06014fb9d8335d2e9b6fd758`; merge `4df704ae787947d2138658cae984726470f7633d`; S01-S20 accepted with zero real external side effects.

### W03

Final outcome: `DURABLE_EVENT_DELIVERY_VERIFIED`.

W03-F / Reality Gate PR #126 accepted candidate `8108a9259823e27064ca3254785978982d382c2e`; candidate Quality `33476434872`, Test Build `33476434863`, Security `33476435285`; PostgreSQL Reality Gate `33476470808`; merge/main `76ba0db1bf399c21d08e2190915213ceb8f4eb02`; post-merge Quality `33476605969`, Test Build `33476605936`, Security `33476606422`: SUCCESS.

Canonical Drive folder: `W03_PERSISTENCE_EVENT_BACKBONE_DURABLE_WORKFLOW` / `1ZO73FVedMQM77dtfRtWF9wm54eulBkXc`.

### W04

Final outcome: `W04_CONTROL_CORE_VERIFIED`.

W04-H PR #151 accepted candidate `b4de1097b03a4b94bc81ac38f6cbe0019244724b`; candidate Quality `33506852902`, Test Build `33506852889`, Security `33506853276`; controlled merge/main `fcc26c1065961ec6ca52019195108f3562c33365`; post-merge Quality `33507711472`, Test Build `33507711290`, Security `33507712325`: SUCCESS.

Risk Gate A: PASS. Risk Gate B: PASS. Risk Gate C: `PASS_FOR_TEST_SCOPE`. Risk Gate D: `PASS_FOR_W04_SCOPE`.

Canonical Drive folder: `W04_CONTROL_CORE_CAPABILITY_PLANNING_GOAL_GRAPH` / `1Vz45N4p5zhubQvBFAf_zFinkhCFZcQdp`. Detailed W04 node evidence remains canonical in `docs/governance/w04/**`, issues #90-#97, Git history and Drive acceptance records.

## W05-00 accepted evidence

Wave node: W05-00 — Coordination / Intelligence Boundaries.

- Original draft PR #155 was closed without merge after the ready-for-review connector mutation failed on an invalid GitHub GraphQL field. This was an operational connector defect, not a candidate defect.
- Replacement PR #157 used the same branch `wave/05-00-intelligence-boundary-freeze`, same exact candidate HEAD `17f70459ec7f3d2a61e42857f286434ca2b0499c`, and same accepted base at review `b502bfa7e97291086c09cc85cd71040f96d3b036`; replacement introduced no content change.
- Exact candidate gates: Quality `33514457038`, Test Build `33514457065`, Security `33514457830`, Aurora Puzzle Validation `33514457106`, Aurora Copilot Fabric Validation `33514457133`: SUCCESS.
- Independent Program Control review on replacement #157: review id `5079379932`, anchored to exact candidate HEAD, decision `ACCEPT` for controlled merge.
- Controlled merge/main: `0d1895644760be8ed74661ab72756ebf4d81340e`, with expected candidate head enforced.
- Post-merge exact-main Quality `33520579295`: SUCCESS.
- Post-merge exact-main Test Build `33520579206`: SUCCESS.
- Post-merge exact-main Security `33520580008`: SUCCESS.
- Post-merge exact-main Aurora Puzzle Validation `33520579450`: SUCCESS.
- Post-merge exact-main Aurora Copilot Fabric Validation `33520579396`: SUCCESS.
- Post-merge exact-main Aurora Copilot Task Orchestrator `33520579339`: SUCCESS.
- Additional observed exact-main security-gate, secret-scan, dependency-scan / osv-scan and materialize-puzzle-frontier checks: SUCCESS.
- Drive acceptance evidence: `W05_00_ACCEPTANCE_EVIDENCE_2026-09-01` / `156ni-zWA_ko21_SWFM0KJtYpOaWP-N9TV4am5kPZHzM`.
- Drive readiness artifact: `W05_PARALLEL_READINESS_PREBUILD_2026-09-01` / `1FMkKuEKixC1SXZCylnUOUIqWEYIyNP2EHSn-Om4x8tE`; readiness only, never authority.

Final W05-00 outcome: `COMPLETE_ACCEPTED / POST_MERGE_EXACT_MAIN_VERIFIED`.

## W05 canonical DAG and released frontier

Accepted coordination DAG:

`W05-00 -> (W05-A || W05-C || W05-D || W05-E || W05-F)`

`W05-A + W05-C + W05-D + W05-E -> W05-B`

`W05-B + W05-F -> W05-G`

`W05-G -> W05-H`

After acceptance of this status-convergence publication, dependency-ready implementation nodes are `{ W05-A, W05-C, W05-D, W05-E, W05-F }`.

Program execution governance still caps `FREE_ACTIONS_CLI` at at most two dependency-satisfied code tasks per batch. Therefore the implementation frontier is logically five-way parallel but operational publication must be batched in at most two code tasks at a time unless that governance is separately changed and accepted.

### Shared-surface coordination before/while building

- `packages/intelligence/**` does not exist in the accepted pre-W05 implementation baseline. Package skeleton, package manifest, tsconfig, root/public barrels/export maps and workspace/lockfile changes are Program Control shared surfaces and must be created/reconciled once, not independently by leaf workers.
- W05-A owns classifier leaf semantics.
- W05-C owns ReasoningLevel L0-L5 leaf semantics and consumes W04 ExecutionBudget rather than redefining it.
- W05-D owns decomposed confidence/uncertainty/abstention semantics; confidence never becomes authority.
- W05-E owns intelligence Strategy Registry semantics and must remain distinct from W04 Capability Registry.
- W05-F owns bounded generic worker/agent runtime semantics and must compose W03 durable lease/heartbeat/expiry/reclaim primitives rather than create a second durability truth.
- Root manifests, root barrels, workspace config, lockfiles, CI, CODEOWNERS, cross-package public exports and `CURRENT_PROGRAM_STATUS.md` remain Program Control shared surfaces.

## W07-00 reconciliation state

W07-00 issue #106 remains dependency-eligible from accepted W04-H, but its first candidate PR #156 was created/reviewed against main `b502bfa7e97291086c09cc85cd71040f96d3b036`. W05-00 is now merged and current main has advanced, so #156 is stale as a merge candidate even though its exact candidate gates were green.

Stale candidate #156 exact HEAD: `ee11c003ab13b8bdea5ea449634a0c18250cbc56`.
Candidate gates on that exact stale-base HEAD: Quality `33514731437`, Test Build `33514731718`, Security `33514732318`, Aurora Puzzle Validation `33514731330`, Aurora Copilot Fabric Validation `33514731317`: SUCCESS.

Required next W07 action: preserve the reviewed seven-file governance content, recreate/reconcile it onto the latest accepted main after this status-convergence publication, open a non-draft canonical replacement, rerun exact-head gates, independently review, controlled-merge, run post-merge exact-main verification and converge Drive/GitHub before W07-A BUILD release.

W07-A PREBUILD contract-readiness artifact exists in Drive as `W07_A_CONTRACT_READINESS_PREBUILD_2026-09-01` / `15dKLolojLmeT7JhIyR8nc_gvyPv77ay38ljUp9hAO2g`; it remains non-authoritative.

## Architecture boundaries retained

W03 owns durable event/outbox/inbox/replay/DLQ/timers/leases/workflow truth.

W04 owns Objective/Goal/Task lifecycle, target-neutral Capability Registry/CapabilityPlan, logical GoalGraph, bounded planner scheduler, Fast/Governed lane planning, ExecutionBudget and curated PlanTemplate/PlanBinding foundations.

W05 owns intelligence classification, reasoning levels, confidence, strategy/routing and bounded agent-worker semantics only. W05 does **not** own authority, execution, context runtime, provider/device runtime, production adaptive promotion or a second control/durability/capability source of truth.

W06 owns context runtime.

W07 owns generic deterministic execution safety, current authority validation integration, generic target resolution, readback/reconciliation and failure containment; it does not own concrete provider/device/workflow runtimes.

W08 owns provider adapters/credentials/provider-specific transport.
W09 owns workflow fabric/bindings.
W14 owns DeviceId/DeviceRef, registration, session/trust/attestation/realtime gateway.
W15 owns Android/native capability bridge, app integration, permission broker and Device Executor implementation.
W17 owns production telemetry/SLO/DR.
W18 owns adaptive learning/promotion governance.
W19 owns final security hardening.

Core invariants:

- Intelligence != Authority != Execution.
- Capability != Authority.
- Plan/Lane/Budget/Template/Strategy/Confidence != Authority.
- Fast Lane may optimize strategy but cannot bypass current Policy/Authority/Executor validation.
- No target availability, model confidence, worker ownership or route selection can mint execution permission.
- DEVICE capability binding may be target-neutral before W14/W15 but cannot contain Android business logic, DeviceId/session/trust or execution semantics.

## Legacy / TOCA input status

Legacy capability register remains `ACTIVE_CANONICAL_PLANNING_INPUT` for accepted W04 adjudication provenance. W04-B completed explicit adjudication of all 69 deduplicated capability seeds without direct legacy runtime import.

TOCA MCP salvage remains reference-only at audited commit `8a6cfe055be9b34e498cfbdb481e8232dc51df05`. Capability catalog/IDs/lifecycle/resolution/validation-evidence are semantic references only. TOCA Approval/Autonomy/route/business bindings cannot become parallel Aurora authority.

## Development execution fabric

Puzzle/READY_FRONTIER governance remains active. `FREE_ACTIONS_CLI` permits at most two dependency-satisfied code tasks per batch. Program Control owns coordination/acceptance/shared-surface reconciliation. PREBUILD is read-only/non-authoritative and cannot satisfy dependencies. Workers cannot self-accept or auto-merge.

For maximum safe throughput, Program Control should keep independent BUILD leaves isolated, use the two-task batch ceiling, and reconcile shared/publication surfaces once per convergence boundary rather than allowing workers to race on manifests/barrels/root configuration.

## Acceptance discipline

W03+ uses separate Risk Gates A Correctness, B Safety/Authority, C Performance/Economics and D Failure/Recoverability. Release blockers independent of score remain authority bypass, cross-tenant breach, uncontrolled duplicate irreversible side effect, secret exposure and irreversible execution without valid authority.

No stale CI satisfies acceptance. Before every merge/downstream release, revalidate current main, exact candidate HEAD, official gates, PR state, Drive task/change/evidence/acceptance records and active ownership/dependency documents.
