# W02 Acceptance Matrix & Reality Gate

Date: 2026-08-31  
Authority: CHAT W02 PROGRAM COORDINATOR  
Coordination starting SHA: `eb46df1c3a1ab98a6ad6d091178091cb880a70e7`  
Current implementation main at W02-E acceptance: `17e452356abd6e43f959a2cbb0bcf47de35abbfd`  
Gate: **W02 REALITY GATE 1 — AUTHORITY VERIFIED**  
Minimum maturity: **T1 Contract + T2 Simulation**

## Global invariants

- Deny by default and least authority.
- Intelligence/model confidence cannot create or elevate authorization.
- Equivalent canonical inputs + policy snapshot/version produce reproducible decisions/reasons.
- Invalid/missing/mismatched authority fails closed.
- Current policy wins over stale authority evidence.
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

### W02-D — `COMPLETE_ACCEPTED_MERGED`

Acceptance PR #46. Exact accepted HEAD `e9ca04a4b5ffe66619f092bd37614c68b7aa2600`.

Accepted properties:

- one policy-decision vocabulary: `ALLOW | DENY | REQUIRE_APPROVAL`;
- deny by default;
- deterministic conflict precedence;
- replay stability;
- explicit policy reference/version/reasons/evidence;
- confidence/model metadata cannot elevate authority;
- no provider/device/executor side effect.

Exact-head gates: Quality `33428380492`, Test Build `33428380455`, Security `33428381776` — SUCCESS.

Historical PR #41 remains superseded draft evidence and is not current state.

### W02-E — `COMPLETE_ACCEPTED_MERGED`

Acceptance PR #50. Exact accepted/merged SHA `17e452356abd6e43f959a2cbb0bcf47de35abbfd`.

Accepted properties:

- exact tenant/subject/action/scope/constraints/time/current-policy validation;
- expired, not-yet-valid, revoked, wrong-tenant, wrong-subject, wrong-action/scope, stale/incompatible policy and constraint violations fail closed;
- least authority; validation never widens scope;
- current policy wins stale `PolicyToken` / `OwnerDecision` evidence;
- `OwnerDecision` deny/revoke/expiry enforced;
- `SubjectRef` ↔ `AuthoritySubjectReference` comparison explicit/tested;
- `PolicyToken` never contains provider credential/secret authority material;
- deterministic replay/fingerprint;
- confidence cannot create permission;
- no W02-F precheck API and no external side effect.

Exact-head evidence:

- Quality `33435840491`: SUCCESS.
- Test Build `33435840492`: SUCCESS, including executable W02-E authority-validation matrix and cleanup.
- Security `33435841084`: SUCCESS.
- 23-scenario authority/attack matrix: PASS.
- cleanup: PASS; canonical broken relative refs = 0.

### W02-F — `DEPENDENCY_GATED_PB3 / NOT_STARTED`

Pass requires read-only/side-effect-free current-policy query/precheck, responses composing D/E canonical types, explicit current policy/correlation/reasons/evidence and no authority minting. Precheck is informational only.

### W02-G — `DEPENDENCY_GATED_PB4`

Pass requires clean consumer compilation/public exports, schema parity, duplicate/cycle/dependency/legacy-runtime audits, full T1/T2 suite, official gates on exact acceptance main and final Drive registry/evidence convergence.

## Publication barriers

- PB0: `COMPLETE`.
- PB1: `COMPLETE_RELEASED` on technical acceptance main `b48953cd4a7913e154fe2804248217ffe0c0952d`.
- PB2: `COMPLETE_RELEASED` via PR #47, exact publication HEAD `2dd9d77e1062ae03d95268bd2de99b28376878fc`.
- PB3: `ELIGIBLE_NOT_EXECUTED` — W02-E is accepted, but E shared public publication has not been performed.
- PB4: `PENDING`.
- PB5: `PENDING`.

Completion of W02-E is not Reality Gate completion and does not mark W02 complete.

## PB3 acceptance guard

PB3 must be a separate coordinator-controlled publication action. Before W02-F can start, PB3 must:

- expose the accepted E public contract/schema surfaces through canonical shared barrels/export maps/manifests as required;
- validate consumer package/subpath resolution without internal-import bypass;
- preserve exact accepted W02-E semantics;
- introduce no F query/precheck behavior;
- pass official Quality, Test Build and Security on the exact publication HEAD;
- record publication SHA/PR/merge/evidence in GitHub and Drive governance.

An acceptance shim, build alias or direct internal import is not PB3 publication evidence.

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

W02-E acceptance provides direct evidence for the authority-validation subset of these scenarios, including expiry, tenant/subject/action/scope mismatch, revoked/stale authority, current-policy precedence, deterministic replay and confidence neutrality. Full T1/T2 execution remains W02-G responsibility after A-F convergence.

## Reproducibility evidence

A T2 run records exact code SHA, contract/schema versions, policy reference/version/snapshot identity, normalized request/action/scope, tenant, subject/actor refs, relevant consent/purpose/jurisdiction refs, authority evidence refs, correlation, decision, reason codes and deterministic input fingerprint/reference. Secrets, provider credentials and private model chain-of-thought are excluded.

## Gate result rule

- T1 PASS + T2 PASS => `REALITY_GATE_1_AUTHORITY_VERIFIED`.
- Any safety/authority negative case unexpectedly returning ALLOW => blocking failure.
- Missing deterministic replay evidence => blocking failure.
- Any real external side effect => blocking scope violation.
- Any unresolved ownership drift in final integration surfaces => blocking acceptance failure.

Reality Gate execution remains dependency-gated to W02-G after A-F convergence. ADR-002 Device Plane planning does not weaken or replace this gate.
