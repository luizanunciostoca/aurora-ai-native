# W08 — Provider Contract & Publication Freeze

Status: `W08_00_BUILD_CANDIDATE / CONTRACT_FREEZE`
Date: 2026-09-02
Base exact main at branch creation: `5715ffa4e9d4cd628c1f6d4d6e7a3410ea3d5324`

## Purpose

Freeze the semantic interface that W08 descendants must implement without creating a parallel execution, authority, identity, capability or device model.

This document specifies obligations, not a permission to publish new shared TypeScript contracts before their owner/integration task is accepted.

## 1. Provider target binding

Every provider operation must resolve an explicit binding containing enough information to prove:

- Aurora tenant identity;
- provider family / implementation;
- external account or principal reference when the provider requires one;
- external target/resource reference when applicable;
- compatibility with the W07 `ExecutionTargetReference` whose `kind` is `PROVIDER`;
- binding/version state needed to reject stale, ambiguous or cross-tenant mappings.

The binding must fail closed on tenant/account/provider mismatch. Possession of a syntactically valid provider ID or a verified account is only a precondition; it is never execution authority.

## 2. Credential boundary

Credentials are represented outside business/execution evidence by an opaque secret reference. The resolver must:

- resolve only within explicit tenant/provider/account context;
- reject wrong-tenant, revoked, expired, missing or incompatible credential state;
- support rotation/revocation awareness where the provider/backend permits it;
- return only the minimum transient credential material required by the provider client;
- prevent plaintext secret persistence in repository, logs, cache/context, tests, ActionIntent, Receipt, Evidence, PolicyToken, OwnerDecision or Drive governance.

Secret reference validity does not satisfy W02 authority or W07 execution gates.

## 3. Read contract

A W08 read adapter must be non-mutating and return normalized observations with, as applicable:

- tenant/provider/account binding reference;
- correlation reference;
- external resource reference;
- provider response/revision token or equivalent;
- pagination/cursor metadata;
- freshness/observed-at timestamp;
- provenance/source metadata;
- rate-limit/quota observation;
- normalized provider error state.

A read method with provider semantics that can mutate external state is prohibited from the read surface even if a vendor SDK names it as a read-like operation.

## 4. Governed write transport contract

A W08 write transport is an internal execution adapter below W07. It must consume, directly or through a compatibility-safe execution frame:

- resolved `PROVIDER` target binding;
- tenant and correlation context;
- current W07/W02 authority validation outcome required for that execution;
- idempotency key / execution identity;
- provider-specific preconditions or version checks when supported;
- operation payload already selected by the owning domain wave;
- safe mode/staging/paused/no-op metadata when the provider supports it.

It must return a normalized transport result that is sufficient to decide whether readback is required. It must not expose a public business-command API for planner/router/model callers.

## 5. Health, quota and retry metadata

W08-E operational observations distinguish at least:

- healthy/ready observation;
- provider authentication failure;
- credential unavailable/revoked;
- account binding mismatch;
- throttling/rate limit with retry-after where available;
- quota exhaustion;
- provider outage;
- transient transport failure;
- permanent provider rejection.

These are precondition/operational facts. They do not decide whether an action may happen.

Retry metadata is advisory to the governed execution/reconciliation path. It cannot override idempotency, authority, financial or policy constraints.

## 6. Readback and reconciliation contract

For writes where provider acceptance does not prove durable final state, W08-F must provide a readback path capable of returning:

- observed external resource/state;
- observed-at/freshness metadata;
- provider revision/reference where available;
- binding/account confirmation;
- comparison data needed by W07 reconciliation;
- explicit eventual-consistency, not-found, conflict or mismatch state.

### Reconcile-before-retry rule

If a write can have taken effect but its result is unknown, timeout/connection failure/ambiguous provider response must be classified as `AMBIGUOUS_WRITE`/execution uncertainty. Automatic blind retry is prohibited. The next safe action is readback/reconciliation using the original target, correlation and idempotency context. Retry is permitted only after reconciliation establishes that retry will not duplicate or widen the requested side effect.

## 7. Normalized provider error taxonomy

The W08 foundation freezes these normalized categories:

| Category | Meaning / handling constraint |
| --- | --- |
| `PROVIDER_AUTHENTICATION_FAILED` | provider authentication/session rejected; not Aurora authority denial |
| `SECRET_UNAVAILABLE` | credential reference cannot currently resolve |
| `SECRET_REVOKED` | credential revoked/invalidated |
| `ACCOUNT_BINDING_MISMATCH` | tenant/provider/account/target binding mismatch; fail closed |
| `RATE_LIMITED` | provider throttling; preserve retry metadata |
| `QUOTA_EXHAUSTED` | provider quota/usage ceiling reached |
| `PROVIDER_OUTAGE` | provider unavailable/degraded |
| `TRANSIENT_TRANSPORT_FAILURE` | transport failure known not to prove write success |
| `PERMANENT_REQUEST_REJECTED` | provider rejected request as non-retryable without changed input/state |
| `NOT_FOUND` | external resource absent at observation time |
| `CONFLICT` | provider-side state/precondition conflict |
| `AMBIGUOUS_WRITE` | write may have occurred; reconcile before retry |
| `EVENTUAL_CONSISTENCY_PENDING` | expected provider state not yet observable within current readback window |
| `READBACK_MISMATCH` | observed state differs from intended/accepted transport state |

Later provider-specific codes map into this taxonomy without changing its authority meaning.

## 8. Provider capability publication

W08 may describe provider support for an existing W04 capability, but:

- capability identity/definition remains W04-owned;
- provider support is a binding/implementation fact, not the capability source of truth;
- account/credential/health verification is not capability authority;
- a provider binding cannot widen a CapabilityPlan;
- W08-G is the integration owner for any capability-binding publication required by provider foundation acceptance.

## 9. Safe staging contract

Provider integration acceptance defaults to non-production side effects. Use, in priority order, provider mocks, contract fixtures, official sandbox/test accounts, no-op/dry-run APIs, paused/non-serving resource creation, or otherwise reversible staging. Any real external production mutation requires later explicit release/authority governance and is not granted by W08-00.

Fixtures must contain no real secrets or production account identifiers unless separately governed and redacted from repository/evidence.

## 10. Publication barriers

A provider implementation cannot be published as a W08 accepted dependency until applicable checks prove:

1. exact tenant/provider/account/target isolation;
2. opaque credential resolution and secret-leak negative tests;
3. read/non-mutation boundary;
4. W07-only write reachability and no public bypass from planner/router/model/domain layers;
5. idempotency/preconditions/correlation propagation;
6. health/rate-limit/quota normalization without authority inference;
7. ambiguous-write classification and reconcile-before-retry;
8. readback mismatch/eventual consistency handling;
9. provider external IDs stay external references;
10. safe mocks/staging and no unauthorized production activation;
11. W04 capability source-of-truth preservation;
12. exact-head Quality + Test Build + Security plus Risk Gates A-D and independent acceptance.

## 11. Provider family minimum expectations

- Instagram/Meta Social: publish/readback, comments/DM read surfaces, account binding, pagination/rate-limit/error semantics. W11 owns publication/community decisions.
- Meta Ads: account/business/ad-account binding, read/write/readback, throttling/quota/financially relevant transport facts. W12 owns campaign/spend decisions and approvals.
- Google Ads: customer/MCC/account binding, read/write/readback, partial mutation/quota/error semantics. W13 owns campaign/search/PMax/Display/YouTube/keyword/conversion decisions.

No provider family may introduce a direct execution path around W07.