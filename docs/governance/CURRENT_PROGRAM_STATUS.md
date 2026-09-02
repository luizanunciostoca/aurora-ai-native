# Aurora AI-Native — Current Program Status & Document Authority

Status: `ACTIVE_CURRENT_PROGRAM_STATE_ACCEPTANCE_BOOTSTRAP_PENDING_W07_COMPLETE_W06_A_ACCEPTED_W06_B_E_ACCEPTANCE_PENDING_W08_00_W09_00_W10_00_W14_00_CANDIDATES`
Audit date: 2026-09-02
Verified live main for this status candidate: `5715ffa4e9d4cd628c1f6d4d6e7a3410ea3d5324`

## Authority order

1. GitHub `main` is implementation/code authority.
2. Accepted PR/exact-SHA/post-merge evidence governs implementation and publication acceptance.
3. Google Drive `AURORA_AI_NATIVE_DEVELOPMENT_GOVERNANCE` is live operational governance/evidence authority.
4. Developer Manual v0.5 Audit-Consolidated, accepted ADRs and owning-wave governance define architecture/scope.
5. Risk & Architecture Validation Framework v1.0 is mandatory for W03+.
6. Historical/superseded/salvage material is provenance/reference only.

No prompt, task node, PREBUILD artifact, draft/open PR, agent/model output, green CI on a stale SHA, cache hit or reference source releases a dependency by itself. A candidate HEAD change invalidates the previous candidate's CI/review evidence for acceptance.

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
- W07-00/A/B/C/D/E/F/G/H: `COMPLETE_ACCEPTED`; W07 is complete. Canonical W07-H acceptance is PR #228.

Open candidates are not accepted dependencies until independent acceptance and controlled merge.

## Current execution frontier

- **Program Control acceptance bootstrap — `TECHNICALLY_ACCEPTABLE / INDEPENDENT_ACCEPTANCE_PENDING`**: issue #241 is implemented by PR #242 at exact HEAD `00e5fced35a3e55baa5b9170e3f8007b70adbee5` against unchanged main `5715ffa4e9d4cd628c1f6d4d6e7a3410ea3d5324`. Quality `33663166892`, Test Build `33663166706`, Security `33663167420`, Aurora Puzzle Validation `33663166713` and Aurora Copilot Fabric Validation `33663166770`: SUCCESS. The candidate is 18 commits ahead / 0 behind, mergeable and limited to five governance/tooling/test files. Its reviewer uses a bounded immutable SHA-256-bound static dossier, protected canonical-workflow provenance and a read-only Copilot tool boundary; raw model/session output is not published or retained. This workflow is not active authority until #242 itself is independently accepted and merged.
- **W06-B — `BUILD_COMPLETE / ACCEPTANCE_PENDING`**: PR #235, exact HEAD `1b10bed145813b73a401d6a3c5256c0335ae0d96`; Quality `33648034436`, Test Build `33648034207`, Security `33648036132`: SUCCESS; exact-head Program Control technical re-review records Risk Gates A-D PASS as COMMENT only. The current candidate also fails closed on inherited/accessor-backed retrieval policy records. W06-C remains blocked until W06-B is independently accepted and merged.
- **W06-E — `BUILD_COMPLETE / ACCEPTANCE_PENDING`**: PR #232, exact HEAD `1afd4cbaf4a45425c3a9d15f4ad36f117556fb59`; Quality `33647897538`, Test Build `33647897474`, Security `33647898021`: SUCCESS; exact-head Program Control technical re-review records Risk Gates A-D PASS as COMMENT only. The current candidate fails closed on inherited memory-boundary keys and non-string timestamp coercion. W06-E contributes with accepted W06-C to the later W06-D/F join.
- **W08-00 — `BUILD_COMPLETE / ACCEPTANCE_PENDING`**: PR #236, exact HEAD `1fb765cd82a40f3a07522614b9b60c6be846e4b0`; Quality `33606511193`, Test Build `33606511110`, Security `33606511683`: SUCCESS. Acceptance releases W08-A and W08-B only.
- **W09-00 — `BUILD_COMPLETE / ACCEPTANCE_PENDING`**: PR #238, exact HEAD `6c8c4acd7713ed00ce5300833d82896c3b8804c0`; Quality `33607285467`, Test Build `33607285457`, Security `33607286177`: SUCCESS. Acceptance releases W09-A only.
- **W10-00 — `BUILD_COMPLETE / ACCEPTANCE_PENDING`**: PR #239, exact HEAD `b38e2319ffd0d21aaedc4e7315658d4a26ed22ba`; Quality `33608843176`, Test Build `33608843154`, Security `33608843770`: SUCCESS. Acceptance releases W10-A only.
- **W14-00 — `BUILD_COMPLETE / ACCEPTANCE_PENDING`**: PR #240, exact HEAD `0b2cb9ec7eb13f3e973aee930d50507870dd699e`; Quality `33608863473`, Test Build `33608863487`, Security `33608863938`: SUCCESS. Acceptance releases W14-A and W14-D only; Device Plane DP3 remains closed through W14-H.

