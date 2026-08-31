# W02-B — Tenant Boundary

Status: IMPLEMENTED_ON_SUBWAVE_BRANCH

This directory intentionally contains no workspace manifest during W02-B. Shared workspace/package integration is coordinator-owned and deferred to PB1.

Canonical implementation lives in the W02-B exclusive leaf paths:

- `packages/contracts/src/tenant-boundary/**`
- `packages/schemas/src/tenant-boundary/**`

Invariants:

- W01 `TenantId`, `IdentityId`, `CorrelationId`, `ActorRef`, `SubjectRef` are reused unchanged.
- No default tenant exists.
- Unknown, missing, malformed, ambiguous, subject-mismatched and cross-tenant access fail closed.
- A valid identity ID alone never establishes tenant membership.
- System and external identities require explicit tenant binding.
- Correlation and boundary evidence are retained for downstream authority checks.
- No persistence, Policy Engine, provider call or external side effect is implemented here.
