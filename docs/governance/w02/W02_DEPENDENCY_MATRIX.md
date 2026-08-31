# W02 Dependency Matrix — Aurora AI-Native

Date: 2026-08-31  
Authority: CHAT W02 PROGRAM COORDINATOR  
Coordination starting SHA: `eb46df1c3a1ab98a6ad6d091178091cb880a70e7`  
Current implementation main at W02-E acceptance: `17e452356abd6e43f959a2cbb0bcf47de35abbfd`

## Canonical DAG

```text
W02-00
  ├─> W02-A ─┐
  ├─> W02-B ─┼─> PB1 ─> W02-D ─> PB2 ─> W02-E ─> PB3 ─> W02-F ─> PB4 ─> W02-G ─> PB5/W02 ACCEPTANCE
  └─> W02-C ─┘
```

Draft code is never a publication barrier. A dependent stage is released only by accepted/published predecessors plus coordinator-controlled publication evidence.

## Current authoritative state

| Stage | State | Evidence / guard |
|---|---|---|
| W02-00 | `COMPLETE_ACCEPTED` | PR #35 |
| W02-A | `COMPLETE_ACCEPTED_MERGED` | PR #39; accepted head `4f84f20a1285ec3727591ed2ad89f90a9f988f1d` |
| W02-B | `COMPLETE_ACCEPTED_MERGED` | PR #37 |
| W02-C | `COMPLETE_ACCEPTED_MERGED` | PR #36 |
| PB1 | `COMPLETE_RELEASED` | immutable technical main `b48953cd4a7913e154fe2804248217ffe0c0952d` |
| W02-D | `COMPLETE_ACCEPTED_MERGED` | PR #46; exact head `e9ca04a4b5ffe66619f092bd37614c68b7aa2600` |
| PB2 | `COMPLETE_RELEASED` | PR #47; exact publication head `2dd9d77e1062ae03d95268bd2de99b28376878fc` |
| W02-E | `COMPLETE_ACCEPTED_MERGED` | PR #50; exact accepted/merged SHA `17e452356abd6e43f959a2cbb0bcf47de35abbfd` |
| PB3 | `ELIGIBLE_NOT_EXECUTED` | E accepted; coordinator publication still required |
| W02-F | `DEPENDENCY_GATED_PB3 / NOT_STARTED` | precheck APIs only after PB3 |
| PB4 | `PENDING` | requires accepted F and A-F convergence |
| W02-G | `DEPENDENCY_GATED_PB4` | final integration + Reality Gate execution |
| PB5 | `PENDING` | exact-main final evidence + Drive convergence |

Historical PR #41 remains superseded W02-D draft evidence. It is not current state.

## Stage requirements

| Stage | Hard dependency | Required output | Release / acceptance condition |
|---|---|---|---|
| W02-00 | W01 accepted | audit, charter, ownership, DAG, acceptance/reality gate | satisfied |
| W02-A | W02-00 | identity-resolution contracts/schemas/runtime | satisfied |
| W02-B | W02-00; A if consumed | tenant boundary/binding contracts/schemas/runtime | satisfied |
| W02-C | W02-00 | consent/purpose/jurisdiction contracts/schemas/registries | satisfied |
| PB1 | A+B+C accepted | public exports + consumer fixture | satisfied |
| W02-D | PB1 | deterministic policy evaluation contracts/core | satisfied; exact-head replay/default-deny/conflict evidence |
| PB2 | D accepted | D public contracts/package exports | satisfied under coordinator publication |
| W02-E | PB2 + accepted A/B/C/D | PolicyToken/OwnerDecision validation/evaluation | satisfied; fail-closed attack/negative matrix |
| PB3 | E accepted | E public contracts/schemas/package exports + consumer boundary | **not executed**; exact PB3 SHA + gates required |
| W02-F | PB3 | current-policy query/precheck API | side-effect-free + informational-only + consumer tests |
| PB4 | F accepted | A-F converged main | exact converged SHA recorded |
| W02-G | PB4 | integrated exports/tests/Reality Gate evidence | T1+T2 + official gates |
| PB5 | G merged | exact-main evidence + Drive registry convergence | W02 complete/accepted |

## Accepted D / PB2 / E chain

W02-D acceptance:

- PR #46.
- exact head `e9ca04a4b5ffe66619f092bd37614c68b7aa2600`.
- Quality `33428380492`, Test Build `33428380455`, Security `33428381776`: SUCCESS.

PB2 publication:

- PR #47.
- exact publication head `2dd9d77e1062ae03d95268bd2de99b28376878fc`.
- Quality `33429270894`, Test Build `33429270672`, Security `33429271811`: SUCCESS.

W02-E acceptance:

- PR #50.
- exact accepted/merged SHA `17e452356abd6e43f959a2cbb0bcf47de35abbfd`.
- Quality `33435840491`, Test Build `33435840492`, Security `33435841084`: SUCCESS.
- 23-scenario authority-validation/attack matrix: PASS.
- cleanup: PASS; canonical broken relative refs = 0.

## Contract publication order

1. **P0 — W01:** canonical IDs/context/authority/error/outcome/versioning — accepted.
2. **P1 — A/B/C:** identity resolution; tenant boundary; consent/purpose/jurisdiction — accepted/published.
3. **P2 — D:** deterministic policy evaluation — accepted/published through PB2.
4. **P3 — E:** authority validation/evaluation — accepted; **PB3 public publication not yet executed**.
5. **P4 — F:** current-policy query/precheck — gated by PB3.
6. **P5 — G:** final integrated exports/tests — gated by PB4.

A downstream consumer may not substitute direct/internal imports, a build alias or an acceptance shim for a required publication barrier.

## PB3 guard

W02-E acceptance alone does not release W02-F. PB3 must independently reconcile coordinator-owned shared barrels/export maps, package manifests and consumer boundaries for E, then pass official Quality, Test Build and Security on the exact publication HEAD before F may start.

## Downstream guards

- W03 cannot bypass W02 identity/policy boundaries.
- W04 may consume policy/precheck information but cannot create authorization semantics.
- W05 routing/confidence affects verification/escalation only, never permission.
- W06 cache/context/speculation never replaces current policy validation.
- W07 must perform execution-time authority validation where required; stale precheck is never an execution credential.
- ADR-002 Device Plane planning changes no W02 dependency or authority semantics.

## Final W02 guard

Reality Gate 1 remains dependency-gated to W02-G after A-F convergence. Completion of W02-E does not mark W02 complete.
