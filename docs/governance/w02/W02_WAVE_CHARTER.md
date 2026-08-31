# W02 Wave Charter — Identity, Tenant, Authority, Consent & Policy Core

Date: 2026-08-31  
Authority: CHAT W02 PROGRAM COORDINATOR  
Exact coordination starting SHA: `eb46df1c3a1ab98a6ad6d091178091cb880a70e7`  
Current implementation main at W02-E acceptance: `17e452356abd6e43f959a2cbb0bcf47de35abbfd`

## Mission

Create the canonical core for identity resolution, tenant boundaries/binding, consent/purpose/jurisdiction, deterministic current-policy evaluation, `PolicyToken`/`OwnerDecision` authority evaluation and read-only policy query/precheck APIs. W02 performs no real external provider/device side effects.

## Current release state

- W02-00: `COMPLETE_ACCEPTED`.
- W02-A: `COMPLETE_ACCEPTED_MERGED` — PR #39.
- W02-B: `COMPLETE_ACCEPTED_MERGED` — PR #37.
- W02-C: `COMPLETE_ACCEPTED_MERGED` — PR #36.
- PB1: `COMPLETE_RELEASED`.
- W02-D: `COMPLETE_ACCEPTED_MERGED` — PR #46; exact accepted head `e9ca04a4b5ffe66619f092bd37614c68b7aa2600`.
- PB2: `COMPLETE_RELEASED` — PR #47; exact publication head `2dd9d77e1062ae03d95268bd2de99b28376878fc`.
- W02-E: `COMPLETE_ACCEPTED_MERGED` — PR #50; exact accepted/merged SHA `17e452356abd6e43f959a2cbb0bcf47de35abbfd`.
- PB3: `ELIGIBLE_NOT_EXECUTED`.
- W02-F: `DEPENDENCY_GATED_PB3 / NOT_STARTED`.
- PB4: `PENDING`.
- W02-G: `DEPENDENCY_GATED_PB4`.
- PB5 / W02 final acceptance: `PENDING`.
- Reality Gate 1: defined; execution remains W02-G responsibility after A-F convergence.

Historical PR #41 remains superseded W02-D draft evidence and does not override this state.

## Hard invariants

1. Deny by default.
2. Least authority.
3. Intelligence != Authority != Execution.
4. Model confidence, reasoning level, route, cache hit, template match, device session or precheck cannot create/increase permission.
5. Agents, n8n, UI, routers and executors cannot invent authority.
6. Policy evaluation is deterministic/reproducible for equivalent canonical inputs and policy version/snapshot.
7. Invalid, malformed, expired, revoked or mismatched authority fails closed.
8. Tenant mismatch fails closed.
9. Consent, purpose and jurisdiction are explicit/verifiable inputs when applicable.
10. Current policy wins over stale authority evidence.
11. Authorization-affecting outputs carry correlation and sufficient audit/reproduction evidence.
12. W02 does not implement W03 persistence/event backbone.
13. W02 does not implement W04 Goal Graph/Capability Planner/lanes.
14. W02 does not implement W05 Intelligence Router/Confidence Engine.
15. W02 does not implement W06 Context Engine/cache/speculation.
16. W02 does not implement W07+ external/device execution.
17. W01 canonical primitives are composed, never forked.

## Canonical namespace freeze

The source and semantic role of `IdentityId`, `TenantId`, `ActorRef`, `SubjectRef`, `OwnerDecision`, `PolicyToken`, `AuthorityScope`, `CorrelationContext`, `CanonicalError` and `ExecutionOutcome` remain W01 authority.

W02-D owns exactly one policy-decision vocabulary: `ALLOW | DENY | REQUIRE_APPROVAL`, distinct from W01 `OwnerDecision` states and `ExecutionOutcome`.

W01 authority subject representation remains `AuthoritySubjectReference`. `SubjectRef` bridging/comparison must be explicit, deterministic and tested; no silent cast or duplicate subject primitive.

## Subwaves

### W02-A — Identity Resolution Contracts & Runtime

Accepted/merged. Produces deterministic identity-resolution contracts/evidence/runtime without authentication credential minting, identity-graph persistence or authority creation.

