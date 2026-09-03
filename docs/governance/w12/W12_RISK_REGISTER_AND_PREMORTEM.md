# W12 — Risk Register and Premortem

Status: `CANDIDATE_COORDINATION_FREEZE_W12_00`
Task: `W12-00`
Issue: `#112`

## Premortem premise

Assume a future W12 deployment caused financial loss, wrong-account mutations, duplicate Meta resources or unsafe optimization. The controls below are mandatory design inputs for descendants; they do not replace the canonical Risk Framework.

## P0/P1 risk register

### R12-01 — Wrong tenant, Business Manager or ad account

Failure: a valid provider credential is used against the wrong business/ad-account scope.

Required controls: explicit tenant plus W08 provider-binding match, resource/account preconditions, wrong-account negative tests and fail-closed ambiguity.

### R12-02 — Currency or unit mismatch causes overspend

Failure: cents/major units, daily/lifetime budget or currency semantics are misinterpreted.

Required controls: explicit currency/unit/time-horizon fields, validated ceilings and execution-time authority checks.

### R12-03 — Duplicate mutation after timeout

Failure: campaign/ad-set/ad creation is repeated after an ambiguous provider response.

Required controls: idempotency context, `EXECUTION_UNCERTAIN`, provider readback/reconciliation and no blind retry.

### R12-04 — Creation unexpectedly serves traffic

Failure: a resource created for staging is immediately active or billable.

Required controls: paused/non-serving-first where provider semantics guarantee it, explicit readback and separate activation authority.

### R12-05 — Activation inherits creation approval

Failure: successful paused creation is treated as permission to unpause.

Required controls: activation is a separate high-impact action with fresh current approval/authority and financial scope.

### R12-06 — Stale audience, creative or conversion state

Failure: a plan is executed against provider state that changed since planning.

Required controls: freshness/provenance, expected-state preconditions and revalidation before mutation.

### R12-07 — Provider verification becomes authority

Failure: a verified account, healthy API or valid credential is treated as permission.

Required controls: explicit separation of W08 verification/transport from W02/W07 authority/execution gates.

### R12-08 — Optimization widens financial scope

Failure: model confidence, ROAS prediction or recommendation raises budget/bid, expands targeting or activates serving automatically.

Required controls: recommendations remain non-authoritative; explicit financial constraints and abstain/human-review path for weak/high-impact evidence.

### R12-09 — Provider IDs become canonical identity

Failure: Meta account/resource IDs leak into Aurora canonical entity identity and cross-tenant boundaries.

Required controls: opaque provider refs mapped through W08; canonical identity remains W01-owned.

### R12-10 — Secret leakage

Failure: access token, refresh token, app secret, raw credential or private provider payload enters logs, evidence, fixtures or context.

Required controls: opaque credential references only, security scans and sanitized evidence.

### R12-11 — W12 bypasses W07/W08

Failure: planner, router or domain service calls Meta mutation transport directly.

Required controls: ownership tests/review, allowed-import/surface audit and explicit command composition over accepted W07/W08 boundaries only.

### R12-12 — Staging becomes real billable side effect

Failure: test fixtures or staging harnesses use production account/resource bindings.

Required controls: safe mocks/staging bindings, no-real-side-effect tests, explicit environment/account fences and readback.

### R12-13 — Partial provider failure is flattened to success

Failure: some resources mutate while others fail, but W12 records a single local success state.

Required controls: per-target receipts/readback, explicit partial/uncertain state and reconciliation before follow-up writes.

### R12-14 — Rate limit or health degradation creates unsafe retry storm

Failure: repeated retries multiply mutations or spend.

Required controls: W08 rate-limit/health semantics, bounded retry policy, idempotency and reconcile-before-retry after any ambiguous write.

### R12-15 — Attribution data is treated as causal certainty

Failure: delayed/incomplete metrics trigger irreversible spend changes as if causality were proven.

Required controls: freshness/provenance, uncertainty disclosure, bounded recommendations and separate execution authority.

## Acceptance expectations

Risk Gates A-D on the exact W12-00 candidate must explicitly confirm that this governance freeze creates no provider side effect, duplicates no W02/W07/W08 source of truth, does not weaken financial safety and leaves descendant publication barriers closed until their live dependencies and exact-head acceptance evidence are satisfied.