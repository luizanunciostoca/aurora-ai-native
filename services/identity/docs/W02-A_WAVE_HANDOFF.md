# W02-A_WAVE_HANDOFF

Date: 2026-08-31
Wave: W02-A — Identity Resolution Contracts & Runtime
Branch: `wave/02a-identity-resolution`
PR: #38
Baseline main SHA: `b61ba0d8370619678e697e12c00514ea7c5847b4`

## Handoff contract

W02-A supplies deterministic identity resolution only. Consumers provide a canonical tenant, correlation, schema version and W01 `SubjectRef`; runtime returns either one canonical resolved identity or a fail-closed canonical error result with audit evidence.

### Produced

- `IdentityResolutionRequest`
- `IdentityResolutionResult`
- `IdentityResolutionStatus`
- `IdentityResolutionEvidence`
- `ResolvedIdentity`
- `IdentityResolutionRecord` as read-only lookup material
- `IdentityResolutionRequestSchema`
- `DeterministicIdentityResolver`

### Guarantees

- External/provider identity is an input binding reference, never a canonical ID substitute.
- Resolution preserves requested tenant context.
- Unknown -> `NOT_FOUND`.
- Ambiguous -> `CONFLICT` semantics and `AMBIGUOUS` resolution status.
- Cross-tenant reference -> fail closed with canonical `FORBIDDEN`.
- Expected identity-kind mismatch -> fail closed.
- Resolution never grants authority; evidence contains literal `authorityGranted: false`.
- Deterministic replay is explicit through an injected clock boundary.

### Integration boundary

Shared `@aurora/contracts` and `@aurora/schemas` public barrels/export maps remain coordinator-owned. W02-A leaf contracts/schemas must be published by the coordinator at PB1 after A/B/C acceptance. W02-D/E/F must not consume draft leaf files as if already published.

### Downstream note for W02-B

`IdentityResolutionRecord` is not a tenant authorization/binding decision. W02-B remains owner of tenant boundary and identity-to-tenant binding semantics.

### Pending before accepted merge

- official repository gates must publish green evidence on the exact PR HEAD;
- coordinator must verify exact-main rebase and no ownership collision;
- public export publication remains a coordinator barrier action;
- Drive governance copies must match the accepted GitHub state.
