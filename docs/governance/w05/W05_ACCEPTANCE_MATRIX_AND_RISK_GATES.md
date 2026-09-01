# W05 ACCEPTANCE MATRIX & RISK GATES

Date: 2026-09-01  
Status: `W05_00_COORDINATION_FREEZE_CANDIDATE`  
Target: `W05_INTELLIGENCE_RUNTIME_VERIFIED`

## Global invariants

- Intelligence/confidence/reasoning/strategy/agent output != authority.
- No-AI deterministic routing is valid and preferred when sufficient.
- Multi-agent is opt-in by demonstrated need, never default.
- W04 Capability Registry remains unique; W05 strategy registry is distinct.
- W03 durability is reused; W05 cannot create a competing workflow/lease/timer truth.
- W07 remains the only generic side-effect execution boundary.
- W18 owns learned production promotion.

## W05-00 coordination freeze acceptance

Required evidence:
1. Charter, Dependency Matrix, Ownership Matrix, this Acceptance Matrix, Risk Register and Over-Agentification/Eval Plan agree.
2. `docs/governance/copilot/tasks/W05.json` is schema v2 and represents the same DAG, leaf paths, shared locks and readiness rules.
3. Live repository audit confirms the existing `services/agent-runtime` scaffold is reused and no competing intelligence runtime is being made canonical.
4. W02/W03/W04 ownership boundaries and W06/W07/W17/W18 cross-wave interfaces are explicit.
5. Over-agentification adjudication is complete for A-H before any agent/team runtime work begins.
6. No runtime implementation, policy/authority issuance or external side effect is introduced by W05-00.
7. Quality, Test Build and Security pass on one exact candidate HEAD; independent review, controlled merge, post-merge verification and Drive/GitHub convergence follow.

## Subwave acceptance

### W05-A — Task Complexity / Risk / Modality Classifier
Must prove deterministic/reproducible classification for equivalent inputs, explicit UNKNOWN/insufficient-evidence behavior, bounded feature set, tenant/correlation propagation where applicable and negative tests proving risk labels cannot authorize execution.

### W05-C — ReasoningLevel L0-L5
Must prove explicit level semantics and bounded escalation/de-escalation rules driven by task need, uncertainty and ExecutionBudget. Reasoning level cannot widen authority or skip mandatory validation.

### W05-D — Confidence Engine
Must prove decomposed confidence/uncertainty reasons, stable output semantics, abstention/escalation behavior, calibration interface compatibility and zero conversion of confidence into permission/spend/write authority.

### W05-E — Strategy Registry
Must prove one deterministic strategy identity/compatibility/availability/fallback registry, model/provider abstraction, version/freshness metadata and explicit distinction from W04 capability identity. Availability is not authority.

### W05-B — Intelligence Router
Must prove lowest-sufficient route selection across deterministic/no-AI, model, specialist, computer-use and human strategies; bounded fallback/escalation; W04 lane/budget/capability constraints consumed without duplication; explicit route evidence; no direct side effects.

### W05-F — Generic Agent Runtime
Must prove worker-pool bounds, cancellation, lease/heartbeat/reclaim semantics, deterministic ownership transitions and reuse of W03 durable primitives where durability is required. No god-object orchestrator or hidden tool authority.

### W05-G — Bounded Adaptive Loop
Must prove explicit loop state machine, max iterations/time/model/tool-call/budget limits, inspect/repair/validate break conditions, cancellation and abstention/escalation. Tool planning cannot execute side effects directly.

### W05-H — Routing Benchmarks / Evals
Must compare valid route families on quality, latency, cost/compute, model/tool calls and escalation behavior; demonstrate zero authority elevation; record exact fixture/config/version provenance. Test-scope measurements cannot be presented as production SLOs.

## Risk Gate A — Correctness

PASS requires:
- deterministic classifier/reasoning/confidence/router decisions where inputs/config are fixed;
- versioned strategy identity/compatibility and deterministic fallback;
- bounded worker/loop state transitions;
- canonical tenant/correlation/version propagation;
- no duplicate control/capability/durability source of truth;
- consumer/publication compatibility.

## Risk Gate B — Safety / Authority

PASS requires evidence that:
- confidence, model quality, strategy availability, route choice or agent consensus cannot authorize execution;
- W05 cannot mint/widen `PolicyToken`, `OwnerDecision` or executable authority;
- no direct provider/device/workflow/local side effect exists in W05;
- cross-tenant context/strategy/worker state cannot satisfy another tenant;
- high confidence cannot suppress current policy/authority validation;
- no secrets/private chain-of-thought enter strategy evidence.

Authority bypass, cross-tenant breach, hidden execution, secret exposure or irreversible side effect outside W07 are independent release blockers.

## Risk Gate C — Performance / Economics

W05-H must measure at test scope:
- classification/router/reasoning/confidence overhead p50/p95/p99;
- deterministic/template/small-model/frontier/specialist/human route cost and latency where fixtures permit;
- model/tool call counts;
- bounded worker concurrency and loop iteration pressure;
- fallback/escalation cost;
- quality-compatible lower-compute route success rate.

No invented production SLO or provider price assumption is acceptable. Baselines must identify measurement environment and fixture versions.

## Risk Gate D — Failure / Recoverability

Must exercise:
- strategy unavailable/stale/incompatible;
- confidence UNKNOWN or conflicting signals;
- model timeout/rate limit/error;
- worker lease loss/reclaim and cancellation;
- loop budget exhaustion/max-iteration termination;
- malformed model/tool output;
- downstream executor unavailable without bypass;
- replay/restart using W03 durability where applicable;
- deterministic abstention/escalation instead of unsafe guessing.

## Final W05 Reality scenarios

R01 deterministic task selects no-AI route.  
R02 uncertainty increases verification/reasoning without changing authority.  
R03 high confidence cannot authorize an otherwise denied write.  
R04 strategy unavailable selects explicit fallback or abstains.  
R05 W04 capability availability is consumed but never copied into strategy permission.  
R06 W04 lane/budget constrain strategy without becoming router-owned truth.  
R07 ReasoningLevel escalation respects budget while mandatory safety remains outside degradable intelligence.  
R08 worker pool concurrency is bounded.  
R09 lost worker lease is reclaimed through canonical durability semantics without duplicate ownership.  
R10 adaptive loop terminates at each configured bound.  
R11 malformed tool/model observation fails closed or escalates.  
R12 agent output cannot call executor/provider/device directly.  
R13 tenant A strategy/worker state cannot satisfy tenant B.  
R14 route evidence reconstructs why a strategy was selected without private chain-of-thought.  
R15 legacy Manus behavior is fixture/reference only and does not become control-plane authority.  
R16 W05 does not create W06 memory/cache runtime.  
R17 W05 does not create W07 execution/readback/reconciliation runtime.  
R18 no adaptive strategy is self-promoted; W18 remains owner.  
R19 benchmark identifies environment/version and does not claim production SLO.  
R20 final integrated routing path demonstrates compatible quality with bounded compute and zero authority elevation.

## Final decision vocabulary

`ACCEPT | ACCEPT_WITH_RECORDED_RISK | REJECT | BLOCKED`.

W05-00 may only release A/C/D/E/F after independent acceptance and full exact-head/merge/Drive convergence.