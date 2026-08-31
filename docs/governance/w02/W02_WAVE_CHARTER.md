# W02 Wave Charter — Identity, Tenant, Authority, Consent & Policy Core

Date: 2026-08-31  
Authority: CHAT W02 PROGRAM COORDINATOR  
Exact coordination starting SHA: `eb46df1c3a1ab98a6ad6d091178091cb880a70e7`  
PB1 technical acceptance: `b48953cd4a7913e154fe2804248217ffe0c0952d`

## Mission

Create the canonical core for identity resolution, tenant boundaries/binding, consent/purpose/jurisdiction, deterministic current-policy evaluation, `PolicyToken`/`OwnerDecision` authority evaluation and read-only policy query/precheck APIs. W02 performs no real external provider/device side effects.

## Current release state

- W02-00: `COMPLETE_ACCEPTED`.
- W02-A: `COMPLETE_ACCEPTED_MERGED` — PR #39.
- W02-B: `COMPLETE_ACCEPTED_MERGED` — PR #37.
- W02-C: `COMPLETE_ACCEPTED_MERGED` — PR #36.
- PB1: `COMPLETE_RELEASED`.
- W02-D: `IN_PROGRESS_DRAFT_PR_41`; not accepted, PB2 still pending.
- W02-E: `DEPENDENCY_GATED_PB2`.
- W02-F: `DEPENDENCY_GATED_PB3`.
- W02-G: `DEPENDENCY_GATED_PB4`.
- Reality Gate 1: defined; execution remains W02-G responsibility after A-F convergence.

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
10. Authorization-affecting outputs carry correlation and sufficient audit/reproduction evidence.
11. W02 does not implement W03 persistence/event backbone.
12. W02 does not implement W04 Goal Graph/Capability Planner/lanes.
13. W02 does not implement W05 Intelligence Router/Confidence Engine.
14. W02 does not implement W06 Context Engine/cache/speculation.
15. W02 does not implement W07+ external/device execution.
16. W01 canonical primitives are composed, never forked.

## Canonical namespace freeze

The source and semantic role of `IdentityId`, `TenantId`, `ActorRef`, `SubjectRef`, `OwnerDecision`, `PolicyToken`, `AuthorityScope`, `CorrelationContext`, `CanonicalError` and `ExecutionOutcome` remain W01 authority.

W02-D owns exactly one new policy-decision vocabulary: `ALLOW | DENY | REQUIRE_APPROVAL`, distinct from W01 `OwnerDecision` states and `ExecutionOutcome`.

W01 authority subject representation remains `AuthoritySubjectReference`. Any W02 `SubjectRef` bridge/comparison must be explicit, deterministic and tested; no silent cast or duplicate subject primitive.

## Subwaves

### W02-A — Identity Resolution Contracts & Runtime

Accepted/merged. Produces deterministic identity-resolution contracts/evidence/runtime without authentication credential minting, identity-graph persistence or authority creation.

### W02-B — Tenant Boundary & Identity Binding

Accepted/merged. Produces explicit identity-to-tenant boundary/binding semantics without default-tenant inference or cross-tenant fallback.

### W02-C — Consent, Purpose & Jurisdiction

Accepted/merged. Produces explicit consent/purpose/jurisdiction policy context. W03-owned persistence remains out of scope.

### W02-D — Deterministic Policy Engine

Status: `IN_PROGRESS_DRAFT_PR_41`.

Consumes accepted/published A/B/C and produces pure deterministic policy decisions/reasons/evidence with fail-closed conflict/default-deny behavior. Draft implementation does not constitute PB2.

Acceptance requires branch reconciliation with then-current `main`, exact-head tests/gates, and reconciliation of any coordinator-owned shared/root/workflow changes. At this audit, PR #41 touches `package-lock.json` and `.github/workflows/w02d-format.yml`, which remain coordinator-controlled until explicitly reconciled.

### W02-E — PolicyToken Validation & Authority Decision Evaluation

Gated until PB2. Validates W01 authority evidence against current identity/tenant/subject/scope/time/constraints/current policy and applicable consent/purpose/jurisdiction. It does not mint provider credentials or execution authority beyond validated scope.

### W02-F — Policy Query / Precheck APIs

Gated until PB3. Exposes read-only/current-policy/precheck interfaces by composing D/E. Precheck is informational and never substitutes execution-time validation.

### W02-G — Integration, Security & Contract Tests

Gated until PB4. Owns final shared integration after explicit lock transfer, negative/security matrices, contract/schema/public-export tests and Reality Gate execution/evidence.

## Publication barriers

- **PB0:** W02-00 accepted -> A/B/C may start. `COMPLETE`.
- **PB1:** A+B+C accepted + public contracts/schemas published -> D released. `COMPLETE_RELEASED`.
- **PB2:** D accepted + required D public surfaces published by coordinator -> E released. `PENDING`.
- **PB3:** E accepted/published -> F released. `PENDING`.
- **PB4:** F accepted + A-F converged -> G released. `PENDING`.
- **PB5:** G merged + Reality Gate T1/T2 + exact-main/Drive convergence -> W02 complete. `PENDING`.

A draft PR/file is not a published dependency.

## W02-D acceptance reconciliation

PR #41 originated from main `c4f25eb41fcb7ff9e390466146ebdeb8239bfe6f`; later accepted governance advanced `main` beyond that point. Before acceptance, W02-D must:

- rebase/reconcile on current main;
- preserve W01 and accepted A/B/C semantics;
- use only its frozen leaf ownership unless coordinator transfer is recorded;
- eliminate or explicitly reconcile coordinator-controlled root/workflow changes;
- prove deterministic replay, fail closed behavior, conflict precedence and no intelligence-to-authority elevation;
- pass official Quality/Test Build/Security on exact final HEAD;
- record accepted HEAD, merge SHA and PB2 publication as distinct evidence.

## Reality Gate 1 — Authority Verified

Minimum maturity: **T1 Contract + T2 Simulation**.

The suite covers ALLOW, DENY, REQUIRE_APPROVAL, expired/invalid/revoked authority, wrong tenant/subject/scope, missing consent, purpose mismatch, jurisdiction restriction, policy conflict, stale authority and high-confidence metadata that must not alter authority outcome. It performs no real external side effect.

Reality Gate execution remains W02-G responsibility; PB1 or D implementation cannot mark it complete.

## Exit criteria

W02 can be accepted only after A-G converge in dependency order; deterministic/fail-closed tests pass; public exports compile from consumer fixtures; no duplicate canonical primitive or policy vocabulary exists; no canonical runtime depends on legacy/reference trees; official gates pass on exact final main; and Drive registries/evidence are synchronized.

ADR-002 Device Plane planning introduces no exception to this charter and no new W02 execution authority.