The connected authoring identity is also the PR author on the candidates above. Governance prohibits self-accept and self-merge. Therefore #232, #235, #236, #238, #239, #240 and #242 still require a distinct authorized acceptance/merge identity even though their current exact-head technical gates are green.

The live task ledger currently has no open `aurora:puzzle-build-ready` node without `aurora:canonical-pr-open`. Opening another BUILD candidate would create a parallel truth or violate the accepted DAG. Readiness/PREBUILD artifacts remain non-authoritative.

## Acceptance and controlled-integration bootstrap

The current program-wide constraint is operational governance rather than missing candidate code:

- issue #241 records that canonical `main` has no active independent acceptance dispatch for already-built candidates;
- PR #242 supplies that dispatch but cannot bootstrap its own authority. Its `workflow_dispatch` and `pull_request_target` paths become trusted only after the workflow exists on accepted `main`;
- #242 currently has no distinct eligible requested reviewer and no independent exact-head acceptance evidence. Program Control COMMENT reviews are technical evidence only;
- no W00-F acceptance/evidence record has been published to Drive, which is correct while independent acceptance remains pending;
- issue #243 defines the future controlled non-self merge/finalization contract as `READINESS_ONLY / BLOCKED_ON_#242_ACCEPTED_MAIN`. No #243 implementation branch or merge authority is released yet;
- generic Copilot code review, author comments, successful CI or a copied machine marker cannot substitute the canonical `aurora-acceptance` evidence contract.

After #242 is independently accepted and merged, #243 may implement the distinct `github-actions[bot]` integration path that consumes machine-verifiable exact-head acceptance evidence, revalidates current HEAD/main/checks, performs the controlled merge and waits for post-merge main gates before lifecycle/Drive convergence.

## W06 — Context Engine

Accepted DAG:

`W06-00 -> (W06-A || W06-E)`

`W06-A -> W06-B -> W06-C`

`W06-C + W06-E -> (W06-D || W06-F)`

`W06-D + W06-F -> W06-G -> W06-H`

Current state:

- W06-00 accepted.
- W06-A accepted on current main.
- W06-B PR #235 is exact-head gate-complete at `1b10bed145813b73a401d6a3c5256c0335ae0d96`, but independent acceptance/merge is pending.
- W06-E PR #232 is exact-head gate-complete at `1afd4cbaf4a45425c3a9d15f4ad36f117556fb59`, but independent acceptance/merge is pending.
- W06-C is **not BUILD_READY** until W06-B is accepted on live main.
- W06-D and W06-F remain blocked until both W06-C and W06-E are accepted.
- W06-G remains blocked on W06-D + W06-F.
- W06-H remains blocked on W06-G.

The W06 critical path is independent acceptance/merge of W06-B followed by W06-C. W06-E acceptance is a parallel prerequisite for the later W06-D/F frontier.

## W07 — Executor Plane

W07 is `COMPLETE_ACCEPTED` through W07-H. Canonical W07-H acceptance is PR #228. Closed duplicate/non-authoritative W07-H candidates remain historical only and must not be merged or cited as current acceptance truth.

Accepted architectural boundary remains:

- W07 owns the generic deterministic side-effect boundary, current authority-validation integration, target resolution, receipts/evidence, readback/reconciliation and failure containment.
- `ExecutionTargetReference(kind=PROVIDER)` carries provider target metadata but not credential or authority semantics.
- Provider transport does not replace W07 and device transport remains separately owned by the Device Plane chain.

## W08 — Provider Adapter Foundation

W08-00 was independently BUILD_READY after accepted W07-H and was advanced to governance-only PR #236.

Internal W08 DAG:

`W08-00 -> (W08-A || W08-B)`

`W08-A + W08-B -> (W08-C || W08-D || W08-E)`

`W08-C + W08-D + W08-E -> W08-F -> W08-G`

