# W02 Ownership Matrix — Aurora AI-Native

Date: 2026-08-31  
Authority: CHAT W02 PROGRAM COORDINATOR  
Baseline SHA: `eb46df1c3a1ab98a6ad6d091178091cb880a70e7`

## Rules

- One canonical write owner per file/path at a time.
- A/B/C may work in parallel only on disjoint leaf paths.
- D/E/F are serialized through publication barriers.
- Shared barrels/manifests/root/workspace/CI files stay coordinator-locked unless explicitly transferred.
- G receives final shared-integration ownership only after A-F publication.
- Legacy/reference trees are read-only.
- No W02 subwave may redefine `IdentityId`, `TenantId`, `ActorRef`, `SubjectRef`, `OwnerDecision`, `PolicyToken`, `AuthorityScope`, `CorrelationContext`, `CanonicalError` or `ExecutionOutcome`.

## Protected W01 sources

Read/compose; no parallel redefinition:

- `packages/contracts/src/ids/**`
- `packages/contracts/src/context/identity.ts`
- `packages/contracts/src/context/tenant.ts`
- `packages/contracts/src/context/correlation.ts`
- `packages/contracts/src/policy/authority-primitives.ts`
- `packages/contracts/src/policy/owner-decision.ts`
- `packages/contracts/src/policy/policy-token.ts`
- `packages/contracts/src/results/error-semantics.ts`
- `packages/contracts/src/results/execution-semantics.ts`
- mirrored W01 schema files
- `packages/registries/src/ids/**`
- `packages/registries/src/versioning/**`

Any corrective/additive edit requires explicit coordinator lock transfer and compatibility/regression evidence.

## Coordinator-locked shared surfaces

- `packages/contracts/src/index.ts`
- `packages/schemas/src/index.ts`
- `packages/registries/src/index.ts`
- the three shared package manifests/tsconfigs
- root `package.json`, `package-lock.json`, `tsconfig.base.json`, workspace/tooling config
- `.github/CODEOWNERS`, `.github/workflows/**`
- shared public export maps/barrels
- cross-wave dependency/version changes

Minimal publication-only changes may be performed by the coordinator between barriers.

## W02-A — Identity Resolution

**Branch:** `wave/02a-identity-resolution`  
**Status:** READY after PB0.

**Exclusive paths**

- `packages/contracts/src/identity-resolution/**`
- `packages/schemas/src/identity-resolution/**`
- `services/identity/**`

**Produces:** `IdentityResolutionRequest`, `IdentityResolutionResult`, `IdentityResolutionStatus`, `IdentityResolutionEvidence`.

**Consumes:** W01 `IdentityId`, `ActorRef`, `SubjectRef`, external identity refs, correlation/context/error/version primitives.

**Forbidden:** W01 ID/context/policy/result source edits, root/shared barrels/manifests, identity graph persistence, policy decisions, provider side effects.

**Merge prerequisites:** W02-00 accepted; exact-main rebase; leaf compile/schema/tests; no duplicate identity primitives.

## W02-B — Tenant Boundary & Identity Binding

**Branch:** `wave/02b-tenant-boundary`  
**Status:** READY after PB0.

**Exclusive paths**

- `packages/contracts/src/tenant-boundary/**`
- `packages/schemas/src/tenant-boundary/**`
- `services/tenant/**`

**Produces:** `IdentityTenantBinding`, `TenantBoundaryContext`, `TenantBoundaryCheck`, `TenantBoundaryDecision`.

**Consumes:** W01 tenant/identity/context/error primitives and published A results when needed.

**Forbidden:** new TenantId/IdentityId aliases, permissive default tenant/cross-tenant fallback, W01 source edits, policy engine/persistence, shared barrels/manifests.

**Merge prerequisites:** W02-00 accepted; any A dependency rebased before final acceptance; fail-closed tenant tests.

## W02-C — Consent, Purpose & Jurisdiction

**Branch:** `wave/02c-consent-purpose-jurisdiction`  
**Status:** READY after PB0.

**Exclusive paths**

- `packages/contracts/src/consent/**`
- `packages/schemas/src/consent/**`
- `packages/contracts/src/purpose/**`
- `packages/schemas/src/purpose/**`
- `packages/contracts/src/jurisdiction/**`
- `packages/schemas/src/jurisdiction/**`
- `packages/registries/src/consent/**`
- `packages/registries/src/purpose/**`
- `packages/registries/src/jurisdiction/**`
- `services/consent/**`

**Produces:** consent status/evidence, purpose reference/context and jurisdiction context/restriction contract families.

