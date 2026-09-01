# W05 OWNERSHIP MATRIX

Date: 2026-09-01  
Status: `W05_00_COORDINATION_FREEZE_CANDIDATE`  
Base main: `b502bfa7e97291086c09cc85cd71040f96d3b036`

## Principles

- W05 owns intelligence strategy selection, not policy authority, control-core truth, context truth or execution.
- Exact path ownership is narrow by default; neighboring files are not implicitly owned.
- Shared manifests, barrels, root config, CI and publication maps remain Program Control-owned.
- Concurrent semantic work that needs one shared/public surface stops at `SHARED_SURFACE_RECONCILIATION_REQUIRED`.

## Canonical namespace allocation

### `packages/intelligence/**`
Program Control owns package skeleton, `package.json`, tsconfig/build config and root/public barrels.

Leaf ownership:
- W05-A: `packages/intelligence/src/classification/**`; tests `packages/intelligence/test/w05a-**`.
- W05-C: `packages/intelligence/src/reasoning-level/**`; tests `packages/intelligence/test/w05c-**`.
- W05-D: `packages/intelligence/src/confidence/**`; tests `packages/intelligence/test/w05d-**`.
- W05-B: `packages/intelligence/src/router/**`; tests `packages/intelligence/test/w05b-**`.
- W05-H: W05 integration/routing benchmark fixtures under `packages/intelligence/test/w05h-**`; it does not rewrite semantic leaves.

### `packages/registries/src/strategies/**`
- W05-E only.
- This registry represents intelligence strategies/models/specialists/computer-use/human routing compatibility and availability metadata.
- It MUST remain semantically distinct from `packages/registries/src/capabilities/**`, which remains the single W04 Capability Registry.
- Shared `packages/registries/src/index.ts`, package manifest/build/export surfaces remain Program Control-owned.

### `services/agent-runtime/**`
The existing scaffold is the canonical W05 runtime target.
- W05-F: `services/agent-runtime/src/runtime/**`; tests `services/agent-runtime/test/w05f-**`.
- W05-G: `services/agent-runtime/src/loop/**`; tests `services/agent-runtime/test/w05g-**`.
- Existing `legacy-manus-reference/**` remains provenance/reference-only and is never authoritative runtime.
- `services/agent-runtime/STATUS.md`, service manifests/config/barrels/publication are Program Control-owned shared surfaces.

## Node ownership

| Node | Exclusive semantic ownership | Prohibited overlap |
|---|---|---|
| W05-00 | `docs/governance/w05/**`, W05 graph/ownership metadata | no runtime feature code |
| W05-A | classification leaf | no authority decision; no router |
| W05-C | ReasoningLevel leaf | no model execution authority; no budget source of truth |
| W05-D | confidence leaf/calibration interface | no approval/permission; no W18 promotion |
| W05-E | strategy registry leaf | no second capability registry |
| W05-B | Intelligence Router leaf | no direct tools/executor side effects |
| W05-F | generic bounded worker runtime | no god-object control plane; no duplicate durable workflow |
| W05-G | bounded adaptive loop | no unbounded autonomy; no executor implementation |
| W05-H | integration/eval/benchmark evidence | no new production semantic runtime |

## Program Control shared surfaces

- root `package.json`, lockfiles, workspace/build config;
- `.github/workflows/**`, CODEOWNERS;
- `packages/intelligence/package.json`, tsconfig/build config and public/root barrels;
- `packages/registries/package.json`, tsconfig/build config and root public barrel;
- `services/agent-runtime/STATUS.md`, manifests/config/root barrels;
- `packages/contracts/**` and `packages/schemas/**` public evolution unless an owning W05 node receives an explicit compatibility-reviewed allocation;
- `docs/governance/CURRENT_PROGRAM_STATUS.md` and cross-wave publication maps.

## Cross-wave locks

- W02 owns Policy Engine, PolicyToken/OwnerDecision and current authority validation semantics.
- W03 owns durable events/outbox/inbox/replay/DLQ/timers/leases/workflow truth.
- W04 owns lifecycle, Capability Registry/CapabilityPlan, GoalGraph, scheduler, lanes, ExecutionBudget and curated templates.
- W06 owns context retrieval/ranking/trust/freshness/minimization/memory/cache.
- W07 owns ActionIntent execution, current execution validation, target resolution, readback/reconciliation/failure containment.
- W17 owns production observability/SLOs; W18 owns adaptive learned promotion.

## Parallel write policy

After W05-00 acceptance, A/C/D/E/F are safe semantic parallel candidates because their leaf paths are disjoint. B starts only after A/C/D/E acceptance. G starts only after B/F acceptance. H starts only after G acceptance. Any unplanned cross-leaf semantic dependency must be recorded and the frontier narrowed rather than solved by path widening.