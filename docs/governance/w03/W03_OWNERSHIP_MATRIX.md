# W03 Ownership Matrix

Status: `W03_00_COORDINATION_FREEZE_CANDIDATE`  
Baseline `main`: `ad664f32949256ccc5751fe1fb88047b66c2d247`

## Rule

One canonical owner per semantic surface. W03 may store/transport canonical W01/W02 references but may not fork `EventEnvelope`, canonical IDs/context/versioning, tenant/identity or policy/authority vocabularies.

| Owner | Exclusive surface after release | Must not own |
|---|---|---|
| W03-00 / Program Control | `docs/governance/w03/**`, migration-number allocation, shared/publication reconciliation | leaf runtime except explicit conflict resolution |
| W03-A | W03-assigned `migrations/**`, `packages/persistence/**` baseline | W04/business/provider/device schema |
| W03-B | `packages/events/**` outbox/inbox/idempotency leaf paths | external executor/retry authority |
| W03-C | `packages/events/**` transport/subscription/ack leaf paths | W04 Capability Registry |
| W03-D | `packages/events/**` ordering/replay/DLQ/recovery leaf paths | authority semantics or blind external replay |
| W03-E | `packages/workflow/**` timer/lease/durable-state leaf paths | W04 scheduler/GoalGraph, W05 agents, W15 Android |
| W03-F | W03 integration/fault/load tests, fixtures/benchmarks/runbook | new product semantics during acceptance |

## Coordinator-retained surfaces

Root `package.json`, `package-lock.json`, shared/root TypeScript/build config, CI/workflows, CODEOWNERS, cross-package public exports/manifests and any file required by multiple parallel leaf tasks remain coordinator-controlled unless a written transfer is recorded.

## Canonical read/reuse-only surfaces

- `packages/contracts/src/envelopes/**` and `EventEnvelope`: W01 authority.
- canonical IDs/context/versioning contracts and envelope schemas: W01 authority.
- `packages/policy/**` and accepted identity/tenant/policy/authority semantics: W02 authority.

## Future-wave exclusions

W04 owns Capability Registry/GoalGraph/planning scheduler/lanes/budgets/templates; W05 agent/model runtime; W07 ActionIntent side-effect execution, reconciliation and `EXECUTION_UNCERTAIN`; W08 providers; W09 n8n; W14 device gateway/session/trust; W15 Android runtime; W17 production telemetry/SLO/DR; W18 adaptive learning.

## Conflict rule

If two leaf tasks need the same source file, shared barrel, migration number, manifest or schema, ownership returns to W03-00 until a deterministic transfer/reconciliation is recorded. A merge does not self-release ownership; downstream use requires independent acceptance plus main/Drive convergence.
