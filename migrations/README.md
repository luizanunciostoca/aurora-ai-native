# W03 migration baseline

This directory holds the W03 Postgres migration baseline for durable event, inbox/outbox, idempotency and workflow state.

## Conventions

- Number migrations in ascending order (`001_...`, `002_...`) and keep each file deterministic.
- Prefer additive changes only. If a migration must change semantics or drop state, use an explicit forward-safe transition and document the rollback risk.
- Use `UUID`, `TIMESTAMPTZ`, `JSONB` and canonical tenant ids for durable runtime state; do not create W04 or device/provider domain tables in W03.
- Keep all critical keys, checks and indexes explicit in SQL so that idempotency, replay safety, timer claims and lease fencing remain verifiable at the database layer.
- Keep retention and cleanup policy alongside DDL comments so operators can enforce bounded storage cost and audit retention.

## Baseline migration

- `001_w03_postgres_baseline.sql` creates the durable schema primitives required for W03-A: event store, outbox, inbox, idempotency ledger, timers and lease state.
