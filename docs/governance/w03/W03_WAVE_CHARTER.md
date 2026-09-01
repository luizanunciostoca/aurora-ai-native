# W03 Wave Charter — Persistence / Event Backbone / Durable Workflow

Status: `W03_00_COORDINATION_FREEZE_CANDIDATE`  
Baseline `main`: `ad664f32949256ccc5751fe1fb88047b66c2d247`  
Owner: AURORA PROGRAM CONTROL / W03-00

## Mission

Deliver the durable foundation for Postgres persistence, deterministic migrations, transactional outbox/inbox, idempotency, durable `EventEnvelope` delivery/subscriptions, bounded ordering/replay/DLQ, timers, leases and durable workflow primitives.

W02 PB5 is accepted and W03 is released for this coordination freeze. Leaf runtime remains gated until W03-00 is independently accepted.

## Canonical inputs

- GitHub `main`, accepted exact-SHA evidence and `CURRENT_PROGRAM_STATUS.md`.
- Developer Manual v0.5, Action Plan v0.4.1 and Risk Framework v1.0.
- W01 canonical `EventEnvelope`, IDs, context and versioning contracts/schemas.
- W02 accepted tenant/identity/policy/authority boundaries where durable state carries those references.
- TOCA MCP event/persistence/scheduler/migration material as `REFERENCE_ONLY`.

## Live repository audit

At the baseline, `EventEnvelope` and schema parity already exist in W01-owned packages. No canonical Aurora transactional outbox/inbox, Postgres persistence backbone, subscription registry or durable scheduler implementation was found. `infra/STATUS.md` explicitly states that Postgres/event infrastructure is scaffold-only. Searches for outbox/Postgres/scheduler resolve to governance/reference material rather than competing production runtime.

## Namespace freeze

W03 may materialize only the following owned runtime families after their dependency is released:

- `packages/persistence/**` — W03 Postgres/migration/storage primitives.
- `packages/events/**` — outbox/inbox/idempotency, transport/subscriptions, replay/DLQ.
- `packages/workflow/**` — W03 timers/leases/durable workflow state primitives.
- `migrations/**` — W03-assigned ordered migrations under coordinator allocation.
- `docs/governance/w03/**` — W03 governance/evidence mirrors.

Existing W01/W02 contracts are reused, never copied or widened. Root manifests, lockfile, CI/workflows, CODEOWNERS and shared/publication surfaces remain coordinator-owned.

## Hard boundaries

W03 does **not** implement W04 GoalGraph/Capability Registry/lanes, W05 agent runtime, W06 context/cache, W07 side-effect Executor, W08 providers, W09 n8n business logic, W14 gateway/session/trust, W15 Android/device runtime, W17 full telemetry/DR or W18 learning.

W03-C subscription interest is event routing, not a second Capability Registry. W03-E durable workflow is deterministic infrastructure, not W04 planning or W05 agent orchestration.

## Event-driven rule

Reliable state transitions are event-driven by default. Polling is allowed only as bounded claim scanning, reconciliation or documented recovery fallback with explicit interval/backoff/budget/ownership. It may not become hidden primary orchestration.

## Internal DAG

`W03-00 -> W03-A -> (W03-B || W03-C) -> (W03-D || W03-E) -> W03-F`

D/E require both B and C. Every edge requires accepted predecessor evidence, not merely a draft/open PR.

## Final target

`EventEnvelope -> transactional durable persistence -> delivery -> subscriber -> ack/replay`, including duplicate/dedupe, failure/DLQ recovery, timer/lease/restart recovery and reconstructable correlation/evidence without duplicate irreversible downstream side effects.

This charter becomes active only after the W03-00 governance PR passes Quality/Test Build/Security on one exact HEAD, `main` is revalidated, merge/post-merge verification succeeds and Drive registries converge.
