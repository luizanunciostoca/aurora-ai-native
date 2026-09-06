# Aurora AI-Native — Current Program Status & Document Authority

Status: `ACTIVE_CURRENT_PROGRAM_STATE_W00_W14_ACCEPTED_W15_00_I_ACCEPTED_W15_J_DP5_PHYSICAL_PENDING_W16_READINESS_ONLY`
Audit date: 2026-09-06
Canonical implementation baseline at this status candidate: `958381223d857fc821657fc1026d92bc48055456`

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
- W15-J issue #344: `IN_PROGRESS / PHYSICAL_DP5_REQUIRED`; it is not accepted and remains the current program frontier.
- W16-00 issue #116: `READINESS_ONLY / PREBUILD_NON_AUTHORITATIVE`; BUILD remains blocked by W15-J.
- W17-W20: downstream dependency-gated. PREBUILD/readiness may exist where governance explicitly permits it, but it does not satisfy dependencies or create BUILD authority.

## Current live frontier — W15-J physical Device Plane acceptance

At this audit snapshot, the only open canonical implementation PRs are the paired W15-J candidates below. Both are draft by design and both are based directly on current `main` with `behind=0`.

### Android / physical DP5 candidate — PR #413

- exact HEAD: `11781e0fa7017d031a97f477490f160f62ff4dbd`;
- base/main: `958381223d857fc821657fc1026d92bc48055456`;
- exact-head Android Foundation: SUCCESS;
- exact-head Quality: SUCCESS;
- exact-head Test Build: SUCCESS;
- exact-head Security: SUCCESS.

The exact physical-input APK is byte-bound as:

- variant: `localDebug`;
- package: `ai.aurora.device.local`;
- version: `0.15.0-alpha.1`;
- APK SHA-256: `898ed4246586429a5c06d5c6ceeb4f99f7a6bcd591ca2b2375dda37b0bbe1790`;
- packaging artifact ZIP SHA-256: `8b4c085e5440728652a9af4f9c15fd4a8c08cce7212d72192ebf32ea47fc3ad9`.

The artifact identity remains explicitly fail-closed: `canonical_acceptance=false`, `physical_evidence_required=true`, `dp5_status=INCOMPLETE`.

### Governed LOCAL host candidate — PR #462

- exact HEAD: `3efc2d741d0498dcd5aa3996019b115df390315e`;
- base/main: `958381223d857fc821657fc1026d92bc48055456`;
- exact-head Quality run `34039052609`: SUCCESS;
- exact-head Test Build run `34039052557`: SUCCESS;
- exact-head Security run `34039052976`: SUCCESS;
- exact-head Aurora Copilot Fabric Validation run `34039052542`: SUCCESS.

The candidate composes the current W03 durable delivery/execution-state owners, W07 current-authority/safeguard/containment/reconciliation owners and W14 device/session/trust owners into the real LOCAL host path. Issue #460 remains open until this candidate can be canonically integrated through the shared W15-J reality gate.

### What remains before W15-J acceptance

CI and artifact provenance are necessary but not sufficient. W15-J may not receive `aurora:accepted`, and PR #413/#462 may not be merged as the W15-J acceptance pair, until genuine representative hardware/environment evidence proves the mandatory DP5 matrix, including at minimum:

1. exact APK installation and exact candidate/device/environment binding;
2. bootstrap and authenticated W14 device/session path;
3. real wake/voice/presence path where the scenario requires it;
4. governed W07 dispatch into W15 native execution;
5. native effect plus Receipt/Evidence and reconciliation/readback;
6. disconnect/reconnect, dedupe, offline, cancellation/kill, late evidence and `EXECUTION_UNCERTAIN` reconcile-before-retry behavior;
7. threat, resource/performance and cleanup evidence;
8. operator attestation and independent acceptance review;
9. integrated Risk Gates A Correctness, B Safety/Authority, C Performance/Economics and D Failure/Recoverability on the exact physical candidate tuple.

Until those controls pass, physical DP5 is `NOT_RUN / INCOMPLETE`; green CI, a package hash, ACK/receipt presence, transcript confidence or local Android permission must not be promoted to verified external outcome or retry authority.

## Downstream state

### W16 — Workspace / Experience

W16-00 depends on W14-H plus W15-J. W14-H is accepted; W15-J is not. Therefore W16 may continue only governed PREBUILD/readiness work that does not publish runtime BUILD authority. No W16 implementation merge may infer W15-J acceptance from the prepared APK or software-only CI.

### W17-W20

W17 observability/evidence, W18 evaluation/adaptive promotion, W19 converged security and W20 integrated staging/release remain governed by their live DAG dependencies. They may consume accepted upstream contracts and approved readiness artifacts only within their own gates; they cannot bypass W15/W16 dependency edges.

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

`W15-J PHYSICAL DP5 -> ACCEPT/INTEGRATE EXACT PAIR -> RELEASE W16 BUILD FRONTIER -> RECALCULATE DOWNSTREAM DAG`

Parallel work is permitted only where path ownership is disjoint and dependencies are already satisfied. Work on W16-W20 that would depend on W15-J runtime acceptance remains readiness/prebuild only.

## Acceptance discipline

W03+ uses separate Risk Gates A Correctness, B Safety/Authority, C Performance/Economics and D Failure/Recoverability. Release blockers independent of score remain authority bypass, cross-tenant breach, uncontrolled duplicate irreversible side effect, secret exposure and irreversible execution without valid authority.

No stale CI satisfies acceptance. Before every merge or downstream release, revalidate current `main`, exact candidate HEAD, merge-base/behind state, official gates, PR/task state, blockers, current ownership/dependency documents and required external/physical evidence. If `main` or either member of an exact paired candidate moves, invalidate the stale pairing, reconcile and rerun all required exact-head/package/physical gates before integration.
