# W03 Recovery Runbook — Durable Event Delivery

Status: W03-F acceptance candidate

## Authority boundary

This runbook restores W03 durable state only. Recovery, replay, a stored EventEnvelope, an idempotency record, a lease, a timer, a provider credential or a prior successful execution **never creates current execution authority**. Any future external side effect must cross the current W07 execution authority boundary when that wave exists.

## Canonical recovery order

1. Stop new W03 dispatch/claims when database state is uncertain.
2. Establish PostgreSQL availability and transaction health before changing durable records.
3. Inspect tenant-scoped outbox/inbox/idempotency/timer/lease state using correlation/event identifiers.
4. Reclaim only records whose claim/lease is expired under the accepted fencing semantics.
5. Never let a stale claim token or stale lease owner acknowledge, complete, cancel or mutate current ownership.
6. Quarantine sequence gaps, stale/out-of-order events and replay that could imply external side effects.
7. Resume bounded delivery only after queue depth, claim ownership and tenant boundaries are consistent.
8. Preserve evidence for enqueue -> claim -> dispatch -> ack/receipt -> replay/DLQ/timer transitions.

## Failure procedures

### Database unavailable

- Fail closed; do not infer commit/rollback from an ambiguous connection result.
- Stop new claim loops and external dispatch.
- Restore connectivity, then inspect durable state before retrying.
- A transaction that did not commit is treated as absent; a committed outbox row is the durable source for later dispatch.

### Worker crash after commit but before dispatch

- The committed outbox row remains pending/claimable.
- A replacement worker may claim it according to claim-token expiry and attempt limits.
- Duplicate consumer effects remain protected by inbox/idempotency semantics.

### Worker crash after claim

- Do not steal an unexpired active claim/lease.
- After expiry, reclaim with a new owner token.
- The stale owner must not ack/complete/cancel after reclaim.

### Duplicate delivery

- Register/inspect tenant-scoped idempotency/inbox state.
- Identical replay returns the recorded state; incompatible operation/payload/event reference is a deterministic conflict.
- Never silently coalesce incompatible payloads.

### Out-of-order / sequence gap

- Ordering is scoped, never global by default.
- Quarantine stale/out-of-order or gap records according to the replay coordinator.
- Advance a checkpoint only on an accepted next sequence.

### Poison / unsafe replay

- Place the event in quarantine/DLQ with reason and timestamps.
- External-side-effect replay remains `executionAuthorized:false` and requires fresh authority validation before any later execution.
- Do not create an infinite retry loop.

### Timer / lease contention

- Claim due timers with row-lock/skip-locked semantics and an ownership fence.
- Heartbeat only the exact current unexpired owner.
- On restart, expire stale leases and requeue only the timer still fenced by that stale owner.
- Completion and cancellation race through the same current-owner/state preconditions so only one terminal transition wins.

## Validation required before W03 acceptance

The W03-F candidate must prove, on one exact candidate lineage:

- deterministic integration scenarios in the normal repository test suite;
- a real PostgreSQL gate applying the accepted W03 migration;
- transaction rollback and committed-outbox recovery;
- active-owner exclusion and stale-owner fencing;
- tenant isolation;
- timer claim contention and one terminal transition;
- malformed canonical identifiers rejected;
- unavailable database fails closed;
- bounded fan-out/backlog/load evidence with recorded latency metrics;
- no provider or device side effects.

## Escalation

If state cannot be classified as committed, rolled back, pending, claimed by a current owner, safely reclaimable, acked, quarantined or terminal, stop automatic recovery and classify it as reconciliation-required. Do not guess external state.
