# W02 Wave Charter — Identity, Tenant, Authority, Consent & Policy Core

Date: 2026-08-31  
Authority: CHAT W02 PROGRAM COORDINATOR  
Exact starting main SHA: `eb46df1c3a1ab98a6ad6d091178091cb880a70e7`

## Release state

PB1 technical acceptance main: `b48953cd4a7913e154fe2804248217ffe0c0952d`.

- W02-00: `COMPLETE_ACCEPTED`.
- W02-A: `COMPLETE_ACCEPTED_MERGED` via PR #39; accepted head `4f84f20a1285ec3727591ed2ad89f90a9f988f1d`; PR #38 superseded.
- W02-B: `COMPLETE_ACCEPTED_MERGED` via PR #37.
- W02-C: `COMPLETE_ACCEPTED_MERGED` via PR #36.
- PB1: `COMPLETE_RELEASED` after coordinator lockfile/public-export convergence and consumer-boundary verification.
- W02-D: `READY` under its frozen exclusive ownership.
- W02-E: `DEPENDENCY_GATED_PB2`.
- W02-F: `DEPENDENCY_GATED_PB3`.
- W02-G: `DEPENDENCY_GATED_PB4`.

## Mission

Create the canonical core for identity resolution, tenant boundaries/binding, consent/purpose/jurisdiction, deterministic current-policy evaluation, `PolicyToken`/`OwnerDecision` authority evaluation and read-only policy query/precheck APIs. W02 must not perform external provider side effects.

## Hard invariants

1. Deny by default.
2. Least authority.
3. Intelligence != Authority.
4. Model confidence, reasoning level, route, cache hit or template match cannot create or increase permission.
5. Agents, n8n, UI, routers and executors cannot invent authority.
6. Policy evaluation is deterministic and reproducible for equivalent canonical inputs and current-policy snapshot/version.
7. Invalid, malformed, expired, revoked or mismatched authority fails closed.
8. Tenant mismatch fails closed.
9. Consent, purpose and jurisdiction are explicit/verifiable inputs whenever applicable.
10. Authorization-affecting outputs carry correlation and sufficient audit/reproduction evidence.
11. W02 does not implement W03 persistence/event backbone.
12. W02 does not implement W04 Capability Planner/Goal Graph/lanes.
13. W02 does not implement W05 Intelligence Router/Confidence Engine.
14. W02 does not implement W06 Context Engine/cache/speculation.
15. W01 canonical primitives are composed, never forked.

## Canonical namespace freeze

The source and semantic role of the following names are frozen to W01: `IdentityId`, `TenantId`, `ActorRef`, `SubjectRef`, `OwnerDecision`, `PolicyToken`, `AuthorityScope`, `CorrelationContext`, `CanonicalError`, and `ExecutionOutcome`.

Additive compatibility changes or W02-specific error codes require serialized coordinator ownership and regression evidence. Subwaves may not create local duplicate unions/types.

## W02 policy decision vocabulary

W02-D owns one canonical policy decision vocabulary: `ALLOW | DENY | REQUIRE_APPROVAL`. This is distinct from W01 `OwnerDecision` states and from `ExecutionOutcome`.

## Subject compatibility

W01 `OwnerDecision`/`PolicyToken` retain `AuthoritySubjectReference` on the wire. W02 may resolve canonical `SubjectRef`, but any comparison/bridge must be explicit, deterministic and tested; no silent cast and no second `SubjectRef` is permitted.

## Subwaves

### W02-A — Identity Resolution Contracts & Runtime

Produces deterministic identity-resolution contracts/evidence and runtime. It does not create authentication credentials, identity graph persistence or authority. W02-A is accepted/merged and its public PB1 surfaces are published.

### W02-B — Tenant Boundary & Identity Binding

Produces explicit identity-to-tenant binding/boundary semantics. It never creates a second `TenantId`/`IdentityId` or permissive cross-tenant fallback. W02-B is accepted/merged and its PB1 public surface is published.

### W02-C — Consent, Purpose & Jurisdiction

