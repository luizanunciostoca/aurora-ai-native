# W03 Risk Register & Pre-mortem

Status: `W03_00_COORDINATION_FREEZE_CANDIDATE`  
Framework: Risk & Architecture Validation Framework v1.0  
Baseline `main`: `ad664f32949256ccc5751fe1fb88047b66c2d247`

Exposure = likelihood × impact × detectability. Release blockers remain independent of score.

| Risk | Exposure | Control/verification |
|---|---:|---|
| W03-R01 duplicate delivery -> duplicate downstream effect | 80 CRITICAL | tenant-scoped idempotency/inbox uniqueness, conflict fingerprint, claim ownership; duplicate/concurrent/replay tests |
| W03-R02 outbox atomicity gap/lost event | 60 HIGH | same transaction, rollback/crash recovery tests |
| W03-R03 cross-tenant durable collision | 50 HIGH | tenant-scoped durable keys/queries/constraints; concurrent negative tests |
| W03-R04 lease split-brain/stale owner commit | 60 HIGH | lease token/version/fencing, atomic reclaim, stale-owner rejection |
| W03-R05 unsafe/stale replay | 60 HIGH | event != authority; replay controls + idempotency; downstream W07 reconcile-before-retry |
| W03-R06 poison/retry storm | 48 HIGH | bounded attempts/backoff, quarantine/DLQ/recovery |
| W03-R07 hidden global ordering assumption | 48 HIGH | explicit ordering domain/version preconditions; shuffled-delivery tests |
| W03-R08 timer duplication/clock bug | 48 HIGH | UTC instants, timer identity/state + lease/fencing; restart/race tests |
| W03-R09 stale/incompatible durable workflow resume | 48 HIGH | workflow schema/version/resume preconditions/terminal invariants |
| W03-R10 unbounded queue/storage/retention growth | 48 HIGH | indexed claims, bounded batches, backpressure/retention/lag hooks |
| W03-R11 SKIP LOCKED starvation/hot partition | 36 MODERATE | deterministic/fair claim ordering, aging, contention benchmark |
| W03-R12 partial/irreversible migration drift | 40 MODERATE | ordered immutable migration ledger, transactional/forward-fix policy, rehearsal |
| W03-R13 schema/event poisoning | 60 HIGH | W01 schema validation before dispatch, tenant/version checks, event-derived authority forbidden |
| W03-R14 evidence gap prevents reconstruction | 60 HIGH | durable eventId/correlation/tenant/status/attempt/owner timestamps and normalized outcomes |

## Pre-mortem

Assume W03 failed in production:

1. DB outage creates retry stampede -> require bounded backoff/batches/backpressure and failure-load gate.
2. Worker crashes after a future external effect but before ack -> W03 preserves idempotent delivery evidence; W07 must reconcile ambiguous external state before retry.
3. Tenants share idempotency key -> uniqueness is scoped by tenant/operation domain and negative-tested.
4. Stale lease owner commits after reclaim -> fencing/versioned writes reject it.
5. Poison event loops forever -> bounded attempts -> quarantine/DLQ -> explicit recovery.
6. Consumer assumes order -> explicit per-domain ordering/version rules and shuffled tests.
7. Migration is interrupted -> deterministic ledger + transactional/forward-fix rehearsal.
8. Queue outage grows storage until normal queries collapse -> indexed eligibility, retention/backpressure and lag/depth hooks.
9. Replay becomes implicit authorization -> architectural invariant: event/history != authority.
10. Incident cannot be reconstructed -> durable correlation/evidence transition records.

## Stress plan

- duplicate/replayed/out-of-order `EventEnvelope`;
- representative scaling toward 1,500 objectives / 10,000 downstream events with bounded fan-out/queue/claims;
- DB outage/latency/rollback;
- concurrent claimers, worker crash and expired lease;
- poison message + DLQ recovery;
- ack loss/subscriber outage;
- timer/restart/cancellation races;
- tenant mismatch under concurrency;
- backlog/storage pressure and retry amplification.

## Performance evidence shape

Record p50/p95/p99 enqueue/dispatch, consumer throughput, queue lag/depth, duplicate-rejection cost, claim contention, replay/DLQ recovery, timer/lease contention, resume latency, retry amplification and storage growth. Numeric SLOs must be evidence-driven, not invented by W03-00.

## Architecture kill criteria

Redesign before acceptance if W03 creates duplicate source of truth, hidden unbounded polling, circular event control, duplicate irreversible side effects after retry/replay, cross-tenant durable collision, unreconstructable failure, unbounded concurrency/storage, or recovery that guesses whether a side effect occurred.
