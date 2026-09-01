# W07-H Candidate Scope & Risk Gate Plan

Date: 2026-09-01
Status: `CANDIDATE_BUILD`
Base main: `c7a01549abac801915ad161e69a5685a8271f481`

## Scope

W07-H is integration, fault injection, acceptance evidence and consumer-publication validation only. It introduces no new semantic executor runtime and no W08/W09/W14/W15 runtime implementation.

Candidate implementation path:
- `services/executors/test/w07h-integration-fault-injection.test.ts`

This governance record is within the W07-H owned documentation surface.

## Canonical upstream bindings exercised

- W02: canonical `evaluateAuthority` from `@aurora/policy-core/authority` built output.
- W03: canonical `decideIdempotency` plus SQL builders for `w03_idempotency_key`; the H harness stores no production ledger and delegates replay/conflict decisions to W03 semantics.
- W04: accepted target-neutral `planCapabilities` source, with `authorizesExecution=false`.
- W07-B: current authority gate.
- W07-C: safeguards/idempotency/preconditions/quotas/deadlines.
- W07-D: target-neutral resolution.
- W07-E: target-neutral Receipt/Evidence/readback.
- W07-F: `EXECUTION_UNCERTAIN` and reconcile-before-retry.
- W07-G: circuit breaker, kill switch and failure containment.

## Reality gate matrix

The candidate test covers R01-R24 from `W07_ACCEPTANCE_MATRIX_AND_RISK_GATES.md`, including PROVIDER/DEVICE/WORKFLOW/LOCAL_SERVICE mock consumers, stale authority/target, duplicate fencing, readback mismatch, uncertainty, reconciliation, circuit/kill recovery, W03 replay and end-to-end provenance reconstruction.

## Risk gates

- Gate A — Correctness: deterministic chain and consumer compatibility.
- Gate B — Safety / Authority: no non-authoritative bypass, no fake provider identity, no secrets, no second authority source.
- Gate C — Performance / Economics: CI test-scope p50/p95/p99 measurements only; never production SLO claims.
- Gate D — Failure / Recoverability: duplicate, stale, timeout, uncertain outcome, reconciliation, circuit-open and kill-switch paths.

## Safety fences

- Real external side effects expected: `0`.
- No provider/device/workflow/local consumer runtime is imported or implemented.
- No second Policy Engine, idempotency ledger or Capability Registry is introduced.
- No acceptance or merge may occur from the authoring execution; AGENTS.md independent review requirement remains mandatory.
- Exact-head Quality, Test Build and Security must all pass before independent Program Control acceptance.