W08-A/B are **not BUILD_READY as canonical BUILD dependencies** until PR #236 is independently accepted and merged on live main.

## W09 — Governed n8n Workflow Fabric

W09-00 was independently BUILD_READY after accepted W03-F and W07-H and was advanced to governance-only PR #238.

Internal W09 DAG:

`W09-00 -> W09-A`

`W09-A -> (W09-B || W09-C || W09-D)`

`W09-B + W09-C + W09-D -> W09-E -> W09-F`

W09-A is **not BUILD_READY as a canonical BUILD dependency** until PR #238 is independently accepted and merged on live main.

## W10 — Revenue / CRM Domain

W10-00 was independently BUILD_READY after accepted W05-H and W07-H and was advanced to governance-only PR #239.

Internal W10 DAG:

`W10-00 -> W10-A`

`W10-A -> (W10-B || W10-C)`

`W10-B + W10-C -> (W10-D || W10-E || W10-F)`

`W10-D + W10-E + W10-F -> W10-G`

W10-A is **not BUILD_READY as a canonical BUILD dependency** until PR #239 is independently accepted and merged on live main. W11 cannot consume an intermediate/open W10 surface; the W10 -> W11 publication barrier remains closed until W10-G acceptance.

## W14 — Gateway & Device Session Plane

W14-00 was independently BUILD_READY after accepted W05-H and W07-H and was advanced to governance-only PR #240 under the accepted Device Plane planning/ownership rules.

Internal W14 DAG:

`W14-00 -> (W14-A || W14-D)`

`W14-A + W14-D -> (W14-B || W14-C || W14-E)`

`W14-B + W14-C + W14-E -> (W14-F || W14-G)`

`W14-F + W14-G -> W14-H`

W14-A and W14-D are **not BUILD_READY as canonical BUILD dependencies** until PR #240 is independently accepted and merged on live main. Device Plane DP3 remains CLOSED until W14-H is independently accepted, merged and post-merge verified with an explicit W15 publication/handoff.

## Architecture boundaries retained

- W03 owns durable event/outbox/inbox/replay/DLQ/timers/leases/workflow truth.
- W04 owns Objective/Goal/Task lifecycle, target-neutral Capability Registry/CapabilityPlan, GoalGraph, bounded scheduler, lanes, ExecutionBudget and curated templates.
- W05 owns intelligence classification/reasoning/confidence/strategy/routing and bounded worker/inspect-repair semantics only.
- W06 owns context retrieval/ranking/trust/freshness/minimization/memory/cache/snapshot/speculation semantics; it does not own authority or execution.
- W07 owns generic deterministic side-effect safety, current authority-validation integration, target resolution, readback/reconciliation and failure containment.
- W08 owns provider adapters, credential boundary and provider-specific transport/readback below W07.
- W09 owns n8n workflow binding/bridge/credential-reference/evidence-forwarding/migration integration only.
- W10 owns Revenue/CRM domain lifecycle, qualification/scoring, domain persistence/read models, nurture/sales/customer-success controllers and next-best-action candidate planning without authority elevation.
- W14 owns gateway/realtime/device registration/session/trust/replay/revoke/evidence ingress.
- W15 owns Android/native capability bridge/app integration/permission broker/Device Executor.
- W16 owns Workspace/view/control surfaces only.
- W17 owns production telemetry/SLO/evidence/DR.
- W18 owns eval-driven adaptive learning/promotion.
- W19 owns converged security hardening.
- W20 owns integrated staging/release acceptance.

Device-plane ownership locks remain active: provider != device; workflow != device; W08/W09 do not own Device Runtime; W14/W15 do not create provider/workflow-side bypasses around W07.

Core invariants:

- Intelligence != Authority != Execution.
- Context != Authority.
- Capability != Authority.
- Score/CRM state/NBA candidate != Authority.
- Provider/account/credential/health verification != Authority.
- Workflow/run/webhook/credential state != Authority.
- Session authentication/trust/attestation/device presence != Authority.
- Plan/Lane/Budget/Template/Strategy/Confidence/Worker/Loop/Cache/Snapshot != Authority.
- Fast Lane may optimize strategy but cannot bypass current Policy/Authority/Executor validation.
- Receipt/transport/workflow completion acknowledgement is not verified external state.
- `EXECUTION_UNCERTAIN` / ambiguous external write requires reconcile-before-retry.

## Superseded/stale current-state assertions

The following earlier current-state claims/evidence are superseded or historical and must not be used to release work:

