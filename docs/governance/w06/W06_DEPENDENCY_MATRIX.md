# W06 DEPENDENCY MATRIX

Date: 2026-09-02  
Status: `W06_00_COORDINATION_FREEZE_CANDIDATE`  
Base main: `8deb67875ba6f3fecd7494f7cc955d5965543e3a`

## Dependency authority

An edge is satisfied only by accepted canonical evidence: exact final HEAD + required gates + controlled merge + post-merge verification + Drive/GitHub convergence. PREBUILD, branch code, open PR, model/agent output, cache state or green CI alone never releases a node.

## W06 DAG

| Node | Hard dependencies | Unlocks | Owned semantic surface |
|---|---|---|---|
| W06-00 | W05-H accepted; W02-W04 accepted foundations | A, E | governance/context boundary freeze only |
| W06-A | W06-00 | B | ContextQuery + source adapters |
| W06-E | W06-00 | D, F after C | memory boundary model |
| W06-B | W06-A | C | retrieval/ranking/trust/freshness |
| W06-C | W06-B | D, F with E | MinimalContextPackage + compression |
| W06-D | W06-C + W06-E | G with F | ContextSnapshot + incremental invalidation |
| W06-F | W06-C + W06-E | G with D | semantic cache |
| W06-G | W06-D + W06-F | H | reversible safe speculative preparation |
| W06-H | W06-G | W06 final consumers | context quality/performance tests |

Canonical graph:

`W05-H -> W06-00 -> (A || E)`

`A -> B -> C`

`C + E -> (D || F)`

`D + F -> G -> H`

## First READY frontier after W06-00 acceptance

`{W06-A, W06-E}`.

They are semantically separable only if their diffs remain inside frozen leaves. Any required public contract/package manifest/root-barrel change is a Program Control convergence barrier.

## Cross-wave dependencies

- W06 consumes W01 context primitives and W02 tenant/identity/consent/purpose/jurisdiction boundaries; it never redefines identity or authority.
- W06 consumes W03 event/replay foundations for invalidation; no duplicate durable event/workflow source of truth.
- W06 consumes W04 task/control/budget information; no GoalGraph/lane/budget source-of-truth duplication.
- W06 serves W05 intelligence with context; W05 route/confidence cannot widen source eligibility or tenant scope.
- W07 remains the hard execution boundary; context/cache/snapshot evidence never substitutes current authority.
- W17 owns production-grade telemetry/SLOs and W18 owns learned promotion.

## Fail-closed release rules

1. Unknown tenant/source/classification/provenance required for a fact prevents trusted inclusion.
2. Stale/unknown freshness cannot be silently treated as current where currentness is required.
3. Trust score, ranking score, semantic similarity, cache hit or snapshot presence never grants authority.
4. Compression cannot remove mandatory provenance, conflict, tenant/classification or safety-relevant constraints.
5. Cache/snapshot cannot replay PolicyToken/OwnerDecision as current execution permission.
6. W03 replay/out-of-order invalidation cannot resurrect invalidated context without a fresh compatible source read.
7. Speculation remains read-only/reversible preparation and cannot call W07/provider/device/workflow writes.
8. Descendants remain gated until their exact predecessors are accepted.

## PREBUILD policy

Blocked nodes may perform read-only readiness/reference analysis only when permitted by Puzzle governance. PREBUILD cannot modify runtime source, create authority, satisfy an edge or become canonical by existence.
