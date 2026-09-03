# W09 — Governed n8n Workflow Fabric

Status: `W09_00_BUILD_CANDIDATE / GOVERNANCE_FREEZE`
Date: 2026-09-03
Reconciled exact base: `3ed51de66f3925c41c3a02a83de58b956e1cd1a9`
Task: `W09-00`

## 1. Mission

Build Aurora's governed n8n integration fabric without making n8n a source of truth, authority engine, provider/device executor, or parallel durable workflow runtime.

W09 owns versioned n8n workflow bindings, event/webhook/schedule bridging, workflow credential-reference integration, run/evidence forwarding, curated migration and replay-safe integration. External side effects remain governed by W07 and provider/device-specific execution remains with their owner waves.

## 2. Accepted prerequisites

W09-00 depends on accepted W03-F durable foundations and accepted W07-H Executor integration. At this freeze both prerequisites are accepted on live Git history.

Canonical inputs:

- W03 durable event/outbox/inbox/replay/idempotency/timer/lease/workflow foundations;
- W07 current-authority execution boundary, target resolution, receipts/readback/reconciliation and failure containment;
- W04 target-neutral capability truth where a workflow is bound to an Aurora capability;
- W08 provider layer only when a workflow ultimately targets provider-specific transport; W09 does not require an unaccepted W08 child to freeze its own workflow fabric contracts;
- canonical `DEVICE_PLANE_CROSS_WAVE_OWNERSHIP` workflow-only lock;
- `catalog/n8n/STATUS.md` and governed Drive corpus as reference-only migration input.

## 3. Canonical runtime target

The repository already identifies `services/n8n-bridge/**` as the canonical W09 integration target. W09 descendants extend that surface rather than creating a second n8n bridge.

`packages/workflow/**` is retained as generic durable workflow foundation owned by W03. W09 consumes its semantics and must not redefine generic workflow durability, replay, leases or event truth.

## 4. n8n corpus status

The governed reference corpus is not runtime authority:

- source archive: `n8n-workflows-main.zip`;
- source SHA-256: `4173960e9aed58b773482b2e660976533dabcc982ddd3e14d6790a670eebd89b`;
- 2,053 workflows parsed;
- 1,979 structurally unique;
- 1,937 sanitized reference patterns preserved in Drive;
- 74 structural duplicates index-only;
- 10 empty/invalid excluded;
- 32 direct command/SSH patterns index-only high risk.

No bulk import is permitted. Any migrated topology is re-specified against current Aurora contracts with provenance/license/security review.

## 5. Hard invariants

1. Aurora is source of truth; n8n is integration/execution fabric only.
2. n8n workflow registration, successful run, credential possession, node status, webhook signature or scheduler ownership never equals Aurora action authority.
3. External side effects must traverse W07 and the appropriate target executor/provider/device boundary. A workflow cannot call around W07 for a governed side effect.
4. W03 remains durable event/replay/idempotency/workflow truth; W09 cannot create a parallel replay ledger or workflow state authority.
5. Workflow credentials are opaque external references bound to tenant/workflow/provider context. Secret values never enter bindings, templates, logs, evidence or governance.
6. Duplicate/out-of-order webhook, event and schedule delivery must be replay-safe and bounded.
7. A timeout/ambiguous downstream external write remains uncertain and follows W07 reconcile-before-retry; W09 cannot hide uncertainty by rerunning a workflow blindly.
8. Shell/SSH/Execute Command reference patterns are prohibited from active migration unless a later explicitly governed `LOCAL_SERVICE` capability and authority path accepts them.
9. W09 does not own provider adapters (W08), Android/device execution (W15), gateway/device trust (W14), or domain business logic (W10-W13).
10. Workflow outputs/evidence are observations linked into Aurora correlation; they do not rewrite canonical historical evidence.

## 6. Frozen W09 DAG

- `W09-00` — coordination / governance / ownership / risk freeze.
- `W09-A` — N8nWorkflowBinding registry; depends on W09-00.
- `W09-B` — event/webhook/schedule bridge; depends on W09-A.
- `W09-C` — workflow credential boundary; depends on W09-A.
- `W09-D` — receipt/evidence forwarding; depends on W09-A.
- `W09-E` — curated workflow migration; depends on W09-B + W09-C + W09-D.
- `W09-F` — governance/replay/failure/integration acceptance; depends on W09-E.

Acceptance of W09-00 releases W09-A only. No descendant can consume this candidate branch as accepted authority.

## 7. Non-goals

W09-00 does not implement n8n API calls, workflow registration, webhooks, schedules, credentials, domain automation, provider writes, device commands, shell execution, production workflow activation or authority semantics.

## 8. Acceptance rule

W09-00 follows the current Single-Owner Governed Acceptance path already canonical on live main:

1. final exact candidate HEAD passes Quality + Test Build + Security;
2. cleanup/source-of-truth/scope audit is clean;
3. Risk Gates A-D are recorded for that exact HEAD with blockers empty;
4. live main, PR head/base, mergeability, changed paths and review threads are revalidated immediately before merge;
5. merge uses the exact validated candidate HEAD;
6. downstream release occurs only after Quality + Test Build + Security succeed on the exact post-merge main SHA.

A second GitHub identity is optional, not required. The same owner may perform the governed acceptance lifecycle provided no stale CI, untested HEAD, unresolved blocker or post-merge gate is bypassed.
