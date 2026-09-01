# Aurora AI-Native — Current Program Status & Document Authority

Status: `ACTIVE_CURRENT_PROGRAM_STATE_W05_A_E_ACCEPTED_W05_C_D_F_READY_W07_A_D_ACCEPTED_W07_B_C_E_READY`
Audit date: 2026-09-01
Accepted implementation baseline before this convergence publication: `5318fec80a4e61541cea3690d075d515e5514373`

## Authority order

1. GitHub `main` is implementation/code authority.
2. Accepted PR/exact-SHA/post-merge evidence governs implementation and publication acceptance.
3. Google Drive `AURORA_AI_NATIVE_DEVELOPMENT_GOVERNANCE` is live operational governance/evidence authority.
4. Developer Manual v0.5 Audit-Consolidated, accepted ADRs and owning-wave governance define architecture/scope.
5. Risk & Architecture Validation Framework v1.0 is mandatory for W03+.
6. Historical/superseded/salvage material is provenance/reference only.

No prompt, task node, PREBUILD artifact, draft PR, agent output, green CI on a stale SHA or reference source releases a dependency by itself. Historical detail omitted from this compact current-state file remains preserved in Git history and accepted wave/Drive evidence.

## Accepted program state

- W00: `COMPLETE_ACCEPTED`.
- W01: `COMPLETE_ACCEPTED`.
- W02: `COMPLETE_ACCEPTED / REALITY_GATE_1_AUTHORITY_VERIFIED`.
- W03: `COMPLETE_ACCEPTED / REALITY_GATE_DURABLE_EVENT_DELIVERY_VERIFIED`.
- W04: `COMPLETE_ACCEPTED / W04_CONTROL_CORE_VERIFIED`.
- W05-00: `COMPLETE_ACCEPTED_MERGED / POST_MERGE_EXACT_MAIN_VERIFIED`.
- W05-A: `COMPLETE_ACCEPTED_MERGED / POST_MERGE_EXACT_MAIN_VERIFIED`.
- W05-E: `COMPLETE_ACCEPTED_MERGED / POST_MERGE_EXACT_MAIN_VERIFIED`.
- W05-C/D/F: `DEPENDENCY_READY`; W05-B remains gated on accepted W05-C + W05-D; W05-G remains gated on W05-B + W05-F; W05-H then gates W06.
- W07-00: `COMPLETE_ACCEPTED_MERGED / POST_MERGE_EXACT_MAIN_VERIFIED`.
- W07-A: `COMPLETE_ACCEPTED_MERGED / POST_MERGE_EXACT_MAIN_VERIFIED`.
- W07-D: `COMPLETE_ACCEPTED_MERGED / POST_MERGE_EXACT_MAIN_VERIFIED` after acceptance of this convergence publication.
- W07-B/C/E: `DEPENDENCY_READY`; implementation remains subject to ownership/shared-surface controls and the `FREE_ACTIONS_CLI` two-code-task batch ceiling.
- W07-F/G: gated on accepted W07-B + W07-C + W07-D + W07-E. W07-D alone does not release F/G.
- W07-H: gated on accepted W07-F + W07-G.
- W08-W20 remain dependency-gated except PREBUILD/readiness explicitly allowed by accepted Puzzle governance.
- W15-00 remains additionally dependent on W02-PB5, W03-F, W07-H and W14-H.

## Compact accepted baseline evidence

### W02-W04

W02 final outcome: `REALITY_GATE_1_AUTHORITY_VERIFIED`; PB5 release main `ad664f32949256ccc5751fe1fb88047b66c2d247`; W02-G accepted merge `4df704ae787947d2138658cae984726470f7633d`.

W03 final outcome: `DURABLE_EVENT_DELIVERY_VERIFIED`; W03-F merge/main `76ba0db1bf399c21d08e2190915213ceb8f4eb02`; post-merge Quality `33476605969`, Test Build `33476605936`, Security `33476606422`: SUCCESS.

