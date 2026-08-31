# W02 Ownership Matrix — Aurora AI-Native

Date: 2026-08-31  
Authority: CHAT W02 PROGRAM COORDINATOR  
Current PB3 technical publication main: `fc5634488c84e382ee69efc0444ff9b70c004d77`

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

- `packages/contracts/src/index.ts`;
- `packages/schemas/src/index.ts`;
- `packages/registries/src/index.ts`;
- shared package manifests/tsconfigs/export maps;
- root `package.json`, `package-lock.json`, `tsconfig.base.json` and workspace tooling;
- `.github/CODEOWNERS`;
- `.github/workflows/**`;
- cross-wave dependency/version changes.

A leaf subwave may request coordinator publication or mechanical integration; it may not silently absorb shared ownership because a local test/build requires it.

## Closed/released accepted leaf ownership

### W02-A — Identity Resolution
Status: `COMPLETE_ACCEPTED_MERGED` via PR #39. Leaf lock: `CLOSED_RELEASED`.
Former exclusive paths: `packages/contracts/src/identity-resolution/**`, `packages/schemas/src/identity-resolution/**`, `services/identity/**`.

### W02-B — Tenant Boundary & Identity Binding
Status: `COMPLETE_ACCEPTED_MERGED` via PR #37. Leaf lock: `CLOSED_RELEASED`.
Former exclusive paths: `packages/contracts/src/tenant-boundary/**`, `packages/schemas/src/tenant-boundary/**`, `services/tenant/**`.

### W02-C — Consent, Purpose & Jurisdiction
Status: `COMPLETE_ACCEPTED_MERGED` via PR #36. Leaf lock: `CLOSED_RELEASED`.
Former exclusive paths: contracts/schemas/registries consent/purpose/jurisdiction leaves plus `services/consent/**` where applicable.

### W02-D — Deterministic Policy Engine
Status: `COMPLETE_ACCEPTED_MERGED` via PR #46. Leaf lock: `CLOSED_RELEASED`.
Accepted exact HEAD: `e9ca04a4b5ffe66619f092bd37614c68b7aa2600`.
Former scope: `packages/contracts/src/policy-engine/**`, `packages/schemas/src/policy-engine/**`, `packages/registries/src/policy/**`, D-owned deterministic `packages/policy/**` paths.
Historical PR #41 remains superseded draft evidence; D never gained general root/shared ownership.

### W02-E — PolicyToken Validation & Authority Decision Evaluation
Status: `COMPLETE_ACCEPTED_MERGED` via PR #50. Leaf lock: `CLOSED_RELEASED`.
Accepted exact SHA: `17e452356abd6e43f959a2cbb0bcf47de35abbfd`.
Accepted semantic/leaf paths:
- `packages/contracts/src/policy-validation/**`;
- `packages/schemas/src/policy-validation/**`;
- `packages/policy/src/authority/**`.

The temporary acceptance-only transfer for `packages/policy/test/w02e-authority-validation.test.ts` and `packages/schemas/tsconfig.build.json` is closed. No permanent W02-E ownership widening occurred.

## Publication ownership

### PB1
Status: `COMPLETE_RELEASED`.

### PB2
Status: `COMPLETE_RELEASED`; coordinator publication PR #47, exact publication HEAD `2dd9d77e1062ae03d95268bd2de99b28376878fc`.

### PB3
Status: `COMPLETE_RELEASED_MERGED`.

Coordinator publication PR #53:
- exact publication HEAD `cece292115c0dfa91da2b9694934348ea04b6b4d`;
- publication main `fc5634488c84e382ee69efc0444ff9b70c004d77`;
- Quality `33439372557`, Test Build `33439372604`, Security `33439373811` — SUCCESS.

PB3 coordinator-owned changes were limited to:
- `packages/contracts/package.json`;
- `packages/contracts/src/index.ts`;
- `packages/schemas/package.json`;
- `packages/schemas/src/index.ts`;
- `packages/policy/package.json` authority subpath export;
- `packages/schemas/test/consumer-fixture.test.mjs`.

PB3 did not modify W02-E semantic runtime, `package-lock.json`, workflows, CODEOWNERS or W02-F implementation paths. PB3 publication lock is now `CLOSED_RELEASED`.

## Released ownership — not yet active

### W02-F — Policy Query / Precheck APIs
State: `RELEASED_NOT_STARTED / READY_FOR_IMPLEMENTATION`.

Its leaf ownership may activate only when W02-F is explicitly started under its own subwave. Planned exclusive paths:
- `packages/contracts/src/policy-query/**`;
- `packages/schemas/src/policy-query/**`;
- `packages/policy/src/query/**`;
- `services/policy/**` as authorized by the W02-F charter.

Precheck remains informational, side-effect-free and cannot mint executable authority.

### W02-G — Integration, Security & Contract Tests
State: `DEPENDENCY_GATED_PB4`.

After PB4 and explicit final lock transfer, G may own W02 shared integration/public exports, integration/security tests, consumer fixtures and Reality Gate evidence. It does not gain unrelated feature ownership.

## Current lock state

- W02-A/B/C/D/E: `CLOSED_RELEASED`.
- PB3 publication surfaces: `COMPLETE_RELEASED`; publication lock closed.
- W02-F: `RELEASED_NOT_STARTED`; leaf ownership inactive until explicit start.
- W02-G: `GATED_PB4`.
- Shared/root/workflow/publication surfaces: `COORDINATOR_LOCKED` except completed, recorded narrow transfers.

Conflict status: `NO_MATERIAL_W02_OWNERSHIP_CONFLICT`.

## Cross-wave prohibitions

No W02 owner may implement W03 persistence/event backbone, W04 Goal Graph/CapabilityPlan/lanes/budgets, W05 Intelligence Router/reasoning/confidence, W06 Context Engine/cache/speculation, or W07+ side-effect executors/providers/device runtime. ADR-002 does not transfer Device Plane ownership into W02.
