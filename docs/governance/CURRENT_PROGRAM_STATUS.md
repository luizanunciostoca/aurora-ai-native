# Aurora AI-Native — Current Program Status & Document Authority

Status: `ACTIVE_CURRENT_PROGRAM_STATE_W05_A_E_ACCEPTED_W05_C_D_F_READY_W07_A_D_ACCEPTED_W07_B_C_E_READY`
Audit date: 2026-09-01
Accepted implementation baseline before this status publication: `5318fec80a4e61541cea3690d075d515e5514373`

## Authority order

1. GitHub `main` is implementation/code authority.
2. Accepted PR/exact-SHA/post-merge evidence governs implementation and publication acceptance.
3. Google Drive `AURORA_AI_NATIVE_DEVELOPMENT_GOVERNANCE` is live operational governance/evidence authority.
4. Developer Manual v0.5 Audit-Consolidated, accepted ADRs and owning-wave governance define architecture/scope.
5. Risk & Architecture Validation Framework v1.0 is mandatory for W03+.
6. Historical/superseded/salvage material is provenance/reference only.

No prompt, task node, PREBUILD artifact, draft PR, agent output, green CI on a stale SHA or reference source releases a dependency by itself. Historical detail intentionally omitted from this compact current-state file remains preserved in Git history and accepted wave evidence.

## Accepted program state

- W00: `COMPLETE_ACCEPTED`.
- W01: `COMPLETE_ACCEPTED`.
- W02: `COMPLETE_ACCEPTED / REALITY_GATE_1_AUTHORITY_VERIFIED`.
- W03: `COMPLETE_ACCEPTED / REALITY_GATE_DURABLE_EVENT_DELIVERY_VERIFIED`.
- W04: `COMPLETE_ACCEPTED / W04_CONTROL_CORE_VERIFIED`.
- W05-00: `COMPLETE_ACCEPTED_MERGED / POST_MERGE_EXACT_MAIN_VERIFIED`.
- W05-A: `COMPLETE_ACCEPTED_MERGED / POST_MERGE_EXACT_MAIN_VERIFIED`.
- W05-E: `COMPLETE_ACCEPTED_MERGED / POST_MERGE_EXACT_MAIN_VERIFIED`.
- W05-C/D/F: `DEPENDENCY_READY`; implementation remains subject to exact ownership/shared-surface controls and the `FREE_ACTIONS_CLI` two-code-task batch ceiling.
- W05-B: gated on accepted W05-C + W05-D; W05-A and W05-E are already accepted.
- W05-G: gated on accepted W05-B + W05-F.
- W05-H: gated on accepted W05-G.
- W06: gated on accepted W05-H.
- W07-00: `COMPLETE_ACCEPTED_MERGED / POST_MERGE_EXACT_MAIN_VERIFIED`.
- W07-A: `COMPLETE_ACCEPTED_MERGED / POST_MERGE_EXACT_MAIN_VERIFIED`.
- W07-D: `COMPLETE_ACCEPTED_MERGED / POST_MERGE_EXACT_MAIN_VERIFIED`.
- W07-B/C/E: `DEPENDENCY_READY`; implementation remains subject to exact ownership/shared-surface controls and the same two-code-task batch ceiling.
- W07-F/G: gated on accepted W07-B + W07-C + W07-E; W07-D is already accepted.
- W07-H: gated on accepted W07-F + W07-G.
- W08-W20 remain dependency-gated except PREBUILD/readiness explicitly allowed by accepted Puzzle governance.
- W15-00 remains additionally dependent on W02-PB5, W03-F, W07-H and W14-H.

## Compact accepted baseline evidence

### W02

Final outcome: `REALITY_GATE_1_AUTHORITY_VERIFIED`.

PB5 release main: `ad664f32949256ccc5751fe1fb88047b66c2d247`. W02-G accepted merge: `4df704ae787947d2138658cae984726470f7633d`; Reality Gate S01-S20 accepted with zero real external side effects.

### W03

Final outcome: `DURABLE_EVENT_DELIVERY_VERIFIED`.

W03-F accepted candidate `8108a9259823e27064ca3254785978982d382c2e`; merge/main `76ba0db1bf399c21d08e2190915213ceb8f4eb02`; post-merge Quality `33476605969`, Test Build `33476605936`, Security `33476606422`: SUCCESS.

Canonical Drive folder: `W03_PERSISTENCE_EVENT_BACKBONE_DURABLE_WORKFLOW` / `1ZO73FVedMQM77dtfRtWF9wm54eulBkXc`.

### W04

Final outcome: `W04_CONTROL_CORE_VERIFIED`.

W04-H PR #151 accepted candidate `b4de1097b03a4b94bc81ac38f6cbe0019244724b`; merge/main `fcc26c1065961ec6ca52019195108f3562c33365`; post-merge Quality `33507711472`, Test Build `33507711290`, Security `33507712325`: SUCCESS.

Canonical Drive folder: `W04_CONTROL_CORE_CAPABILITY_PLANNING_GOAL_GRAPH` / `1Vz45N4p5zhubQvBFAf_zFinkhCFZcQdp`.

