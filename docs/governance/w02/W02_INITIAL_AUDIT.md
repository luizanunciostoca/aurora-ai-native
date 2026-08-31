# W02 Initial Audit — Aurora AI-Native

Date: 2026-08-31  
Authority: CHAT W02 PROGRAM COORDINATOR  
Status: `COMPLETE_FOR_COORDINATION_BASELINE`  
Exact audited main/base SHA: `eb46df1c3a1ab98a6ad6d091178091cb880a70e7`

## Authority

- Manual: `AURORA_AI_NATIVE_MANUAL_TECNICO_DESENVOLVEDOR_v0.4_ADAPTIVE_INTELLIGENCE`
- Plan: `AURORA_AI_NATIVE_W02_W20_UPDATED_ACTION_PLAN_v0.4`
- ADR: `ADR-001_ADAPTIVE_INTELLIGENCE_COMPUTE_EFFICIENCY_ARCHITECTURE`
- W01: `COMPLETE / ACCEPTED`, final integration PR #34.

## Live audit

- `main` was revalidated at the exact expected W01 accepted SHA; no baseline drift was found.
- `packages/contracts` contains the canonical W01 shared IDs, propagation/context primitives, authority contracts and result semantics.
- `packages/schemas` mirrors the canonical W01 runtime schemas, including context/policy validation.
- `packages/registries` currently provides ID/versioning foundations; there is no W02 policy registry yet.
- `packages/policy` does not exist at baseline.
- `services/policy` does not exist at baseline.
- Existing service directories are scaffold/domain surfaces; none is a canonical W02 policy authority.
- `reference/original-manus`, `apps/aurora-desktop/legacy-reference` and `services/agent-runtime/legacy-manus-reference` are legacy/reference-only and may not become authority or canonical W02 runtime dependencies.

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

W01 `OwnerDecision` and `PolicyToken` intentionally carry `AuthoritySubjectReference` on the wire. W02 identity resolution may resolve canonical `SubjectRef`, but authority validation must bridge/compare those explicitly. W02 must not silently replace the W01 wire type or create a second `SubjectRef`.

## Classification

- W01 contracts/schemas: `ACTIVE_CANONICAL`.
- Legacy Manus/reference trees: `LEGACY_REFERENCE_ONLY`, read-only.
- Existing non-W02 services: `SCAFFOLD/NON_CANONICAL_FOR_W02` for authority purposes.
- `packages/policy` and `services/policy`: `MISSING_W02_TARGETS`, not competing implementations.
- No competing canonical implementation of the frozen W01 names was found in the audited canonical package surfaces.

## Governance drift

Drive `MASTER_WAVE_REGISTRY` already records W01 accepted and W02 READY. The global historical `OWNERSHIP_LOCKS` document still ends with a W01 activation section even though the canonical W01 lock document later closes/releases W01 locks. W02-00 therefore must append the W02 activation/current-state block and make the release state unambiguous.

## Coordinator decisions

- Deny by default and least authority are hard invariants.
- Intelligence/model confidence cannot create or increase permission.
- Deterministic policy evaluation belongs to a pure W02 policy core, without W03 persistence or provider side effects.
- Shared package barrels/manifests/root integration stay serialized under coordinator ownership; A/B/C receive disjoint leaf paths.
- W03 persistence/event backbone, W04 planning/Goal Graph, W05 router/confidence and W06 context/cache/speculation remain out of scope.

## Result

W02 baseline is suitable for coordinated implementation. There are no technical blockers to releasing W02-A/B/C after this W02-00 coordination change is accepted; W02-D/E/F/G remain dependency-gated by the publication DAG.
