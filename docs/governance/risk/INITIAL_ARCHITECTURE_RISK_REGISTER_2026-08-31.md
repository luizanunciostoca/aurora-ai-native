# Aurora AI-Native — Initial Architecture Risk Register

Status: `BASELINE_ANALYSIS`
Date: `2026-08-31`
Starting live main analyzed: `8894021ae00b257b940fe3ac8bd7c73f5da36c28`

This register is the first cross-wave application of the Risk & Architecture Validation Framework. Scores are architecture-level estimates and must be recalibrated with runtime telemetry as owning waves are implemented.

## Executive result

The architecture remains technically strong, but its main risk cluster is not model capability. The dominant risks are system complexity, critical-path latency, state/context staleness, duplicate/uncertain execution, governance drift and coordination cost.

One risk was directly observed during this audit: repository governance status drifted behind the actual accepted W02-D/PB2 state. This is not a theoretical concern and is recorded as `RSK-012`.

## Risk register

### RSK-001 — Architecture complexity / control-plane overgrowth

- Surface: cross-system architecture
- Likelihood: 4
- Impact: 5
- Detectability: 3
- Exposure: 60 HIGH
- Failure mode: excessive number of layers/controllers causes hidden coupling, slow change velocity, inconsistent state ownership and fragile integration.
- Leading indicators: repeated translation contracts, multiple components owning the same decision, long dependency chains, frequent coordinator reconciliation.
- Prevention: component ownership map, architecture kill criteria, dependency DAG review, require concrete problem statement for every new component.
- Mitigation: collapse redundant layers; convert non-adaptive components to deterministic services.
- Owner: coordinator + W04/W05/W06/W07 as their runtime surfaces emerge.

### RSK-002 — Over-agentification

- Surface: W05 workforce + vertical consumers
- Likelihood: 4
- Impact: 4
- Detectability: 3
- Exposure: 48 HIGH
- Failure mode: tasks that should be functions/workflows become agent interactions, increasing latency, cost, nondeterminism and failure surface.
- Leading indicators: agent created around a single API, agent-to-agent handoff without genuine reasoning need, stable transformation using LLM loops.
- Prevention: mandatory behavior classification before creating an agent.
- Mitigation: replace with function/service/controller/template.
- Owner: W05 + vertical waves.

### RSK-003 — Governed-path latency accumulation

- Surface: gateway → context → policy → routing → reasoning → tools → executor → evidence
- Likelihood: 4
- Impact: 5
- Detectability: 2
- Exposure: 40 MODERATE, operationally high-priority.
- Failure mode: safe architecture becomes too slow for conversational or operational UX.
- Leading indicators: serial remote calls; policy/context duplicated across stages; p95 dominated by orchestration rather than model/tool work.
- Prevention: latency budget per path; parallelize independent prechecks/retrieval; local deterministic validation where safe; Fast/Governed lanes.
- Mitigation: degraded context, cached verified facts, reduced reasoning level, async non-critical evidence work where semantics allow.
- Owners: W03/W04/W05/W06/W14/W17.

### RSK-004 — Context Broker / Context Engine bottleneck

- Surface: W06
- Likelihood: 4
- Impact: 5
- Detectability: 3
- Exposure: 60 HIGH
- Failure mode: centralized context assembly becomes global latency and availability bottleneck.
- Leading indicators: high retrieval fan-out, context assembly p95 growth, low cache hit rate, invalidation lag, every task requiring full rebuild.
- Prevention: compiled incremental snapshots, cache hierarchy, bounded retrieval, locality, provenance/freshness metadata.
- Mitigation: minimal/degraded context mode with explicit confidence/freshness consequences.
- Owner: W06, observability W17.

### RSK-005 — Stale context/cache used as truth

- Surface: W06 + Fast Lane consumers
- Likelihood: 3
- Impact: 5
- Detectability: 4
- Exposure: 60 HIGH
- Failure mode: stale cached result or compiled snapshot changes planning/response incorrectly, or worse is treated as current authority.
- Prevention: version/hash/freshness/invalidation; tenant/scope in keys; current policy always wins.
- Release blocker condition: stale data becomes authority or creates unsafe side effect.
- Owner: W06/W04/W07/W19.

### RSK-006 — Policy precheck interpreted as execution authority

- Surface: W02-F consumers W04/W05/W06/W07
- Likelihood: 3
- Impact: 5
- Detectability: 4
- Exposure: 60 HIGH
- Failure mode: router/fast lane/planner treats informational precheck as permission to execute.
- Prevention: separate types/APIs; current validation at executor boundary; negative contract tests.
- Mitigation: fail closed and require authority validation.
- Owner: W02-F/W07; threat hardening W19.

### RSK-007 — Authority scope widening / stale token acceptance

- Surface: W02-E + W07
- Likelihood: 3
- Impact: 5
- Detectability: 4
- Exposure: 60 HIGH
- Failure mode: valid token/decision is accepted for wrong tenant, subject, scope, constraints, time or incompatible policy state.
- Prevention: least-authority validation matrix, no widening, current policy/version checks, explicit expiry/revocation semantics where supported.
- Owner: W02-E/W07/W19.

### RSK-008 — Duplicate or uncertain external execution