## W05 accepted evidence and frontier

Accepted DAG:

`W05-00 -> (W05-A || W05-C || W05-D || W05-E || W05-F)`

`W05-A + W05-C + W05-D + W05-E -> W05-B`

`W05-B + W05-F -> W05-G -> W05-H -> W06`

### W05-00

Canonical acceptance evidence: `W05_00_ACCEPTANCE_EVIDENCE_2026-09-01` / `156ni-zWA_ko21_SWFM0KJtYpOaWP-N9TV4am5kPZHzM`.

### W05-E

PR #169 accepted exact candidate `13d75a7b05d3f6ea7cd9d5f56f669013db44c082`; controlled merge/main `5768f6f77be6695e72c2cf7cae16ae04f12748da`; post-merge Quality `33527659921`, Test Build `33527659888`, Security `33527660602`: SUCCESS.

Drive evidence: `W05_E_ACCEPTANCE_EVIDENCE_2026-09-01` / `1t6_RcQdJSdOXZQJuMopCZtc2TJDsSpPd6CLxUHi6TLE`.

W05-E Strategy Registry remains separate from W04 Capability Registry and cannot grant authority.

### W05-A

Canonical current-main replacement PR #175 superseded stale/held candidates without merging them.

Accepted candidate base: `edf90ef6974a26179236c4c30cb71f1eda47c72c`.
Exact accepted candidate HEAD: `71d1e2e697c2c6ba5992456afd03dc130e0f6bbd`.
Candidate Quality `33531119135`, Test Build `33531119103`, Security `33531119934`, Copilot Fabric `33531119212`: SUCCESS.

The candidate Test Build executed the canonical `@aurora/intelligence` workspace typecheck, build and 7/7 W05-A tests. Independent Program Control review recorded `ACCEPT` on the same exact candidate HEAD.

Controlled merge/main: `972c2429de43909ee42c1f77ecc1f4fe1af28faa`.
Post-merge exact-main Quality `33531398574`, Test Build `33531398619`, Security `33531399282`, Copilot Fabric `33531398888`: SUCCESS.

Drive evidence: `W05_A_ACCEPTANCE_EVIDENCE_2026-09-01` / `1-gcU8ir7_IwZAKS7LdTclgrbfUbDwFhgejUEilB1Odg`.

Accepted W05-A invariants:

- deterministic task class, modality, bounded complexity, reversibility, risk and classification-confidence evidence;
- explicit UNKNOWN/insufficient-evidence behavior rather than guessed certainty;
- tenant/correlation propagation;
- equivalent normalized inputs converge deterministically;
- `CLASSIFIER_ONLY_NO_AUTHORITY` is invariant;
- DECISION_SUPPORT, risk signals, confidence and EXECUTE classification do not mint, widen, validate or replace Policy/Authority/Executor permission;
- no external side effect or provider/device/workflow runtime is introduced.

Current logical W05 implementation frontier is `{ W05-C, W05-D, W05-F }`. W05-B remains blocked until W05-C and W05-D are also accepted.

Shared-surface controls remain:

- `packages/intelligence/**` publication/bootstrap surfaces are Program Control-owned;
- W05-C owns ReasoningLevel L0-L5 and consumes W04 ExecutionBudget rather than redefining it;
- W05-D owns decomposed confidence/uncertainty/abstention; confidence is never authority;
- W05-F owns bounded generic worker/agent semantics and composes W03 durability rather than creating a second durability truth;
- root manifests/barrels/workspace config/lockfiles/CI/CODEOWNERS/cross-package public exports remain Program Control shared surfaces.

## W07 accepted evidence and frontier

Accepted DAG:

`W07-00 -> W07-A -> (W07-B || W07-C || W07-D || W07-E)`

`W07-B + W07-C + W07-D + W07-E -> (W07-F || W07-G)`

`W07-F + W07-G -> W07-H`

### W07-00

Final outcome: `COMPLETE_ACCEPTED / POST_MERGE_EXACT_MAIN_VERIFIED`.
Drive evidence: `W07_00_ACCEPTANCE_EVIDENCE_2026-09-01` / `1vJtJ0BpqH6B1xSodCVZ1MyGvYNiqJYShIs8UMi8d2Xs`.

### W07-A

PR #170 accepted exact current-main-reconciled candidate `c47ebe44572cc2540c902c43ab252054edb6c726`; controlled merge/main `1bcdb72078dd4d7e89bb92791fb0e14095ffd65b`; post-merge Quality `33528098556`, Test Build `33528098540`, Security `33528099185`: SUCCESS.

Drive evidence: `W07_A_ACCEPTANCE_EVIDENCE_2026-09-01` / `1AOMJlL8q4EIhF6GJcfCn05TGxQIqKZHDA_FllI7N8-M`.

Accepted W07-A invariants:

