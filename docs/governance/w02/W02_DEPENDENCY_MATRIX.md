# W02 Dependency Matrix — Aurora AI-Native

Date: 2026-08-31  
Authority: CHAT W02 PROGRAM COORDINATOR  
Coordination starting SHA: `eb46df1c3a1ab98a6ad6d091178091cb880a70e7`  
Current PB3 technical publication main: `fc5634488c84e382ee69efc0444ff9b70c004d77`

## Canonical DAG

```text
W02-00
  ├─> W02-A ─┐
  ├─> W02-B ─┼─> PB1 ─> W02-D ─> PB2 ─> W02-E ─> PB3 ─> W02-F ─> PB4 ─> W02-G ─> PB5/W02 ACCEPTANCE
  └─> W02-C ─┘
```

A dependent stage is released only by accepted/published predecessors plus coordinator-controlled publication evidence. Draft code, internal imports and build aliases do not satisfy publication barriers.

## Current authoritative state

| Stage | State | Evidence / guard |
|---|---|---|
| W02-00 | `COMPLETE_ACCEPTED` | PR #35 |
| W02-A | `COMPLETE_ACCEPTED_MERGED` | PR #39 |
| W02-B | `COMPLETE_ACCEPTED_MERGED` | PR #37 |
| W02-C | `COMPLETE_ACCEPTED_MERGED` | PR #36 |
| PB1 | `COMPLETE_RELEASED` | technical main `b48953cd4a7913e154fe2804248217ffe0c0952d` |
| W02-D | `COMPLETE_ACCEPTED_MERGED` | PR #46; exact HEAD `e9ca04a4b5ffe66619f092bd37614c68b7aa2600` |
| PB2 | `COMPLETE_RELEASED` | PR #47; exact publication HEAD `2dd9d77e1062ae03d95268bd2de99b28376878fc` |
| W02-E | `COMPLETE_ACCEPTED_MERGED` | PR #50; exact accepted SHA `17e452356abd6e43f959a2cbb0bcf47de35abbfd` |
| PB3 | `COMPLETE_RELEASED_MERGED` | PR #53; exact publication HEAD `cece292115c0dfa91da2b9694934348ea04b6b4d`; publication main `fc5634488c84e382ee69efc0444ff9b70c004d77` |
| W02-F | `RELEASED_NOT_STARTED / READY_FOR_IMPLEMENTATION` | PB3 satisfied; implementation not started |
| PB4 | `PENDING` | requires accepted F and A-F convergence |
| W02-G | `DEPENDENCY_GATED_PB4` | final integration + Reality Gate execution |
| PB5 | `PENDING` | final exact-main evidence + Drive convergence |

Historical PR #41 remains superseded W02-D draft evidence and does not represent current state.

## Stage requirements

| Stage | Hard dependency | Required output | Release / acceptance condition |
|---|---|---|---|
| W02-00 | W01 accepted | audit, charter, ownership, DAG, acceptance/reality gate | satisfied |
| W02-A | W02-00 | identity-resolution contracts/schemas/runtime | satisfied |
| W02-B | W02-00; A if consumed | tenant boundary/binding contracts/schemas/runtime | satisfied |
| W02-C | W02-00 | consent/purpose/jurisdiction contracts/schemas/registries | satisfied |
| PB1 | A+B+C accepted | public exports + consumer fixture | satisfied |
| W02-D | PB1 | deterministic policy evaluation contracts/core | satisfied |
| PB2 | D accepted | D public contracts/package exports | satisfied |
| W02-E | PB2 + accepted A/B/C/D | PolicyToken/OwnerDecision validation/evaluation | satisfied |
| PB3 | E accepted | E public contracts/schemas/authority runtime + consumer boundary | satisfied via PR #53 |
| W02-F | PB3 | current-policy query/precheck APIs | read-only, side-effect-free, informational-only; own exact-head gates required |
| PB4 | F accepted | A-F converged main | exact converged SHA recorded |
| W02-G | PB4 | integrated exports/tests/Reality Gate evidence | T1+T2 + official gates |
| PB5 | G merged | exact-main evidence + Drive registry convergence | W02 complete/accepted |

## Accepted D → PB2 → E → PB3 chain

W02-D acceptance:
- PR #46.
- exact HEAD `e9ca04a4b5ffe66619f092bd37614c68b7aa2600`.
- Quality `33428380492`, Test Build `33428380455`, Security `33428381776`: SUCCESS.

PB2 publication:
- PR #47.
- exact publication HEAD `2dd9d77e1062ae03d95268bd2de99b28376878fc`.
- Quality `33429270894`, Test Build `33429270672`, Security `33429271811`: SUCCESS.

W02-E acceptance:
- PR #50.
- exact accepted/merged SHA `17e452356abd6e43f959a2cbb0bcf47de35abbfd`.
- Quality `33435840491`, Test Build `33435840492`, Security `33435841084`: SUCCESS.
- 23-scenario authority-validation/attack matrix: PASS.

PB3 publication:
- PR #53.
- exact publication HEAD `cece292115c0dfa91da2b9694934348ea04b6b4d`.
- publication main `fc5634488c84e382ee69efc0444ff9b70c004d77`.
- Quality `33439372557`, Test Build `33439372604`, Security `33439373811`: SUCCESS.
- public consumer fixture verifies `@aurora/contracts/policy-validation`, `@aurora/schemas/policy-validation` and `@aurora/policy-core/authority`.

## Contract publication order

1. **P0 — W01:** canonical IDs/context/authority/error/outcome/versioning — accepted.
2. **P1 — A/B/C:** identity resolution; tenant boundary; consent/purpose/jurisdiction — accepted/published.
3. **P2 — D:** deterministic policy evaluation — accepted/published through PB2.
4. **P3 — E:** authority validation/evaluation — accepted/published through PB3.
5. **P4 — F:** current-policy query/precheck — released, not started.
6. **P5 — G:** final integrated exports/tests — gated by PB4.

## W02-F guard

PB3 releases W02-F but does not start it. W02-F must remain informational/read-only and side-effect-free. Precheck cannot mint authority, replace current validation or become an execution credential. W02-F must pass its own exact-head tests/gates before PB4 may be considered.

## Downstream guards

- W03 cannot bypass W02 identity/policy boundaries.
- W04 may consume policy/precheck information but cannot create authorization semantics.
- W05 routing/confidence affects verification/escalation only, never permission.
- W06 cache/context/speculation never replaces current policy validation.
- W07 must perform execution-time authority validation where required; stale precheck is never an execution credential.
- ADR-002 Device Plane planning changes no W02 dependency or authority semantics.

## Final W02 guard

Reality Gate 1 remains dependency-gated to W02-G after A-F convergence. PB3 completion does not mark W02 complete.