**Consumes:** W01 tenant/identity/correlation/version/error primitives.

**Forbidden:** W03 persistence/migrations, policy evaluator, duplicate W01 IDs/types, external writes, shared barrels/manifests.

**Merge prerequisites:** W02-00 accepted; deterministic/versioned registry semantics where introduced; schema/negative tests.

## PB1 — Coordinator publication

A/B/C must be accepted and cross-dependencies reconciled. Coordinator publishes required shared contract/schema/registry exports and verifies a consumer fixture before D is released.

## W02-D — Deterministic Policy Engine

**Branch:** `wave/02d-policy-engine`  
**Status:** `DEPENDENCY_GATED_PB1`.

**Exclusive paths after PB1**

- `packages/contracts/src/policy-engine/**`
- `packages/schemas/src/policy-engine/**`
- `packages/registries/src/policy/**`
- initial `packages/policy/**` bootstrap and deterministic evaluation implementation

**Produces:** `PolicyEvaluationRequest`, `PolicyEvaluationDecision = ALLOW | DENY | REQUIRE_APPROVAL`, `PolicyEvaluationResult`, canonical policy reason semantics.

**Consumes:** accepted A/B/C and W01 policy/context/error/version primitives.

**Forbidden:** persistence/event backbone, router/confidence/planner, provider/executor calls, redefinition of OwnerDecision states or ExecutionOutcome.

**Merge prerequisites:** PB1; deterministic replay; default-deny/conflict tests; no duplicate policy vocabulary/cycles.

## PB2 — Coordinator publication

D accepted/published; exact SHA recorded before E release.

## W02-E — PolicyToken & Authority Evaluation

**Branch:** `wave/02e-authority-validation`  
**Status:** `DEPENDENCY_GATED_PB2`.

**Exclusive paths after PB2**

- `packages/contracts/src/policy-validation/**`
- `packages/schemas/src/policy-validation/**`
- `packages/policy/src/authority/**`

**Produces:** `PolicyTokenValidationRequest/Result`, `AuthorityEvaluationRequest/Result` and canonical validation reason semantics that compose `CanonicalError`.

**Consumes:** W01 `PolicyToken`, `OwnerDecision`, `AuthorityScope`, `AuthoritySubjectReference`, `PolicyReference`; accepted A/B/C/D.

**Forbidden:** secrets/provider credentials, confidence-as-permission, persistence/provider execution, replacement authority types.

**Merge prerequisites:** PB2; full fail-closed negative matrix; explicit deterministic `SubjectRef`/`AuthoritySubjectReference` bridge tests.

## PB3 — Coordinator publication

E accepted/published; exact SHA recorded before F release.

## W02-F — Policy Query / Precheck APIs

**Branch:** `wave/02f-policy-precheck-api`  
**Status:** `DEPENDENCY_GATED_PB3`.

**Exclusive paths after PB3**

- `packages/contracts/src/policy-query/**`
- `packages/schemas/src/policy-query/**`
- `packages/policy/src/query/**`
- `services/policy/**`

**Produces:** `PolicyPrecheckRequest/Response`, `PolicyQueryRequest/Response`; responses compose D/E types and define no second decision enum.

**Consumes:** accepted A-E.

**Forbidden:** authority minting from precheck, router/lane/confidence/planner logic, provider writes, persistence/event backbone.

**Merge prerequisites:** PB3; contract/schema/API consumer tests; side-effect-free proof.

## W02-G — Integration, Security & Contract Tests

**Branch:** `wave/02g-policy-integration`  
**Status:** gated on PB4/F acceptance.

**Exclusive paths after lock transfer**

- W02 shared package/service barrels/manifests/public exports
- `packages/policy` integration tests
- `services/policy` integration/security tests
- `tools/test/w02/**` or equivalent W02 cross-system test area
- W02 consumer fixtures and Reality Gate evidence

**Consumes:** A-F.

**Forbidden:** unrelated production features; production leaf edits except minimal defect remediation with recorded rationale.

**Merge prerequisites:** A-F accepted/published; lock transfer; T1+T2 PASS; official repository gates green.

## Prohibited cross-wave targets

All W02 subwaves are prohibited from implementing W03 persistence/event backbone, W04 Goal Graph/CapabilityPlan/lanes/budgets, W05 router/reasoning/confidence, W06 context/cache/speculation and W07+ provider/executor side effects.

## Lock transfer

A transfer requires owner completion state, accepted branch HEAD/PR, dependency publication SHA and coordinator registry update. Silent ownership transfer is invalid.
