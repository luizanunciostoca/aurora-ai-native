# W09 — Workflow Binding & Safe Execution Freeze

Status: `W09_00_BUILD_CANDIDATE / CONTRACT_FREEZE`
Date: 2026-09-02
Base exact main at branch creation: `5715ffa4e9d4cd628c1f6d4d6e7a3410ea3d5324`

## 1. N8nWorkflowBinding semantic freeze

W09-A must model a versioned immutable binding sufficient to identify and validate a governed workflow without copying raw n8n credentials or environment IDs into canonical truth. Required semantic fields include, as applicable:

- Aurora binding identity/version;
- tenant scope;
- n8n workflow reference distinct from Aurora canonical IDs;
- workflow version/revision/hash;
- status/lifecycle such as candidate, active, superseded, disabled or revoked;
- source provenance and sanitized-corpus lineage when migrated;
- existing W04 capability binding/reference when the workflow supports an Aurora capability;
- required execution target classes and integration prerequisites;
- credential-reference requirements, never secret values;
- registration/supersession metadata;
- compatibility/version constraints.

Unknown, stale, disabled, revoked, cross-tenant or incompatible bindings fail closed.

## 2. Registration lifecycle

Registration is governed and versioned:

1. candidate topology is re-specified from current Aurora requirements/reference material;
2. provenance/license/security classification is recorded;
3. capability/target requirements are reconciled with current owners;
4. credential references and tenant scope are declared without values;
5. deterministic validation/tests pass;
6. accepted immutable binding version is registered;
7. changed workflow topology creates a new version/hash rather than mutating accepted history silently;
8. supersession/revocation is explicit and replay-safe.

n8n's internal workflow ID/status is not sufficient canonical registration evidence by itself.

## 3. Event / webhook / schedule topology

W09-B bridges triggers into Aurora using W03 semantics:

- every ingress/egress propagates tenant, correlation and causation context;
- replay/duplicate detection uses durable idempotency semantics rather than process memory alone;
- out-of-order events remain explicit where ordering matters;
- schedules create governed trigger/request facts, not direct external side effects;
- webhook signature/authentication is transport authenticity only, not business action authority;
- retries are bounded and classified by failure/uncertainty state;
- backpressure/fan-out limits are explicit.

## 4. Credential boundary

W09-C uses opaque workflow credential references bound to exact tenant + workflow + provider/integration context.

Credential values must not appear in:

- N8nWorkflowBinding;
- W03 events beyond an opaque reference when owner-approved;
- W07 ActionIntent/Receipt/Evidence unless a safe non-secret identifier is explicitly required;
- templates;
- logs/diagnostics;
- fixtures committed to Git;
- governance/evidence documents.

Credential presence or n8n credential-store success never grants Aurora authority. Wrong-tenant, missing, revoked or stale credential reference fails closed.

## 5. External side-effect topology

Allowed topology:

`Aurora trigger/context/domain plan -> current Policy/Authority -> W07 governed Executor -> target-specific executor/provider/device/local-service -> Receipt/readback/evidence`

W09 may coordinate a workflow around that topology but cannot replace it with `n8n node -> provider/device` for governed side effects.

A workflow may perform genuinely read-only/non-side-effect integration operations only where the owning integration contract classifies them as such and tenant/credential boundaries are still enforced.

## 6. Receipt / evidence forwarding

W09-D normalizes workflow run observations including started, completed, failed, cancelled and uncertain, preserving binding version/hash, tenant, correlation/causation and safe provenance.

Forwarding rules:

- workflow completion is not proof of external final state;
- target receipts/readback remain W07/target-owner evidence;
- W09 cannot overwrite or retroactively mutate accepted evidence;
- sensitive workflow payloads are minimized/redacted;
- missing/forged/unlinked target receipts cannot be manufactured from n8n run status;
- uncertainty remains explicit.

## 7. Reconcile-before-retry

If a workflow step invokes governed external execution and the outcome is ambiguous, W09 must preserve `EXECUTION_UNCERTAIN`/equivalent uncertainty and wait for W07/target readback reconciliation. Blindly rerunning the node or entire workflow is prohibited when duplication is possible.

Replay after crash/reconnect must resume from durable Aurora/W03 state and accepted binding version, not assume that n8n's local run history is the single source of truth.

## 8. Curated migration categories

Reference patterns are classified before migration:

- `RE_SPECIFY_SAFE_CANDIDATE` — topology may be reimplemented against current contracts;
- `REFERENCE_ONLY_DOMAIN_PATTERN` — useful idea but business/domain owner must implement decisions;
- `REFERENCE_ONLY_PROVIDER_PATTERN` — provider-specific pattern belongs behind W08/W07;
- `HIGH_RISK_INDEX_ONLY` — shell/SSH/Execute Command or equivalent high-risk local execution;
- `REJECT_SECRET_OR_ID_LEAK` — contains embedded credentials/private IDs or unsafe static bindings;
- `REJECT_DUPLICATE_OR_INVALID` — structural duplicate, empty or invalid source;
- `LICENSE_PROVENANCE_HOLD` — verbatim reuse blocked until provenance/license is accepted.

Bulk raw-corpus promotion is prohibited.

## 9. Publication barriers

No W09 workflow binding/integration becomes an accepted dependency until applicable checks prove:

- exact tenant/workflow/version/hash binding;
- Aurora source-of-truth preservation;
- W03 replay/idempotency integration;
- W07-only governed side-effect reachability;
- credential-value non-leakage and wrong-tenant fail-closed behavior;
- duplicate/out-of-order trigger safety;
- uncertainty/reconcile-before-retry preservation;
- evidence forwarding without parallel evidence truth;
- provenance/license classification for migrated topology;
- high-risk shell/SSH patterns remain inactive;
- exact-head Quality + Test Build + Security and Risk Gates A-D.
