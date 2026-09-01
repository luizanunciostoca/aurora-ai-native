# W03 migration baseline

This directory holds the W03 Postgres migration baseline for durable event, inbox/outbox, idempotency and workflow state.

## Conventions

- Number migrations in ascending order (`001_...`, `002_...`) and keep each file deterministic.
- Prefer additive changes only. If a migration must change semantics or drop state, use an explicit forward-safe transition and document the rollback risk.
- Persist Aurora canonical IDs exactly in their governed `<prefix>_<ULID>` wire format. Do not coerce `TenantId`, `EventId`, `CorrelationId`, `CausationId`, `IdentityId` or other canonical IDs to database UUIDs.
- UUIDs are allowed only as explicitly documented database-local surrogates when no Aurora canonical namespace exists; such UUIDs never become canonical IDs by persistence.
- Use `TIMESTAMPTZ` and `JSONB` for durable temporal and structured state where appropriate.
- Carry `tenant_id` through relational keys and foreign-key constraints wherever a durable reference crosses tables, so a valid event identifier from tenant A cannot satisfy a tenant B relation.
- Keep all critical keys, checks and indexes explicit in SQL so that idempotency, replay safety, timer claims and lease fencing remain verifiable at the database layer.
- Preserve canonical `EventEnvelope` identity/context needed for later transport and replay: event ID/type/version, occurrence time, producer identity/kind, source, tenant, correlation/causation, subject/classification, payload and metadata.
- Keep retention and cleanup policy alongside DDL comments so operators can enforce bounded storage cost and audit retention.

## Baseline migration

- `001_w03_postgres_baseline.sql` creates the durable schema primitives required for W03-A: canonical event store, outbox, inbox, idempotency ledger, timers and lease state.
- Runtime claim, retry, replay, transport and workflow behavior remains owned by W03-B through W03-E; this migration only establishes the persistence constraints they may rely on.
