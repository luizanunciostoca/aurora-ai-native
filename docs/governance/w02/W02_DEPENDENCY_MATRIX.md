# W02 Dependency Matrix — Aurora AI-Native

Date: 2026-08-31  
Authority: CHAT W02 PROGRAM COORDINATOR  
Baseline SHA: `eb46df1c3a1ab98a6ad6d091178091cb880a70e7`

## Canonical DAG

```text
W02-00
  ├─> W02-A ─┐
  ├─> W02-B ─┼─> PB1 ─> W02-D ─> PB2 ─> W02-E ─> PB3 ─> W02-F ─> PB4 ─> W02-G ─> PB5/W02 ACCEPTANCE
  └─> W02-C ─┘
```

A/B/C may run concurrently only on their exclusive leaf paths. D/E/F/G are released only by accepted/published predecessors, not by draft files.

## Stage requirements

| Stage | Hard dependency | Required published output | Release condition |
|---|---|---|---|
| W02-00 | W01 ACCEPTED | audit, charter, ownership, DAG, acceptance/reality gate, registries | coordination PR accepted + Drive synchronized |
| W02-A | W02-00 | identity-resolution contracts/schemas/runtime evidence | exact-main rebase + leaf tests |
| W02-B | W02-00; A only if consumed | tenant binding/boundary contracts/schemas | fail-closed tenant tests; any A dependency rebased |
| W02-C | W02-00 | consent/purpose/jurisdiction contracts/schemas/registries | deterministic negative tests |
| PB1 | A+B+C accepted | public exports + consumer fixture | exact PB1 main SHA recorded |
| W02-D | PB1 | deterministic policy evaluation contracts/core | replay/default-deny/conflict tests |
| PB2 | D accepted | D public contracts/package exports | exact PB2 SHA recorded |
| W02-E | PB2 + accepted A/B/C | token/authority validation contracts/core | full fail-closed matrix |
| PB3 | E accepted | E public contracts/exports | exact PB3 SHA recorded |
| W02-F | PB3 | query/precheck contracts/API | side-effect-free + consumer tests |
| PB4 | F accepted | A-F converged main | exact main SHA recorded |
| W02-G | PB4 | integrated exports/tests/Reality Gate evidence | T1+T2 + official gates |
| PB5 | G merged | final exact-main evidence + Drive registry convergence | W02 COMPLETE/ACCEPTED |

## Contract publication order

1. **P0 — W01:** canonical IDs/context/authority/error/outcome/versioning already published.
2. **P1 — A/B/C:** identity resolution; tenant binding/boundary; consent/purpose/jurisdiction.
3. **P2 — D:** deterministic policy evaluation decision/result/reasons.
4. **P3 — E:** PolicyToken/OwnerDecision validation/evaluation.
5. **P4 — F:** current-policy query/precheck API.
6. **P5 — G:** integrated public exports/test fixtures only; no new unrelated semantic vocabulary.

A downstream consumer may not substitute direct internal-path imports for the required public publication barrier.

## Merge/rebase order

1. W02-00 coordination.
2. A/B/C independently by readiness; declared cross-dependencies must be rebased before final acceptance.
3. Coordinator PB1 publication.
4. D.
5. Coordinator PB2 publication.
6. E.
7. Coordinator PB3 publication.
8. F.
9. G after PB4.
10. PB5 final exact-main acceptance.

## Downstream guards

- W03 may plan but cannot bypass W02 identity/policy boundaries in persistence/event implementation.
- W04 consumes W02 policy/precheck semantics; it cannot create lane/capability authorization semantics.
- W05 confidence/routing may affect verification or escalation strategy only; never permission.
- W06 cache/context/speculation must revalidate current policy before an authority-relevant consumer acts.
- W07 executor cannot treat a stale F precheck result as an execution credential; execution-time validation remains mandatory in its wave.

## Current state after W02-00

- A: READY
- B: READY
- C: READY
- D: `GATED_PB1`
- E: `GATED_PB2`
- F: `GATED_PB3`
- G: `GATED_PB4`
