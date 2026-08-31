# W02 Dependency Matrix — Aurora AI-Native

Date: 2026-08-31  
Authority: CHAT W02 PROGRAM COORDINATOR  
Coordination starting SHA: `eb46df1c3a1ab98a6ad6d091178091cb880a70e7`  
PB1 technical acceptance: `b48953cd4a7913e154fe2804248217ffe0c0952d`

## Canonical DAG

```text
W02-00
  ├─> W02-A ─┐
  ├─> W02-B ─┼─> PB1 ─> W02-D ─> PB2 ─> W02-E ─> PB3 ─> W02-F ─> PB4 ─> W02-G ─> PB5/W02 ACCEPTANCE
  └─> W02-C ─┘
```

Draft code is never a publication barrier. D/E/F/G are released only by accepted/published predecessors and coordinator-controlled publication evidence.

## Current state

| Stage | State | Evidence / guard |
|---|---|---|
| W02-00 | `COMPLETE_ACCEPTED` | PR #35 |
| W02-A | `COMPLETE_ACCEPTED_MERGED` | PR #39; accepted head `4f84f20a1285ec3727591ed2ad89f90a9f988f1d` |
| W02-B | `COMPLETE_ACCEPTED_MERGED` | PR #37 |
| W02-C | `COMPLETE_ACCEPTED_MERGED` | PR #36 |
| PB1 | `COMPLETE_RELEASED` | technical main `b48953cd4a7913e154fe2804248217ffe0c0952d` |
| W02-D | `IN_PROGRESS_DRAFT_PR_41` | branch `wave/02d-policy-engine`; not accepted |
| PB2 | `PENDING` | requires accepted/published D |
| W02-E | `DEPENDENCY_GATED_PB2` | no implementation acceptance before PB2 |
| PB3 | `PENDING` | requires accepted/published E |
| W02-F | `DEPENDENCY_GATED_PB3` | precheck APIs only after PB3 |
| PB4 | `PENDING` | requires accepted F and A-F convergence |
| W02-G | `DEPENDENCY_GATED_PB4` | final integration + Reality Gate execution |
| PB5 | `PENDING` | exact-main final evidence + Drive convergence |

## Stage requirements

| Stage | Hard dependency | Required published output | Release condition |
|---|---|---|---|
| W02-00 | W01 ACCEPTED | audit, charter, ownership, DAG, acceptance/reality gate | coordination accepted + Drive synchronized |
| W02-A | W02-00 | identity-resolution contracts/schemas/runtime | accepted/merged — satisfied |
| W02-B | W02-00; A only if consumed | tenant boundary/binding contracts/schemas/runtime | accepted/merged — satisfied |
| W02-C | W02-00 | consent/purpose/jurisdiction contracts/schemas/registries | accepted/merged — satisfied |
| PB1 | A+B+C accepted | public exports + consumer fixture | complete — satisfied |
| W02-D | PB1 | deterministic policy evaluation contracts/core | exact-head replay/default-deny/conflict evidence + current-main reconciliation |
| PB2 | D accepted | D public contracts/package exports | exact PB2 SHA recorded by coordinator |
| W02-E | PB2 + accepted A/B/C/D | PolicyToken/OwnerDecision validation/evaluation | full fail-closed matrix |
| PB3 | E accepted | E public contracts/exports | exact PB3 SHA recorded |
| W02-F | PB3 | current-policy query/precheck API | side-effect-free + consumer tests |
| PB4 | F accepted | A-F converged main | exact converged SHA recorded |
| W02-G | PB4 | integrated exports/tests/Reality Gate evidence | T1+T2 + official gates |
| PB5 | G merged | final exact-main evidence + Drive registry convergence | W02 COMPLETE/ACCEPTED |

## W02-D current-main reconciliation requirement

Draft PR #41 was created from `c4f25eb41fcb7ff9e390466146ebdeb8239bfe6f`. The audit baseline for the documentation cleanup is later main `f0a4c2e00ca3eee6e5d9d52489d75a614bd799ae`.

Before W02-D acceptance:

1. rebase/reconcile the branch against then-current `main`;
2. revalidate no accepted A/B/C or W01 semantic authority was changed;
3. reconcile any coordinator-owned root/workflow/publication files under explicit ownership;
4. run official Quality, Test Build and Security on the exact final HEAD;
5. record accepted HEAD/PR/merge SHA and PB2 publication separately.

At this audit, PR #41 includes draft changes to root `package-lock.json` and `.github/workflows/w02d-format.yml`; both are coordinator-controlled surfaces under the W02 ownership rules. Their presence is not accepted by implication and must be resolved or explicitly owned before W02-D acceptance.

## Contract publication order

1. **P0 — W01:** canonical IDs/context/authority/error/outcome/versioning — accepted.
2. **P1 — A/B/C:** identity resolution; tenant boundary; consent/purpose/jurisdiction — accepted/published.
3. **P2 — D:** deterministic policy evaluation — draft/in progress.
4. **P3 — E:** authority validation/evaluation — gated.
5. **P4 — F:** current-policy query/precheck — gated.
6. **P5 — G:** final integrated exports/tests — gated.

A downstream consumer may not substitute direct internal imports for a required publication barrier.

## Downstream guards

- W03 may plan but cannot bypass W02 identity/policy boundaries.
- W04 may consume W02 policy/precheck semantics but cannot create authorization semantics.
- W05 routing/confidence may affect verification/escalation only, never permission.
- W06 cache/context/speculation must not replace current policy validation.
- W07 must perform execution-time authority validation where required; stale F precheck is never an execution credential.
- ADR-002 Device Plane planning changes no W02 dependency or authority semantics.

## PB1 evidence

Pre-merge: Quality `33417131319`, Test Build `33417131305`, Security `33417131803` — SUCCESS.  
Post-merge technical main: Quality `33417242995`, Test Build `33417242973`, Security `33417243977` — SUCCESS.

PB1 remains immutable historical technical acceptance. Later governance/documentation main SHAs do not rewrite that acceptance reference.
