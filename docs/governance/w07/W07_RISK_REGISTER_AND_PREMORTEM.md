# W07 RISK REGISTER & PRE-MORTEM

Date: 2026-09-01  
Status: `W07_00_COORDINATION_FREEZE_CANDIDATE`  
Framework: AURORA Risk & Architecture Validation Framework v1.0  
Base main: `b502bfa7e97291086c09cc85cd71040f96d3b036`

Exposure = likelihood × impact × detectability. 1-20 LOW; 21-40 MODERATE; 41-70 HIGH; 71-125 CRITICAL.

Independent release blockers: authority bypass, cross-tenant execution, uncontrolled duplicate irreversible side effect, secret exposure, fake target identity that hides provenance or failure-containment bypass.

## W07-R01 — stale precheck/confidence becomes execution authority
L4 I5 D5 = 100 CRITICAL. Controls: execution-time current W02 validation; negative tests; no fallback to precheck. Owner: B/H.

## W07-R02 — Fast Lane/ExecutionBudget skips mandatory safety
L3 I5 D5 = 75 CRITICAL. Controls: safety outside degradable budget; lane/budget only constrain optional strategy. Owner: B/C/H.

## W07-R03 — duplicate irreversible side effect after retry/replay
L4 I5 D5 = 100 CRITICAL. Controls: idempotency/preconditions before call, W03 ledger integration, reconcile-before-retry, concurrency/fault injection. Owner: C/F/H.

## W07-R04 — EXECUTION_UNCERTAIN translated to ordinary failure
L4 I5 D5 = 100 CRITICAL. Controls: distinct state machine, blind-retry prohibition, readback/reconcile path. Owner: F/H.

## W07-R05 — fake provider identity for device/workflow/local
L3 I5 D4 = 60 HIGH. Controls: first-class target kinds and canonical contract-family migration. Owner: A/E.

## W07-R06 — stale/ambiguous target binding executes wrong target
L3 I5 D4 = 60 HIGH. Controls: freshness/compatibility/identity checks and non-execution outcome. Owner: D/H.

## W07-R07 — target availability interpreted as authority
L3 I5 D5 = 75 CRITICAL. Controls: resolver result is precondition only; B validates authority independently. Owner: D/B/H.

## W07-R08 — cross-tenant target/authority mismatch
L2 I5 D5 = 50 HIGH and release-blocking if realized. Controls: canonical tenant/subject/scope checks before target call; target binding tenant consistency. Owner: B/D/H.

## W07-R09 — readback mismatch ignored
L3 I5 D4 = 60 HIGH. Controls: acknowledgement != verified result; explicit mismatch/uncertainty evidence. Owner: E/F/H.

## W07-R10 — kill switch/circuit state overridden by intelligence
L3 I5 D5 = 75 CRITICAL. Controls: deterministic failure-containment check on execution path; no model/router override. Owner: G/H.

## W07-R11 — fail-open operational readiness
L3 I5 D4 = 60 HIGH. Controls: Aurora does not inherit TOCA optional-off readiness default; required validation fails closed. Owner: B/G.

## W07-R12 — second idempotency/replay source of truth
L3 I5 D4 = 60 HIGH. Controls: reuse W03 ledger/event primitives and explicit integration. Owner: C/F/Program Control.

## W07-R13 — secret/provider credential leaks into Receipt/Evidence
L2 I5 D5 = 50 HIGH and release-blocking if realized. Controls: secret references only, redaction/schema restrictions, negative fixtures. Owner: E/H.

## W07-R14 — provider/device/workflow runtime ownership leakage
L3 I4 D4 = 48 HIGH. Controls: generic resolver/executor interfaces only; W08/W09/W14/W15 own concrete runtime. Owner: 00/A/D/E/H.

## W07-R15 — blind retry storm/cascading failure
L3 I5 D4 = 60 HIGH. Controls: bounded attempts, circuit breaker, backoff policy hooks, reconcile-before-retry and overload tests. Owner: C/F/G/H.

## W07-R16 — cancellation races side effect
L3 I5 D4 = 60 HIGH. Controls: deterministic pre-execution cancellation/precondition check; post-call ambiguity reconciled rather than guessed. Owner: C/F/G/H.

## W07-R17 — legacy/provider compatibility breaks accepted consumers
L3 I4 D3 = 36 MODERATE. Controls: versioned canonical family, old fixtures, migration adapters and schema/type parity. Owner: A/H.

## W07-R18 — local-service target becomes arbitrary shell capability
L2 I5 D5 = 50 HIGH. Controls: LOCAL_SERVICE is governed allowlisted binding, not arbitrary command string; no child_process ownership in W07 generic contracts. Owner: A/D; later W19 hardening.

## PRE-MORTEM — assume W07 failed in production

1. A stale precheck authorized a write. Action: current W02 authority validation immediately before execution.
2. Timeout occurred after provider accepted the write, then retry duplicated it. Action: EXECUTION_UNCERTAIN + target readback/reconciliation before retry.
3. Device was encoded as fake provider and incident provenance was wrong. Action: first-class target kinds, no fake provider fields.
4. Resolver found an available target and treated that as permission. Action: resolver never grants authority.
5. Kill switch was ignored because router marked task urgent. Action: deterministic non-bypassable kill/circuit gate.
6. Receipt said ACK but actual state differed. Action: explicit readback/mismatch semantics.
7. W07 copied a second idempotency ledger and replay sources diverged. Action: consume W03 canonical durability.
8. Credential content landed in Evidence. Action: safe references only and schema/negative tests.
9. Android/provider behavior leaked into generic executor and blocked substitution. Action: concrete adapters remain owner-wave runtime.
10. Cancellation raced an irreversible call and status was guessed. Action: reconcile observed target state and preserve uncertainty.

## Stress/failure plan

- concurrent duplicate ActionIntent races;
- replay/reconnect duplicates from W03 fixtures;
- wrong tenant/subject/scope/constraint authority matrix;
- stale/revoked policy token/decision references;
- target stale/unavailable/ambiguous/compatibility mismatch;
- timeout before call, during call and after probable acknowledgement;
- delayed/out-of-order receipt/readback;
- readback mismatch and unavailable reconciliation;
- circuit open/half-open/recovery under repeated failure;
- kill switch activation with queued and in-flight work;
- quota/deadline/precondition exhaustion;
- high concurrency with bounded attempts;
- legacy provider and target-neutral contract compatibility fixtures;
- DEVICE/WORKFLOW/LOCAL_SERVICE no-fake-provider fixtures.

## Architecture kill criteria

Redesign before acceptance if W07 permits execution without current required authority, blind retry after ambiguous side effect, duplicate irreversible effects under replay, fake provider identity, target availability as authority, fail-open kill/readiness behavior, cross-tenant execution, secrets in evidence, a second idempotency/policy/capability truth or concrete provider/device/workflow runtime inside the generic executor layer.