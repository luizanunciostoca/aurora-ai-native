# W02 Ownership Matrix — Aurora AI-Native

Date: 2026-08-31  
Authority: CHAT W02 PROGRAM COORDINATOR  
Coordination starting SHA: `eb46df1c3a1ab98a6ad6d091178091cb880a70e7`  
Current implementation main at W02-E acceptance: `17e452356abd6e43f959a2cbb0bcf47de35abbfd`

## Global ownership rules

- One canonical write owner per path at a time.
- W01 canonical primitives are frozen/composed, never forked.
- Shared barrels/manifests/root/workspace/CI files remain coordinator-controlled unless an explicit narrow transfer is recorded.
- Publication-barrier ownership is separate from leaf implementation ownership.
- Draft PRs do not transfer ownership.
- Legacy/reference trees are read-only/non-authoritative.

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

A leaf subwave may request coordinator publication or mechanical integration; it may not silently absorb shared ownership because a local test/build requires it.

## Closed/released accepted leaf ownership

### W02-A — Identity Resolution

Status: `COMPLETE_ACCEPTED_MERGED` via PR #39. Leaf lock: `CLOSED_RELEASED`.

Former exclusive paths:

- `packages/contracts/src/identity-resolution/**`
- `packages/schemas/src/identity-resolution/**`
- `services/identity/**`

### W02-B — Tenant Boundary & Identity Binding

Status: `COMPLETE_ACCEPTED_MERGED` via PR #37. Leaf lock: `CLOSED_RELEASED`.

Former exclusive paths:

- `packages/contracts/src/tenant-boundary/**`
- `packages/schemas/src/tenant-boundary/**`
- `services/tenant/**`

### W02-C — Consent, Purpose & Jurisdiction

Status: `COMPLETE_ACCEPTED_MERGED` via PR #36. Leaf lock: `CLOSED_RELEASED`.

Former exclusive paths:

- `packages/contracts/src/{consent,purpose,jurisdiction}/**`
- `packages/schemas/src/{consent,purpose,jurisdiction}/**`
- `packages/registries/src/{consent,purpose,jurisdiction}/**`
- `services/consent/**` when present under accepted C ownership

### W02-D — Deterministic Policy Engine

Status: `COMPLETE_ACCEPTED_MERGED` via PR #46. Leaf lock: `CLOSED_RELEASED`.

Accepted exact head: `e9ca04a4b5ffe66619f092bd37614c68b7aa2600`.

Former semantic/leaf scope:

- `packages/contracts/src/policy-engine/**`
- `packages/schemas/src/policy-engine/**`
- `packages/registries/src/policy/**`
- `packages/policy/**` deterministic policy-core implementation paths allocated to D

Historical PR #41 and its root/workflow drift remain superseded audit evidence. The accepted D state reconciled that drift before acceptance; temporary workflows are absent from the accepted diff, and the required `package-lock.json` workspace registration received an explicit narrow coordinator transfer. D did not gain general root/shared ownership.

### W02-E — PolicyToken Validation & Authority Decision Evaluation

Status: `COMPLETE_ACCEPTED_MERGED` via PR #50. Leaf lock: `CLOSED_RELEASED`.

Accepted/merged exact SHA: `17e452356abd6e43f959a2cbb0bcf47de35abbfd`.

Accepted semantic/leaf paths:

- `packages/contracts/src/policy-validation/**`
- `packages/schemas/src/policy-validation/**`
- `packages/policy/src/authority/**`

Temporary coordinator transfer used only for exact-head acceptance:

- `packages/policy/test/w02e-authority-validation.test.ts` — acceptance execution shim only.
- `packages/schemas/tsconfig.build.json` — build-only resolution support before PB3 publication.

That temporary transfer is `CLOSED`. Both paths revert to coordinator/shared-integration ownership. No permanent W02-E ownership widening occurred.

W02-E exact-head evidence: Quality `33435840491`, Test Build `33435840492`, Security `33435841084` — SUCCESS; 23-scenario authority-validation matrix PASS.

## Publication ownership

### PB1

Status: `COMPLETE_RELEASED`. A/B/C public boundaries converged on technical main `b48953cd4a7913e154fe2804248217ffe0c0952d`.

### PB2

Status: `COMPLETE_RELEASED`. Coordinator published accepted W02-D public surfaces through PR #47 at exact publication head `2dd9d77e1062ae03d95268bd2de99b28376878fc`.

### PB3

Status: `ELIGIBLE_NOT_EXECUTED`.

PB3 remains exclusively coordinator-owned. It must reconcile/publicly expose accepted W02-E contracts/schemas/package surfaces and consumer boundaries. W02-E leaf acceptance does **not** transfer this ownership and does **not** count as PB3 publication.

## Dependency-gated ownership

### W02-F — Policy Query / Precheck APIs

State: `DEPENDENCY_GATED_PB3 / NOT_STARTED`.

Future exclusive paths after PB3:

- `packages/contracts/src/policy-query/**`
- `packages/schemas/src/policy-query/**`
- `packages/policy/src/query/**`
- `services/policy/**`

Precheck remains informational and cannot mint executable authority.

### W02-G — Integration, Security & Contract Tests

State: `DEPENDENCY_GATED_PB4`.

After explicit final lock transfer, G may own W02 shared integration/public exports, integration/security tests, consumer fixtures and Reality Gate evidence. It does not gain unrelated feature ownership.

## Current lock state

- W02-A/B/C/D/E: `CLOSED_RELEASED`.
- PB3 shared publication surfaces: `COORDINATOR_LOCKED / ELIGIBLE_NOT_EXECUTED`.
- W02-F: `GATED_PB3`.
- W02-G: `GATED_PB4`.
- Shared/root/workflow/publication surfaces: `COORDINATOR_LOCKED` except for separately recorded completed transfers.

Conflict status: `NO_MATERIAL_W02_E_OWNERSHIP_CONFLICT`.

## Cross-wave prohibitions

No W02 owner may implement W03 persistence/event backbone, W04 Goal Graph/CapabilityPlan/lanes/budgets, W05 Intelligence Router/reasoning/confidence, W06 Context Engine/cache/speculation, or W07+ side-effect executors/providers/device runtime. ADR-002 does not transfer Device Plane ownership into W02.
