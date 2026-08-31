# W02-A_WAVE_EVIDENCE

Date: 2026-08-31
Wave: W02-A — Identity Resolution Contracts & Runtime
Branch: `wave/02a-identity-resolution`
Baseline main SHA: `b61ba0d8370619678e697e12c00514ea7c5847b4`
Validated implementation HEAD: `5fa87be3788f901f97d06ec5b345d56ee33af7f2`
PR: #38

## Implemented

- Canonical `IdentityResolutionRequest`, `IdentityResolutionResult`, `IdentityResolutionStatus` and `IdentityResolutionEvidence`.
- Request and result runtime schemas.
- Read-only `IdentityResolutionRecord` for resolver lookup only; explicitly not W02-B tenant-binding authority.
- Deterministic resolver for canonical and external/provider identity references with mandatory injected clock.
- Canonical W01 `IdentityId`, `TenantId`, `ActorRef`, `SubjectRef`, `ExternalIdentityRef`, `ContractVersion`, `CorrelationId` and `CanonicalError` reused without redefinition.
- Provider external identifiers never become canonical `IdentityId`.
- Unknown, tenant mismatch, ambiguity and identity-kind mismatch fail closed.
- Evidence structurally requires `authorityGranted: false`.
- No Policy Engine, identity graph persistence, credentials, provider writes or authority minting.

## Tests implemented

Runtime tests cover canonical identity, external binding, unknown identity, ambiguity, cross-tenant misuse, expected-kind mismatch, external-ID/canonical-ID separation, no implicit authority and deterministic replay.

Schema tests cover canonical request parsing, malformed external reference rejection, unsupported identity-kind rejection, successful result validation, authority-escalation rejection and invalid resolved candidate-count rejection.

## Identity kinds

W01 canonical kinds are preserved: HUMAN, AGENT, SERVICE and SYSTEM. Agent/profile resolution uses canonical AGENT semantics; no parallel PROFILE identity kind is introduced.

## Official gate evidence on validated implementation HEAD

- Security: PASS.
- Quality: FAIL at `npm ci`; all later quality steps skipped.
- Test Build: FAIL at `npm ci`; test/build/cleanup steps skipped.

The root `package-lock.json` does not yet contain the new `services/identity` workspace entry. W02-00 explicitly coordinator-locks the root lockfile/shared manifests/public barrels, so W02-A did not modify that surface without ownership transfer.

## Scope integrity

All production changes are confined to W02-A exclusive leaf paths under `packages/contracts/src/identity-resolution/**`, `packages/schemas/src/identity-resolution/**` and `services/identity/**`. Shared W01 sources, root manifests/lockfile, shared barrels/export maps and Policy Engine surfaces were not modified.

## Evidence decision

Implementation evidence is complete, but wave acceptance remains blocked on coordinator publication of the required root workspace/lock surface followed by green official gates on the resulting exact HEAD.
