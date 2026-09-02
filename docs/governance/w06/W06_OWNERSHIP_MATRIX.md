# W06 OWNERSHIP MATRIX

Date: 2026-09-02  
Status: `W06_00_COORDINATION_FREEZE_CANDIDATE`  
Base main: `8deb67875ba6f3fecd7494f7cc955d5965543e3a`

## Principles

- W06 owns context retrieval/minimization/cache semantics, not identity, policy, authority, control-core truth, intelligence routing or execution.
- Existing W01 context primitives are reused; W06 does not redefine TenantContext, CorrelationContext, identity refs or DataClassification.
- Exact path ownership is narrow by default.
- Package manifests, root/public barrels, shared contracts, CI and cross-wave publication remain Program Control-owned.
- Concurrent work requiring one shared surface stops at `SHARED_SURFACE_RECONCILIATION_REQUIRED`.

## Canonical namespace allocation

### `packages/context/**`

A new W06-owned semantic package may be materialized only after W06-00 acceptance. Program Control owns package skeleton, `package.json`, tsconfig/build config and root/public barrels.

Leaf ownership:
- W06-A: `packages/context/src/query/**`, `packages/context/src/sources/**`; tests `packages/context/test/w06a-**`.
- W06-B: `packages/context/src/retrieval/**`; tests `packages/context/test/w06b-**`.
- W06-C: `packages/context/src/minimal-context/**`; tests `packages/context/test/w06c-**`.
- W06-E: `packages/context/src/memory-boundaries/**`; tests `packages/context/test/w06e-**`.
- W06-D: `packages/context/src/snapshots/**`; tests `packages/context/test/w06d-**`.
- W06-F: `packages/context/src/semantic-cache/**`; tests `packages/context/test/w06f-**`.
- W06-G: `packages/context/src/speculation/**`; tests `packages/context/test/w06g-**`.
- W06-H: integration/quality/performance evidence under `packages/context/test/w06h-**` plus W06 governance evidence; it does not rewrite semantic leaves.

## Existing shared context primitives

`packages/contracts/src/context/**` remains W01 canonical shared foundation and is not a general W06 leaf namespace.

W06 consumes:
- TenantContext;
- CorrelationContext / CausationRef;
- ActorRef / SubjectRef / ExternalIdentityRef;
- Deadline / Expiry / RFC3339 timestamp primitives;
- DataClassification;
- PropagationContext / PropagationMetadata.

If W06-A/C later require a public cross-wave contract in `packages/contracts/**` or schema publication in `packages/schemas/**`, Program Control must explicitly allocate and reconcile that shared change. No leaf may create a parallel ID/context primitive to avoid this barrier.

## Node ownership

| Node | Exclusive semantic ownership | Prohibited overlap |
|---|---|---|
| W06-00 | `docs/governance/w06/**`, W06 graph/ownership metadata | no runtime feature code |
| W06-A | query/source adapter leaves | no retrieval ranking; no provider writes |
| W06-B | retrieval/ranking/trust/freshness leaf | no authority; no cache source of truth |
| W06-C | minimal context/compression leaf | no hidden removal of policy/provenance constraints |
| W06-E | memory boundary taxonomy/retention/conflict ownership | no global memory god-store |
| W06-D | snapshot/invalidation leaf | no frozen policy/authority permission |
| W06-F | semantic cache leaf | no secrets/credentials/authority-token cache |
| W06-G | speculative preparation leaf | no external side effects |
| W06-H | integration/performance/eval evidence | no new production semantic runtime; no W18 promotion |

## Program Control shared surfaces

- root `package.json`, lockfiles, workspace/build config;
- `.github/workflows/**`, CODEOWNERS;
- future `packages/context/package.json`, tsconfig/build config and root/public barrels;
- `packages/contracts/**` and `packages/schemas/**` public evolution;
- W03/W04/W05 package/service public barrels owned by those waves;
- `docs/governance/CURRENT_PROGRAM_STATUS.md` and cross-wave publication maps.

## Cross-wave locks

- W01 owns canonical IDs/context primitives.
- W02 owns identity/tenant/consent/purpose/jurisdiction/policy/authority semantics.
- W03 owns durable event/replay/workflow truth.
- W04 owns lifecycle, CapabilityPlan, GoalGraph, scheduler, lanes, ExecutionBudget and templates.
- W05 owns classifier/reasoning/confidence/router/strategy/agent-loop intelligence.
- W07 owns current execution validation, target resolution, side effects, readback/reconciliation/failure containment.
- W17 owns production observability/SLOs; W18 owns adaptive learned promotion.

## Reference-only ownership

- Legacy MemoryManager remains `CONCEPT_REUSE`; no direct runtime import.
- TOCA Asset Intelligence/Creative Truth material remains semantic/provenance reference; no TOCA business source of truth or schema is promoted wholesale.

## Parallel write policy

After W06-00 acceptance, A and E are safe semantic parallel candidates if their leaf paths remain disjoint. B starts only after A acceptance. C starts after B. D and F may proceed in parallel only after both C and E are accepted. G starts after D/F. H starts after G. Unplanned cross-leaf dependency narrows the frontier instead of widening ownership.
