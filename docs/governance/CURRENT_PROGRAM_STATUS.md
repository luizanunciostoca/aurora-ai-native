# Aurora AI-Native — Current Program Status & Document Authority

Status: `ACTIVE_CURRENT_PROGRAM_STATE_W07_COMPLETE_W06_A_ACCEPTED_W06_B_E_ACCEPTANCE_PENDING_W08_00_CANDIDATE`
Audit date: 2026-09-02
Verified live main for this status candidate: `5715ffa4e9d4cd628c1f6d4d6e7a3410ea3d5324`

## Authority order

1. GitHub `main` is implementation/code authority.
2. Accepted PR/exact-SHA/post-merge evidence governs implementation and publication acceptance.
3. Google Drive `AURORA_AI_NATIVE_DEVELOPMENT_GOVERNANCE` is live operational governance/evidence authority.
4. Developer Manual v0.5 Audit-Consolidated, accepted ADRs and owning-wave governance define architecture/scope.
5. Risk & Architecture Validation Framework v1.0 is mandatory for W03+.
6. Historical/superseded/salvage material is provenance/reference only.

No prompt, task node, PREBUILD artifact, draft/open PR, agent/model output, green CI on a stale SHA, cache hit or reference source releases a dependency by itself. Historical detail intentionally omitted from this current-state summary remains preserved in Git history, accepted PRs and Drive evidence.

## Current canonical implementation baseline

Live `main` is `5715ffa4e9d4cd628c1f6d4d6e7a3410ea3d5324`, the controlled merge that accepted W06-A after exact-head Quality/Test Build/Security and Program Control Risk Gates A-D.

Accepted baseline:

- W00: `COMPLETE_ACCEPTED`.
- W01: `COMPLETE_ACCEPTED`.
- W02: `COMPLETE_ACCEPTED / REALITY_GATE_1_AUTHORITY_VERIFIED`.
- W03: `COMPLETE_ACCEPTED / REALITY_GATE_DURABLE_EVENT_DELIVERY_VERIFIED`.
- W04: `COMPLETE_ACCEPTED / W04_CONTROL_CORE_VERIFIED`.
- W05: `COMPLETE_ACCEPTED` through W05-H.
- W06-00: `COMPLETE_ACCEPTED_MERGED / POST_MERGE_EXACT_MAIN_VERIFIED`.
- W06-A: `COMPLETE_ACCEPTED_MERGED`; accepted candidate `d81a345e0d315864a59ae519ad9c599c0e583d87`, controlled merge/current main `5715ffa4e9d4cd628c1f6d4d6e7a3410ea3d5324`.
- W07-00/A/B/C/D/E/F/G/H: `COMPLETE_ACCEPTED`; W07 is complete. W07-H was accepted through canonical PR #228 and the accepted W07 integration main preceding W06-A was `3bf15c8d09e01be68bc5a4de1cd04defcb8b5025`.

Open candidates are not accepted dependencies until independent acceptance and controlled merge.

## Current execution frontier

| Node | Current state | Exact candidate / evidence | Dependency effect |
| --- | --- | --- | --- |
| W06-B | `BUILD_COMPLETE / ACCEPTANCE_PENDING` | PR #235, exact HEAD `dd1661a44c8f783a49bb8a53e1b2ae707a5fbe32`; Quality `33602802668`, Test Build `33602802986`, Security `33602802995`: SUCCESS; technical Risk Gates A-D PASS | W06-C remains blocked until W06-B is independently accepted and merged |
| W06-E | `BUILD_COMPLETE / ACCEPTANCE_PENDING` | PR #232, exact HEAD `312318b8fd3e80b1e9f911d8bb3c6208d2c6a440`; Quality `33599675274`, Test Build `33599675284`, Security `33599675691`: SUCCESS; technical Risk Gates A-D PASS | contributes with accepted W06-C to release W06-D and W06-F |
| W08-00 | `BUILD_COMPLETE / ACCEPTANCE_PENDING` | PR #236, base `5715ffa4e9d4cd628c1f6d4d6e7a3410ea3d5324`, exact HEAD `1fb765cd82a40f3a07522614b9b60c6be846e4b0`; Quality `33606511193`, Test Build `33606511110`, Security `33606511683`: SUCCESS; PR currently clean/mergeable | acceptance releases W08-A and W08-B only |
| W09-00 | `DEPENDENCY_READY / PUZZLE_BUILD_READY` | issue #109 | coordinator/freeze can begin independently |
| W10-00 | `DEPENDENCY_READY / PUZZLE_BUILD_READY` | issue #110 | coordinator/freeze can begin independently |
| W14-00 | `DEPENDENCY_READY / PUZZLE_BUILD_READY` | issue #114 | coordinator/freeze can begin independently; device ownership locks remain mandatory |