- Surface: W03 event durability + W07 executor + providers/devices
- Likelihood: 4
- Impact: 5
- Detectability: 4
- Exposure: 80 CRITICAL
- Failure mode: timeout/replay/reconnect causes duplicate external side effect, spend, message, mutation or device action.
- Prevention: idempotency keys, outbox/inbox, execution identity, `EXECUTION_UNCERTAIN`, reconcile-before-retry, readback.
- Mitigation: quarantine/reconciliation workflow, circuit breaker, human escalation for irreversible ambiguity.
- Owner: W03/W07/W08/W14/W15/W19/W20.

### RSK-009 — Agent loop / handoff explosion

- Surface: W05
- Likelihood: 4
- Impact: 4
- Detectability: 2
- Exposure: 32 MODERATE
- Failure mode: ping-pong handoffs, recursive delegation or repeated inspect/repair causes latency and cost explosion.
- Prevention: max handoffs, max reasoning rounds, tool/model budgets, termination criteria, lease TTL.
- Owner: W05/W18.

### RSK-010 — Economic runaway

- Surface: W04/W05/W06/W18 + verticals
- Likelihood: 4
- Impact: 4
- Detectability: 3
- Exposure: 48 HIGH
- Failure mode: large models, multi-agent deliberation, retries and retrieval multiply cost faster than business value.
- Prevention: Lowest Sufficient Intelligence, ExecutionBudget, task-class cost baselines, semantic cache, plan templates.
- Mitigation: downgrade reasoning/model, queue low-value work, stop when budget exhausted.
- Owner: W04/W05/W18.

### RSK-011 — Evidence / observability gap

- Surface: cross-system, W17 owner
- Likelihood: 3
- Impact: 5
- Detectability: 5
- Exposure: 75 CRITICAL
- Failure mode: system fails or makes a bad decision and the causal chain cannot be reconstructed.
- Leading indicators: missing correlation, missing policy version, receipt without readback, evidence with unresolved target/executor.
- Prevention: correlation/causation propagation; decision/intent/receipt/evidence linkage; evidence completeness metric.
- Owner: all waves for emission, W17 for system telemetry.

### RSK-012 — Governance/documentation/live-state drift

- Surface: GitHub governance + Drive registry
- Likelihood: 5
- Impact: 4
- Detectability: 2
- Exposure: 40 MODERATE; observed.
- Observed evidence: on 2026-08-31 live `main` was `8894021...`, W02-D had been accepted/merged through PR #46 and PB2 released through PR #47, but `docs/governance/CURRENT_PROGRAM_STATUS.md` still stated W02-D `IN_PROGRESS_DRAFT_PR_41`, PB2 closed and W02-E dependency-gated.
- Failure mode: a new chat/wave starts from stale dependency/authority assumptions and either duplicates work or violates an ownership/publication barrier.
- Prevention: pre-wave live-state reconciliation; machine-checkable status where possible; exact-SHA binding; update status as part of publication/acceptance transaction.
- Mitigation: stop dependent work, reconcile GitHub + Drive, mark superseded records explicitly.
- Owner: program coordinator.

### RSK-013 — Event poisoning / replay / ordering error

- Surface: W03
- Likelihood: 3
- Impact: 5
- Detectability: 4
- Exposure: 60 HIGH
- Failure mode: malformed, stale, duplicated or reordered event drives invalid state transition or duplicate action.
- Prevention: canonical EventEnvelope validation, idempotent consumers, causation/correlation, sequence/version semantics, DLQ, replay-safe handlers.
- Owner: W03/W19.

### RSK-014 — Central dependency blast radius

- Surface: policy, context, event backbone, registry, gateway
- Likelihood: 3
- Impact: 5
- Detectability: 3
- Exposure: 45 HIGH
- Failure mode: one central service outage disables the majority of Aurora even when some operations could safely degrade.
- Prevention: distinguish hard safety dependencies from optional intelligence dependencies; local verified cache where safe; bounded fallback.
- Owner: W03/W06/W14/W17.

### RSK-015 — Device-plane privilege and replay risk

- Surface: W14/W15 future
- Likelihood: 3
- Impact: 5
- Detectability: 4
- Exposure: 60 HIGH
- Failure mode: stolen session, replay, malicious deep link/package impersonation, accessibility misuse or offline queue duplicates local side effects.
- Prevention: device identity/session trust, keystore, permission broker, capability binding verification, replay protection, kill switch, high-risk fallback classification.
- Owner: W14/W15/W19/W20.

## Priority order

Immediate architecture priority:

1. RSK-008 duplicate/uncertain execution — CRITICAL.
2. RSK-011 evidence gaps — CRITICAL.
3. RSK-001 architecture complexity — HIGH.
4. RSK-004 context bottleneck — HIGH.
5. RSK-005/006/007 authority + stale-state cluster — HIGH.
6. RSK-012 governance drift — observed and must be corrected now.
7. RSK-010 economic runaway — HIGH as intelligence runtime arrives.

## Baseline decision

No current finding invalidates the overall Aurora architecture. The present action is to institutionalize detection and mitigation before W03-W07 create the durable/event/control/intelligence/context/executor critical path. The observed governance drift should be reconciled in the same documentation change that introduces this framework.
