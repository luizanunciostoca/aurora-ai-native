# Aurora AI-Native — Current Program Status & Document Authority

Status: `ACTIVE_CURRENT_PROGRAM_STATE_W05_IMPLEMENTATION_FRONTIER_READY_W07_00_COMPLETE_ACCEPTED_W07_A_RELEASE_PENDING_STATUS_CONVERGENCE`
Audit date: 2026-09-01
Current accepted implementation/governance baseline before this status-convergence publication: `ebcf5c3117963755962903fa45403f9155808443`

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
- W05-A/C/D/E/F: `DEPENDENCY_READY`; implementation remains subject to shared-surface ownership and `FREE_ACTIONS_CLI` batch limits.
- W05-B: gated on accepted W05-A + W05-C + W05-D + W05-E.
- W05-G: gated on accepted W05-B + W05-F.
- W05-H: gated on accepted W05-G.
- W06: gated on accepted W05-H.
- W07-00: `COMPLETE_ACCEPTED_MERGED / POST_MERGE_EXACT_MAIN_VERIFIED` on accepted main `ebcf5c3117963755962903fa45403f9155808443`.
- W07-A: becomes `DEPENDENCY_READY` only after this status-convergence publication is independently accepted, merged and post-merge verified.
- W07-B/C/D/E: gated on accepted W07-A.
- W07-F/G: gated on accepted W07-B + W07-C + W07-D + W07-E.
- W07-H: gated on accepted W07-F + W07-G.
- W08-W20 remain dependency-gated except PREBUILD/readiness explicitly allowed by accepted Puzzle governance.
- W15-00 is not released by W04-H or W07-00 alone; it remains additionally dependent on W02-PB5, W03-F, W07-H and W14-H.

## Compact accepted baseline evidence

### W02

PB5 canonical PR #73 merged after exact HEAD `bd9b5d7495bd3c49ca24781c41238be7fda3dbdc` passed Quality `33462240393`, Test Build `33462240427` and Security `33462240798`. PB5 release main is `ad664f32949256ccc5751fe1fb88047b66c2d247`; exact-main gates succeeded.

W02-G Reality Gate accepted candidate `ee2572d09392f6ee06014fb9d8335d2e9b6fd758`; merge `4df704ae787947d2138658cae984726470f7633d`; S01-S20 accepted with zero real external side effects.

### W03

Final outcome: `DURABLE_EVENT_DELIVERY_VERIFIED`.

W03-F / Reality Gate PR #126 accepted candidate `8108a9259823e27064ca3254785978982d382c2e`; candidate Quality `33476434872`, Test Build `33476434863`, Security `33476435285`; PostgreSQL Reality Gate `33476470808`; merge/main `76ba0db1bf399c21d08e2190915213ceb8f4eb02`; post-merge Quality `33476605969`, Test Build `33476605936`, Security `33476606422`: SUCCESS.

Canonical Drive folder: `W03_PERSISTENCE_EVENT_BACKBONE_DURABLE_WORKFLOW` / `1ZO73FVedMQM77dtfRtWF9wm54eulBkXc`.

Stale W03-D fallback PR #120 is explicitly `SUPERSEDED / CLOSED_WITHOUT_MERGE`; canonical W03-D was accepted through PR #123. No current dependency or authority may derive from #120.

### W04

Final outcome: `W04_CONTROL_CORE_VERIFIED`.

W04-H PR #151 accepted candidate `b4de1097b03a4b94bc81ac38f6cbe0019244724b`; candidate Quality `33506852902`, Test Build `33506852889`, Security `33506853276`; controlled merge/main `fcc26c1065961ec6ca52019195108f3562c33365`; post-merge Quality `33507711472`, Test Build `33507711290`, Security `33507712325`: SUCCESS.

Risk Gate A: PASS. Risk Gate B: PASS. Risk Gate C: `PASS_FOR_TEST_SCOPE`. Risk Gate D: `PASS_FOR_W04_SCOPE`.

Canonical Drive folder: `W04_CONTROL_CORE_CAPABILITY_PLANNING_GOAL_GRAPH` / `1Vz45N4p5zhubQvBFAf_zFinkhCFZcQdp`.

## W05-00 accepted evidence