- any status claiming W06-A is merely `BUILD_READY` or lacks canonical acceptance;
- any status claiming W07-H is still `BUILD_READY` or unaccepted;
- any status claiming W09-00, W10-00 or W14-00 remains only `BUILD_READY` after publication of their canonical coordinator PRs;
- W06-B intermediate heads `f9ebb884...`, `3cb2b3be...`, `bf101ee3...`, former acceptance candidate `dd1661a44c8f783a49bb8a53e1b2ae707a5fbe32`, hardening intermediate `6c0ce1091e50eccee70d50d79a85690ddbcbbfaf` and all checks/reviews attached to them; only current exact HEAD `1b10bed145813b73a401d6a3c5256c0335ae0d96` may satisfy W06-B candidate evidence now;
- W06-E former acceptance candidate `312318b8fd3e80b1e9f911d8bb3c6208d2c6a440`, hardening intermediate `f3af2769e2921e3f304a5b2c20dfaeb6e3709cc2` and all checks/reviews attached to them; only current exact HEAD `1afd4cbaf4a45425c3a9d15f4ad36f117556fb59` may satisfy W06-E candidate evidence now;
- duplicate W07-H PR #229 HEAD `b03450e96455cb19e334b4fefff2d4877d1cd5fe` and duplicate PR #233 HEAD `baf949e9049b0846c6d257f80e12a88ea416451f`; both are non-authoritative/DO NOT MERGE;
- PR #242 former candidate heads `64e2c31f7ee3ca61e166f155cd39ac39859c5f99`, `685692ccd48239652b1450c3ccf02ba77d553c8a`, `3eaf61d80da5f38aa2979eeb31362e03bc8e6f25`, `0519f8a05f32a11dc1e1f6f3762693a4d934c4d1`, `144291ceb59f17d0b20abe0b7b8182e39c22dfbf`, `eecb6672964e5df809f8206b800ae8807a87b012` and `83689a8bc6463d0cc5065b6456d597e38ba0e5be`; only current exact HEAD `00e5fced35a3e55baa5b9170e3f8007b70adbee5` may satisfy its candidate evidence now;
- PR #237 earlier status-candidate heads `e50d780a6e3e461934fce5c2b0c208ba3cef95a8`, `035efa25c722dad5c324276c7f11ece551c33aaf`, `e9d5b6b2817e78c47f9c99ff3e315651dd91789d` and `09b63b3ac77c44533dfbbab1a2dac10564e23610`; their exact-head gates/reviews are historical after this convergence commit;
- any PREBUILD/readiness artifact presented as accepted dependency truth.

Candidate evidence becomes stale if its exact HEAD changes. If live main moves before integration, Program Control must revalidate dependency compatibility/mergeability/scope and rerun any gate required by active governance; a green run attached to a different candidate HEAD never transfers automatically.

## Current safe path

1. Obtain independent exact-head acceptance and a currently valid controlled merge for PR #242. Do not use #242 to accept itself.
2. After #242 is accepted on live main, implement and independently accept issue #243's controlled non-self merge path.
3. Use the accepted two-stage path to process W06-B PR #235 first after immediate live-main revalidation; its controlled merge releases W06-C, the W06 critical path.
4. Process W06-E PR #232 before the W06-C+E join releases W06-D/F.
5. Process W08-00 PR #236 to release W08-A and W08-B, W09-00 PR #238 to release W09-A, W10-00 PR #239 to release W10-A, and W14-00 PR #240 to release W14-A and W14-D; DP3 remains blocked through W14-H.
6. Do not start W06-C from #235, W08-A/B from #236, W09-A from #238, W10-A from #239, W14-A/D from #240, or any other descendant from an unmerged candidate; descendants consume accepted live-main truth only.

## Acceptance discipline

W03+ uses separate Risk Gates A Correctness, B Safety/Authority, C Performance/Economics and D Failure/Recoverability. Release blockers independent of score remain authority bypass, cross-tenant breach, uncontrolled duplicate irreversible side effect, secret exposure and irreversible execution without valid authority.

No stale CI satisfies acceptance. Before every merge or downstream release, revalidate current `main`, exact candidate HEAD, official Quality/Test Build/Security gates, PR/task state, Drive evidence and active ownership/dependency documents. If `main` moves, reconcile candidate compatibility and rerun required exact-head evidence before integration.

Program Control owns canonical status convergence. This status update itself remains a candidate until independently accepted/merged; until then, live `main` plus accepted PR/exact-SHA/post-merge evidence continue to supersede stale prose in the previous status file.
