# W07-C / W15-J — Execution-Attempt & Quota Ownership Decision

Status: `OWNERSHIP_DECISION_RUNTIME_PORT_SHIPPED_DURABLE_SOURCE_BLOCKED`
Date: 2026-09-06
Issue: `luizanunciostoca/aurora-ai-native#469` (tracks `#460`, W15-J / DP5).
Upstream checkpoint: PR `#462` exact green head `3696ed90daf5e6fa173e01cfe798a39e182de788`.

## Mission

Provide the missing **server-owned runtime source** for the W07 safeguard inputs
`attemptNumber`, `maxAttempts` and optional execution `quota` consumed by the W15-J
dispatching voice flow (`W15JDispatchingVoiceCandidateIntake` ->
`evaluateExecutionSafeguards`).

## Ownership decision

**W07-C owns the semantics and the read side of the execution-attempt/quota input**;
it consumes a current server-owned value at the safeguard gate and persists nothing.

**No accepted canonical primitive currently owns the durable, tenant + ActionIntent-scoped
execution-attempt/quota state.** The durable source is therefore **BLOCKED** pending a
coordinator-owned schema/allocation decision (below). This change ships only the W07-C-owned
fail-closed read port and resolution guard; it does **not** fabricate the durable store.

### Primitive-by-primitive verdict

| Candidate primitive | Verdict | Reason |
|---|---|---|
| `w03_event_outbox.attempt_count` / `maxAttempts` | **REJECTED (prohibited)** | W03 EventEnvelope **delivery-transport** counters bound to event fan-out, not ActionIntent execution. Different semantics; the issue forbids this reuse. |
| `w03_idempotency_key` | **REJECTED** | W03 operation/idempotency **fence** (NEW/REPLAY/CONFLICT). It detects duplicate operations; it is not an attempt/quota counter and carries no attempt/quota value. |
| W04 `ExecutionBudget` (`packages/control/src/budget`) | **REJECTED** | Planning-lane constraint metadata (`LATENCY_MS`/`COST_MICROS`/`REASONING_UNITS`/`TOOL_CALLS`/`CONCURRENCY`). It is not an execution-attempt/quota counter, is degradable, and by invariant cannot bypass safety/authority. Reusing it as the safety-critical attempt/quota source would conflate planning with the side-effect gate. |
| W07-F reconciliation | **REJECTED** | Owns retry **eligibility** (`nextAttemptNumber`, `reconcile-before-retry`). It does not own the *current* attempt/quota counter consumed at the gate. |
| W07-C safeguard gate | **READ-SIDE OWNER (accepted scope)** | Accepted scope is the deterministic gate over call-time inputs with **no second W03 ledger**. It cannot be the durable source of truth. |

## Precise ownership / schema blocker

A durable **execution-attempt/quota** store is required with these semantics. No accepted
migration or schema currently provides it, and creating one is a **coordinator-owned
shared/publication surface** (a new migration under `migrations/**`, possible
`packages/persistence`/`packages/events` additions and any cross-package export). Such
allocation is outside the W07-C leaf fence granted by `#469` and requires Program Control
reconciliation before implementation.

Required canonical semantics for the (blocked) durable source:

1. **Identity** binds `tenantId + actionIntentId + executionRef` (ActionIntent execution
   context), never an event/outbox fan-out id.
2. **Current value** is server-owned and re-read at the W07-C gate on every evaluation.
3. **Never supplied** by Android, wake/STT, router confidence, W14 ACK or device trust.
4. **Fail closed** on state absence, source outage or malformed data — no fabricated
   `attempt=1/maxAttempts=3` default.
5. **No automatic retry permission** — W07-F reconciliation remains the owner of retry
   eligibility.
6. **Quota**, when present, is current and tenant-scoped.

Until a compatible canonical primitive is allocated and accepted, the dispatching voice flow
must treat the attempt/quota input as **unavailable** and fail closed
(`NOT_ATTEMPTED_STATE_UNAVAILABLE`), as the `OwnerBackedVoiceExecutionStateSource` contract
already requires. This change does not weaken that stance and produces **no physical PASS**.

## What this change adds (W07-C leaf scope)

New leaf files under `services/executors/src/safeguards/**` (W07-C exclusive ownership):

- `attempt-quota-source.ts` — the `ExecutionAttemptQuotaSource` port, the
  tenant + ActionIntent-bound `ExecutionAttemptQuotaLookup`, the
  `ExecutionAttemptQuotaSnapshot` (reusing the canonical `ExecutionQuotaSnapshot`), and the
  fail-closed `ExecutionAttemptQuotaResolution` vocabulary.
- `attempt-quota-resolution.ts` — `resolveCurrentAttemptQuota`, a deterministic fail-closed
  guard that re-reads the source at the gate and rejects on outage/throw, state absence,
  malformed state, lookup `tenantId`/`actionIntentId` context mismatch, malformed lookup
  reference or invalid evaluation time. It validates shape and context binding only; the
  existing `evaluateExecutionSafeguards` remains the owner of `ATTEMPT_LIMIT_REACHED` /
  `QUOTA_EXHAUSTED` verdicts.

Tests: `services/executors/test/w07c-attempt-quota-source.test.ts` (positive / negative /
malformed / outage / stale / boundary; W07-C test ownership).

The durable adapter implementing `ExecutionAttemptQuotaSource` against an accepted canonical
store is intentionally **not** included; it is gated on the ownership/schema blocker above.

## Authority boundary

- No `PolicyToken`/authority issuance; no second Policy Engine.
- No W03 ledger duplication; W03 idempotency integration is unchanged.
- No event/outbox counter is reinterpreted as an execution attempt.
- No client/device/transport value becomes attempt/quota state or retry permission.
- `INTELLIGENCE != AUTHORITY != EXECUTION`.
