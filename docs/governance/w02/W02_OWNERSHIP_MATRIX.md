# W02 Ownership Matrix — Aurora AI-Native

Date: 2026-08-31  
Authority: CHAT W02 PROGRAM COORDINATOR  
Coordination starting SHA: `eb46df1c3a1ab98a6ad6d091178091cb880a70e7`

## Global ownership rules

- One canonical write owner per path at a time.
- W01 canonical primitives are frozen/composed, never forked.
- Shared barrels/manifests/root/workspace/CI files remain coordinator-controlled unless an explicit lock transfer is recorded.
- Legacy/reference trees are read-only/non-authoritative.
- Draft PRs do not transfer ownership.
- Publication-barrier ownership is separate from leaf implementation ownership.

## Frozen W01 authority

W02 must not redefine `IdentityId`, `TenantId`, `ActorRef`, `SubjectRef`, `OwnerDecision`, `PolicyToken`, `AuthorityScope`, `CorrelationContext`, `CanonicalError` or `ExecutionOutcome`.

Corrective/additive changes to W01 authority require explicit coordinator ownership plus compatibility/regression evidence.

## Coordinator-controlled shared surfaces

These remain serialized throughout W02 unless explicitly transferred:

- `packages/contracts/src/index.ts`
- `packages/schemas/src/index.ts`
- `packages/registries/src/index.ts`
- shared package manifests/tsconfigs/export maps
- root `package.json`, `package-lock.json`, `tsconfig.base.json` and workspace tooling
- `.github/CODEOWNERS`
- `.github/workflows/**`
- cross-wave dependency/version changes

A leaf subwave may request a coordinator publication or mechanical integration change; it may not silently absorb ownership because its tests require one.

## Accepted leaf ownership

### W02-A — Identity Resolution

Status: `COMPLETE_ACCEPTED_MERGED` via PR #39. Leaf lock closed/released.

Former exclusive paths:

- `packages/contracts/src/identity-resolution/**`
- `packages/schemas/src/identity-resolution/**`
- `services/identity/**`

### W02-B — Tenant Boundary & Identity Binding

Status: `COMPLETE_ACCEPTED_MERGED` via PR #37. Leaf lock closed/released.

Former exclusive paths:

- `packages/contracts/src/tenant-boundary/**`
- `packages/schemas/src/tenant-boundary/**`
- `services/tenant/**`

### W02-C — Consent, Purpose & Jurisdiction

Status: `COMPLETE_ACCEPTED_MERGED` via PR #36. Leaf lock closed/released.

Former exclusive paths:

- `packages/contracts/src/consent/**`
- `packages/schemas/src/consent/**`
- `packages/contracts/src/purpose/**`
- `packages/schemas/src/purpose/**`
- `packages/contracts/src/jurisdiction/**`
- `packages/schemas/src/jurisdiction/**`
- `packages/registries/src/consent/**`
- `packages/registries/src/purpose/**`
- `packages/registries/src/jurisdiction/**`
- `services/consent/**` if/when present under accepted W02-C ownership

PB1 is `COMPLETE_RELEASED`; A/B/C public package boundaries were converged by the coordinator on technical acceptance main `b48953cd4a7913e154fe2804248217ffe0c0952d`.

## Active ownership

### W02-D — Deterministic Policy Engine

Branch: `wave/02d-policy-engine`  
Current state: `IN_PROGRESS_DRAFT_PR_41`  
Draft head observed during this audit: `e9c22eb5e165670c4ec047b29393b4668f79de46`.

Exclusive semantic/leaf scope:

- `packages/contracts/src/policy-engine/**`
- `packages/schemas/src/policy-engine/**`
- `packages/registries/src/policy/**`
- `packages/policy/**` deterministic policy-core implementation paths

Produces one canonical W02 policy decision vocabulary: `ALLOW | DENY | REQUIRE_APPROVAL`, deterministic evaluation requests/results/evidence/reasons.

Forbidden within leaf ownership:

- persistence/event backbone;
- router/confidence/planner/context runtime;
- provider/device/executor calls;
- redefinition of W01 authority/outcome primitives;
- edits to accepted A/B/C leaf semantics;
- silent edits to coordinator-controlled shared/root/workflow/publication surfaces.

### Current W02-D ownership drift requiring reconciliation

Draft PR #41 currently contains changes to:

- root `package-lock.json`;
- `.github/workflows/w02d-format.yml`.

Both are coordinator-controlled by this matrix. These changes are **not accepted ownership transfers**. Before W02-D can be accepted, the coordinator must either:

1. remove/rebuild those changes through the proper coordinator publication/integration path; or
2. explicitly record a narrow lock transfer/publication action and revalidate the exact final HEAD.

The branch must also reconcile against then-current `main`; its original base `c4f25eb41fcb7ff9e390466146ebdeb8239bfe6f` predates later accepted governance changes.

PB2 remains coordinator-controlled and closed until D acceptance/publication.

## Dependency-gated ownership

### W02-E — PolicyToken & Authority Evaluation

State: `DEPENDENCY_GATED_PB2`.

Future exclusive paths after PB2:

- `packages/contracts/src/policy-validation/**`
- `packages/schemas/src/policy-validation/**`
- `packages/policy/src/authority/**`

### W02-F — Policy Query / Precheck APIs

State: `DEPENDENCY_GATED_PB3`.

Future exclusive paths after PB3:

- `packages/contracts/src/policy-query/**`
- `packages/schemas/src/policy-query/**`
- `packages/policy/src/query/**`
- `services/policy/**`

Precheck remains informational; F cannot mint executable authority.

### W02-G — Integration, Security & Contract Tests

State: `DEPENDENCY_GATED_PB4`.

After explicit final lock transfer, G owns W02 shared integration/public exports, W02 integration/security tests, consumer fixtures and Reality Gate evidence. It does not gain unrelated feature ownership.

## Cross-wave prohibitions

No W02 owner may implement:

- W03 persistence/event backbone;
- W04 Goal Graph/CapabilityPlan/lanes/budgets;
- W05 Intelligence Router/reasoning/confidence;
- W06 Context Engine/cache/speculation;
- W07+ side-effect executors/providers/device runtime.

ADR-002 does not transfer any Device Plane ownership into W02.

## Current lock state

- W02-A/B/C: `CLOSED_RELEASED`.
- W02-D: `ACTIVE_IN_PROGRESS_DRAFT_PR_41` only for its frozen leaf/semantic scope.
- W02-E: `GATED_PB2`.
- W02-F: `GATED_PB3`.
- W02-G: `GATED_PB4`.
- Shared/root/workflow/publication surfaces: `COORDINATOR_LOCKED`.

Conflict status: `RECONCILIATION_REQUIRED_BEFORE_W02_D_ACCEPTANCE` because PR #41 currently touches coordinator-controlled files. This is an acceptance guard, not a rejection of the D implementation itself.
