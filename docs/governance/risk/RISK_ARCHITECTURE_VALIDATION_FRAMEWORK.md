# Aurora AI-Native — Risk & Architecture Validation Framework

Status: `PROPOSED_CANONICAL_CROSS_WAVE_GOVERNANCE`
Version: `1.0`
Date: `2026-08-31`
Activation target: W03+; retrospective baseline applies immediately to current W02 artifacts without reopening accepted W00/W01 work.

## 1. Purpose

This framework turns architecture-risk analysis into an explicit, repeatable program discipline. A wave is not considered sufficiently validated only because its happy path works. Each applicable wave must demonstrate correctness, safety, performance behavior and failure behavior using evidence appropriate to its maturity.

The framework does not create runtime authority, does not replace wave ownership, does not move W18 adaptive-eval ownership earlier, and does not authorize implementation of future-wave runtime contracts before their owner wave.

## 2. Core validation dimensions

Every relevant change is evaluated against four mandatory gates:

1. **Correctness** — deterministic semantics, contract compatibility, state transitions, idempotency, reproducibility and expected outcomes.
2. **Safety / Authority** — tenant, identity, policy, authority, consent, data boundaries, side-effect safety, least authority and fail-closed behavior.
3. **Performance / Economics** — latency, fan-out, model/tool calls, resource pressure, concurrency, cost and graceful degradation.
4. **Failure behavior / Recoverability** — timeout, partial failure, duplicate/replay, stale state, uncertain execution, dependency outage, cancellation, retry/reconciliation and rollback.

A release decision must not collapse these four gates into one generic PASS.

## 3. Risk record schema

Each tracked architectural risk uses the following minimum record:

- `riskId`
- `title`
- `systemSurface`
- `description`
- `triggerCondition`
- `failureMode`
- `likelihood` 1–5
- `impact` 1–5
- `detectability` 1–5, where 5 means difficult to detect before impact
- `exposureScore = likelihood * impact * detectability`
- `leadingIndicators`
- `preventiveControls`
- `mitigation / degradedMode`
- `verificationMethod`
- `ownerWave / ownerSurface`
- `status`: OPEN | MITIGATED | ACCEPTED_RISK | SUPERSEDED | CLOSED
- `evidenceRefs`
- `reviewTrigger`

Exposure guidance:

- 1–20: LOW
- 21–40: MODERATE
- 41–70: HIGH
- 71–125: CRITICAL

A low numeric score never overrides a known authority/safety invariant violation. Any demonstrated authority bypass, cross-tenant breach, uncontrolled duplicate side effect, secret exposure or irreversible execution without valid authority is release-blocking regardless of score.

## 4. Mandatory pre-mortem

Before implementation acceptance of each major wave, reviewers assume the wave has failed in production and reconstruct plausible causes. At minimum consider:

- architecture/component overload;
- hidden coupling and circular dependency;
- stale or conflicting state;
- authority/policy bypass;
- duplicate or uncertain execution;
- dependency/provider outage;
- context poisoning/staleness;
- retry storms;
- unbounded agent/tool loops;
- cost explosion;
- observability gaps;
- rollback/kill-switch failure;
- documentation/registry drift.

The pre-mortem must produce concrete tests, telemetry requirements or architecture changes. A pre-mortem that only lists generic concerns is insufficient.

## 5. Stress scenario model

Stress analysis combines deterministic injected conditions rather than benchmarking only raw throughput. Examples:

- high concurrent objective volume;
- provider timeout/rate limiting;
- duplicate events;
- delayed receipts;
- stale policy/context/cache;
- partial worker/agent unavailability;
- network partition;
- database/event-backbone pressure;
- conflicting user or system commands;
- cancellation during execution;
- model/tool latency spikes;
- budget exhaustion.

Every scenario must define expected system decisions: queue, reject, degrade, fallback, reconcile, escalate, circuit-break or continue. `retry` is never an acceptable default without idempotency/reconciliation reasoning.

## 6. Quantitative analysis requirements

### 6.1 Latency path model

For each important user-visible path, maintain an execution-path budget:

`T_total = T_gateway + T_context + T_policy + T_routing + T_reasoning + T_tools + T_executor + T_readback + T_evidence + queueing`

Track or estimate p50/p95/p99 as the implementation matures. Parallelizable steps should be explicitly identified, but safety-critical ordering must not be removed merely for speed.

