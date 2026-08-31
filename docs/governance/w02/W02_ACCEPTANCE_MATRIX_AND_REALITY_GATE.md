# W02 Acceptance Matrix & Reality Gate

Date: 2026-08-31  
Authority: CHAT W02 PROGRAM COORDINATOR  
Coordination starting SHA: `eb46df1c3a1ab98a6ad6d091178091cb880a70e7`  
Gate: **W02 REALITY GATE 1 — AUTHORITY VERIFIED**  
Minimum maturity: **T1 Contract + T2 Simulation**

## Global invariants

- Deny by default and least authority.
- Intelligence/model confidence cannot create or elevate authorization.
- Equivalent canonical inputs + policy snapshot/version produce reproducible decisions/reasons.
- Invalid/missing/mismatched authority fails closed.
- No external provider/device or real side effect is invoked by W02 gate tests.
- Authorization-affecting outputs carry correlation and sufficient audit/reproduction evidence.
- No duplicate W01 primitive or competing W02 decision vocabulary.

## Subwave acceptance state

### W02-A — `COMPLETE_ACCEPTED_MERGED`

PR #39. Deterministic identity resolution, provider/canonical identity separation, no authority creation, schema/runtime evidence and no identity-graph persistence accepted.

### W02-B — `COMPLETE_ACCEPTED_MERGED`

PR #37. Explicit identity/tenant binding and fail-closed wrong/missing/ambiguous/cross-tenant behavior accepted.

### W02-C — `COMPLETE_ACCEPTED_MERGED`

PR #36. Explicit consent/purpose/jurisdiction semantics accepted without W03 persistence.

### W02-D — `IN_PROGRESS_DRAFT_PR_41`

Pass requires exactly one policy decision vocabulary (`ALLOW | DENY | REQUIRE_APPROVAL`), default deny, deterministic conflict handling, replay stability, explicit policy version/reference/reasons/evidence, and zero confidence-based authority elevation or external side effect.

Draft PR #41 is not acceptance. Before acceptance it must reconcile against then-current `main` and satisfy the W02 ownership matrix. At this audit the draft touches root `package-lock.json` and `.github/workflows/w02d-format.yml`, which are coordinator-controlled surfaces. Those changes must be removed/rebuilt under coordinator publication or explicitly transferred/reconciled before final exact-head acceptance.

### W02-E — `DEPENDENCY_GATED_PB2`

Pass requires exact tenant/subject/action/scope/constraints/time/current-policy validation. Expired, revoked/invalid, wrong-tenant, wrong-subject, wrong-scope/action, stale/incompatible policy/version and constraint violations fail closed. `SubjectRef` ↔ `AuthoritySubjectReference` comparison is explicit/tested. Token is never a provider credential.

### W02-F — `DEPENDENCY_GATED_PB3`

Pass requires read-only/side-effect-free current-policy query/precheck, responses composing D/E canonical types, explicit current policy/correlation/reasons/evidence and no authority minting. Precheck is informational only.

### W02-G — `DEPENDENCY_GATED_PB4`

Pass requires clean consumer compilation/public exports, schema parity, duplicate/cycle/dependency/legacy-runtime audits, full T1/T2 suite, official gates on exact acceptance main and final Drive registry/evidence convergence.

## Publication barriers

- PB0: `COMPLETE`.
- PB1: `COMPLETE_RELEASED` on technical acceptance main `b48953cd4a7913e154fe2804248217ffe0c0952d`.
- PB2: `PENDING` — D not accepted/published.
- PB3: `PENDING`.
- PB4: `PENDING`.
- PB5: `PENDING`.

PB1 completion is not Reality Gate completion and does not mark W02 complete.

## T1 — Contract gate

All must pass on the exact final W02 acceptance SHA:

- canonical public exports resolve;
- consumer fixture type compilation;
- runtime schema parse/reject parity for serialized contracts;
- one unique source for frozen W01 names;
- one unique `PolicyEvaluationDecision` vocabulary;
- no package dependency cycle;
- no canonical W02 runtime dependency on `reference/**` or `**/legacy-reference/**`;
- no accidental W03/W04/W05/W06/W07+ feature implementation;
- no unresolved ownership violation in shared/root/CI/publication surfaces.

## T2 — Simulation scenarios

| ID | Scenario | Expected |
|---|---|---|
| S01 | valid identity + tenant + applicable consent/purpose/jurisdiction + current policy allow + valid authority | `ALLOW` with policy/correlation/reasons/evidence |
| S02 | current policy explicitly denies | `DENY`; no authority/confidence override |
| S03 | policy requires approval without sufficient current decision evidence | `REQUIRE_APPROVAL` |
| S04 | expired authority | non-ALLOW / fail closed |
| S05 | wrong tenant | `DENY` |
| S06 | wrong subject | `DENY` |
| S07 | wrong action/scope | `DENY` |
| S08 | revoked OwnerDecision or malformed/invalid PolicyToken | `DENY` |
| S09 | required consent missing | non-ALLOW |
| S10 | purpose mismatch | non-ALLOW |
| S11 | jurisdiction restriction | non-ALLOW with evidence |
| S12 | unresolved policy conflict | `DENY` |
| S13 | identity not found/ambiguous | non-ALLOW; no fallback authority |
| S14 | historically valid/stale authority while current policy denies | `DENY`; current policy wins |
| S15 | DENY/REQUIRE_APPROVAL + synthetic high confidence/reasoning metadata | identical authority result |
| S16 | repeated identical canonical request + fixed policy snapshot | identical normalized decision/reasons/fingerprint |
| S17 | authority from tenant A injected into tenant B request | `DENY` |
| S18 | F precheck | no provider/executor call, persistence write, external mutation or authority minting |
| S19 | malformed/incompatible subject/scope reference | schema reject or deterministic non-ALLOW |
| S20 | missing current-policy context | `DENY`; never stale permissive fallback |

## Reproducibility evidence

A T2 run records exact code SHA, contract/schema versions, policy reference/version/snapshot identity, normalized request/action/scope, tenant, subject/actor refs, relevant consent/purpose/jurisdiction refs, authority evidence refs, correlation, decision, reason codes and deterministic input fingerprint/reference. Secrets, provider credentials and private model chain-of-thought are excluded.

## Gate result rule

- T1 PASS + T2 PASS => `REALITY_GATE_1_AUTHORITY_VERIFIED`.
- Any safety/authority negative case unexpectedly returning ALLOW => blocking failure.
- Missing deterministic replay evidence => blocking failure.
- Any real external side effect => blocking scope violation.
- Any unresolved ownership drift in final integration surfaces => blocking acceptance failure.

Reality Gate execution remains dependency-gated to W02-G after A-F convergence. ADR-002 Device Plane planning does not weaken or replace this gate.

## PB1 evidence

Accepted W02-A/PB1 head `4f84f20a1285ec3727591ed2ad89f90a9f988f1d`: Quality `33417131319`, Test Build `33417131305`, Security `33417131803` — SUCCESS.  
Post-merge technical main `b48953cd4a7913e154fe2804248217ffe0c0952d`: Quality `33417242995`, Test Build `33417242973`, Security `33417243977` — SUCCESS.