### W02-B — Tenant Boundary & Identity Binding

Accepted/merged. Produces explicit identity-to-tenant boundary/binding semantics without default-tenant inference or cross-tenant fallback.

### W02-C — Consent, Purpose & Jurisdiction

Accepted/merged. Produces explicit consent/purpose/jurisdiction policy context. W03-owned persistence remains out of scope.

### W02-D — Deterministic Policy Engine

Status: `COMPLETE_ACCEPTED_MERGED`.

Acceptance PR #46; exact accepted head `e9ca04a4b5ffe66619f092bd37614c68b7aa2600`. Produces pure deterministic policy decisions/reasons/evidence with fail-closed conflict/default-deny behavior. Quality `33428380492`, Test Build `33428380455`, Security `33428381776` — SUCCESS.

### W02-E — PolicyToken Validation & Authority Decision Evaluation

Status: `COMPLETE_ACCEPTED_MERGED`.

Acceptance PR #50; exact accepted/merged SHA `17e452356abd6e43f959a2cbb0bcf47de35abbfd`.

Validates W01 authority evidence against current tenant/subject/action/scope/time/constraints/current policy. Enforces least authority, no scope widening, current-policy precedence, explicit subject bridging, OwnerDecision applicability and deterministic replay. `PolicyToken` is never provider credential material. It does not implement external execution or W02-F precheck.

Acceptance evidence: Quality `33435840491`, Test Build `33435840492`, Security `33435841084` — SUCCESS; 23-scenario authority-validation matrix PASS.

### W02-F — Policy Query / Precheck APIs

Status: `DEPENDENCY_GATED_PB3 / NOT_STARTED`.

After PB3, F may expose read-only/current-policy/precheck interfaces by composing D/E. Precheck is informational and never substitutes execution-time validation or mints authority.

### W02-G — Integration, Security & Contract Tests

Status: `DEPENDENCY_GATED_PB4`.

After PB4 and explicit lock transfer, G owns final shared integration, negative/security matrices, contract/schema/public-export tests and Reality Gate execution/evidence.

## Publication barriers

- **PB0:** W02-00 accepted -> A/B/C may start. `COMPLETE`.
- **PB1:** A+B+C accepted + public contracts/schemas published -> D released. `COMPLETE_RELEASED`.
- **PB2:** D accepted + required D public surfaces published by coordinator -> E released. `COMPLETE_RELEASED` via PR #47.
- **PB3:** E accepted + E public surfaces published/tested by coordinator -> F released. `ELIGIBLE_NOT_EXECUTED`.
- **PB4:** F accepted + A-F converged -> G released. `PENDING`.
- **PB5:** G merged + Reality Gate T1/T2 + exact-main/Drive convergence -> W02 complete. `PENDING`.

A draft PR/file, internal import, build alias or acceptance shim is not a published dependency.

## PB3 guard

W02-E acceptance does not automatically publish E. PB3 must be a separate coordinator-controlled action that reconciles canonical public barrels/export maps/manifests and consumer boundaries, preserves accepted E semantics, adds no F behavior, passes official gates on the exact publication HEAD, and records publication evidence before W02-F can start.

## Reality Gate 1 — Authority Verified

Minimum maturity: **T1 Contract + T2 Simulation**.

The final suite covers ALLOW, DENY, REQUIRE_APPROVAL, expired/invalid/revoked authority, wrong tenant/subject/scope, missing consent, purpose mismatch, jurisdiction restriction, policy conflict, stale authority and high-confidence metadata that must not alter authority outcome. It performs no real external side effect.

W02-E already provides accepted evidence for its authority-validation subset, but full Reality Gate execution remains W02-G responsibility after A-F convergence.

## Exit criteria

W02 can be accepted only after A-G converge in dependency order; deterministic/fail-closed tests pass; public exports compile from consumer fixtures; no duplicate canonical primitive or policy vocabulary exists; no canonical runtime depends on legacy/reference trees; official gates pass on exact final main; Reality Gate T1/T2 passes; and Drive/repository governance evidence is synchronized.

ADR-002 Device Plane planning introduces no exception to this charter and no new W02 execution authority.