- one canonical target-neutral ActionIntent/Receipt/Evidence family for PROVIDER, DEVICE, WORKFLOW and LOCAL_SERVICE;
- old provider compatibility preserved explicitly; conflicting legacy/new representations fail closed;
- DEVICE/WORKFLOW/LOCAL_SERVICE never fabricate provider identity;
- target identity/availability is not authority;
- W14 retains DeviceId/DeviceRef ownership;
- W08/W09/W14/W15 retain concrete target runtime ownership;
- receipt/acknowledgement remains distinct from verified external state/readback;
- no provider/device/workflow runtime or external side effect was introduced by W07-A.

### W07-D

PR #180 accepted exact current-main candidate `2766264c79540dd803d8d7e4ccc9e0ef80e662e4` on accepted executor bootstrap base/main `84a42291dc64d7e0e4d561c18c82420ef5b5111b`.

Candidate Quality `33534237054`, Test Build `33534237072`, Security `33534237900`: SUCCESS. Test Build job `99944482205` compiled the executor leaf and executed 8/8 W07-D tests with zero failures; the cleanup audit reported `canonicalBrokenRelativeRefs=0`.

Controlled merge/main: `5318fec80a4e61541cea3690d075d515e5514373`.
Post-merge exact-main Quality `33534674425`, Test Build `33534674451`, Security `33534675235`: SUCCESS.

Drive evidence: `W07_D_ACCEPTANCE_EVIDENCE_2026-09-01` / `1cr33O-J-FmG7FpEjv5Iptf5uQYKHnv9oE4vmTpDuiLE`.

Accepted W07-D invariants:

- deterministic target-neutral resolution for PROVIDER, DEVICE, WORKFLOW and LOCAL_SERVICE;
- complete provider identity matching, including optional account reference;
- tenant mismatch, missing/ambiguous binding, unavailable/degraded/retired state, stale binding, malformed time, incompatible binding/target/ActionIntent and failed generic preconditions all fail closed;
- target freshness uses an exclusive boundary and malformed/non-RFC3339 time fails as `TARGET_TIME_INVALID`;
- every success and failure result fixes `authorizesExecution=false`;
- no PolicyToken/OwnerDecision issuance or widening, provider credential, concrete provider/device/workflow runtime or external side effect is introduced.

Current W07 implementation frontier is `{ W07-B, W07-C, W07-E }`, subject to the global two-code-task ceiling and shared-surface controls. W07-F/G remain gated until W07-B, W07-C and W07-E are accepted in addition to already accepted W07-D; W07-H remains gated on W07-F + W07-G.

## Architecture boundaries retained

W03 owns durable event/outbox/inbox/replay/DLQ/timers/leases/workflow truth.

W04 owns Objective/Goal/Task lifecycle, target-neutral Capability Registry/CapabilityPlan, GoalGraph, bounded planner scheduler, Fast/Governed lane planning, ExecutionBudget and curated PlanTemplate/PlanBinding foundations.

W05 owns intelligence classification, reasoning levels, confidence, strategy/routing and bounded agent-worker semantics only. W05 does not own authority, execution, context runtime, concrete provider/device runtime or a second control/durability/capability source of truth.

W06 owns context runtime.

W07 owns generic deterministic execution safety, current authority-validation integration, generic target resolution, readback/reconciliation and failure containment. W07 does not own concrete provider/device/workflow runtimes.

W08 owns provider adapters/credentials/provider-specific transport. W09 owns workflow fabric/bindings. W14 owns DeviceId/DeviceRef, registration, session/trust/attestation/realtime gateway. W15 owns Android/native capability bridge, app integration, permission broker and Device Executor implementation. W17 owns production telemetry/SLO/DR. W18 owns adaptive learning/promotion governance. W19 owns final security hardening.

Core invariants:

- Intelligence != Authority != Execution.
- Capability != Authority.
- Plan/Lane/Budget/Template/Strategy/Confidence != Authority.
- Fast Lane may optimize strategy but cannot bypass current Policy/Authority/Executor validation.
- Target availability, model confidence, worker ownership or route selection cannot mint execution permission.
- Receipt/acknowledgement is not verified external state.
- `EXECUTION_UNCERTAIN` requires reconcile-before-retry semantics.

## Development execution fabric

Puzzle/READY_FRONTIER governance remains active. `FREE_ACTIONS_CLI` permits at most two dependency-satisfied code tasks per batch. Program Control owns coordination/acceptance/shared-surface reconciliation. PREBUILD is read-only/non-authoritative and cannot satisfy dependencies. Workers cannot self-accept or auto-merge.

For maximum safe throughput, keep independent BUILD leaves isolated, use the two-task ceiling, and reconcile shared/publication surfaces once per convergence boundary rather than allowing workers to race on manifests, barrels, lockfiles or root configuration.

## Acceptance discipline

W03+ uses separate Risk Gates A Correctness, B Safety/Authority, C Performance/Economics and D Failure/Recoverability. Release blockers independent of score remain authority bypass, cross-tenant breach, uncontrolled duplicate irreversible side effect, secret exposure and irreversible execution without valid authority.

No stale CI satisfies acceptance. Before every merge or downstream release, revalidate current `main`, exact candidate HEAD, official gates, PR state, Drive task/change/evidence/acceptance records and active ownership/dependency documents.
