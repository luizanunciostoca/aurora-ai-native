# W08 — Provider Contract & Publication Freeze

Status: `W08_00_RECONCILED_BUILD_CANDIDATE / CONTRACT_FREEZE`
Date: 2026-09-02
Base exact main at branch creation: `5d7feaeb095c35c748fe7ec17ae9d1d39b3cfbcc`
Supersedes historical candidate: PR `#236` / HEAD `1fb765cd82a40f3a07522614b9b60c6be846e4b0`

## Purpose

Freeze the semantic interface that W08 descendants must implement without creating a parallel execution, authority, identity, capability, context or device model.

This document defines obligations. It is not permission to publish shared TypeScript contracts before the owning descendant/integration task is accepted.

## 1. Provider target binding

Every provider operation must resolve an explicit binding sufficient to prove:

- Aurora tenant identity;
- provider family / implementation;
- external account or principal reference where required;
- external target/resource reference where applicable;
- compatibility with W07 `ExecutionTargetReference(kind = PROVIDER)`;
- binding/version state needed to reject stale, ambiguous, wrong-account or cross-tenant mappings.

Possession of a provider ID, account verification or syntactically valid target is only precondition metadata and never execution authority.

## 2. Credential boundary

Credentials are represented outside business/execution evidence by opaque SecretReference-style metadata. The W08-B resolver must:

- resolve only within explicit tenant/provider/account context;
- reject wrong-tenant, revoked, expired, missing or incompatible credential state;
- support rotation/revocation awareness where the provider/backend permits it;
- expose only the minimum transient material required by the provider client;
- prohibit plaintext secret persistence in source, config, logs, cache/context, tests, ActionIntent, Receipt, Evidence, PolicyToken, OwnerDecision and governance.

Secret-reference validity cannot satisfy W02 authority or W07 execution gates.

## 3. Read contract

A W08 read adapter is non-mutating and returns normalized observations with, as applicable:

- tenant/provider/account binding reference;
- correlation reference;
- external resource reference;
- provider revision/response token;
- pagination/cursor metadata;
- freshness/observed-at timestamp;
- provenance/source metadata;
- rate-limit/quota observations;
- normalized provider error state.

A provider operation capable of external mutation is prohibited from the read surface even if a vendor SDK names it as read-like.

## 4. Governed write transport

A W08 write transport is an internal provider adapter below W07. It consumes, directly or through a compatibility-safe frame:

- resolved `PROVIDER` target binding;
- tenant and correlation context;
- current W07/W02 validation outcome required for the execution;
- idempotency/execution identity;
- provider preconditions/version checks where supported;
- operation payload already selected by the owning domain wave;
- safe mode/staging/paused/no-op metadata where supported.

It returns a normalized transport result sufficient to determine whether readback is required. It must not expose a planner/router/model business-command bypass.

## 5. Health, quota and retry metadata

W08-E distinguishes at least:

- healthy/ready observation;
- provider authentication failure;
- credential unavailable/revoked;
- account binding mismatch;
- rate limiting with retry-after where available;
- quota exhaustion;
- provider outage;
- transient transport failure;
- permanent provider rejection.

These are operational facts, not authorization decisions. Retry metadata cannot override idempotency, authority, policy, financial or reconciliation constraints.

## 6. Readback and reconciliation

For writes whose transport response does not prove durable final state, W08-F provides readback capable of returning:

- observed external resource/state;
- observed-at/freshness metadata;
- provider revision/reference where available;
- binding/account confirmation;
- comparison data needed by W07 reconciliation;
- explicit eventual-consistency, not-found, conflict or mismatch state.

### Reconcile-before-retry

If a write may have taken effect but its result is unknown, timeout/connection loss/ambiguous response becomes `AMBIGUOUS_WRITE` / execution uncertainty. Automatic blind retry is prohibited. Readback/reconciliation must use the original target, correlation and idempotency context. Retry is eligible only after reconciliation proves it will not duplicate or widen the side effect and all current W07 safeguards are satisfied again.

