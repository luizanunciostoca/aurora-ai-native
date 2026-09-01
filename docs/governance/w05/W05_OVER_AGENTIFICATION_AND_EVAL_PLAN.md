# W05 OVER-AGENTIFICATION GATE & ROUTING EVAL PLAN

Date: 2026-09-01  
Status: `W05_00_COORDINATION_FREEZE_CANDIDATE`

## 1. Mandatory decision order

Before creating an agent or multi-agent team, classify the workload in this order and stop at the lowest sufficient mechanism:

1. deterministic function;
2. service;
3. event handler;
4. workflow/controller;
5. template/plan binding;
6. single model call;
7. bounded agent;
8. multi-agent team.

Executor is not an intelligence mechanism and remains W07-owned. Policy/authority/retries/state machines remain deterministic whenever possible.

## 2. W05 node adjudication

| Node | Default mechanism | Agent justified? | Reason |
|---|---|---|---|
| W05-A classifier | deterministic function/service | No by default | structured task/risk/modality signals and UNKNOWN semantics are deterministic first |
| W05-C ReasoningLevel | deterministic resolver | No | selection policy is a bounded decision function over task/uncertainty/budget inputs |
| W05-D Confidence Engine | deterministic scoring/decomposition | No | confidence/calibration interface must be reproducible and auditable |
| W05-E Strategy Registry | registry/service | No | registry is data + deterministic compatibility/fallback semantics |
| W05-B Intelligence Router | deterministic router with optional bounded model-derived inputs | No agent by default | router selects a strategy; it is not itself an autonomous worker |
| W05-F Generic Agent Runtime | bounded worker runtime | Yes, conditionally | only tasks requiring iterative observation/planning/coordination beyond function/service/model-call semantics |
| W05-G Adaptive loop | bounded single-agent/controller loop | Yes, conditionally | justified only where inspect/repair/validate feedback is necessary; hard bounds required |
| W05-H Evals | test/benchmark harness | No | evaluation must be deterministic around versioned fixtures/configuration |

Multi-agent team behavior is **not required for W05 acceptance**. Any later multi-agent composition needs a concrete benchmarked advantage and its own ownership/risk evidence.

## 3. Router route families

W05-H must exercise, where fixtures and adapters exist without side effects:
- deterministic/no-AI;
- curated template/service;
- small/low-cost model;
- frontier model;
- specialist strategy;
- computer-use strategy as planning classification only, never live side effect in W05;
- human escalation/abstention.

## 4. Benchmark contract

Every benchmark record must include:
- task/fixture ID and version/hash;
- strategy ID/version;
- classifier/reasoning/confidence/router config version;
- ExecutionBudget inputs used for routing;
- selected route and structured reason codes;
- quality score/acceptance result defined by the fixture;
- latency p50/p95/p99 at test scope where repeated runs are meaningful;
- model calls, tool-planning calls and retry/escalation counts;
- compute/token/cost measurement when directly observable; otherwise mark `NOT_OBSERVED`, never invent;
- fallback/abstention state;
- authority-elevation violations, expected always `0`;
- environment/runtime version and timestamp.

## 5. Efficiency decision rule

A cheaper/faster route is preferred only when it remains within the fixture's declared quality/safety compatibility threshold. A route that saves compute by lowering required correctness, suppressing escalation or weakening policy/authority/executor checks is a failure, not an optimization.

No production SLO, provider pricing or business outcome is inferred from W05-H test measurements. W17/W18 own production telemetry and learned economic optimization.

## 6. Calibration boundary

W05-D may emit confidence components, uncertainty reasons and a stable calibration interface. W05-H may generate calibration/eval observations. W18 alone may use accepted datasets/telemetry to produce adaptive calibration or routing promotions under shadow/canary/rollback governance.

## 7. Loop/worker budgets

Any W05-F/G runtime must declare and enforce:
- max workers/concurrency;
- max loop iterations;
- max elapsed time/deadline;
- max model calls;
- max tool-planning calls;
- cost/reasoning budget from accepted W04 ExecutionBudget where applicable;
- cancellation behavior;
- lease/heartbeat/reclaim behavior when durable ownership is required;
- terminal `COMPLETED | ABSTAINED | ESCALATED | CANCELLED | BUDGET_EXHAUSTED | FAILED`-equivalent explicit semantics.

Budget exhaustion must never weaken mandatory W02/W07 safety checks.

## 8. Promotion gate

An agent/team mechanism is acceptable only when evidence shows a concrete quality or task-completion benefit over the lowest sufficient alternative at acceptable bounded latency/cost and without authority elevation. Otherwise use the simpler mechanism.

Architecture kill condition: a generic agent becomes mandatory plumbing for deterministic validation, policy, authority, scheduling, retries or side effects.