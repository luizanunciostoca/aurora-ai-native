# Device Plane — Dependency Matrix

Status: `ACTIVE_CANONICAL_FOR_PLANNING`  
Date: 2026-08-31  
Authority: Manual v0.4.1 + ADR-002

## Canonical DAG

```text
W02 policy/authority ----┐
W03 durable events ------|
W04 capabilities --------|
W07 executor targets ----+--> W15 Android Device Plane
W14 gateway/session -----|
```

W17 consumes W15 runtime evidence. W19 hardens the converged Device Plane. W20 performs physical release acceptance.

## Stage requirements

| Stage | Required output for Device Plane |
|---|---|
| W02 | deterministic policy/authority core and current-policy/precheck APIs; no Android runtime |
| W03 | idempotency, durable delivery/replay, outbox/inbox/timers reusable by reconnect/offline workflows |
| W04-B | target-neutral Capability Registry + CapabilityPlan |
| W07 | `ExecutionTargetReference`, target resolver, device-compatible Executor/Receipt/Evidence semantics |
| W14 | device registration/identity-reference, authenticated/trusted session, realtime delivery, dedupe/replay protection, revoke/kill, receipt ingress |
| W15 | Android Device Runtime built only on accepted upstream contracts |
| W17 | queryable device execution/evidence/latency/outcome/reconciliation telemetry |
| W19 | device-specific threat tests and P0/P1 remediation |
| W20 | physical Android E2E release acceptance |

## W15 hard dependencies

- W02 policy/authority core accepted.
- W03 durable event/idempotency foundations accepted.
- W04 Capability Registry target-neutral contracts accepted.
- W07 device-compatible execution-target/executor contracts accepted.
- W14 Device Gateway/session/trust accepted.

The existence of `apps/aurora-android` scaffold does not release W15 implementation.

## Device publication barriers

- DP0 — ADR-002 + Manual/Action Plan v0.4.1 accepted for planning.
- DP1 — W04 target-neutral Capability Registry accepted.
- DP2 — W07 device-compatible execution-target contracts accepted.
- DP3 — W14 Device Gateway/session contracts accepted.
- DP4 — W15-00 ownership/contracts accepted.
- DP5 — W15 runtime integration accepted.
- DP6 — W17 telemetry + W19 security gates accepted.
- DP7 — W20 physical device acceptance / Release 1.0.

These are additional Device Plane guards and never replace canonical program-wave prerequisites.

## Fail-closed guards

- No W15 code may infer authority from device session, Android permission, app presence or prior successful execution.
- No stale W02-F precheck may authorize W07/W15 execution.
- No offline replay may blindly repeat `EXECUTION_UNCERTAIN` side effects.
- No device capability binding may be used when discovery/permission/trust freshness is invalid.
- No provider credential or local device secret is allowed in PolicyToken, ActionIntent metadata, plan templates, semantic cache or telemetry.

## Current program state

DP0 is planning-complete only. DP1-DP7 remain pending/dependency-gated. W02-D is currently `IN_PROGRESS` in draft/open PR #41 after PB1 release; PB2 remains closed until W02-D is accepted and published. Because the W02-D branch started before the Device Plane planning merge, its final acceptance must first rebase/revalidate against the latest main. The canonical W02 sequence remains D -> PB2 -> E -> PB3 -> F -> PB4 -> G -> PB5 before downstream waves are released according to the main roadmap.
