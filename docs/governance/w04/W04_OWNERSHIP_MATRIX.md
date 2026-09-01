# W04 OWNERSHIP MATRIX

Date: 2026-09-01  
Status: `W04_00_COORDINATION_FREEZE_CANDIDATE`  
Base main: `76ba0db1bf399c21d08e2190915213ceb8f4eb02`

## Ownership principles

- W04 owns planning/control semantics, not execution authority or side effects.
- Existing W01/W02/W03 canonical contracts remain authoritative in their domains.
- Exact path ownership is narrow by default. A worker may not widen scope because a neighboring file is convenient.
- Package manifests, lockfiles, root build/workspace config, barrels/public exports, CODEOWNERS and CI remain Program Control-owned shared surfaces unless explicitly transferred.
- If two concurrent tasks need one shared/publication surface, leaf workers stop at `SHARED_SURFACE_RECONCILIATION_REQUIRED`; Program Control reconciles it after semantic leaves are stable.

## Canonical namespace allocation

### `packages/control/**`
New W04-owned package namespace for control-core semantics only. Its shared package skeleton/publication surfaces are Program Control-owned.

Leaf allocations:
- `src/lifecycle/**` — W04-A.
- `src/capability-plan/**` — W04-B.
- `src/goal-graph/**` — W04-C.
- `src/scheduler/**` — W04-D.
- `src/lanes/**` — W04-E.
- `src/budget/**` — W04-F.
- `src/templates/**` — W04-G.
- `test/w04a-**`, `test/w04b-**`, etc. — matching subwave.
- W04-H owns W04 integration/benchmark fixtures, not the semantic leaves above.

### `packages/registries/src/capabilities/**`
Single canonical Capability Registry foundation — W04-B only.

The registry stores/validates target-neutral capability metadata/lifecycle/compatibility/availability/freshness and governed binding descriptors. It is not a permission store and not an executor.

## Node ownership

| Node | Exclusive semantic ownership | Prohibited overlap |
|---|---|---|
| W04-00 | `docs/governance/w04/**`, W04 machine graph metadata, current-status reconciliation | No runtime feature implementation |
| W04-A | `packages/control/src/lifecycle/**`, W04-A tests | No W05 agent runtime; no scheduler/capability registry |
| W04-B | `packages/registries/src/capabilities/**`, `packages/control/src/capability-plan/**`, W04-B tests | No second registry; no provider/device executor; no authority issuance |
| W04-C | `packages/control/src/goal-graph/**`, W04-C tests | No durable workflow replacement; no implicit model mutation |
| W04-D | `packages/control/src/scheduler/**`, W04-D tests | No provider execution; no W03 lease/timer duplication |
| W04-E | `packages/control/src/lanes/**`, W04-E tests | Lane is not authority; no W05 routing implementation |
| W04-F | `packages/control/src/budget/**`, W04-F tests | Budget cannot weaken validation or issue authority |
| W04-G | `packages/control/src/templates/**`, W04-G tests | No W18 self-learning/self-promotion |
| W04-H | W04 integration/performance/contract tests and W04 operational runbook/evidence | No new semantic runtime implementation |

## Program Control shared surfaces

The following remain coordinator-owned throughout W04 unless a recorded ownership transfer says otherwise:
- root `package.json` and `package-lock.json`;
- root TypeScript/build/workspace configuration;
- `.github/workflows/**` and CODEOWNERS;
- `packages/control/package.json`;
- `packages/control/tsconfig*.json`;
- `packages/control/src/index.ts` and any package export/publication map;
- `packages/registries/package.json`, tsconfig/build config and `packages/registries/src/index.ts`;
- `packages/contracts/**` and `packages/schemas/**` public/shared evolution unless explicitly allocated by Program Control after compatibility review;
- cross-package publication/consumer maps.

A leaf task that discovers a required change here reports it; it does not silently claim the surface.

## Cross-wave ownership locks

### W03
Owns Postgres durable persistence, outbox/inbox, idempotency, event transport, replay/DLQ, timers, leases and durable workflow primitives. W04 consumes these; it does not copy them into GoalGraph/scheduler.

### W02
Owns policy/authority. Capability metadata, lane selection, budget or template match cannot become `PolicyToken`, `OwnerDecision` or an executable authorization decision.

### W05
Owns intelligence classification/router/reasoning/confidence/agent runtime. W04 lane eligibility is deterministic planning/control metadata, not a model strategy router.

### W07
Owns execution target resolution and side-effect executor semantics, including current Policy/Authority validation, readback, reconciliation, circuit breaker and kill switch.

### W14
Owns DeviceId/DeviceRef decision, registration, session/trust, realtime device gateway and revoke/kill transport semantics.

### W15
Owns Android/native capability bridge, installed-app integration, local permission/consent brokerage and Device Executor implementation.

### W17/W18
W17 owns production telemetry/SLO/evidence integration; W18 owns adaptive optimization and promotion. W04 only exposes stable fields/curated foundations they can consume.

## Capability seed ownership

The 69 legacy capability seeds and TOCA capability vocabulary are not owned as runtime code by W04-00. W04-B owns semantic adjudication: ACCEPT / REJECT / RENAME / DECOMPOSE, with provenance and risk/evidence metadata.

No seed creates an implementation obligation. High-risk verbs such as shell/browser console/file delete/deploy/device power remain vocabulary/risk inputs until their actual executor owner waves are separately authorized.

## Parallel write policy

Safe semantic parallelism after W04-00:
- A, B and F have distinct leaf surfaces.
- Shared `packages/control` scaffold/barrel/manifest changes are a Program Control barrier.
- C/E/G are distinct leaves after A+B.
- D may overlap E/G only when live diff ownership remains disjoint.
- H starts only after D+E+G accepted and owns convergence tests, not leaf rewrites.

Any unplanned semantic overlap fails closed and reduces the current READY frontier rather than permitting concurrent edits.
