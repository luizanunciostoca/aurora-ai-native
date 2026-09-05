---
description: 'Prepare high-value Aurora Puzzle READINESS/PREBUILD lanes without creating authority'
---

Target node/wave: ${input:target:Enter the blocked Aurora node or wave}

Operate in non-authoritative Puzzle mode.

Revalidate live GitHub and identify why the target is not canonical BUILD_READY. Then prepare only useful future integration work:

- expected input/output contracts and assumptions;
- exact ownership/shared surfaces;
- reference/reuse decisions;
- negative/failure/replay/race/security test matrix;
- threat and recovery model;
- integration/reconciliation plan;
- performance/resource hypotheses;
- acceptance/reality-gate scenarios.

Set and preserve:

`canonicalAuthority=false`
`requiresReconciliation=true`

Do not satisfy a dependency, create a canonical acceptance PR, freeze a future-owner public contract, edit shared/root surfaces or treat an expected contract as accepted truth.

Runtime PREBUILD patches are permitted only when the owning task has explicit machine-readable `prebuildAllowedPaths`; otherwise perform zero speculative runtime writes.

Return assumptions in a form Program Control can later compare as `SATISFIED / CHANGED / INVALID` against the actually accepted upstream contract.