The connected authoring identity is also the PR author on the open candidates above. Governance prohibits self-accept and self-merge. Therefore #232, #235 and #236 require a distinct authorized acceptance/merge identity even though their exact-head technical gates are green.

## W06 — Context Engine

Accepted DAG:

`W06-00 -> (W06-A || W06-E)`

`W06-A -> W06-B -> W06-C`

`W06-C + W06-E -> (W06-D || W06-F)`

`W06-D + W06-F -> W06-G -> W06-H`

Current state:

- W06-00 accepted.
- W06-A accepted on current main.
- W06-B PR #235 is a final exact-head candidate and is technically gate-complete, but independent acceptance/merge is pending.
- W06-E PR #232 is a final exact-head candidate and is technically gate-complete, but independent acceptance/merge is pending.
- W06-C is **not BUILD_READY** until W06-B is accepted on live main.
- W06-D and W06-F remain blocked until both W06-C and W06-E are accepted.
- W06-G remains blocked on W06-D + W06-F.
- W06-H remains blocked on W06-G.

The W06 critical path is acceptance of W06-B followed by W06-C. W06-E acceptance is a parallel prerequisite for the later W06-D/F frontier.

## W07 — Executor Plane

W07 is `COMPLETE_ACCEPTED` through W07-H.

Canonical W07-H acceptance is PR #228. Closed duplicate/non-authoritative W07-H candidates remain historical only and must not be merged or cited as current acceptance truth.

Accepted architectural boundary remains:

- W07 owns the generic deterministic side-effect boundary, current authority-validation integration, target resolution, receipts/evidence, readback/reconciliation and failure containment.
- `ExecutionTargetReference(kind=PROVIDER)` carries provider target metadata but not credential or authority semantics.
- provider transport does not replace W07 and device transport remains separately owned by the Device Plane chain.

## W08 — Provider Adapter Foundation

W08-00 was independently BUILD_READY after accepted W07-H and was advanced to a governance-only candidate in PR #236.

PR #236 freezes:

- provider-specific ownership beneath W07 rather than a second generic executor;
- W04 as the sole Capability Registry/CapabilityPlan source of truth;
- explicit tenant/provider/account/target binding;
- external provider IDs as external references, not Aurora canonical IDs;
- opaque credential/SecretReference resolution and prohibition on plaintext credential persistence;
- read-only adapter semantics for reads;
- W07-only reachability for external writes;
- provider health/account/authentication as operational/precondition metadata, never Aurora execution authority;
- normalized provider error/uncertainty semantics;
- `AMBIGUOUS_WRITE -> readback/reconcile-before-retry`, with blind retry prohibited;
- Instagram/Meta Social, Meta Ads and Google Ads as required downstream provider families for W11-W13; GCP remains reference/candidate until an explicit owner/consumer releases it;
- safe mock/sandbox/no-op/paused-first acceptance and no production activation from W08-00.

Internal W08 DAG:

`W08-00 -> (W08-A || W08-B)`

`W08-A + W08-B -> (W08-C || W08-D || W08-E)`

`W08-C + W08-D + W08-E -> W08-F -> W08-G`

W08-A/B are **not BUILD_READY as canonical BUILD dependencies** until PR #236 is independently accepted and merged on live main.

## Architecture boundaries retained

