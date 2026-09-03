# W08 — Provider Adapter Foundation

Status: `W08_00_RECONCILED_BUILD_CANDIDATE / GOVERNANCE_FREEZE`
Date: 2026-09-02
Base exact main at branch creation: `5d7feaeb095c35c748fe7ec17ae9d1d39b3cfbcc`
Task: `W08-00`
Supersedes historical candidate: PR `#236` / HEAD `1fb765cd82a40f3a07522614b9b60c6be846e4b0`

## 1. Mission

Build the provider-specific integration layer beneath Aurora's accepted W07 Executor boundary, with explicit read/write separation, opaque credential references, tenant/account/provider binding, operational health/rate-limit metadata, readback/reconciliation and safe staging.

W08 is an integration foundation. It does not own business campaign/social decisions, Policy/Authority, Android/device runtime, workflow runtime or the canonical Capability Registry.

## 2. Canonical authority and accepted inputs

Authority is resolved in this order:

1. live GitHub `main` and accepted exact-SHA/PR/post-merge evidence;
2. accepted task labels and owning-wave governance;
3. canonical Developer Manual / ADR / risk framework;
4. reference-only TOCA, n8n and legacy material.

Required accepted inputs at this reconciliation:

- W07-H issue `#140` is closed `aurora:accepted` and owns the generic Executor integration/fault boundary;
- W07 `ExecutionTargetReference`, including `kind = PROVIDER`, remains the generic provider target boundary and carries no credential or authority semantics;
- W04 remains the target-neutral Capability Registry / `CapabilityPlan` source of truth;
- W03 remains the durable idempotency/event/replay foundation consumed through W07;
- W02 remains current policy/authority validation truth;
- device-plane ownership remains outside W08;
- TOCA MCP provider patterns remain reference-only, pinned by Aurora governance to `luizanunciostoca/toca-mcp-server@8a6cfe055be9b34e498cfbdb481e8232dc51df05`, with `NO_DIRECT_RUNTIME_IMPORT` by default.

W06 is now complete through H on live main, but W08-00 does not depend on W06 and does not reinterpret W06 context/cache semantics.

## 3. Provider inventory frozen for W08 foundation

Required downstream provider families:

- `INSTAGRAM_META_SOCIAL` — organic publishing, comments and messaging primitives consumed by W11;
- `META_ADS` — Meta Marketing/Ads primitives consumed by W12;
- `GOOGLE_ADS` — Google Ads primitives consumed by W13.

`GCP` remains a shared-service/provider reference candidate. A concrete GCP adapter is released only by an explicit accepted consumer/owner decision.

The inventory is a provider-family requirement, not permission to copy provider implementations, production account identifiers or credentials.

## 4. Architectural invariants

1. W08 consumes W07 `PROVIDER` execution targets and never creates a second generic executor or target taxonomy.
2. Provider/account verification, credential validity, health, quota availability, trust score, model confidence, cache hit or provider response success never equals Aurora execution authority.
3. External provider IDs remain external references and never become new canonical Aurora entity IDs.
4. Provider is never a synonym for device; W14/W15 retain device ownership.
5. W04 remains the only Capability Registry source of truth. W08 may bind provider implementations to accepted capabilities but cannot redefine capability semantics.
6. W08 read surfaces are non-mutating by contract and test.
7. External writes are reachable only beneath W07 after current authority/policy validation, target resolution, idempotency/preconditions and safeguards.
8. Credential material resolves behind opaque references. Plaintext secrets are prohibited in repository source, PolicyToken, OwnerDecision, ActionIntent, Receipt/Evidence, context/cache, templates, logs, fixtures and governance.
9. Ambiguous external writes remain uncertain and require readback/reconcile-before-retry. Blind retry is prohibited.
10. Provider-specific business decisions stay in W11-W13; W08 transports and normalizes provider semantics only.

## 5. Frozen subwave DAG

- `W08-00` — coordination / contract / ownership / risk freeze.
- `W08-A` — provider binding and external identity/ID mapping; depends on W08-00.
- `W08-B` — SecretReference and credential boundary; depends on W08-00.
- `W08-C` — read adapter foundation; depends on W08-A + W08-B.
- `W08-D` — governed write transport; depends on W08-A + W08-B.
- `W08-E` — health, rate limits, quotas and retry metadata; depends on W08-A + W08-B.
- `W08-F` — readback and reconciliation adapters; depends on W08-C + W08-D + W08-E.
- `W08-G` — safe mocks, staging, capability bindings and integration; depends on W08-F.

No descendant BUILD is released by an open W08-00 PR. W08-A/B become BUILD_READY only after W08-00 reaches `aurora:accepted` on live main.

## 6. Contract freeze

W08 freezes provider-facing semantics around:

- provider family / implementation identity;
- explicit tenant + provider + account + target binding;
- external resource references distinct from Aurora IDs;
- opaque SecretReference / credential resolution state;
- non-mutating read request/result with provenance, pagination and freshness metadata;
- governed write transport carrying W07/W03 correlation, idempotency and preconditions;
- provider operational observations for auth, availability, rate limit, quota and retry metadata;
- readback observations sufficient for W07 reconciliation;
- explicit uncertain/eventually-consistent provider outcomes.

Shared/public root publication remains coordinator/Program Control-owned and must be compatibility-safe.

## 7. Normalized provider error taxonomy

W08 descendants normalize at least:

- `PROVIDER_AUTHENTICATION_FAILED`
- `SECRET_UNAVAILABLE`
- `SECRET_REVOKED`
- `ACCOUNT_BINDING_MISMATCH`
- `RATE_LIMITED`
- `QUOTA_EXHAUSTED`
- `PROVIDER_OUTAGE`
- `TRANSIENT_TRANSPORT_FAILURE`
- `PERMANENT_REQUEST_REJECTED`
- `NOT_FOUND`
- `CONFLICT`
- `AMBIGUOUS_WRITE`
- `EVENTUAL_CONSISTENCY_PENDING`
- `READBACK_MISMATCH`

Provider authentication is provider state, not Aurora authorization.

## 8. Publication barriers

A write-capable provider adapter cannot become an accepted dependency until applicable evidence proves:

- exact tenant/provider/account/target binding;
- current credential-reference resolution without secret persistence;
- W07-only write reachability;
- current W02 authority/policy validation remains required at execution time;
- W03/W07 idempotency, preconditions and correlation are preserved;
- provider transport acceptance is not silently promoted to verified business outcome;
- readback/reconciliation exists for ambiguous writes;
- reconcile-before-retry is enforced;
- safe mock/sandbox/no-op/paused staging is used where available;
- provider capability bindings preserve W04 truth;
- no W11-W13 domain policy is implemented in W08.

## 9. Non-goals

W08-00 does not implement provider SDK calls, OAuth flows, production credentials, business commands, Android/device execution, n8n workflows, campaign logic, policy issuance, authority evaluation or production activation.

## 10. Acceptance rule

W08-00 follows the current Single-Owner Governed Acceptance path already evidenced on live main:

1. final exact candidate HEAD passes Quality + Test Build + Security;
2. cleanup/source-of-truth/scope audit is clean;
3. Risk Gates A-D are recorded as exact-head technical COMMENT evidence, never as a GitHub self-APPROVE event;
4. live main and candidate HEAD are immediately revalidated;
5. merge uses `expected_head_sha` and fails closed on drift;
6. exact merged main passes post-merge Quality + Test Build + Security;
7. only then may issue `#108` become `aurora:accepted` and release W08-A/B.
