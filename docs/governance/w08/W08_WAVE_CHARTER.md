# W08 — Provider Adapter Foundation

Status: `W08_00_BUILD_CANDIDATE / GOVERNANCE_FREEZE`
Date: 2026-09-02
Base exact main at branch creation: `5715ffa4e9d4cd628c1f6d4d6e7a3410ea3d5324`
Task: `W08-00`

## 1. Mission

Build the provider-specific integration layer beneath Aurora's generic W07 Executor boundary, with explicit read/write separation, opaque credential references, tenant/account/provider binding, operational health/rate-limit metadata, readback/reconciliation, and safe staging.

W08 is an integration foundation. It does not own business campaign/social decisions, Policy/Authority, Android/device runtime, workflow runtime, or the canonical Capability Registry.

## 2. Canonical authority and inputs

Authority is resolved in this order:

1. live GitHub `main` and accepted exact-SHA/PR/post-merge evidence;
2. Google Drive `AURORA_AI_NATIVE_DEVELOPMENT_GOVERNANCE` operational governance/evidence;
3. accepted Developer Manual v0.5 / ADRs / wave governance;
4. reference-only legacy, n8n, and TOCA material.

Required accepted inputs at this freeze:

- W07-H accepted generic Executor integration and fault-consumer boundary;
- W07 `ExecutionTargetReference`, including `kind = PROVIDER` without credential or authority semantics;
- W04 target-neutral Capability Registry / `CapabilityPlan` ownership;
- W03 durable idempotency/event/replay foundations used by W07;
- W02 current policy/authority validation boundary used by W07;
- canonical `DEVICE_PLANE_CROSS_WAVE_OWNERSHIP` locks;
- TOCA MCP provider implementation reference pinned by Aurora governance to `luizanunciostoca/toca-mcp-server@8a6cfe055be9b34e498cfbdb481e8232dc51df05`, reference-only and `NO_DIRECT_RUNTIME_IMPORT` by default.

## 3. Provider inventory frozen for W08 foundation

Required downstream provider families:

- `INSTAGRAM_META_SOCIAL` — Instagram/Meta organic publishing, comments and messaging primitives consumed by W11;
- `META_ADS` — Meta Marketing/Ads primitives consumed by W12;
- `GOOGLE_ADS` — Google Ads primitives consumed by W13.

`GCP` patterns remain a shared-service/provider reference candidate because W08 planning sources name GCP, but this freeze does not invent an unowned W11-W13 GCP runtime requirement. A concrete GCP adapter is released only by an explicit downstream consumer and owner decision.

The inventory is a provider-family requirement, not permission to copy provider implementations or credentials.

## 4. Architectural invariants

1. W08 consumes W07 `PROVIDER` execution targets. It does not create a second generic executor or target taxonomy.
2. Provider/account verification, credential validity, health, quota availability, trust score, model confidence, cache hit, or provider response success never equals Aurora execution authority.
3. External provider IDs remain external references. They do not become new canonical Aurora entity IDs.
4. Provider is never a synonym for device. Device/runtime ownership remains W14/W15.
5. W04 remains the single Capability Registry source of truth. W08 may publish provider capability bindings only through the governed W04 integration boundary.
6. Reads must be non-mutating by contract and test.
7. External writes must be reachable only below the W07 execution boundary after current validation, target resolution, idempotency/preconditions and safeguards.
8. Credential material is resolved behind opaque references. Plaintext secrets must not appear in repository source, PolicyToken, OwnerDecision, ActionIntent, Receipt/Evidence, context/cache, templates, logs, test fixtures, or Drive governance.
9. Ambiguous external writes fail into uncertainty and require provider readback/reconciliation before any retry. Transport success alone is not verified business outcome.
10. Provider-specific business decisions stay in owner waves W11-W13; W08 transports and normalizes provider semantics only.

## 5. Frozen subwave DAG

- `W08-00` — coordination / contract / ownership / risk freeze.
- `W08-A` — provider binding and external identity/ID mapping; depends on W08-00.
- `W08-B` — SecretReference and credential boundary; depends on W08-00.
- `W08-C` — read adapter foundation; depends on W08-A + W08-B.
- `W08-D` — governed write transport; depends on W08-A + W08-B.
- `W08-E` — health, rate limits, quotas and retry metadata; depends on W08-A + W08-B.
- `W08-F` — readback and reconciliation adapters; depends on W08-C + W08-D + W08-E.
- `W08-G` — safe mocks, staging, capability bindings and integration; depends on W08-F.

No descendant BUILD is released by this candidate PR alone. W08-A/B become BUILD_READY only after W08-00 is independently accepted and merged with exact-head and post-merge gates.

## 6. Contract freeze

W08 freezes provider-facing semantics around these concepts without prematurely creating shared/root contracts:

- provider family / provider implementation identity;
- explicit tenant + provider + account + target binding;
- external resource references distinct from Aurora IDs;
- opaque secret/credential reference and resolution status;
- non-mutating read request/result with provenance, pagination and freshness metadata;
- governed write transport request/result carrying W07/W03 correlation, idempotency and preconditions;
- provider operational observation: auth state, availability, rate limit, quota and retry metadata;
- readback observation sufficient for W07 reconciliation;
- explicit external outcome states including uncertain and eventually-consistent observations.

Shared/public root publication remains Program Control-owned and must be compatibility-safe.

## 7. Provider error taxonomy

Normalized categories frozen for downstream implementation:

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

Provider authentication is deliberately named as provider authentication, not Aurora authorization.

## 8. Publication barriers

A W08 write-capable adapter cannot become generally consumable until all applicable barriers are proven:

- exact tenant/provider/account/target binding;
- current credential-reference resolution without secret leakage;
- W07-only external write entry path;
- current W02 authority/policy validation remains required at execution time;
- W03/W07 idempotency, preconditions and correlation preserved;
- provider response normalized without silently treating transport acceptance as verified outcome;
- readback/reconciliation path exists for ambiguous writes;
- reconcile-before-retry enforced for uncertainty;
- safe mocks/staging/no-op/paused mode used where provider supports it;
- provider capability bindings do not replace W04 capability truth;
- no W11-W13 business-domain semantics in W08.

## 9. Non-goals

W08-00 does not implement provider SDK calls, OAuth flows, credentials, business commands, Android/device execution, n8n workflows, domain campaign logic, policy issuance, authority evaluation, or production activation.

## 10. Acceptance rule

W08-00 acceptance requires the final exact candidate HEAD to pass Quality + Test Build + Security, cleanup/source-of-truth/scope audit, Risk Gates A-D, independent Program Control review, immediate live-main revalidation, controlled merge, and post-merge exact-main verification. The authoring identity must not self-accept or self-merge.