Wave node: W05-00 — Coordination / Intelligence Boundaries.

- Original draft PR #155 was closed without merge after the ready-for-review connector mutation failed; this was an operational connector defect, not a candidate defect.
- Canonical replacement PR #157 retained the same exact candidate HEAD `17f70459ec7f3d2a61e42857f286434ca2b0499c` with no content drift.
- Exact candidate gates: Quality `33514457038`, Test Build `33514457065`, Security `33514457830`, Aurora Puzzle Validation `33514457106`, Aurora Copilot Fabric Validation `33514457133`: SUCCESS.
- Independent Program Control review on #157: review id `5079379932`, exact-head decision `ACCEPT`.
- Controlled merge/main: `0d1895644760be8ed74661ab72756ebf4d81340e`.
- Post-merge exact-main Quality `33520579295`, Test Build `33520579206`, Security `33520580008`, Aurora Puzzle Validation `33520579450`, Aurora Copilot Fabric Validation `33520579396`, Aurora Copilot Task Orchestrator `33520579339`: SUCCESS.
- Drive acceptance evidence: `W05_00_ACCEPTANCE_EVIDENCE_2026-09-01` / `156ni-zWA_ko21_SWFM0KJtYpOaWP-N9TV4am5kPZHzM`.
- Drive readiness artifact: `W05_PARALLEL_READINESS_PREBUILD_2026-09-01` / `1FMkKuEKixC1SXZCylnUOUIqWEYIyNP2EHSn-Om4x8tE`; readiness only, never authority.

Final W05-00 outcome: `COMPLETE_ACCEPTED / POST_MERGE_EXACT_MAIN_VERIFIED`.

## W05 canonical DAG and released frontier

Accepted coordination DAG:

`W05-00 -> (W05-A || W05-C || W05-D || W05-E || W05-F)`

`W05-A + W05-C + W05-D + W05-E -> W05-B`

`W05-B + W05-F -> W05-G`

`W05-G -> W05-H`

Dependency-ready implementation nodes are `{ W05-A, W05-C, W05-D, W05-E, W05-F }`.

Program execution governance caps `FREE_ACTIONS_CLI` at at most two dependency-satisfied code tasks per batch. The implementation frontier is logically five-way parallel but operational BUILD publication remains limited to two code tasks at a time unless that governance is separately changed and accepted.

### W05 shared-surface coordination

- `packages/intelligence/**` did not exist in the accepted pre-W05 implementation baseline. Package skeleton, manifest, tsconfig, root/public barrels/export maps and workspace/lockfile changes are Program Control shared surfaces and must be created/reconciled once, not independently by leaf workers.
- W05-A owns classifier leaf semantics.
- W05-C owns ReasoningLevel L0-L5 leaf semantics and consumes W04 ExecutionBudget rather than redefining it.
- W05-D owns decomposed confidence/uncertainty/abstention semantics; confidence never becomes authority.
- W05-E owns intelligence Strategy Registry semantics and must remain distinct from W04 Capability Registry.
- W05-F owns bounded generic worker/agent runtime semantics and must compose W03 durable lease/heartbeat/expiry/reclaim primitives rather than create a second durability truth.
- Root manifests, root barrels, workspace config, lockfiles, CI, CODEOWNERS, cross-package public exports and `CURRENT_PROGRAM_STATUS.md` remain Program Control shared surfaces.

## W07-00 accepted evidence and released successor boundary

Wave node: W07-00 — Executor Boundary / Ownership / Compatibility / Risk Freeze.

### Superseded candidate

Original draft PR #156 was based on pre-W05 main `b502bfa7e97291086c09cc85cd71040f96d3b036`, exact HEAD `ee11c003ab13b8bdea5ea449634a0c18250cbc56`. Its exact-head gates were green, but accepted main advanced through W05-00 and W05 status convergence. #156 was therefore closed without merge and retained as provenance only.

### Canonical current-main replacement

