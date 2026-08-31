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

Minimal publication-only changes may be performed by the coordinator between barriers. PB1 publication is complete, but this did not transfer future shared-surface ownership to W02-D.

## W02-A — Identity Resolution

**Canonical acceptance branch:** `wave/02a-pb1-convergence`  
**Status:** `COMPLETE_ACCEPTED_MERGED` via PR #39. PR #38 is superseded historical evidence.

**Former exclusive paths — leaf lock closed after acceptance**

- `packages/contracts/src/identity-resolution/**`
- `packages/schemas/src/identity-resolution/**`
- `services/identity/**`

**Produces:** `IdentityResolutionRequest`, `IdentityResolutionResult`, `IdentityResolutionStatus`, `IdentityResolutionEvidence`.

**Consumes:** W01 `IdentityId`, `ActorRef`, `SubjectRef`, external identity refs, correlation/context/error/version primitives.

**Forbidden:** W01 ID/context/policy/result source edits, root/shared barrels/manifests, identity graph persistence, policy decisions, provider side effects.

**Accepted evidence:** head `4f84f20a1285ec3727591ed2ad89f90a9f988f1d`; PB1 technical main `b48953cd4a7913e154fe2804248217ffe0c0952d`; exact-head and post-merge gates green.

## W02-B — Tenant Boundary & Identity Binding

**Branch:** `wave/02b-tenant-boundary`  
**Status:** `COMPLETE_ACCEPTED_MERGED` via PR #37; leaf lock closed/released.

**Former exclusive paths**

- `packages/contracts/src/tenant-boundary/**`
- `packages/schemas/src/tenant-boundary/**`
- `services/tenant/**`

**Produces:** `IdentityTenantBinding`, `TenantBoundaryContext`, `TenantBoundaryCheck`, `TenantBoundaryDecision`.

**Consumes:** W01 tenant/identity/context/error primitives and published A results when needed.

**Forbidden:** new TenantId/IdentityId aliases, permissive default tenant/cross-tenant fallback, W01 source edits, policy engine/persistence, shared barrels/manifests.

## W02-C — Consent, Purpose & Jurisdiction

**Branch:** `wave/02c-consent-purpose-jurisdiction`  
**Status:** `COMPLETE_ACCEPTED_MERGED` via PR #36; leaf lock closed/released.

**Former exclusive paths**

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

## PB1 — Coordinator publication

**Status:** `COMPLETE_RELEASED` on technical acceptance main `b48953cd4a7913e154fe2804248217ffe0c0952d`.

A/B/C are accepted and cross-dependencies reconciled. Coordinator regenerated the root lockfile, published the required A/B/C contract/schema public subpaths and verified the consumer fixture. This releases W02-D implementation ownership only for the frozen D leaf scope below. Shared/root publication surfaces remain coordinator-owned.

## W02-D — Deterministic Policy Engine

**Branch:** `wave/02d-policy-engine`  
**Status:** `READY` — ownership released by PB1.

**Active exclusive paths after PB1**

- `packages/contracts/src/policy-engine/**`
- `packages/schemas/src/policy-engine/**`
- `packages/registries/src/policy/**`
- initial `packages/policy/**` bootstrap and deterministic evaluation implementation

**Produces:** `PolicyEvaluationRequest`, `PolicyEvaluationDecision = ALLOW | DENY | REQUIRE_APPROVAL`, `PolicyEvaluationResult`, canonical policy reason semantics.

**Consumes:** accepted/published A/B/C and W01 policy/context/error/version primitives.

**Forbidden:** persistence/event backbone, router/confidence/planner, provider/executor calls, redefinition of OwnerDecision states or ExecutionOutcome, edits to accepted A/B/C leaf files, or shared/root publication files without explicit coordinator transfer.

**Merge prerequisites:** deterministic replay; default-deny/conflict tests; no duplicate policy vocabulary/cycles; exact-main revalidation. PB2 is not implied by D implementation and remains coordinator-controlled after D acceptance.

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

## Current release state

- W02-A: `COMPLETE_ACCEPTED_MERGED`
- W02-B: `COMPLETE_ACCEPTED_MERGED`
- W02-C: `COMPLETE_ACCEPTED_MERGED`
- PB1: `COMPLETE_RELEASED`
- W02-D: `READY`
- W02-E: `DEPENDENCY_GATED_PB2`
- W02-F: `DEPENDENCY_GATED_PB3`
- W02-G: `DEPENDENCY_GATED_PB4`

PB1 evidence: pre-merge Quality `33417131319`, Test Build `33417131305`, Security `33417131803`; post-merge main Quality `33417242995`, Test Build `33417242973`, Security `33417243977` — all SUCCESS.