W04 final outcome: `W04_CONTROL_CORE_VERIFIED`; W04-H merge/main `fcc26c1065961ec6ca52019195108f3562c33365`; post-merge Quality `33507711472`, Test Build `33507711290`, Security `33507712325`: SUCCESS.

## W05 accepted evidence and frontier

Accepted DAG:

`W05-00 -> (W05-A || W05-C || W05-D || W05-E || W05-F)`

`W05-A + W05-C + W05-D + W05-E -> W05-B`

`W05-B + W05-F -> W05-G -> W05-H -> W06`

W05-E PR #169 accepted candidate `13d75a7b05d3f6ea7cd9d5f56f669013db44c082`; merge/main `5768f6f77be6695e72c2cf7cae16ae04f12748da`; post-merge Quality `33527659921`, Test Build `33527659888`, Security `33527660602`: SUCCESS. Drive evidence: `W05_E_ACCEPTANCE_EVIDENCE_2026-09-01` / `1t6_RcQdJSdOXZQJuMopCZtc2TJDsSpPd6CLxUHi6TLE`.

W05-A PR #175 accepted exact candidate `71d1e2e697c2c6ba5992456afd03dc130e0f6bbd`; merge/main `972c2429de43909ee42c1f77ecc1f4fe1af28faa`; post-merge Quality `33531398574`, Test Build `33531398619`, Security `33531399282`, Copilot Fabric `33531398888`: SUCCESS. Candidate Test Build executed 7/7 W05-A tests. Drive evidence: `W05_A_ACCEPTANCE_EVIDENCE_2026-09-01` / `1-gcU8ir7_IwZAKS7LdTclgrbfUbDwFhgejUEilB1Odg`.

Current W05 implementation frontier is `{ W05-C, W05-D, W05-F }`. W05-B remains blocked until W05-C and W05-D are accepted. W05 intelligence output remains non-authoritative.

## W07 accepted evidence and frontier

Accepted DAG:

`W07-00 -> W07-A -> (W07-B || W07-C || W07-D || W07-E)`

`W07-B + W07-C + W07-D + W07-E -> (W07-F || W07-G)`

`W07-F + W07-G -> W07-H`

W07-00 final outcome: `COMPLETE_ACCEPTED / POST_MERGE_EXACT_MAIN_VERIFIED`. Drive evidence: `W07_00_ACCEPTANCE_EVIDENCE_2026-09-01` / `1vJtJ0BpqH6B1xSodCVZ1MyGvYNiqJYShIs8UMi8d2Xs`.

W07-A PR #170 accepted candidate `c47ebe44572cc2540c902c43ab252054edb6c726`; merge/main `1bcdb72078dd4d7e89bb92791fb0e14095ffd65b`; post-merge Quality `33528098556`, Test Build `33528098540`, Security `33528099185`: SUCCESS. Drive evidence: `W07_A_ACCEPTANCE_EVIDENCE_2026-09-01` / `1AOMJlL8q4EIhF6GJcfCn05TGxQIqKZHDA_FllI7N8-M`.

### W07 shared Executor build/test bootstrap

Program Control PR #178 accepted exact candidate `04820379859c182264670483577d76217fa3bd2a`; merge/main `84a42291dc64d7e0e4d561c18c82420ef5b5111b`; post-merge Quality `33533530295`, Test Build `33533530354`, Security `33533530923`: SUCCESS.

The accepted bootstrap makes `services/executors/src/**` participate in canonical typecheck/build and compiles/executes executor tests through the root harness. It is shared infrastructure only and does not grant authority or imply acceptance of an executor leaf.

### W07-D accepted evidence

Canonical PR #180 superseded stale/overlapping historical PRs #174, #176 and #179 without inheriting their shared-surface drift.

Accepted base/main: `84a42291dc64d7e0e4d561c18c82420ef5b5111b`.
Exact accepted candidate HEAD: `2766264c79540dd803d8d7e4ccc9e0ef80e662e4`.
Candidate Quality `33534237054`, Test Build `33534237072`, Security `33534237900`: SUCCESS.