Produces explicit/verifiable consent status/evidence, purpose and jurisdiction policy context. W03-owned persistence remains out of scope. W02-C is accepted/merged and its PB1 public surfaces are published.

### W02-D — Deterministic Policy Engine

Consumes accepted/published A/B/C and produces pure deterministic current-policy decisions/reasons with default deny and conflict fail-closed semantics. PB1 is satisfied, so W02-D may now begin only inside its allocated ownership.

### W02-E — PolicyToken Validation & Authority Decision Evaluation

Validates W01 authority evidence against current identity/tenant/subject/scope/time/constraints/current policy and applicable consent/purpose/jurisdiction. It remains gated until PB2.

### W02-F — Policy Query / Precheck APIs

Exposes read-only/current-policy/precheck interfaces by composing D/E. Precheck has no provider side effects and does not itself mint execution authority. It remains gated until PB3.

### W02-G — Integration, Security & Contract Tests

Owns final shared integration after lock transfer, negative/security matrices, contract/schema/public-export tests and W02 Reality Gate evidence. It remains gated until PB4.

## Publication barriers

- **PB0:** W02-00 accepted -> A/B/C may start. **COMPLETE.**
- **PB1:** A+B+C accepted and their public contracts/schemas published by coordinator -> D released. **COMPLETE/RELEASED** on technical acceptance main `b48953cd4a7913e154fe2804248217ffe0c0952d`.
- **PB2:** D accepted/published -> E released. **PENDING.**
- **PB3:** E accepted/published -> F released. **PENDING.**
- **PB4:** F accepted -> G released. **PENDING.**
- **PB5:** G Reality Gate T1+T2 accepted on exact main and Drive synchronized -> W02 COMPLETE. **PENDING.**

A draft file is not a published dependency. Publication requires accepted leaf implementation, mirrored runtime schema where serialized, contract tests, accepted branch/PR state and required coordinator-controlled public exports.

PB1 did not transfer shared barrels/manifests, root workspace/lockfile, CI, CODEOWNERS or cross-wave dependency/version ownership to W02-D. Those surfaces remain coordinator-controlled for subsequent publication barriers.

## Audit evidence minimum

Authorization-affecting decisions/results must be attributable to correlation, tenant, resolved subject/actor where applicable, action/scope, current policy reference/version, relevant authority evidence, relevant consent/purpose/jurisdiction evidence, explicit reason code(s), evaluation timestamp and sufficient normalized input identity/fingerprint/reference for reproduction without storing secrets or private model chain-of-thought.

## Reality Gate 1 — Authority Verified

Minimum maturity is **T1 Contract + T2 Simulation**. The suite must cover ALLOW, DENY, REQUIRE_APPROVAL, expired authority, wrong tenant, wrong subject, wrong scope, revoked/invalid authority, missing consent, purpose mismatch, jurisdiction restriction and policy conflict. It must also prove that high model confidence cannot convert a DENY/REQUIRE_APPROVAL into ALLOW. No real external provider side effect is allowed.

Reality Gate execution remains dependency-gated to W02-G after A-F convergence. PB1 release does not imply Reality Gate completion or W02 final acceptance.

## PB1 evidence

Pre-merge on accepted W02-A/PB1 head `4f84f20a1285ec3727591ed2ad89f90a9f988f1d`:

- Quality `33417131319` — SUCCESS
- Test Build `33417131305` — SUCCESS
- Security `33417131803` — SUCCESS

Post-merge on technical acceptance main `b48953cd4a7913e154fe2804248217ffe0c0952d`:

- Quality `33417242995` — SUCCESS
- Test Build `33417242973` — SUCCESS
- Security `33417243977` — SUCCESS

## Exit criteria

W02 may be accepted only after A-G converge in dependency order, deterministic replay and fail-closed negative tests pass, public exports compile from a consumer fixture, no duplicate canonical primitive/policy vocabulary exists, no canonical runtime depends on legacy/reference trees, official repository gates pass on the exact final SHA, and Drive registries/evidence are synchronized.
