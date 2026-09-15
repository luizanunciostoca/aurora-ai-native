# W03 ↔ W06 — Aurora Memory Fabric Durability Boundary

Status: `BUILD_CANDIDATE / CROSS_WAVE_INTEGRATION`

Tracking: `#533`

Initial canonical base: `fc94c17b02086ee64c5d703aec21904e0fc5dc6b`

## Purpose

W06-I established Aurora Memory Fabric as the model-agnostic memory/context projection layer. This integration gives that projection durable restart continuity while preserving W03 as the single durability owner and W06 as the single owner of memory semantics.

This is deliberately not a new event store, authority store or global memory source of truth.

## Ownership split

W03 owns:

- the generic tenant-scoped durable JSON state table;
- optimistic revision fencing / compare-and-swap semantics;
- additive migration `002_w03_durable_state.sql`;
- database-level tenant, namespace, key and revision constraints;
- the generic SQL executor contract and Postgres adapter.

W06 owns:

- which Memory Fabric states are eligible for durable storage;
- validation of memory boundaries, provenance, classification and retention references;
- lifecycle semantics (`CANDIDATE`, `VALIDATED`, `CANONICAL`, `SUPERSEDED`, `REVOKED`);
- serialization/restoration of `MemoryFabricSnapshot`;
- explicit exclusion of transient working memory and prohibited material.

Neither layer may infer execution authority from persistence.

## Data flow

```text
W06 MemoryFabricSnapshot
        |
        | validate + strip WORKING/TRANSIENT
        v
W06 durable-state consumer port
        |
        v
W03 tenant-scoped CAS state store
        |
        v
Postgres w03_durable_state

restart
Postgres -> W03 store -> W06 decode/validation -> MemoryFabricSnapshot
```

## Durable-state semantics

The generic W03 row is addressed by:

- canonical `tenant_id`;
- bounded `state_namespace`;
- bounded `state_key`.

The row has a positive monotonic revision and opaque `JSONB` payload. Creation uses expected revision `0`; updates require an exact current revision. Equal-payload writes may return `UNCHANGED` without incrementing the durable revision. A stale writer receives `CONFLICT` and the observed current revision.

CAS conflicts never authorize automatic retry. The caller must reload/reconcile explicitly.

## Memory Fabric persistence policy

The W06 adapter uses namespace `aurora.w06.memory-fabric.v1` and key `snapshot` per tenant.

Persisted:

- durable non-working `CANDIDATE` proposals;
- `VALIDATED` projections with source evidence;
- `CANONICAL` projections;
- `SUPERSEDED` history required for conflict/provenance reconstruction;
- `REVOKED` records required so restart cannot resurrect withdrawn memory.

Not persisted:

- `WORKING` boundary records;
- `TRANSIENT` lifecycle state;
- raw audio / binary content;
- known credential/secret material;
- current `PolicyToken` or `OwnerDecision` material.

The top-level Memory Fabric revision may therefore include transient in-session changes that are absent after restart. It is a W06 projection revision, not the W03 CAS revision. The W03 durable revision is tracked separately and is the only revision used for persistence concurrency.

## Validation on restore

A durable payload is not trusted merely because it came from the database. W06 revalidates:

- tenant binding;
- Memory Fabric snapshot shape;
- memory boundary and source owner;
- classification vocabulary;
- provenance/source references;
- retention reference where required;
- lifecycle and lifecycle evidence;
- JSON-safe content;
- absence of durable transient working state;
- non-authority marker.

Malformed or cross-tenant durable payloads fail closed.

## Event/replay boundary

`w03_durable_state` is a restart projection/checkpoint primitive. It does not replace canonical `EventEnvelope` history, W03 outbox/inbox, replay ordering or DLQ controls. If a future workflow requires reconstructing business history from events, the existing W03 event/replay surfaces remain canonical.

No durable Memory Fabric restore may replay an external side effect or re-authorize an uncertain execution.

## Authority invariants

All durable-state and Memory Fabric results remain explicitly non-authoritative:

- `authorizesExecution=false`;
- `retryAuthorized=false` where retry semantics are surfaced;
- persistence success does not prove source truth;
- model confidence does not promote memory;
- database possession does not mint authority.

`INTELLIGENCE != AUTHORITY != EXECUTION`

`CONTEXT != AUTHORITY`

## DP5 / W16 boundary

This work is independent of W15-J physical DP5 validation. It does not modify the Android physical candidate, device execution, LOCAL host tuple or DP5 evidence dossier. It does not release W16 BUILD.

## Acceptance target

Before merge:

1. additive migration only;
2. W03 generic CAS state tests pass;
3. W06 first-write/reload/restart reconstruction passes;
4. equal-write idempotency passes;
5. stale CAS conflict is surfaced without auto-retry;
6. transient WORKING memory is absent after durable restore;
7. malformed/cross-tenant/prohibited payloads fail closed;
8. no W03 dependency on W06 semantics is introduced;
9. Quality, Test Build and Security pass on the same exact final HEAD.
