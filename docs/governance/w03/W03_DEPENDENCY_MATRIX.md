# W03 Dependency Matrix

Status: `W03_00_COORDINATION_FREEZE_CANDIDATE`  
Baseline `main`: `ad664f32949256ccc5751fe1fb88047b66c2d247`

A dependency is satisfied only by accepted/merged predecessor evidence plus required publication/reconciliation. Draft code, branch existence, imports or green CI on an unaccepted candidate never release downstream work.

| Task | Depends on | Releases after acceptance | Primary output |
|---|---|---|---|
| W03-00 | W02-PB5 accepted | W03-A | charter/dependency/ownership/acceptance/risk freeze |
| W03-A | W03-00 | W03-B and W03-C | Postgres schema + deterministic migration baseline |
| W03-B | W03-A | contributes to D/E | outbox/inbox/idempotency/claims |
| W03-C | W03-A | contributes to D/E | durable EventEnvelope transport/subscriptions/ack |
| W03-D | W03-B + W03-C | contributes to F | ordering/replay/checkpoint/DLQ/recovery |
| W03-E | W03-B + W03-C | contributes to F | timers/leases/durable workflow/restart recovery |
| W03-F | W03-D + W03-E | final W03 acceptance | integration/failure/load Reality Gate |

## Parallelism

After A acceptance, B and C may run in parallel on non-overlapping leaf paths. After both B+C are accepted, D and E may run in parallel. F starts only after both D+E are accepted.

## Shared-surface barriers

Root `package.json`, `package-lock.json`, shared/root TypeScript/build config, CI/workflows, CODEOWNERS and coordinator-owned shared/public export maps require explicit coordinator reconciliation/transfer. Parallel leaf edits to the same shared file are prohibited.

## Cross-wave constraints

- W04 runtime remains gated on final W03 acceptance.
- W15 may later consume W03 idempotency/replay/timers, but W03 does not create device identity/session/runtime.
- W17 later owns production-grade telemetry/DR; W03 provides reconstructable durable hooks/evidence only.
- W03 replay/history never grants authority and never substitutes W07 execution-time current policy/authority validation.

Any disagreement among live `main`, accepted SHA, Drive registries, `CURRENT_PROGRAM_STATUS` or ownership/dependency docs blocks downstream release until reconciled.