- Canonical PR: #159 — `docs(W07-00): reconcile executor boundary freeze on current main`.
- Replacement base at creation: `37ead27f549b51b2b5322b0f45e72f5a95cc2584`.
- Exact candidate HEAD: `da5a0f31d0f914842c60a25fbdf5520250fa7e03`.
- Seven substantive W07-00 governance blobs were recreated byte-for-byte from the reviewed stale-base candidate; `W07_00_CURRENT_MAIN_RECONCILIATION.md` explicitly audited intervening accepted-main drift.
- Independent Program Control review on #159: review id `5079527834`, exact-head decision `ACCEPT` for controlled merge.
- Exact candidate Quality `33521702070`, Test Build `33521702157`, Security `33521703028`, Aurora Puzzle Validation `33521702106`, Aurora Copilot Fabric Validation `33521702131`: SUCCESS.
- Controlled merge/resulting exact main: `ebcf5c3117963755962903fa45403f9155808443`.
- Merge parents: `37ead27f549b51b2b5322b0f45e72f5a95cc2584` and `da5a0f31d0f914842c60a25fbdf5520250fa7e03`.
- Post-merge exact-main Quality `33521973917`, Test Build `33521973597`, Security `33521974872`, Aurora Puzzle Validation `33521973567`, Aurora Copilot Fabric Validation `33521973675`, Aurora Copilot Task Orchestrator `33521973533`: SUCCESS.
- Drive acceptance evidence: `W07_00_ACCEPTANCE_EVIDENCE_2026-09-01` / `1vJtJ0BpqH6B1xSodCVZ1MyGvYNiqJYShIs8UMi8d2Xs`.
- W07-A readiness-only PREBUILD: `W07_A_CONTRACT_READINESS_PREBUILD_2026-09-01` / `15dKLolojLmeT7JhIyR8nc_gvyPv77ay38ljUp9hAO2g`; non-authoritative.

Final W07-00 outcome: `COMPLETE_ACCEPTED / POST_MERGE_EXACT_MAIN_VERIFIED`.

### Accepted W07 architecture freeze

- W07 owns the generic deterministic executor safety boundary.
- Current applicable W02 authority/policy validation remains mandatory where required.
- Target resolution, target availability, provider/device/workflow identity, model output or router output never grants authority.
- W03 remains durability/idempotency/replay source of truth; W07 composes it and cannot create a second idempotency truth.
- W04 remains capability/control/lane/budget source of truth; planning metadata is not execution authority.
- W05 remains intelligence-only and cannot bypass W07.
- ActionIntent/Receipt/Evidence remain one canonical evolving family. W07-A must migrate provider-centric compatibility debt without creating a parallel truth.
- Supported generic target kinds frozen for compatibility work are PROVIDER, DEVICE, WORKFLOW and LOCAL_SERVICE.
- Legacy PROVIDER compatibility may be preserved, but DEVICE/WORKFLOW/LOCAL_SERVICE cannot use fabricated provider identity.
- Acknowledgement is not verified external state.
- `EXECUTION_UNCERTAIN` is distinct from ordinary failure and requires reconcile-before-retry semantics.
- Circuit breaker and kill switch are non-bypassable safety state.
- Receipt/Evidence must not contain provider credentials/secrets.
- W08 owns concrete provider adapters/credentials/transport; W09 workflow runtime; W14 DeviceId/DeviceRef/session/trust/gateway; W15 Android/native capability bridge and Device Executor.

Risk Gate A: `PASS_FOR_COORDINATION_SCOPE`.
Risk Gate B: `PASS_FOR_COORDINATION_SCOPE`.
Risk Gate C: `PASS_FOR_PLAN_SCOPE_ONLY`; runtime performance evidence remains descendant/W07-H owned.
Risk Gate D: `PASS_FOR_PLAN_SCOPE_ONLY`; runtime fault/recovery proof remains descendant-owned.

### W07 successor DAG

After acceptance/merge/post-merge verification of this status-convergence publication:

`W07-00 -> W07-A`

`W07-A -> (W07-B || W07-C || W07-D || W07-E)`

`W07-B + W07-C + W07-D + W07-E -> (W07-F || W07-G)`

`W07-F + W07-G -> W07-H`

W07-A is the only immediately releasable W07 BUILD descendant. Its first obligation is compatibility-safe evolution of generic ExecutionTarget plus ActionIntent/Receipt/Evidence, preserving existing provider compatibility without fake provider identities and without moving provider/device/workflow concrete runtimes into W07.

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
