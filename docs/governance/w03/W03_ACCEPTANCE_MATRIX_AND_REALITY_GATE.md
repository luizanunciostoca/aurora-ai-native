# W03 Acceptance Matrix & Reality Gate

Status: `W03_00_COORDINATION_FREEZE_CANDIDATE`  
Target: `W03_REALITY_GATE_DURABLE_EVENT_DELIVERY_VERIFIED`

Risk Gates A/B/C/D are decided independently; a generic PASS cannot replace them.

## Global invariants

- Reuse W01 canonical `EventEnvelope`, IDs/context/versioning and schemas.
- W02 tenant/identity/policy/authority remains authoritative where applicable.
- Event history/replay never creates authority.
- Duplicate delivery/replay must not cause duplicate irreversible downstream side effects.
- Retry/replay/fan-out are bounded; no blind retry after ambiguous external state.
- Legacy/TOCA material remains reference-only unless deliberately re-specified/promoted.
- No W04+ feature leakage.

## Subwave gates

- **W03-00:** governance/reality/ownership/risk freeze; exact-head Quality/Test Build/Security; no main drift; Drive convergence.
- **W03-A:** reproducible Postgres/migrations, constraints/indexes/version/partial-failure rules, tenant/canonical-ID integrity.
- **W03-B:** atomic outbox, inbox/receipt/idempotency, deterministic claims/conflicts/attempts/evidence hooks.
- **W03-C:** validated durable EventEnvelope transport/subscriptions, bounded fan-out, independent ack, no hidden Capability Registry/polling-first design.
- **W03-D:** explicit ordering domains, replay/checkpoints, poison quarantine/DLQ/recovery and replay safety.
- **W03-E:** deterministic timers/lease fencing/heartbeat/expiry/reclaim, cancellation/timeouts, restart-safe durable state.
- **W03-F:** integrated fault/load Reality Gate and recovery runbook.

## Risk Gate A — Correctness

Deterministic state transitions, schema/type parity, idempotency, atomic persistence semantics, duplicate handling, replay reproducibility and lease/timer state machines must be proven.

## Risk Gate B — Safety / Authority

Tenant isolation must hold in durable keys/queries. No W03 path may elevate authority. Replay/precheck/event state cannot substitute current execution authority. W03 acceptance invokes no real provider/device side effects and introduces no secret-bearing event/evidence path. Any authority bypass, cross-tenant breach, uncontrolled duplicate irreversible side effect, secret exposure or irreversible execution without valid authority is release-blocking.

## Risk Gate C — Performance / Economics

As runtime exists, record enqueue/dispatch p50/p95/p99, consumer throughput, duplicate-rejection cost, queue lag/depth, claim contention/starvation, replay throughput, DLQ recovery, timer/lease contention, resume latency, retry amplification and retention/storage pressure. No invented SLO is accepted without evidence.

## Risk Gate D — Failure / Recoverability

Inject DB outage/rollback, worker crash, duplicate/replayed/out-of-order event, poison message, ack loss, lease expiry/reclaim, timer race, cancellation race, restart/resume and backlog pressure. Behavior must deterministically queue/reject/degrade/reconcile/quarantine/rollback as designed.

## Final Reality Gate R01–R20

1. canonical EventEnvelope validates and persists with tenant/correlation preserved;
2. outbox rolls back with owning transaction;
3. committed outbox survives pre-dispatch crash;
4. duplicate delivery produces one accepted idempotent consumer effect/receipt;
5. same idempotency key with incompatible payload/reference fails deterministically;
6. concurrent claimers do not simultaneously own one active record;
7. expired claim/lease can be reclaimed while stale owner commit is rejected;
8. fan-out is bounded and acknowledgements independent;
9. out-of-order delivery follows explicit ordering policy without global-order fiction;
10. replay is deterministic and cannot mint/elevate authority;
11. poison event reaches quarantine/DLQ after bounded attempts;
12. replay of completed work does not duplicate irreversible downstream effect in simulation;
13. durable timer follows defined at-most/once-per-state semantics across restart/races;
14. workflow resumes with schema/version/precondition checks;
15. cancel/timeout race yields one normalized terminal state;
16. tenant A durable identity/key/lease cannot satisfy tenant B processing;
17. malformed envelope/schema/version rejects before business dispatch;
18. representative 1,500-objective/10,000-event stress model remains bounded by implemented queue/claim/fan-out controls;
19. correlation/evidence reconstructs enqueue->claim->dispatch->ack/replay/DLQ/timer transitions without secrets/private reasoning;
20. no real provider/device execution occurs in W03 Reality Gate.

Final W03 decision is `ACCEPT | ACCEPT_WITH_RECORDED_RISK | REJECT | BLOCKED`. Acceptance requires A/B/C/D pass, applicable R01–R20 pass, Quality/Test Build/Security on one exact final HEAD, main revalidation, cleanup/ownership convergence and synchronized Drive/GitHub evidence.
