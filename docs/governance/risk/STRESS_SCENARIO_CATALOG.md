# Aurora AI-Native — Stress Scenario Catalog

Status: `BASELINE_CATALOG`
Version: `1.0`
Date: `2026-08-31`

These scenarios are architecture-validation assets. They do not imply that all corresponding runtime surfaces exist yet. Each scenario becomes executable when its owner wave implements the required runtime.

## SCN-001 — High-concurrency objective burst

Injected conditions:
- 1,500 simultaneous objectives;
- 10,000 downstream task/event records;
- mixed Fast/Governed eligibility;
- normal providers.

Expected behavior:
- bounded queue/concurrency;
- no dropped causation/correlation;
- fairness prevents starvation;
- budgets propagate;
- critical safety validation remains active under load.

Primary owners: W03/W04/W17.

## SCN-002 — Provider degradation + rate limiting

Injected conditions:
- 5% timeout;
- 10% rate-limited responses;
- latency 5x baseline;
- intermittent readback failure.

Expected behavior:
- circuit breaker/backoff;
- no retry storm;
- idempotency preserved;
- uncertain write is reconciled before retry;
- non-critical work may queue/degrade.

Primary owners: W07/W08/W17/W20.

## SCN-003 — Duplicate/replayed events

Injected conditions:
- 1% duplicate EventEnvelope;
- replay of a previously completed task;
- out-of-order event delivery.

Expected behavior:
- idempotent consumer outcome;
- no duplicate side effect;
- replay/reorder is observable;
- invalid transition fails closed or is reconciled deterministically.

Primary owners: W03/W07.

## SCN-004 — Stale policy/precheck

Injected conditions:
- precheck produced under policy version N;
- current execution policy advances to N+1 and denies action;
- cached plan still references prior precheck.

Expected behavior:
- current validation wins;
- execution denied/approval-required according to N+1;
- stale precheck never grants authority;
- reason references current policy version.

Primary owners: W02-F/W07/W19.

## SCN-005 — Stale/poisoned context

Injected conditions:
- one context source stale;
- one source conflicts with a newer authoritative source;
- semantic cache contains an expired answer.

Expected behavior:
- freshness/provenance conflict detected;
- stale result rejected or confidence/routing escalated;
- no stale context becomes authority;
- evidence records selected source/version.

Primary owners: W06/W05/W19.

## SCN-006 — Agent workforce degradation

Injected conditions:
- three specialist workers unavailable;
- one agent repeatedly hands off task;
- reasoning/model latency doubles.

Expected behavior:
- bounded handoff count;
- fallback to compatible worker/model or human escalation;
- task budget prevents infinite loop;
- lease expiration/reclaim is deterministic.

Primary owners: W05/W17/W18.

## SCN-007 — Execution timeout with ambiguous external state

Injected conditions:
- provider receives request;
- local request times out before acknowledgement;
- external readback is delayed.

Expected behavior:
- status becomes `EXECUTION_UNCERTAIN` or equivalent canonical semantics;
- no blind retry;
- reconciliation/readback attempted;
- irreversible ambiguity escalates appropriately.

Primary owners: W07/W08/W20.

## SCN-008 — Context Engine overload

Injected conditions:
- retrieval fan-out 3x expected;
- cache hit rate below threshold;
- one source slow/unavailable;
- ContextPack exceeds target size.

Expected behavior:
- bounded retrieval;
- timeout/degraded minimal context path where safe;
- no global deadlock;
- latency/cost budget violation is visible.

Primary owners: W06/W17.

## SCN-009 — Economic runaway attempt

Injected conditions:
- task repeatedly requests deeper reasoning;
- multi-agent path proposes additional specialists;
- tool retries increase expected cost.

Expected behavior:
- ExecutionBudget caps model/tool/handoff activity;
- router chooses lower-cost path or stops/escalates;
- authority is unaffected by economic decision.

Primary owners: W04/W05/W18.

## SCN-010 — Cross-tenant mismatch under load

Injected conditions:
- valid identity reference bound to tenant A;
- request/action references tenant B;
- high concurrency and cached identity lookup.

Expected behavior:
- deterministic fail closed;
- cache cannot erase tenant boundary;
- no provider/device write;
- evidence preserves mismatch reason.

Primary owners: W02-B/W02-E/W07/W19.

## SCN-011 — Governance state drift

Injected conditions:
- implementation merges and publication barrier advances;
- Drive/manual/status mirror still reports prior state;
- next wave bootstrap reads mixed sources.

Expected behavior:
- pre-wave reconciliation detects disagreement;
- dependent work does not infer stale gate state;
- authoritative live GitHub state and accepted evidence are reconciled into governance records.

Primary owner: coordinator.

## SCN-012 — Device reconnect/replay

Injected conditions:
- command delivered to Android device;
- device executes then disconnects before receipt;
- reconnect causes command replay/offline queue drain.

Expected behavior:
- execution identity deduplicates command;
- no second side effect;
- receipt/readback/reconciliation recover actual state;
- compromised/revoked session is rejected.

Primary owners: W14/W15/W19/W20.

## Execution policy

For each implemented scenario, record:
- exact test/runtime version;
- injected parameters;
- observed result;
- expected result;
- pass/fail/blocker;
- telemetry/evidence references;
- discovered risk delta.

A scenario is not considered passed if the system merely survives; it must fail/degrade in the intended semantic way.
