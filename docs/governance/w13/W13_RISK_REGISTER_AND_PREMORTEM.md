# W13 — Risk Register and Premortem

Status: `CANDIDATE_COORDINATION_FREEZE_W13_00`
Task: `W13-00`
Issue: `#113`

## Premortem premise

Assume a future W13 deployment caused financial loss, wrong-customer changes, duplicate Google Ads resources, broken conversion measurement or unsafe optimization. The following controls are mandatory design inputs and do not replace the canonical Risk Framework.

## P0/P1 risk register

### R13-01 — Wrong customer CID or MCC hierarchy

Failure: a valid credential targets the wrong customer or manager relationship.

Required controls: explicit tenant/customer/MCC binding, hierarchy verification as precondition only, wrong-account negative tests and fail-closed ambiguity.

### R13-02 — Budget or currency error causes overspend

Failure: budget units, shared budgets, account currency or time horizon are misinterpreted.

Required controls: explicit currency/unit/scope/horizon, ceiling validation and execution-time current authority.

### R13-03 — Duplicate mutation after timeout or quota interruption

Failure: a create/update is repeated because local response was ambiguous.

Required controls: idempotency context, `EXECUTION_UNCERTAIN`, provider readback and reconcile-before-retry.

### R13-04 — Paused staging unexpectedly serves

Failure: a resource intended for staging begins serving/billing.

Required controls: paused/non-serving-first where supported, explicit provider readback and separate enable/activation authority.

### R13-05 — Account verification becomes permission

Failure: valid customer hierarchy, credentials or successful read is treated as write authority.

Required controls: strict W08 verification versus W02/W07 authority separation.

### R13-06 — Stale or incorrect conversion configuration

Failure: Search/PMax optimization is planned against missing, obsolete or incompatible conversion actions.

Required controls: prerequisite freshness/provenance and fail-closed validation before dependent execution.

### R13-07 — PMax partial resource creation is flattened to success

Failure: some assets/asset groups mutate while others fail.

Required controls: per-target receipts/readback, explicit partial/uncertain state and reconciliation before follow-up writes.

### R13-08 — Shared budget or bid strategy widens impact unexpectedly

Failure: a mutation affects more campaigns than the apparent target.

Required controls: dependency/resource scope inspection, explicit financial blast radius and current approval for shared-resource changes.

### R13-09 — Optimization recommendation self-authorizes spend

Failure: model confidence or observed performance raises budget/bid, expands targets or enables serving.

Required controls: recommendations remain non-authoritative and financial changes require current explicit scope.

### R13-10 — Provider IDs become canonical Aurora identity

Failure: CID/MCC/campaign/asset/conversion IDs contaminate canonical tenant/entity identity.

Required controls: opaque provider refs through W08 mapping only.

### R13-11 — Secret or developer-token leakage

Failure: OAuth secret, refresh token, developer token or private provider payload enters logs/evidence/context.

Required controls: credential references only, secret/sensitive-file scans and sanitized evidence.

### R13-12 — Quota/rate-limit retry storm

Failure: retries multiply mutations or create excessive provider pressure.

Required controls: W08 quota/health semantics, bounded retries, idempotency and reconciliation after ambiguous writes.

### R13-13 — n8n absence is replaced with invented coverage

Failure: a nonexistent Google Ads workflow capability is assumed from generic corpus patterns.

Required controls: explicit zero-real-Google-Ads corpus statement; no capability claim without canonical implementation/evidence.

### R13-14 — TOCA reference copied as authority

Failure: reusable client/account-verifier behavior is imported without Aurora ownership, provenance or current policy boundaries.

Required controls: semantic re-specification, source SHA/provenance and explicit W02/W07/W08 boundaries.

### R13-15 — Delayed attribution is treated as causal certainty

Failure: incomplete conversion/performance data triggers irreversible financial mutation.

Required controls: freshness/provenance, uncertainty disclosure, bounded recommendation and separate authority.

### R13-16 — Test/staging causes a billable side effect

Failure: non-production validation targets a real account or serving resource.

Required controls: mocks/safe staging bindings, no-real-side-effect tests and explicit account/environment fencing.

## Acceptance expectations

Risk Gates A-D on the exact W13-00 candidate must confirm that this governance freeze creates no provider side effect, duplicates no W02/W07/W08 truth, does not invent n8n Google Ads coverage, preserves financial/account safety and leaves descendant publication barriers closed until their live dependencies and exact-head acceptance evidence pass.