- W03 owns durable event/outbox/inbox/replay/DLQ/timers/leases/workflow truth.
- W04 owns Objective/Goal/Task lifecycle, target-neutral Capability Registry/CapabilityPlan, GoalGraph, bounded scheduler, lanes, ExecutionBudget and curated templates.
- W05 owns intelligence classification/reasoning/confidence/strategy/routing and bounded worker/inspect-repair semantics only.
- W06 owns context retrieval/ranking/trust/freshness/minimization/memory/cache/snapshot/speculation semantics; it does not own authority or execution.
- W07 owns generic deterministic side-effect safety, current authority-validation integration, target resolution, readback/reconciliation and failure containment.
- W08 owns provider adapters, credential boundary and provider-specific transport/readback below W07.
- W09 owns workflow fabric/bindings.
- W14 owns gateway/realtime/device registration/session/trust/replay/revoke/evidence ingress.
- W15 owns Android/native capability bridge/app integration/permission broker/Device Executor.
- W16 owns Workspace/view/control surfaces only.
- W17 owns production telemetry/SLO/evidence/DR.
- W18 owns eval-driven adaptive learning/promotion.
- W19 owns converged security hardening.
- W20 owns integrated staging/release acceptance.

Device-plane ownership locks remain active: provider != device; W08 does not own Device Runtime; W14/W15 do not create a provider-side bypass around W07.

Core invariants:

- Intelligence != Authority != Execution.
- Context != Authority.
- Capability != Authority.
- Provider/account/credential/health verification != Authority.
- Plan/Lane/Budget/Template/Strategy/Confidence/Worker/Loop/Cache/Snapshot != Authority.
- Fast Lane may optimize strategy but cannot bypass current Policy/Authority/Executor validation.
- Receipt/transport acknowledgement is not verified external state.
- `EXECUTION_UNCERTAIN` / ambiguous external write requires reconcile-before-retry.

## Superseded/stale current-state assertions

The following earlier current-state claims are superseded by accepted live Git/evidence and must not be used to release work:

- any status claiming W06-A is merely `BUILD_READY` or lacks a canonical candidate/acceptance;
- any status claiming W07-H is still `BUILD_READY` or unaccepted;
- W06-B intermediate heads `f9ebb884...`, `3cb2b3be...` and `bf101ee3...`; only final exact HEAD `dd1661a44c8f783a49bb8a53e1b2ae707a5fbe32` may satisfy candidate evidence;
- W06-E formatter/intermediate candidate heads; only final exact HEAD `312318b8fd3e80b1e9f911d8bb3c6208d2c6a440` may satisfy candidate evidence;
- duplicate W07-H PR #229 HEAD `b03450e96455cb19e334b4fefff2d4877d1cd5fe` and duplicate PR #233 HEAD `baf949e9049b0846c6d257f80e12a88ea416451f`; both are non-authoritative/DO NOT MERGE;
- any PREBUILD/readiness artifact presented as accepted dependency truth.

Candidate evidence becomes stale if its exact HEAD changes. If live main moves before integration, Program Control must revalidate dependency compatibility/mergeability/scope and rerun any gate required by active governance; a green run attached to a different candidate HEAD never transfers automatically.

## Current safe path

1. Obtain independent acceptance and controlled merge for W06-B PR #235 after immediate live-main revalidation; this releases W06-C.
2. Obtain independent acceptance and controlled merge for W06-E PR #232 before the W06-C+E join is needed.
3. Obtain independent acceptance and controlled merge for W08-00 PR #236; this releases W08-A and W08-B.
4. In parallel, W09-00, W10-00 and W14-00 coordinator/freeze work may proceed in isolated, non-overlapping PRs because their accepted prerequisites are already satisfied.
5. Do not start W06-C from #235 branch, W08-A/B from #236 branch, or any other descendant from an unmerged candidate; descendants consume accepted live-main truth only.

## Acceptance discipline

W03+ uses separate Risk Gates A Correctness, B Safety/Authority, C Performance/Economics and D Failure/Recoverability. Release blockers independent of score remain authority bypass, cross-tenant breach, uncontrolled duplicate irreversible side effect, secret exposure and irreversible execution without valid authority.

No stale CI satisfies acceptance. Before every merge or downstream release, revalidate current `main`, exact candidate HEAD, official Quality/Test Build/Security gates, PR/task state, Drive evidence and active ownership/dependency documents. If `main` moves, reconcile candidate compatibility and rerun required exact-head evidence before integration.

Program Control owns canonical status convergence. This status update itself remains a candidate until independently accepted/merged; until then, live `main` plus accepted PR/exact-SHA/post-merge evidence continue to supersede stale prose in the previous status file.