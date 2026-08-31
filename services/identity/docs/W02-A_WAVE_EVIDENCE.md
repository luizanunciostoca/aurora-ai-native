# W02-A_WAVE_EVIDENCE

Date: 2026-08-31
Wave: W02-A — Identity Resolution Contracts & Runtime
Branch: `wave/02a-identity-resolution`
Baseline main SHA: `b61ba0d8370619678e697e12c00514ea7c5847b4`
Implementation snapshot before evidence docs: `040719adcd7893c414f6b0a39fe44c4adf0acaaa`
PR: #38

## Implemented

- Canonical `IdentityResolutionRequest`, `IdentityResolutionResult`, `IdentityResolutionStatus` and `IdentityResolutionEvidence`.
- Read-only `IdentityResolutionRecord` for resolver lookup only; explicitly not W02-B tenant-binding authority.
- Deterministic resolver for canonical and external/provider identity references.
- Canonical W01 `IdentityId`, `TenantId`, `ActorRef`, `SubjectRef`, `ExternalIdentityRef`, `ContractVersion`, `CorrelationId` and `CanonicalError` reused without redefinition.
- Provider external identifiers never become canonical `IdentityId`.
- Tenant mismatch fails closed.
- Ambiguity fails closed.
- Identity kind mismatch fails closed.
- Evidence always encodes `authorityGranted: false`.
- Clock is injected, making replay deterministic for equivalent records, request and clock snapshot.
- No Policy Engine, identity graph persistence, credentials, provider writes or authority minting.

## Tests implemented

Runtime tests cover canonical identity, external binding, unknown identity, ambiguity, cross-tenant misuse, expected-kind mismatch, external-ID/canonical-ID separation, no implicit authority and deterministic replay.

Schema tests cover canonical request parsing, malformed external reference rejection and unsupported identity-kind rejection.

## Identity kinds

W01 canonical kinds are preserved: HUMAN, AGENT, SERVICE and SYSTEM. Agent/profile resolution uses canonical AGENT semantics; no parallel PROFILE identity kind is introduced.

## Gates

GitHub workflow configuration requires `npm ci`, format check, lint, typecheck and quality on pull requests. At evidence creation, GitHub had not yet published a workflow run/status for PR #38, so gate status remains PENDING and is not represented as PASS.

## Scope integrity

All production changes are confined to W02-A exclusive leaf paths under `packages/contracts/src/identity-resolution/**`, `packages/schemas/src/identity-resolution/**` and `services/identity/**`. Shared W01 sources, root manifests, shared barrels/export maps and Policy Engine surfaces were not modified.
