# W09 — Acceptance Matrix & Risk Gates

Status: `W09_00_BUILD_CANDIDATE / ACCEPTANCE_FROZEN`
Date: 2026-09-02
Base exact main at branch creation: `5715ffa4e9d4cd628c1f6d4d6e7a3410ea3d5324`

## Global Definition of Done

Every W09 BUILD candidate must satisfy all applicable items on the same exact final HEAD:

- dependency acceptance revalidated against live main;
- ownership/path fence respected;
- deterministic positive/negative/replay tests proportional to task;
- tenant/workflow/version isolation tests where applicable;
- cleanup, duplicate-source-of-truth and scope-leak audit;
- no plaintext secret or production credential in repository/evidence;
- Quality `SUCCESS`;
- Test Build `SUCCESS`;
- Security `SUCCESS`;
- Risk Gates A-D recorded for exact final candidate HEAD;
- independent Program Control acceptance; no self-accept/self-merge;
- controlled merge after immediate live-main revalidation;
- post-merge exact-main verification before downstream release.

## W09-00 — Coordination / Governance Freeze

Must prove:

- W03 and W07 accepted dependencies were revalidated;
- existing `services/n8n-bridge/**` target was reused rather than creating a second bridge;
- `packages/workflow/**` remains W03-owned generic durable workflow truth;
- binding/version/hash/lifecycle semantics are frozen;
- Aurora-vs-n8n source-of-truth boundary is explicit;
- credential reference and secret non-leakage boundary is explicit;
- event/webhook/schedule replay safety is explicit;
- W07-only side-effect topology and reconcile-before-retry are explicit;
- curated migration categories preserve reference-only corpus governance;
- shell/SSH/Execute Command patterns remain index-only high risk;
- premortem covers duplicate execution, credential leakage, webhook replay, stale binding, forged evidence and authority bypass.

Acceptance releases W09-A only.

## W09-A — N8nWorkflowBinding Registry

Must prove immutable/versioned binding registration, tenant scope, external workflow reference separation, version/hash/provenance, capability binding without capability redefinition, lifecycle/supersession/revocation, and fail-closed stale/unknown/cross-tenant handling.

## W09-B — Event/Webhook/Schedule Bridge

Must prove W03 correlation/causation/idempotency propagation, duplicate/out-of-order/replay handling, bounded retries/fan-out, schedules producing governed requests rather than side effects, and transport authentication remaining distinct from action authority.

## W09-C — Workflow Credential Boundary

Must prove opaque credential references, exact tenant/workflow/provider binding, wrong-tenant/missing/revoked fail-closed behavior, secret-value non-leakage across binding/log/event/evidence/template/test surfaces, and no authority inference from credential possession.

## W09-D — Receipt/Evidence Forwarding

Must prove workflow run observations are linked to Aurora correlation, binding version/hash/provenance preserved, sensitive data minimized, external target receipts remain owner truth, uncertain outcomes remain explicit, and workflow success cannot manufacture verified business outcome.

## W09-E — Curated Workflow Migration

Must prove corpus classification, smallest-current-contract re-specification, no bulk import, no secret/private-ID carryover, provenance/license evidence for verbatim reuse, 32 shell/SSH/Execute Command patterns remain inactive/index-only, and domain/provider/device logic remains with owner waves.

## W09-F — Governance / Replay / Failure / Integration

Must prove registration/version drift, duplicate webhook/event, restart/replay, cancellation, missing credentials, provider outage, ambiguous target execution and evidence-forwarding scenarios; no workflow node can mint authority or bypass W07; load/fan-out/retry budgets are bounded; exact-head gates and Risk Gates A-D pass.

## Risk Gate A — Architecture / Source-of-Truth

PASS requires:

- Aurora remains source of truth;
- no second W03 durable workflow/event/idempotency engine;
- no second W07 executor/receipt/reconciliation truth;
- no second W04 capability registry;
- no provider/device/domain ownership leak;
- no bulk raw n8n corpus as production runtime truth.

## Risk Gate B — Safety / Authority / Credentials

PASS requires:

- n8n run/workflow/webhook/credential state never grants Aurora authority;
- wrong tenant/workflow/provider credential use fails closed;
- no plaintext secret leakage;
- webhook authenticity remains transport authenticity, not business permission;
- high-risk shell/SSH/local command execution remains disabled unless separately governed later.

## Risk Gate C — Performance / Economics / Duplicate Safety

PASS requires:

- bounded fan-out/concurrency/retries/schedules;
- duplicate and out-of-order triggers deduplicated through W03-compatible semantics;
- no retry storm after provider/workflow outage;
- no duplicate externally irreversible action after timeout/reconnect;
- workflow overhead and bridge budgets measured without hiding unsafe shortcuts.

## Risk Gate D — Failure / Recoverability / Evidence

PASS requires:

- workflow crash/restart/replay preserves durable correlation and accepted binding version;
- ambiguous external writes preserve uncertainty and reconcile-before-retry;
- cancellation/late completion is explicit;
- evidence forwarding preserves provenance and cannot rewrite accepted history;
- stale/revoked bindings fail safely;
- unsupported/missing provider/device prerequisites block rather than force bypass.

## Kill criteria

Reject/return candidate to BUILD if any of these is found:

- plaintext credential or sensitive runtime secret in Git/evidence;
- direct governed provider/device write from a workflow node around W07;
- n8n state interpreted as PolicyToken/OwnerDecision/current authority;
- blind workflow rerun after ambiguous external write;
- cross-tenant workflow/binding/credential ambiguity that fails permissively;
- W09 reimplements W03 workflow durability or W07 execution semantics;
- raw corpus bulk import or activation of shell/SSH high-risk patterns;
- stale exact-head CI used as final acceptance evidence;
- self-accept/self-merge where independent review is required.