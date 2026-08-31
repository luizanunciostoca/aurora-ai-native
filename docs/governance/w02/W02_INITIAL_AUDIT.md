# W02 Initial Audit — Aurora AI-Native

Date: 2026-08-31  
Authority: CHAT W02 PROGRAM COORDINATOR  
Status: `COMPLETE_HISTORICAL_COORDINATION_BASELINE`  
Exact audited main/base SHA: `eb46df1c3a1ab98a6ad6d091178091cb880a70e7`

> Historical-snapshot rule: this document records the W02-00 starting condition and must not be read as current program status. Current planning authority is Developer Manual v0.4.1 + ADR-001 + ADR-002, and current W02 state is maintained by the W02 charter/dependency/ownership/acceptance documents plus live Drive registries.

## Authority at the time of the audit

- Manual then-current: `AURORA_AI_NATIVE_MANUAL_TECNICO_DESENVOLVEDOR_v0.4_ADAPTIVE_INTELLIGENCE` — now historical predecessor of v0.4.1.
- Plan then-current: `AURORA_AI_NATIVE_W02_W20_UPDATED_ACTION_PLAN_v0.4` — now historical predecessor of v0.4.1.
- ADR: `ADR-001_ADAPTIVE_INTELLIGENCE_COMPUTE_EFFICIENCY_ARCHITECTURE`.
- W01: `COMPLETE / ACCEPTED`, final integration PR #34.

## Baseline audit findings

At the exact starting baseline:

- `main` matched the accepted W01 state; no baseline drift was found.
- `packages/contracts` contained canonical W01 shared IDs, context/propagation, authority and result semantics.
- `packages/schemas` mirrored canonical W01 runtime schemas.
- `packages/registries` provided ID/versioning foundations.
- `packages/policy` did not yet exist.
- `services/policy` did not yet exist.
- Existing non-W02 service directories were scaffold/domain surfaces, not canonical W02 policy authority.
- `reference/original-manus`, `apps/aurora-desktop/legacy-reference` and `services/agent-runtime/legacy-manus-reference` were legacy/reference-only and non-authoritative.

Later accepted W02-A/B/C implementation and draft W02-D work do not rewrite these baseline facts; they simply make them historical.

## Canonical W01 primitives frozen for W02

| Semantic authority | Canonical source |
|---|---|
| IdentityId, TenantId, CorrelationId, CausationId, DecisionId, PolicyTokenId | `packages/contracts/src/ids/**` |
| ActorRef, SubjectRef | `packages/contracts/src/context/identity.ts` |
| TenantContext | `packages/contracts/src/context/tenant.ts` |
| CorrelationContext | `packages/contracts/src/context/correlation.ts` |
| AuthorityScope, AuthoritySubjectReference, AuthorityConstraints, PolicyReference | `packages/contracts/src/policy/authority-primitives.ts` |
| OwnerDecision | `packages/contracts/src/policy/owner-decision.ts` |
| PolicyToken | `packages/contracts/src/policy/policy-token.ts` |
| CanonicalError | `packages/contracts/src/results/error-semantics.ts` |
| ExecutionOutcome | `packages/contracts/src/results/execution-semantics.ts` |

Mirrored W01 schemas remain canonical under `packages/schemas/src/{ids,context,policy,results,versioning}/**`.

## Compatibility observation

W01 `OwnerDecision` and `PolicyToken` intentionally carry `AuthoritySubjectReference` on the wire. W02 may resolve canonical `SubjectRef`, but authority validation must bridge/compare those explicitly. W02 must not silently replace the W01 wire type or create a second `SubjectRef`.

## Baseline classification

- W01 contracts/schemas: `ACTIVE_CANONICAL`.
- Legacy Manus/reference trees: `LEGACY_REFERENCE_ONLY`.
- Existing non-W02 services: scaffold/non-authoritative for W02 authority purposes.
- `packages/policy` and `services/policy`: missing future W02 targets at the audited baseline.
- No competing canonical implementation of the frozen W01 names was found.

## Baseline governance drift that W02-00 resolved

The global historical `OWNERSHIP_LOCKS` document still contained W01 activation text even though W01 had already closed/released its locks. W02-00 established the W02 activation/current-state block and made wave ownership explicit.

## Coordinator decisions established by this audit

- Deny by default and least authority are hard invariants.
- Intelligence/model confidence cannot create/increase permission.
- Deterministic policy evaluation belongs to a pure W02 policy core without W03 persistence/provider side effects.
- Shared package/root/publication surfaces remain serialized under coordinator ownership.
- W03 persistence/event backbone, W04 planning, W05 intelligence routing and W06 context/cache/speculation are outside W02.

## Historical result

The W02 starting baseline was suitable for coordinated implementation. W02-A/B/C were released after W02-00 and have since been accepted/merged. The current status of W02-D/E/F/G must be read from the current W02 governance documents, not from this initial snapshot.
