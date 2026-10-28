# Aurora AI-Native — Current Program Status & Document Authority

Status: `W00_W14_AND_W15_00_I_ACCEPTED_W15_J_EXPERIENCE_PHYSICAL_PENDING_DP5_FINAL_AT_W20_H_W16_PREBUILD`
Audit date: 2026-10-28
Canonical implementation baseline at this status candidate: `77f0f8532197025ee913dd02fcb56878d9d667a9`

## Authority order

1. GitHub `main` is implementation/code authority.
2. Accepted task/PR exact-SHA evidence plus post-merge verification governs dependency release and publication acceptance.
3. Google Drive `AURORA_AI_NATIVE_DEVELOPMENT_GOVERNANCE` remains operational governance/evidence authority where the program requires Drive evidence.
4. Developer Manual v0.5 Audit-Consolidated, accepted ADRs and owning-wave governance define architecture/scope.
5. Risk & Architecture Validation Framework v1.0 is mandatory for W03+.
6. `docs/governance/git/SINGLE_OWNER_GOVERNED_ACCEPTANCE.md` is the canonical single-owner acceptance procedure. Same GitHub identity is permitted only through explicit Program Control role separation and the exact-head/main, CI, Risk Gate, blocker, controlled-merge, post-merge and audit controls defined there.
7. Historical/superseded/salvage material is provenance/reference only.

No prompt, task node, PREBUILD/readiness artifact, draft/open PR, agent/model output, green CI on a stale SHA, cache hit, package artifact, emulator result or reference source releases a dependency by itself. Historical detail intentionally omitted from this current-state summary remains preserved in Git history, accepted PRs/issues and governed evidence.

## Accepted program state

- W00-W14: `COMPLETE_ACCEPTED`. Their accepted integration/publication nodes are already eligible to satisfy downstream graph dependencies.
- W11-H issue #325: `aurora:accepted / closed`.
- W12-H issue #322: `aurora:accepted / closed`.
- W13-H issue #326: `aurora:accepted / closed`.
- W14-H issue #265: `aurora:accepted / closed`; DP3 gateway/device-session publication is accepted.
- W15-00 and W15-A through W15-I: `aurora:accepted / closed`.
- W15-J issue #344: `IN_PROGRESS / EXPERIENCE_SMOKE_REQUIRED`; it is not accepted. The original full physical DP5 matrix is deferred to W20-H by the 2026-10-28 owner decision.
- W16-00 issue #116: `READINESS_ONLY / PREBUILD_NON_AUTHORITATIVE`; BUILD remains blocked until re-scoped W15-J is actually accepted on main after the eight physical smoke checks and post-merge verification.
- W17-W20: downstream dependency-gated. PREBUILD/readiness may exist where governance explicitly permits it, but it does not satisfy dependencies or create BUILD authority.

## Current live frontier — W15-J first-experience physical integration

The explicit repository-owner decision on 2026-10-28 is to complete a **small, genuinely physical first-experience gate now** and move the comprehensive DP5 certification to W20-H/DP7. See [W15_J_EXPERIENCE_FIRST_AND_DEFERRED_DP5_2026-10-28.md](w15/W15_J_EXPERIENCE_FIRST_AND_DEFERRED_DP5_2026-10-28.md). The canonical Puzzle edge `W16-00 -> W15-J` remains intact, so no dependency is satisfied by a new label or readiness artifact alone.

At this update, canonical `main` is `77f0f8532197025ee913dd02fcb56878d9d667a9`. Live draft W15-J candidates are:
- Android PR #413, live HEAD `e42ea0650a5056dd0d26e6ac69021691b5625332`;
- LOCAL host PR #462, live HEAD `790049ae133035db3ed1517b31d9110d7f20d9a4`;
- Tablet DevLab PR #499, live HEAD `009804b6021ac6ef4fb364825cb72cacba19a534`.

Candidate bodies, earlier r11 packaging identities and historical CI evidence reference different SHAs. **Do not reuse an old APK or claim exact-head CI** until current Android/Host/DevLab/packaging/device tuple is reconciled and current SHA-bound checks are rerun. Green software CI alone does not prove a physical effect.

### W15-J re-scoped acceptance (not yet satisfied)

Eight representative-tablet scenarios EX-01..EX-08 are all mandatory:
1. exact candidate/package/device binding, genuine install/readback and cold launch;
2. onboarding, permissions and authenticated W14 session/device binding;
3. five to ten exploratory physical wake activations with a repeatable command;
4. one benign and reversible W02/W07-governed native effect on actual hardware;
5. correlated Receipt/Evidence/readback and reconciled outcome;
6. DENY/stale-authority path with no effect;
7. cancel/kill safety;
8. restart/offline/reconnect/duplicate/uncertainty fail-closed behavior.

No P0/P1 unresolved; scoped Risk Gates A-D, exact final source/package manifest, Quality/Test Build/Security, controlled integration, Program Control review and post-merge exact-main verification are still required. All `PASS` observations must be real, current-tuple physical evidence. `EXPERIENCE_READY` is not `aurora:accepted` by itself.

