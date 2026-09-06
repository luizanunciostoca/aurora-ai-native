# W07-C / W15-J — Execution-Attempt & Quota Ownership Decision

Status: `OWNERSHIP_DECISION_ONLY_DURABLE_SOURCE_BLOCKED`
Date: 2026-09-06
Issue: `luizanunciostoca/aurora-ai-native#469` (tracks `#460`, W15-J / DP5).
Upstream checkpoint: PR `#462` exact green head `3696ed90daf5e6fa173e01cfe798a39e182de788`.

## Mission

Provide the missing **server-owned runtime source** for the W07 safeguard inputs
`attemptNumber`, `maxAttempts` and optional execution `quota` consumed by the W15-J
dispatching voice flow (`W15JDispatchingVoiceCandidateIntake` ->
`evaluateExecutionSafeguards`).

## Decision: ownership decision only — no runtime shipped

This lane is finalized as an **ownership decision, not an implementation**. Live recon
confirms there is **no canonical durable tenant + ActionIntent execution-attempt/quota
runtime primitive on `main`**. The task's acceptance permits an implementation only if a
compatible canonical primitive exists; none does, so this lane returns a precise
ownership/schema blocker and ships **no runtime code and no migration/schema/table**.

- **W07-C owns bounded-attempt/quota semantics** — the deterministic gate
  (`evaluateExecutionSafeguards`) consumes a current server-owned attempt/quota value and
  owns the `ATTEMPT_INVALID` / `ATTEMPT_LIMIT_REACHED` / `QUOTA_INVALID` / `QUOTA_EXHAUSTED`
  verdicts. W07-C persists nothing (no second W03 ledger).
- **Any durable implementation requires an explicit cross-owner W07/W03 persistence
  remediation** (a coordinator-owned schema/allocation decision) before any code is written.
  The W07-C leaf fence granted by `#469` does not transfer that shared/publication surface.
- **No `attempt=1/maxAttempts=3` or any other default is fabricated.**
- **No physical DP5 completion is claimed or implied.**

## Primitive-by-primitive verdict

| Candidate primitive | Verdict | Reason |
|---|---|---|
| `w03_event_outbox.attempt_count` / `maxAttempts` | **REJECTED (prohibited)** | W03 EventEnvelope **delivery-transport** counters bound to event fan-out, not ActionIntent execution. Different semantics; the issue forbids this reuse. |
| `w03_idempotency_key` status | **REJECTED** | W03 operation/idempotency **fence** (NEW/REPLAY/CONFLICT). It detects duplicate operations; it is not an attempt/quota counter and carries no attempt/quota value. |
| W04 `ExecutionBudget` (`packages/control/src/budget`) | **REJECTED** | Planning-lane constraint metadata (`LATENCY_MS`/`COST_MICROS`/`REASONING_UNITS`/`TOOL_CALLS`/`CONCURRENCY`). It is not an execution-attempt/quota counter, is degradable, and by invariant cannot bypass safety/authority. Reusing it as the safety-critical attempt/quota source would conflate planning with the side-effect gate. |
| W07-F reconciliation | **REJECTED** | Owns retry **eligibility** (`nextAttemptNumber`, `reconcile-before-retry`). It does not own the *current* attempt/quota counter consumed at the gate. |
| W07-C safeguard gate | **SEMANTICS OWNER (accepted scope)** | Accepted scope is the deterministic gate over call-time inputs with **no second W03 ledger**. It cannot be the durable source of truth. |

## Precise ownership / schema blocker

A durable **execution-attempt/quota** store is required with the semantics below. No accepted
migration or schema currently provides it, and creating one is a **coordinator-owned
shared/publication surface** (a new migration under `migrations/**`, possible
`packages/persistence`/`packages/events` additions and any cross-package export). Such
allocation is outside the W07-C leaf fence granted by `#469` and requires an explicit
cross-owner W07/W03 persistence remediation authorized by Program Control before
implementation.

### Required canonical semantics for the (blocked) durable source

1. **Identity / context binding.** State binds `tenantId + actionIntentId + executionRef`
   (the ActionIntent execution context), never an event/outbox fan-out id. A read must
   **fail closed** (context mismatch) unless the record's `tenantId` **and**
   `actionIntentId` match the ActionIntent under evaluation, so state owned by a different
   ActionIntent can never be served as current for this intent.
2. **Server-owned and current.** The value is server-owned and re-read at the W07-C gate on
   every evaluation. It is never supplied by Android, wake/STT, router confidence, W14 ACK or
   device trust; client-shaped attempt/quota input is rejected.
3. **Binding / freshness metadata.** The record carries server-owned binding and freshness
   (provenance) metadata sufficient for the gate to detect **stale** source state
   deterministically. Freshness/staleness detection is an **obligation of the future durable
   source**; this decision does not invent a TTL, window or default — any freshness policy
   requires accepted policy first.
4. **Fail closed.** State absence, source outage, malformed or corrupted data, and any
   context/tenant mismatch all fail closed — no fabricated default.
5. **No retry authority.** The value never grants retry permission; W07-F reconciliation
   remains the owner of retry eligibility, and an attempt/quota read is a gate input, not a
   retry decision.
6. **Quota, when present,** is current and tenant-scoped.

Until a compatible canonical primitive is allocated and accepted through the cross-owner
remediation above, the dispatching voice flow must treat the attempt/quota input as
**unavailable** and fail closed (`NOT_ATTEMPTED_STATE_UNAVAILABLE`), as the
`OwnerBackedVoiceExecutionStateSource` contract in PR `#462` already requires. This decision
does not weaken that stance and produces **no physical PASS**.

## Authority boundary

- No `PolicyToken`/authority issuance; no second Policy Engine.
- No W03 ledger duplication; W03 idempotency integration is unchanged.
- No event/outbox counter is reinterpreted as an execution attempt.
- No client/device/transport value becomes attempt/quota state or retry permission.
- `INTELLIGENCE != AUTHORITY != EXECUTION`.