## 7. Normalized provider error taxonomy

| Category | Meaning / handling constraint |
| --- | --- |
| `PROVIDER_AUTHENTICATION_FAILED` | provider authentication/session rejected; not Aurora authority denial |
| `SECRET_UNAVAILABLE` | credential reference cannot currently resolve |
| `SECRET_REVOKED` | credential revoked/invalidated |
| `ACCOUNT_BINDING_MISMATCH` | tenant/provider/account/target mismatch; fail closed |
| `RATE_LIMITED` | provider throttling; preserve retry metadata |
| `QUOTA_EXHAUSTED` | provider quota/usage ceiling reached |
| `PROVIDER_OUTAGE` | provider unavailable/degraded |
| `TRANSIENT_TRANSPORT_FAILURE` | transport failure known not to prove final write state |
| `PERMANENT_REQUEST_REJECTED` | provider rejected request as non-retryable without changed state/input |
| `NOT_FOUND` | external resource absent at observation time |
| `CONFLICT` | provider-side state/precondition conflict |
| `AMBIGUOUS_WRITE` | write may have occurred; reconcile before retry |
| `EVENTUAL_CONSISTENCY_PENDING` | expected provider state not yet observable in the current window |
| `READBACK_MISMATCH` | observed state differs from intended/transport state |

Provider-specific codes may map into this taxonomy without changing authority semantics or erasing safe raw provenance needed for diagnosis.

## 8. Provider capability publication

W08 may describe provider support for an existing W04 capability, but:

- capability identity/definition remains W04-owned;
- provider support is a binding/implementation fact;
- account/credential/health verification is not capability authority;
- a provider binding cannot widen a CapabilityPlan;
- W08-G owns provider-foundation integration publication after all prior descendants are accepted.

## 9. Context and cache boundary

Accepted W06 context, cache, snapshot and speculation outputs may later be consumed by domain/provider flows, but provider state cannot manufacture W06 freshness/trust or cache authority. Credentials and transient provider secrets are never cacheable context.

## 10. Safe staging

Provider integration acceptance defaults to non-production side effects, preferring:

1. deterministic mocks/contract fixtures;
2. official sandbox/test accounts;
3. no-op/dry-run APIs;
4. paused/non-serving resource creation;
5. otherwise reversible staging.

Any real production mutation requires later explicit release/authority governance and is not granted by W08-00. Fixtures must not contain real secrets or production account identifiers.

## 11. Publication barriers

A provider implementation cannot become an accepted W08 dependency until applicable evidence proves:

1. exact tenant/provider/account/target isolation;
2. opaque credential resolution and secret-leak negative tests;
3. read/non-mutation boundary;
4. W07-only write reachability and no planner/router/model/domain bypass;
5. idempotency/preconditions/correlation propagation;
6. health/rate-limit/quota normalization without authority inference;
7. ambiguous-write classification and reconcile-before-retry;
8. readback mismatch/eventual-consistency handling;
9. provider external IDs remain external references;
10. safe mocks/staging and no unauthorized production activation;
11. W04 capability source-of-truth preservation;
12. exact-head Quality + Test Build + Security and Risk Gates A-D;
13. expected-head merge followed by exact-main Quality + Test Build + Security before `aurora:accepted`.

## 12. Provider family minimum expectations

- Instagram/Meta Social: publish/readback, comments/DM reads, account binding, pagination/rate-limit/error semantics. W11 owns publication/community decisions.
- Meta Ads: business/ad-account binding, read/write/readback, throttling/quota/financial transport facts. W12 owns campaign/spend decisions and approvals.
- Google Ads: customer/MCC/account binding, read/write/readback, partial mutation/quota/error semantics. W13 owns campaign/search/PMax/Display/YouTube/keyword/conversion decisions.

No provider family may introduce a direct execution path around W07.
