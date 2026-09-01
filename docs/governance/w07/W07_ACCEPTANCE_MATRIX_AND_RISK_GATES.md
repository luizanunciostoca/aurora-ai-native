# W07 ACCEPTANCE MATRIX & RISK GATES

Date: 2026-09-01  
Status: `W07_00_COORDINATION_FREEZE_CANDIDATE`  
Target: `W07_EXECUTOR_SIDE_EFFECT_SAFETY_VERIFIED`

## Global acceptance invariants

- ActionIntent is the governed generic execution input.
- Current policy/authority validation cannot be replaced by precheck, confidence, lane, budget, target availability or credential possession.
- Target resolution is not authority.
- Idempotency/preconditions are checked before external side effects.
- `EXECUTION_UNCERTAIN` uses reconcile-before-retry.
- Receipt acknowledgement is not verified external state; readback/evidence governs verification where required.
- Kill switch/circuit state is non-bypassable.
- No fake provider identity for DEVICE/WORKFLOW/LOCAL_SERVICE.
- W03 durability is reused; W08/W09/W14/W15 retain target-specific ownership.

## W07-00 coordination freeze acceptance

Required evidence:
1. Charter, Dependency Matrix, Ownership Matrix, this Acceptance Matrix, Risk Register and Execution Target Compatibility Freeze agree.
2. `docs/governance/copilot/tasks/W07.json` is schema v2 and represents the same DAG, exact paths, shared locks and readiness rules.
3. Live audit of ActionIntent/Receipt/Evidence/provider-centric debt is recorded and mapped to a compatibility-safe no-fake-provider migration.
4. W02/W03/W04 safety/source-of-truth dependencies and W08/W09/W14/W15 consumer boundaries are explicit.
5. No runtime feature implementation or external side effect is introduced by W07-00.
6. Quality, Test Build and Security pass on one exact candidate HEAD; independent acceptance, controlled merge, post-merge verification and Drive/GitHub convergence follow.

## Subwave acceptance

### W07-A — ExecutionTargetReference & Target Kinds
Must prove versioned PROVIDER/DEVICE/WORKFLOW/LOCAL_SERVICE semantics, no fake provider IDs, deterministic compatibility adapters, old provider fixture compatibility, conflicting legacy/new target failure, schema/type parity and no W14/W15 identifier/runtime leakage.

### W07-B — Executor SDK & Current Validation
Must consume canonical ActionIntent, call current policy/authority validation where required and fail closed for missing/stale/expired/revoked/wrong-tenant/wrong-subject/wrong-scope/constraint-invalid authority. Fast Lane, confidence, precheck and ExecutionBudget cannot bypass validation. No token issuance.

### W07-C — Idempotency / Preconditions / Quotas / Deadlines
Must prove duplicate detection before external call, explicit precondition/attempt/deadline/expiry/quotas, deterministic concurrency/race behavior and W03 idempotency integration without a duplicate ledger.

### W07-D — ExecutionTargetResolver
Must prove deterministic target binding resolution, freshness/availability/compatibility/precondition checks, canonical non-execution outcomes for stale/unavailable/ambiguous targets and zero authority elevation from target presence.

### W07-E — Receipt / Evidence / Readback
Must produce target-neutral execution receipt/evidence, safe target reference, timestamps/correlation, requested vs observed state and explicit uncertainty/readback mismatch. Provider/device/workflow/local readback interface remains generic; no secrets or W17 telemetry implementation.

### W07-F — EXECUTION_UNCERTAIN & Reconciliation
Must distinguish failure from possibly-executed uncertainty, reconcile-before-retry, prohibit blind retry and prove duplicate prevention under timeout/connection-loss/late acknowledgement/readback ambiguity.

### W07-G — Circuit Breaker / Kill Switch / Failure Containment
Must prove circuit/degradation/kill/cancellation state transitions, overload/cascading-retry controls, safe recovery criteria and non-bypassability by intelligence/model/router outputs.

