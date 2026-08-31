# W02 Acceptance Matrix & Reality Gate

Date: 2026-08-31  
Authority: CHAT W02 PROGRAM COORDINATOR  
Current PB3 technical publication main: `fc5634488c84e382ee69efc0444ff9b70c004d77`  
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
- No duplicate W01 primitive or competing W02 policy decision vocabulary.

## Subwave acceptance state

### W02-A — `COMPLETE_ACCEPTED_MERGED`
PR #39. Deterministic identity resolution accepted without authority creation or identity-graph persistence.

### W02-B — `COMPLETE_ACCEPTED_MERGED`
PR #37. Explicit identity/tenant binding and fail-closed wrong/missing/ambiguous/cross-tenant behavior accepted.

### W02-C — `COMPLETE_ACCEPTED_MERGED`
PR #36. Explicit consent/purpose/jurisdiction semantics accepted without W03 persistence.

### W02-D — `COMPLETE_ACCEPTED_MERGED`
PR #46; exact accepted HEAD `e9ca04a4b5ffe66619f092bd37614c68b7aa2600`.

Accepted properties include one policy-decision vocabulary (`ALLOW | DENY | REQUIRE_APPROVAL`), deny by default, deterministic conflict precedence, replay stability, explicit policy reference/version/reasons/evidence, no confidence-based authority elevation and no external side effect.

Gates: Quality `33428380492`, Test Build `33428380455`, Security `33428381776` — SUCCESS.

### W02-E — `COMPLETE_ACCEPTED_MERGED`
PR #50; exact accepted/merged SHA `17e452356abd6e43f959a2cbb0bcf47de35abbfd`.

Accepted properties include exact tenant/subject/action/scope/constraints/time/current-policy validation; fail-closed expired/not-yet-valid/revoked/stale/mismatched authority; least authority; no scope widening; current-policy precedence; OwnerDecision applicability; explicit subject bridging; provider-secret rejection; deterministic replay; confidence neutrality; and no W02-F precheck implementation.

Gates: Quality `33435840491`, Test Build `33435840492`, Security `33435841084` — SUCCESS. 23-scenario authority/attack matrix: PASS.

### PB3 — `COMPLETE_RELEASED_MERGED`
PR #53; exact publication HEAD `cece292115c0dfa91da2b9694934348ea04b6b4d`; publication main `fc5634488c84e382ee69efc0444ff9b70c004d77`.

Published boundaries:
- `@aurora/contracts/policy-validation` plus contracts root re-export;
- `@aurora/schemas/policy-validation` plus schemas root re-export;
- `@aurora/policy-core/authority`;
- consumer fixture proving public resolution after package builds.

Gates: Quality `33439372557`, Test Build `33439372604`, Security `33439373811` — SUCCESS.

PB3 changes publication/integration only. No W02-E semantic runtime, W02-F query/precheck behavior, provider/executor/persistence/planner/router/model behavior, package-lock, workflow or CODEOWNERS semantics changed.

### W02-F — `RELEASED_NOT_STARTED / READY_FOR_IMPLEMENTATION`
PB3 dependency is satisfied. F has not been implemented or accepted.

Pass requires read-only, side-effect-free current-policy query/precheck APIs that compose accepted D/E types, return explicit current-policy/correlation/reasons/evidence, and never mint executable authority. Stale precheck cannot replace execution-time validation.

### W02-G — `DEPENDENCY_GATED_PB4`
Pass requires clean consumer compilation/public exports, schema parity, duplicate/cycle/dependency/legacy-runtime audits, full T1/T2 suite, official gates on exact acceptance main and final Drive/repository evidence convergence.

## Publication barriers

- PB0: `COMPLETE`.
- PB1: `COMPLETE_RELEASED` — technical main `b48953cd4a7913e154fe2804248217ffe0c0952d`.
- PB2: `COMPLETE_RELEASED` — PR #47; exact publication HEAD `2dd9d77e1062ae03d95268bd2de99b28376878fc`.
- PB3: `COMPLETE_RELEASED_MERGED` — PR #53; exact publication HEAD `cece292115c0dfa91da2b9694934348ea04b6b4d`.
- PB4: `PENDING`.
- PB5: `PENDING`.

PB3 completion releases F only. It is not Reality Gate completion and does not mark W02 complete.

## T1 — Contract gate

All must pass on the exact final W02 acceptance SHA:

- canonical public exports resolve;
- consumer fixture type/runtime resolution succeeds;
- runtime schema parse/reject parity holds;
- one unique source exists for frozen W01 names;
- one unique `PolicyEvaluationDecision` vocabulary exists;
- no package dependency cycle exists;
- no canonical W02 runtime depends on `reference/**` or `**/legacy-reference/**`;
- no accidental W03/W04/W05/W06/W07+ feature implementation exists;
- no unresolved ownership violation exists in shared/root/CI/publication surfaces.

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
| S14 | stale authority while current policy denies | `DENY`; current policy wins |
| S15 | DENY/REQUIRE_APPROVAL + synthetic high confidence metadata | identical authority result |
| S16 | repeated identical canonical request + fixed policy snapshot | identical normalized result/fingerprint |
| S17 | tenant A authority injected into tenant B request | `DENY` |
| S18 | F precheck | no provider/executor call, persistence write, external mutation or authority minting |
| S19 | malformed/incompatible subject/scope reference | schema reject or deterministic non-ALLOW |
| S20 | missing current-policy context | `DENY`; never stale permissive fallback |

W02-E provides accepted evidence for its authority-validation subset. PB3 provides public-boundary evidence. Full T1/T2 execution remains W02-G responsibility after A-F convergence.

## Reproducibility evidence

A final T2 run records exact code SHA, contract/schema versions, policy reference/version/snapshot identity, normalized request/action/scope, tenant, subject/actor refs, consent/purpose/jurisdiction refs, authority refs, correlation, decision, reason codes and deterministic input fingerprint/reference. Secrets, provider credentials and private model chain-of-thought are excluded.

## Gate result rule

- T1 PASS + T2 PASS => `REALITY_GATE_1_AUTHORITY_VERIFIED`.
- Any safety/authority negative case unexpectedly returning ALLOW => blocking failure.
- Missing deterministic replay evidence => blocking failure.
- Any real external side effect => blocking scope violation.
- Any unresolved ownership drift in final integration surfaces => blocking acceptance failure.

Reality Gate execution remains dependency-gated to W02-G after A-F convergence. ADR-002 does not weaken or replace this gate.
