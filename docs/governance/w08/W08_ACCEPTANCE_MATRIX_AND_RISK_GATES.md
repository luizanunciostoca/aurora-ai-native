# W08 — Acceptance Matrix & Risk Gates

Status: `W08_00_RECONCILED_BUILD_CANDIDATE / ACCEPTANCE_FROZEN`
Date: 2026-09-02
Base exact main at branch creation: `5d7feaeb095c35c748fe7ec17ae9d1d39b3cfbcc`
Supersedes historical candidate: PR `#236` / HEAD `1fb765cd82a40f3a07522614b9b60c6be846e4b0`

## Global Definition of Done

Every W08 BUILD candidate must satisfy applicable items on the same exact final HEAD:

- dependency acceptance revalidated against live main;
- ownership/path fence respected;
- deterministic positive/negative/boundary tests proportional to the task;
- tenant/account/provider isolation tests where applicable;
- cleanup, duplicate-source-of-truth and scope-leak audit;
- no plaintext secret or production credential in repository/evidence;
- Quality `SUCCESS`;
- Test Build `SUCCESS`;
- Security `SUCCESS`;
- Risk Gates A-D recorded as exact-head technical COMMENT evidence;
- no unresolved blockers or review threads;
- immediate live-main and candidate-head revalidation;
- merge fenced with the exact expected HEAD;
- post-merge exact-main Quality + Test Build + Security before lifecycle acceptance.

A successful provider SDK response, healthy account, valid credential, green CI or technical COMMENT alone is insufficient acceptance. Only post-merge verified main plus the owning task's `aurora:accepted` state releases descendants.

## W08-00 — Coordination / Contract / Ownership Freeze

Must prove:

- accepted W07-H generic target/executor boundary was revalidated on live main;
- W04 capability source-of-truth ownership is preserved;
- provider inventory for W11-W13 is bounded without inventing domain authority;
- W08 internal DAG and exclusive leaves are frozen;
- read/write/credential/health/readback semantics and normalized errors are frozen;
- reconcile-before-retry and publication barriers are explicit;
- premortem covers wrong account, credential leakage, duplicate mutation, quota/rate limit, external ambiguity and authority bypass;
- diff remains governance-only and creates no provider runtime/shared-contract truth.

Acceptance of W08-00 releases W08-A and W08-B only.

## W08-A — Provider Binding & External Identity/ID Mapping

Must prove:

- provider binding reference remains distinct from canonical Aurora entity IDs;
- explicit tenant/provider/account/target matching;
- wrong-account, cross-tenant, stale/ambiguous binding fail closed;
- provider verification is metadata/precondition only;
- compatibility with W07 `PROVIDER` target semantics;
- no credential material in binding objects.

## W08-B — SecretReference & Credential Boundary

Must prove:

- opaque SecretReference/credential resolver boundary;
- tenant/provider/account-bound lookup;
- missing/revoked/expired/wrong-tenant credential rejection;
- rotation/revocation-aware behavior where supported;
- secret-leak negative scan across serialized contracts, logs, context/cache, fixtures and evidence;
- no credential/secret state interpreted as authority.

## W08-C — Read Adapter Foundation

Must prove:

- read-only adapter interface and normalized result/error mapping;
- no external mutation from public read methods;
- correlation, tenant/account/provider and provenance propagation;
- pagination, freshness and rate-limit observations where applicable;
- deterministic safe mocks/contract fixtures;
- account/tenant isolation on every read path.

## W08-D — Governed Write Transport

Must prove:

- write transport reachable only from the governed W07 execution path;
- planner/router/model/domain layers cannot call a public bypass API;
- idempotency, preconditions, correlation and resolved target binding preserved;
- safe/paused/no-op/staging behavior used where supported;
- ambiguous outcomes never reported as verified success;
- provider response cannot mint or widen authority.

## W08-E — Health, Rate Limits, Quotas & Retry Metadata

Must prove:

- provider authentication, outage, quota exhaustion, throttling and transient failure are distinguished;
- retry-after/backoff metadata preserved without making business-policy decisions;
- provider health/readiness remains precondition metadata;
- degradation simulations cover deterministic provider states;
- no healthy/verified provider can bypass W02/W07 authority, idempotency or financial constraints.

## W08-F — Readback & Reconciliation Adapters

Must prove:

- write outcome readback sufficient for W07 reconciliation;
- eventual consistency, missing resource, duplicate/ambiguous result and delayed state are explicit;
- `AMBIGUOUS_WRITE` invokes reconcile-before-retry;
- late readback and mismatch scenarios do not duplicate side effects;
- transport acceptance is not silently converted to verified business outcome.

## W08-G — Safe Mocks, Staging, Capability Bindings & Integration

Must prove:

- representative provider flows traverse W07 into W08 with no unsafe production side effects;
- provider capabilities bind to existing W04 capability truth rather than redefining it;
- no credential leakage in integration evidence;
- wrong account, expired auth, rate limit, quota, timeout and ambiguous-write scenarios are exercised;
- publication handoff explicitly names supported/unsupported provider operations;
- all four Risk Gates and exact-head CI pass on final integration HEAD;
- exact merged main is reverified before W08-G releases downstream provider consumption.

## Risk Gate A — Architecture / Source-of-Truth

PASS requires:

- no second Policy Engine/authority token;
- no second capability registry;
- no second generic executor/target taxonomy;
- no provider-derived canonical entity IDs;
- no provider-as-device conflation;
- no fork of accepted W06 context/cache semantics;
- no W11-W13 business logic in W08;
- no direct TOCA runtime import unless separately provenance/license-approved and semantically reconciled.

## Risk Gate B — Security / Tenant / Credentials

PASS requires:

- fail-closed tenant/provider/account binding;
- no plaintext secrets in source, config, fixtures, logs, context/cache, contracts or evidence;
- credential resolver minimum-access boundary;
- provider account/auth verification never used as Aurora authority;
- adversarial wrong-account/cross-tenant and credential-revocation tests proportional to the task.

## Risk Gate C — Execution Safety / Failure Containment

PASS requires:

- no write bypass around W07;
- idempotency/preconditions preserved;
- ambiguous writes classified as uncertain;
- reconcile-before-retry proven;
- rate-limit/quota/outage handling bounded;
- circuit-breaker/kill-switch/failure containment remains W07-owned and consumable;
- safe staging/no-op/paused path for acceptance where possible.

## Risk Gate D — Evidence / Compatibility / Operability

PASS requires:

- exact final HEAD for required evidence;
- provider errors/observations normalized without erasing safe raw provenance;
- compatibility at shared publication surfaces reviewed by the owner;
- unsupported provider semantics recorded explicitly rather than inferred;
- cleanup/source-of-truth audit contains no stale temporary diagnostics or duplicate contracts;
- downstream handoff names exact accepted merge/main SHA and supported provider capability bindings.

## Kill criteria

A W08 candidate is rejected or returned to BUILD if any of the following is found:

- plaintext credential/secret in repository/evidence;
- direct planner/router/model external write path;
- provider/account verification interpreted as authority;
- cross-tenant/account ambiguity that fails permissively;
- blind retry of an externally ambiguous write;
- provider transport presented as a second generic executor;
- provider-specific capability definition replacing W04 truth;
- W08 code implementing W11/W12/W13 decisions or W14/W15 device runtime;
- CI/risk evidence attached to a stale/non-final HEAD;
- Risk A-D COMMENT misrepresented as GitHub self-APPROVE;
- downstream release before post-merge exact-main Q/TB/S and `aurora:accepted`.