Until that sequence completes, #344 stays OPEN/unaccepted and #116 stays PREBUILD. W15-J `aurora:accepted` after the revised scope means a governed integration adequate for W16 DEVELOPMENT, **not `DP5 OPEN`**.

### Deferred final DP5/DP7

Full 48-scenario physical matrix, >=100 wake attempts, seven-role semantics, threat/privacy/resource/performance/lifecycle matrix, cleanup, sealing, operator attestation, independent reviewer and final Risk Gates A-D remain mandatory at W20-H against the final release candidate. The existing DP5 dossier validator remains strict and is not relaxed. W20-J cannot authorize Release 1.0 until DP5+DP7 and all other release gates pass.

## Downstream state

### W16 — Workspace / Experience

W16-00 depends on W14-H plus W15-J. W14-H is accepted; W15-J is not. W16 remains governed PREBUILD/readiness-only until the revised W15-J Experience Gate has 8/8 genuine physical PASS, controlled exact-head integration, post-merge Q/TB/S and canonical `aurora:accepted` on #344. After that, Program Control may reconcile W14/W15 contracts and release W16 BUILD without claiming full DP5.

### W17-W20

W17 observability/evidence, W18 evaluation/adaptive promotion and W19 converged security remain governed by their live DAG dependencies and may build from the accepted W15-J first-experience integration; none may assert full DP5 certification. W20-H owns comprehensive DP5+DP7 physical verification, while W20-J retains final Release 1.0 authority.

## Architecture boundaries retained

- W03 owns durable event/outbox/inbox/replay/DLQ/timers/leases/workflow, idempotency and durable execution-state truth.
- W04 owns Objective/Goal/Task lifecycle, target-neutral Capability Registry/CapabilityPlan, GoalGraph, bounded scheduler, lanes, ExecutionBudget and curated templates.
- W05 owns intelligence classification/reasoning/confidence/strategy/routing and bounded worker/inspect-repair semantics only.
- W06 owns context retrieval/ranking/trust/freshness/minimization/memory/cache/snapshot/speculation semantics; it does not own authority or execution.
- W07 owns generic deterministic side-effect safety, current authority validation, safeguards, execution containment, target resolution, readback/reconciliation and retry eligibility.
- W08 owns provider adapters/credentials/provider-specific transport.
- W09 owns workflow fabric/bindings.
- W10 owns CRM/conversation/lead domain state.
- W11 owns organic publication/community domain composition.
- W12 owns Meta Ads domain planning/governed operations.
- W13 owns Google Ads domain planning/governed operations.
- W14 owns gateway/realtime/device registration/session/trust/replay/revoke/evidence ingress.
- W15 owns Android/native capability bridge/app integration/permission broker/Device Executor/voice-presence runtime and physical DP5 acceptance.
- W16 owns Workspace/view/control surfaces only.
- W17 owns production telemetry/SLO/evidence/DR.
- W18 owns eval-driven adaptive learning/promotion.
- W19 owns converged security hardening.
- W20 owns integrated staging/release acceptance.

Core invariants:

- Intelligence != Authority != Execution.
- Context != Authority.
- Capability != Authority.
- Device/session trust != Authority.
- Android permission/Keystore/wake/STT confidence != Authority.
- Plan/Lane/Budget/Template/Strategy/Confidence/Worker/Loop/Cache/Snapshot != Authority.
- Fast Lane may optimize strategy but cannot bypass current Policy/Authority/Executor validation.
- Receipt/acknowledgement is not verified external state.
- `EXECUTION_UNCERTAIN` requires reconcile-before-retry.

## Development execution fabric

Puzzle/READY_FRONTIER governance remains active. Program Control owns coordination, acceptance, dependency release and shared/publication-surface reconciliation. PREBUILD and readiness artifacts are read-only/non-authoritative unless explicitly promoted through a dependency-satisfied BUILD task. Workers cannot self-accept merely because CI is green.

Current safe execution priority is:

`W15-J 8/8 PHYSICAL EXPERIENCE -> RECONCILE/ACCEPT EXACT W15-J CANDIDATES -> RELEASE W16 BUILD -> W20-H FULL DP5/DP7 -> W20-J RELEASE DECISION`

Parallel work is permitted only where path ownership is disjoint and dependencies are already satisfied. Work on W16-W20 that would depend on W15-J runtime acceptance remains readiness/prebuild only.

## Acceptance discipline

W03+ uses separate Risk Gates A Correctness, B Safety/Authority, C Performance/Economics and D Failure/Recoverability. Release blockers independent of score remain authority bypass, cross-tenant breach, uncontrolled duplicate irreversible side effect, secret exposure and irreversible execution without valid authority.

No stale CI satisfies acceptance. Before every merge or downstream release, revalidate current `main`, exact candidate HEAD, merge-base/behind state, official gates, PR/task state, blockers, current ownership/dependency documents and required external/physical evidence. If `main` or either member of an exact paired candidate moves, invalidate the stale pairing, reconcile and rerun all required exact-head/package/physical gates before integration.
