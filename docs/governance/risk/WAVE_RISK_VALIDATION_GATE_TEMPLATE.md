# Aurora AI-Native — Wave Risk Validation Gate Template

Use this record for W03+ and for any retrospective review explicitly requested by the coordinator.

## Wave identity

- Wave/subwave:
- Scope:
- Base main SHA:
- Exact candidate HEAD:
- PR:
- Owner:
- Dependencies consumed:

## Gate A — Correctness

- [ ] deterministic/state semantics verified where applicable
- [ ] contract/schema compatibility verified
- [ ] idempotency/replay behavior verified or N/A justified
- [ ] negative-test matrix complete
- [ ] same canonical input/version reproduces expected outcome where required

Evidence:

Decision: PASS | FAIL | BLOCKED | N/A

## Gate B — Safety / Authority

- [ ] tenant boundary verified
- [ ] identity/subject binding verified
- [ ] policy/authority separation preserved
- [ ] no confidence/model/precheck/cache/session state creates authority
- [ ] least-authority/no-scope-widening checks applied
- [ ] side-effect path fails closed when validation is unavailable/invalid
- [ ] data classification/consent/purpose/jurisdiction checked where applicable

Evidence:

Decision: PASS | FAIL | BLOCKED | N/A

## Gate C — Performance / Economics

Representative paths:

| Path | p50 target | p95 target | p99 target | cost target | max model calls | max tool calls | max fan-out |
|---|---:|---:|---:|---:|---:|---:|---:|
| | | | | | | | |

- [ ] critical path mapped
- [ ] serial vs parallel stages justified
- [ ] concurrency bounded
- [ ] retries bounded
- [ ] latency/cost budget propagated where supported
- [ ] no avoidable agent/model use for deterministic work

Evidence:

Decision: PASS | FAIL | BLOCKED | MODELLED_ONLY | N/A

## Gate D — Failure behavior / Recoverability

Test at least the applicable cases:

- [ ] timeout
- [ ] duplicate/replay
- [ ] cancellation
- [ ] stale state
- [ ] dependency unavailable
- [ ] partial success
- [ ] uncertain execution
- [ ] rate limiting
- [ ] worker/agent unavailable
- [ ] rollback/kill-switch/degraded mode

For each case, state expected semantic result: reject, queue, degrade, reconcile, circuit-break, rollback, escalate or continue.

Evidence:

Decision: PASS | FAIL | BLOCKED | MODELLED_ONLY | N/A

## Pre-mortem

Assume this wave caused a material production incident six months after release.

Top plausible causes:
1.
2.
3.
4.
5.

New tests/controls produced by the pre-mortem:

## Risk delta

### New risks

| Risk ID | Description | L | I | D | Exposure | Owner | Mitigation |
|---|---|---:|---:|---:|---:|---|---|

### Changed risks

| Risk ID | Previous | New | Reason | Evidence |
|---|---|---|---|---|

### Closed/superseded risks

| Risk ID | Closure reason | Evidence |
|---|---|---|

## Dependency / blast-radius review

- Components that depend on this wave:
- Components this wave depends on:
- Single points of failure introduced:
- Degraded mode:
- Rollback boundary:
- State migration/reconciliation needed on rollback:

## Observability / evidence reconstruction

Given one failed execution, can we reconstruct:

- [ ] objective/task
- [ ] correlation/causation
- [ ] selected context/source versions
- [ ] routing/strategy summary where applicable
- [ ] current policy/version used
- [ ] authority/decision reference
- [ ] ActionIntent/ExecutionIntent equivalent
- [ ] executor/target/provider/device
- [ ] receipt
- [ ] readback/evidence
- [ ] final outcome/error class

Known evidence gaps:

## Stress scenarios executed

| Scenario | Parameters | Expected | Observed | Result | Evidence |
|---|---|---|---|---|---|

## Release decision

- Correctness: PASS | FAIL | BLOCKED | N/A
- Safety/Authority: PASS | FAIL | BLOCKED | N/A
- Performance/Economics: PASS | FAIL | BLOCKED | MODELLED_ONLY | N/A
- Failure/Recoverability: PASS | FAIL | BLOCKED | MODELLED_ONLY | N/A

Overall: ACCEPT | ACCEPT_WITH_RECORDED_RISK | REJECT | BLOCKED

Any release-blocking invariant violation overrides aggregate scoring.
