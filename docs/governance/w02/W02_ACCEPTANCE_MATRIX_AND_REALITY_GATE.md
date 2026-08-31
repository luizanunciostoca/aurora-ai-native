# W02 Acceptance Matrix & Reality Gate

Date: 2026-08-31  
Authority: CHAT W02 PROGRAM COORDINATOR  
Starting SHA: `eb46df1c3a1ab98a6ad6d091178091cb880a70e7`  
Gate: **W02 REALITY GATE 1 — AUTHORITY VERIFIED**  
Minimum maturity: **T1 Contract + T2 Simulation**

## Global invariants

- Deny by default and least authority.
- Intelligence/model confidence cannot create or elevate authorization.
- Equivalent canonical inputs + current-policy snapshot/version produce reproducible decisions/reasons.
- Invalid/missing/mismatched authority fails closed.
- No external provider or real side effect is invoked by gate tests.
- Authorization-affecting outputs have correlation and sufficient audit/reproduction evidence.
- No duplicate W01 primitive or local W02 decision vocabulary.

## Subwave acceptance

### W02-A

Pass requires deterministic known/not-found/ambiguous identity resolution, separation of provider/external refs from canonical IdentityId, no authority creation, correlation/evidence, contract/schema parity and no identity-graph persistence.

### W02-B

Pass requires explicit identity-tenant binding, wrong/missing/ambiguous/cross-tenant cases failing closed, no default-tenant fallback, W01 IDs reused and correlation/evidence present.

### W02-C

Pass requires explicit active/revoked/expired/missing consent semantics, deterministic purpose match/mismatch, explicit jurisdiction restrictions, fail closed when required evidence is absent/incompatible, and no W03 persistence.

### W02-D

Pass requires exactly one W02 decision vocabulary (`ALLOW | DENY | REQUIRE_APPROVAL`), default deny, deterministic conflict handling, replay stability, explicit policy version/reference/reasons, no confidence-based permission elevation and no provider/persistence side effect.

### W02-E

Pass requires valid authority only inside exact tenant/subject/action/scope/constraints/time/current-policy bounds. Expired, revoked/invalid, wrong-tenant, wrong-subject, wrong-scope/action, stale/incompatible policy/version and constraint violations fail closed. `SubjectRef` to W01 `AuthoritySubjectReference` comparison must be explicit/tested. Token is never a provider credential.

### W02-F

Pass requires read-only/side-effect-free current-policy query/precheck, responses composing D/E canonical types, explicit current policy/correlation/reasons/evidence, no authority minting from precheck and no lane/router/confidence/planner behavior.

### W02-G

Pass requires clean consumer compilation/public exports, schema parity, duplicate/cycle/dependency/legacy-runtime audits, full T1/T2 suite, official repository gates on exact acceptance SHA and final Drive evidence/registry synchronization.

## T1 — Contract gate

All must pass on the exact acceptance SHA:

- canonical public exports resolve;
- consumer fixture type compilation;
- runtime schema parse/reject parity for new serialized contracts;
- one unique source for frozen W01 names;
- one unique `PolicyEvaluationDecision` vocabulary;
- no package dependency cycle;
- no canonical W02 runtime dependency on `reference/**` or `**/legacy-reference/**`;
- no accidental W03/W04/W05/W06 feature implementation.

## T2 — Simulation scenarios

| ID | Scenario | Expected |
|---|---|---|
| S01 | valid resolved identity + tenant + applicable consent/purpose/jurisdiction + current policy allow + valid authority | `ALLOW` with policy/correlation/reasons/evidence |
| S02 | current policy explicitly denies | `DENY`; no authority/confidence override |
| S03 | policy requires owner approval without satisfying current decision evidence | `REQUIRE_APPROVAL` |
| S04 | expired authority | non-ALLOW / fail closed with expiry reason |
| S05 | wrong tenant | `DENY` before authority elevation |
| S06 | wrong subject | `DENY` |
| S07 | wrong action/scope | `DENY` |
| S08 | revoked OwnerDecision or malformed/invalid PolicyToken | `DENY` |
| S09 | required consent missing | non-ALLOW; never implicit allow |
| S10 | purpose mismatch | non-ALLOW |
| S11 | jurisdiction restriction | non-ALLOW with jurisdiction reason/evidence |
| S12 | unresolved policy conflict | `DENY` |
| S13 | identity not found/ambiguous | non-ALLOW; no fallback authority |
| S14 | historically valid/stale authority while current policy denies | `DENY`; current policy wins |
| S15 | DENY/REQUIRE_APPROVAL case plus synthetic high model confidence/reasoning/route metadata | exactly same authority/policy result |
| S16 | repeated identical canonical request + fixed policy snapshot | identical normalized decision/reason semantics |
| S17 | authority evidence from tenant A injected into tenant B request | `DENY` |
| S18 | F precheck | result without provider/executor call, persistence write, external mutation or authority minting |
| S19 | malformed/incompatible subject/scope reference | schema reject or deterministic `DENY`; never coercion to allow |
| S20 | missing current-policy context | `DENY`; never stale permissive fallback |

## Reproducibility evidence

A T2 run records at minimum exact code SHA, contract/schema versions, current policy reference/version/snapshot identity, normalized request/action/scope, tenant, resolved subject/actor refs, applicable consent/purpose/jurisdiction refs, authority evidence refs, correlation, normalized decision, reason codes and deterministic input fingerprint/reference. Secrets, provider credentials and private model chain-of-thought are excluded.

## Gate result rule

- T1 PASS + T2 PASS => `REALITY_GATE_1_AUTHORITY_VERIFIED`.
- Any safety/authority negative case that unexpectedly returns ALLOW => blocking failure.
- Missing deterministic replay evidence => blocking failure.
- Any real external side effect => blocking failure and W02 scope violation.

At W02-00, the gate definition is complete; execution remains dependency-gated to W02-G after A-F convergence.