Candidate Test Build job `99944482205` compiled the Executor leaf and executed 8/8 W07-D tests with zero failures; harness recorded `executor_tests=1`, exit code 0; root executor build completed; cleanup audit reported `canonicalBrokenRelativeRefs=0`.

Program Control technical review id `5080793968`: ACCEPT on the same exact candidate HEAD. Risk Gate A PASS; Risk Gate B PASS; Risk Gate D PASS for W07-D scope; Gate C not material for this pure resolver scope.

Controlled merge/main: `5318fec80a4e61541cea3690d075d515e5514373`.
Post-merge exact-main Quality `33534674425`, Test Build `33534674451`, Security `33534675235`: SUCCESS.

Drive evidence: `W07_D_ACCEPTANCE_EVIDENCE_2026-09-01` / `1cr33O-J-FmG7FpEjv5Iptf5uQYKHnv9oE4vmTpDuiLE`.

Accepted W07-D invariants:

- deterministic target-neutral resolution for PROVIDER, DEVICE, WORKFLOW and LOCAL_SERVICE;
- complete provider identity matching without provider-identity fabrication for non-provider targets;
- tenant, availability, freshness, strict RFC3339 timing, version compatibility and generic preconditions fail closed;
- missing and ambiguous targets fail closed;
- every result fixes `authorizesExecution: false`;
- no provider credential, PolicyToken/OwnerDecision issuance/widening, concrete target runtime or external side effect is introduced.

After this convergence publication, current W07 implementation frontier is `{ W07-B, W07-C, W07-E }`. W07-F/G remain gated until all three are independently accepted in addition to W07-D.

## Architecture boundaries retained

W03 owns durable event/outbox/inbox/replay/DLQ/timers/leases/workflow truth.

W04 owns Objective/Goal/Task lifecycle, target-neutral Capability Registry/CapabilityPlan, GoalGraph, bounded planner scheduler, Fast/Governed lane planning, ExecutionBudget and curated PlanTemplate/PlanBinding foundations.

W05 owns intelligence classification, reasoning levels, confidence, strategy/routing and bounded agent-worker semantics only. Intelligence is not authority.

W06 owns context runtime.

W07 owns generic deterministic execution safety, current authority-validation integration, generic target resolution, readback/reconciliation and failure containment. W07 does not own concrete provider/device/workflow runtimes.

W08 owns provider adapters/credentials/provider-specific transport. W09 owns workflow fabric/bindings. W14 owns DeviceId/DeviceRef, registration, session/trust/attestation/realtime gateway. W15 owns Android/native capability bridge, app integration, permission broker and Device Executor implementation. W17 owns production telemetry/SLO/DR. W18 owns adaptive learning/promotion governance. W19 owns final security hardening.

Core invariants:

- Intelligence != Authority != Execution.
- Capability != Authority.
- Plan/Lane/Budget/Template/Strategy/Confidence != Authority.
- Fast Lane cannot bypass current Policy/Authority/Executor validation.
- Target availability cannot mint execution permission.
- Receipt/acknowledgement is not verified external state.
- `EXECUTION_UNCERTAIN` requires reconcile-before-retry semantics.

## Development execution fabric

Puzzle/READY_FRONTIER governance remains active. `FREE_ACTIONS_CLI` permits at most two dependency-satisfied code tasks per batch. Program Control owns coordination/acceptance/shared-surface reconciliation. PREBUILD is read-only/non-authoritative and cannot satisfy dependencies. Workers cannot self-release downstream dependencies.

Keep independent BUILD leaves isolated, obey the two-task ceiling, and reconcile shared/publication surfaces once per convergence boundary rather than allowing workers to race on manifests, barrels, lockfiles or root configuration.

## Acceptance discipline

W03+ uses separate Risk Gates A Correctness, B Safety/Authority, C Performance/Economics and D Failure/Recoverability. Release blockers independent of score remain authority bypass, cross-tenant breach, uncontrolled duplicate irreversible side effect, secret exposure and irreversible execution without valid authority.

No stale CI satisfies acceptance. Before every merge or downstream release, revalidate current `main`, exact candidate HEAD, official gates, PR state, Drive evidence and active ownership/dependency documents.