### W07-H — Integration / Fault Injection / Consumer Publication
Must integrate A-G with W02 current validation, W03 idempotency/durability and W04 target-neutral capabilities; run provider/device/workflow/local mock consumer fixtures; fault-inject duplicate, stale authority/target, timeout, readback mismatch, circuit-open and kill-switch scenarios; run four Risk Gates plus exact-head Quality/Test Build/Security.

## Risk Gate A — Correctness

PASS requires:
- canonical target/ActionIntent/Receipt/Evidence schema/type/version parity;
- deterministic validation, target resolution, idempotency and state transitions;
- duplicate/race fencing before external call;
- explicit outcome/uncertainty semantics;
- correlation/tenant/target references reconstructable end to end;
- public consumer compilation/compatibility fixtures.

## Risk Gate B — Safety / Authority

PASS requires evidence that:
- current W02 authority validation is mandatory where operation semantics require it;
- stale precheck/confidence/lane/budget/strategy/capability/target availability cannot authorize execution;
- wrong tenant/subject/scope/constraints fail closed;
- no provider credential/device session becomes business authority;
- kill switch cannot be overridden;
- no fake provider identity and no secret in receipt/evidence;
- no target-specific runtime leaks into W07 generic layers.

Authority bypass, cross-tenant breach, uncontrolled irreversible duplicate, hidden execution path or secret exposure is release-blocking independently of score.

## Risk Gate C — Performance / Economics

At W07-H test scope measure:
- validation + target-resolution overhead p50/p95/p99;
- idempotency/precondition ledger overhead;
- readback/reconciliation latency;
- circuit-breaker/kill-switch decision overhead;
- bounded attempts/concurrency under pressure;
- failure amplification/retry counts.

Safety validation is non-degradable. Test measurements must identify environment/version and are not production SLO claims.

## Risk Gate D — Failure / Recoverability

Must exercise:
- stale/expired/revoked/wrong-scope authority;
- duplicate concurrent commands;
- target unavailable/stale/ambiguous;
- dependency timeout/connection loss after possible side effect;
- late acknowledgement and readback mismatch;
- reconciliation unable to determine state;
- circuit open/half-open/recovery;
- kill switch during queued/in-flight work;
- overload/cascading retry pressure;
- replay/reconnect using W03 durability without duplicate side effects.

## Final W07 Reality scenarios

R01 valid governed PROVIDER ActionIntent reaches mock executor only after current validation.  
R02 stale/expired authority prevents external call.  
R03 informational precheck cannot replace current validation.  
R04 Fast Lane/high confidence cannot bypass executor checks.  
R05 DEVICE target is represented without fake provider ID.  
R06 WORKFLOW/LOCAL_SERVICE targets are represented without provider masquerading.  
R07 legacy provider ActionIntent/Receipt fixtures remain compatible through W07-A migration.  
R08 conflicting legacy/new target references fail closed.  
R09 duplicate concurrent command performs at most one irreversible mock side effect.  
R10 failed precondition/deadline/quota prevents external call.  
R11 stale/ambiguous target resolver returns non-execution outcome.  
R12 target availability alone never authorizes.  
R13 receipt acknowledgement alone does not become verified success.  
R14 readback mismatch is explicit.  
R15 timeout after possible side effect enters EXECUTION_UNCERTAIN.  
R16 EXECUTION_UNCERTAIN reconciles before retry and blind retry is rejected.  
R17 circuit-open blocks execution until governed recovery.  
R18 kill switch blocks queued/new work and cannot be overridden by model/router output.  
R19 receipt/evidence contains no credentials/secrets and preserves tenant/correlation/target provenance.  
R20 W03 replay/reconnect does not duplicate irreversible side effects.  
R21 W08/W09/W14/W15 mock consumer contracts compile without importing their future runtime into W07.  
R22 no second Policy Engine/idempotency ledger/Capability Registry is introduced.  
R23 no real provider/device/workflow/local external side effect occurs in W07 acceptance tests.  
R24 full chain can reconstruct requested action, current authority decision reference, resolved target, attempt, observed result and uncertainty without private reasoning.

## Final decision vocabulary

`ACCEPT | ACCEPT_WITH_RECORDED_RISK | REJECT | BLOCKED`.

W07-00 may release only W07-A after independent exact-head/merge/Drive convergence.