### 6.2 Fan-out / coordination model

Record maximum bounded values for:

- concurrent DAG nodes;
- agent handoffs;
- model calls;
- tool calls;
- retrieval fan-out;
- retries;
- event replays;
- context sources.

Unbounded values are architecture defects unless a hard external limit guarantees bounded behavior.

### 6.3 Cost model

For representative task classes, estimate:

`expectedCost = modelCost + toolCost + retrievalCost + executionCost + retryCost + coordinationOverhead`

W04/W05/W18 may later formalize ExecutionBudget/Economic Governor behavior, but earlier waves must avoid designs that make bounded cost impossible.

### 6.4 Context pressure model

For W06 and consumers, measure or estimate:

- ContextPack size distribution;
- retrieval fan-out;
- cache hit/miss;
- freshness validation rate;
- invalidation lag;
- compression ratio;
- stale-result rejection rate;
- context assembly p95/p99.

## 7. Over-agentification test

Before creating an agent, classify the required behavior:

- deterministic function;
- service;
- event handler;
- workflow/controller;
- executor;
- template/plan binding;
- model call;
- agent;
- multi-agent team.

Use an agent only when the task genuinely benefits from adaptive reasoning, ambiguous planning, open-ended tool choice or iterative inspection/repair. Stable transforms, validation, policy decisions, authority checks, retries, state machines and side-effect execution should remain deterministic whenever practical.

## 8. Required cross-wave evidence

From W03 onward, each wave acceptance must contain, as applicable:

- risk delta: new, changed and retired risks;
- pre-mortem findings;
- negative-test matrix;
- latency/cost budget or justified N/A;
- failure-injection evidence or planned owner wave when runtime does not yet exist;
- observability/evidence path;
- rollback/degraded-mode behavior;
- dependency and blast-radius assessment;
- statement that no new implicit authority path was introduced.

Accepted W00/W01 are not reopened. W02 receives a retrospective baseline and can only be blocked by newly discovered defects that materially violate current acceptance invariants.

## 9. Validation maturity by wave stage

### Contract / planning stage

Allowed evidence:

- static architecture analysis;
- dependency graph review;
- schema/contract negative matrices;
- deterministic property tests;
- threat/premortem modeling;
- modeled latency/cost budgets.

### Runtime stage

Add:

- fault injection;
- load/concurrency tests;
- replay/duplicate testing;
- timeout/cancellation testing;
- dependency degradation;
- resource pressure;
- reconciliation testing.

### Staging / release stage

Add:

- representative production-like traffic;
- canary/shadow where applicable;
- provider quota/rate-limit testing;
- disaster recovery/recovery manifests;
- SLO verification;
- kill-switch/rollback drills;
- end-to-end evidence reconstruction.

## 10. Architecture kill criteria

A design must be changed, split or removed when evidence shows one or more of:

- component exists without a concrete problem/owner;
- duplicate source of truth;
- circular control dependency;
- critical path requires unnecessary serial remote calls;
- side effects can be duplicated after timeout/replay;
- stale precheck/cache/context can become execution authority;
- agent output can bypass deterministic validation;
- failure cannot be reconstructed through correlation/evidence;
- bounded latency/cost/concurrency cannot be stated;
- recovery requires guessing whether an external side effect happened.

## 11. Drift control

Program status, accepted SHA, publication barriers, Drive governance and repository mirrors are treated as a consistency surface. Drift is a first-class risk.

Before wave release/acceptance, compare at minimum:

- latest `main` SHA;
- current open/merged PR state;
- wave status in `CURRENT_PROGRAM_STATUS.md`;
- dependency/publication matrix;
- Drive wave acceptance/handoff/evidence records;
- active developer-manual authority.

Detected disagreement must be reconciled or explicitly recorded before the next dependent implementation starts.

## 12. Ownership

The coordinator owns the framework and cross-wave consistency. Individual waves own mitigation/tests for risks created inside their surfaces. W17 owns production-grade telemetry/SLO evidence. W18 owns adaptive evaluation/promotion and Economic Governor optimization. W19 owns converged security hardening. W20 owns final integrated release acceptance.

## 13. Acceptance rule

The framework becomes effective for future-wave governance when merged through the normal exact-HEAD PR process and mirrored into the Drive governance registry. Until then it is proposed governance and must not be cited as an already accepted runtime contract.
