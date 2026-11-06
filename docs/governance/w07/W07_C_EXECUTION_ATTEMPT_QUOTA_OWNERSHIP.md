# W07-C / W03 — Durable execution-attempt/quota state: ownership decision and implementation record

Date: 2026-09-06
Status: `IMPLEMENTED_AWAITING_OWNER_ACCEPTANCE`
Base main revalidated: `c23fb4a77d61ea9ff39f628002896d73cede1794`
Tracks: #474 (this remediation), #469, #470, #460, W15-J/DP5.

## Mission

Allocate the missing durable server-owned runtime state for the W07-C safeguard
gate's `attemptNumber`, `maxAttempts` and optional tenant-scoped execution
quota inputs, and the smallest W07-C read-side integration needed to consume
it fail-closed.

## Canonical findings (unchanged, reaffirmed)

- `w03_event_outbox.attempt_count`/its `max_attempts` claim bound are
  EventEnvelope transport/delivery counters. They are **not** reused here.
- `w03_idempotency_key` remains an operation fence, not an attempt/quota
  counter.
- W04 `ExecutionBudget` remains planning-lane metadata, not runtime safety
  state.
- W07-F remains the sole owner of retry *eligibility*. This remediation adds
  no retry logic and no automatic-retry permission.
- W07-C owns safeguard semantics and the read-side consumption contract; W03
  owns the durable persistence primitive.

## What this remediation adds

### 1. W03-owned durable schema (additive migration)

`migrations/002_w03_execution_attempt_quota.sql` adds
`w03_execution_attempt_quota`, keyed by `(tenant_id, action_intent_id,
execution_ref)`:

- `attempt_number INTEGER >= 1`, `max_attempts INTEGER >= 1` — required,
  never defaulted by the schema.
- `quota_limit`/`quota_used` — optional, but a database `CHECK` enforces
  they are both present or both absent (no half-specified quota).
- `version BIGINT >= 1` and `updated_at TIMESTAMPTZ` — an optimistic
  concurrency fence and staleness signal for the read-side consumer.
- No column expresses authority, outcome or retry permission.

The migration is additive only (no destructive change to `001`), reversible
by deprecation, and tenant-scoped through the primary key and a canonical
`ActionIntentId` format `CHECK` constraint.

### 2. W03-owned SQL statement builders

`packages/events/src/delivery/attempt-quota.ts` adds pure, tested statement
builders (no ORM, consistent with the rest of `packages/events/src/delivery`):

- `buildSelectExecutionAttemptQuotaStatement` — read the current row.
- `buildInsertExecutionAttemptQuotaStatement` — create the initial row from
  caller-supplied (never schema-fabricated) first-attempt state.
- `buildCompareAndSwapExecutionAttemptQuotaStatement` — optimistic-concurrency
  mutation fenced on the caller's previously-read `version`; a stale writer
  affects zero rows instead of clobbering newer state.

These builders persist counters/quota only. They do not decide retry
eligibility or attempt-limit/quota-exhaustion verdicts; those remain owned by
`evaluateExecutionSafeguards` (W07-C) and W07-F reconciliation respectively.

### 3. W07-C-owned fail-closed read port and resolver

`services/executors/src/safeguards/attempt-quota-source.ts` defines
`ExecutionAttemptQuotaSource`, a read-only port a concrete adapter implements
by materializing a snapshot from `w03_execution_attempt_quota` at the
composition edge. `services/executors/src/safeguards/attempt-quota-resolution.ts`
adds `resolveCurrentAttemptQuota`, which:

- re-reads the source on every call (no cached verdict);
- binds `tenantId + actionIntentId + executionRef` and rejects
  (`CONTEXT_MISMATCH`) if the returned row does not match;
- rejects (`SOURCE_UNAVAILABLE`) if the source throws (outage);
- rejects (`STATE_ABSENT`) if no row exists;
- rejects (`STATE_MALFORMED`) on any non-conforming shape, including a
  corrupted `quota`;
- rejects (`STATE_STALE`) if `updatedAt` is older than a caller-supplied
  `maxAgeMs` or is in the future;
- rejects (`TIME_INVALID` / `LOOKUP_INVALID`) on malformed inputs;
- never fabricates defaults such as `attempt=1`/`maxAttempts=3`;
- never emits an authority or retry field — only structurally resolves
  `attemptNumber`/`maxAttempts`/optional `quota` for
  `evaluateExecutionSafeguards` to evaluate.

## Safety / ownership compliance

- Absence/outage/malformed/stale state fails closed — proven by unit tests
  in `services/executors/test/w07c-attempt-quota-resolution.test.ts`.
- No defaults such as `attempt=1`/`maxAttempts=3` are ever produced.
- No Android/wake/STT/W14 ACK/device-trust input can create or mutate this
  state: the only write paths are the W03-owned SQL statement builders,
  invoked exclusively by server-side execution orchestration.
- Mutation is server-owned via optimistic concurrency (`version`), which is
  compatible with W07 reconciliation/retry ownership: W07-F still decides
  *whether* to retry; this store only durably records the current
  counters/quota once that decision is made.
- No unrelated schema changes: `001_w03_postgres_baseline.sql` is untouched.

## Test and gate evidence

- `packages/events/test/w03g-execution-attempt-quota.test.mjs` — unit tests
  for the SQL statement builders (shape, defaults-never-fabricated,
  optimistic-concurrency fencing).
- `services/executors/test/w07c-attempt-quota-resolution.test.ts` — positive,
  negative, stale, outage and re-read/concurrency-observation tests for the
  fail-closed resolver.
- `packages/events/test/w03g-execution-attempt-quota-postgres-reality-gate.sh`
  — Postgres reality gate: positive insert, optimistic-concurrency
  compare-and-swap (current version succeeds, stale version is rejected and
  leaves the winner's state intact), tenant isolation, malformed
  `ActionIntentId`/attempt/quota rejection, and DB-unavailable fail-closed
  boundary. Run locally against PostgreSQL 16 with all scenarios `PASS`.
- No physical DP5 PASS is claimed or produced by this remediation.

## Residual scope (explicitly out of this remediation)

- Wiring a concrete Postgres-backed `ExecutionAttemptQuotaSource` adapter and
  the W07 execution orchestration write path (the caller that decides
  attempt/quota values and invokes the W03 statement builders) remains W07
  execution-orchestration/W15-J dispatching-intake integration work, tracked
  separately; this issue allocates the durable primitive and the W07-C
  read-side consumption contract only.
- DP5 physical evidence remains separately evidence-gated and `NOT_RUN`.
