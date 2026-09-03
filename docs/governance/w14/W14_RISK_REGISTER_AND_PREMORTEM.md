# W14 — Risk Register & Pre-Mortem

Status: `CANDIDATE_FREEZE_W14_00`

## Premortem

Assume the Device Gateway failed after deployment. The likely severe failures are session hijack or wrong-tenant binding, stale trust being treated as permission, duplicate command delivery after reconnect, ambiguous execution being blindly replayed, forged receipts being accepted as truth, secret material leaking into logs/evidence, or W14 creating a second executor/device-identity/durability framework that drifts from W03/W07/W15.

## Formal risk register

| ID | Risk | Severity | Early signal | Required control / evidence |
| --- | --- | --- | --- | --- |
| W14-R01 | session hijack / identity-session mismatch | P0 | authenticated connection bound to wrong actor/device/tenant | explicit binding, expiry, negative auth/hijack tests, fail closed |
| W14-R02 | cross-tenant command or evidence ingress | P0 | tenant mismatch accepted | tenant/device correlation validation on every boundary |
| W14-R03 | stale/revoked trust used as permission | P0 | expired attestation/session still delivers commands | explicit freshness/expiry/revoke; trust != authority |
| W14-R04 | duplicate command after reconnect | P0 | one command key produces repeated delivery/effect | W03-compatible idempotency/dedupe; reconnect race tests |
| W14-R05 | blind replay after `EXECUTION_UNCERTAIN` | P0 | timeout/disconnect triggers resend before reconcile | preserve uncertainty; W07 reconcile-before-retry |
| W14-R06 | forged/stale/wrong-device receipt accepted | P0 | ingress lacks binding/provenance/freshness checks | authenticated ingress, correlation/provenance validation, rejection tests |
| W14-R07 | receipt/ack interpreted as verified state | P0 | completion marked solely from transport ack | retain W07 readback/reconciliation semantics |
| W14-R08 | raw secrets/attestation keys leak | P0 | token/key values in source/log/evidence/cache | opaque refs only, security scan, fixture/log review |
| W14-R09 | competing DeviceId/TabletId/MobileId taxonomy | P1 | multiple canonical ID primitives appear | W14-D sole publication; duplicate/source-of-truth audit |
| W14-R10 | W14 duplicates W07 executor/target semantics | P1 | local target enum or execution outcome logic | consume W07 DEVICE target/executor contracts only |
| W14-R11 | W14 duplicates W03 durability/idempotency | P1 | second generic outbox/inbox/replay ledger | reuse W03 foundations; architecture audit |
| W14-R12 | W14 leaks native execution into gateway | P0 | mobile-gateway invokes app/hardware capability directly | hard W14/W15 boundary; no side-effect ports in W14 |
| W14-R13 | cancellation race corrupts outcome | P1 | late completion overwritten as cancelled or vice versa | explicit state/race semantics and late-result tests |
| W14-R14 | revoke/kill fails for in-flight/reconnected session | P0 | revoked session accepts new delivery | revoke generation/state fencing; reconnect tests |
| W14-R15 | unbounded outstanding command/backpressure | P1 | queue/buffer growth with slow/offline device | finite queue/outstanding/buffer/retry bounds |
| W14-R16 | reconnect storm causes resource/cost runaway | P1 | rapid reconnect creates duplicate state/work | bounded handshake/recovery, dedupe, rate/backpressure tests |
| W14-R17 | progress/UI state exposes private reasoning | P1 | chain-of-thought-like content in progress payload | safe summaries/reasons/evidence refs only |
| W14-R18 | session/device presence becomes authority | P0 | connected/trusted device bypasses current policy | explicit invariant + current W02/W07 validation downstream |
| W14-R19 | W15 starts from open W14 PR or scaffold | P1 | Android runtime imports unpublished W14 surface | DP3/W14-H publication barrier |
| W14-R20 | stale exact-head gates accepted | P0 | CI/review SHA differs from final candidate | exact-SHA discipline; rerun after reconciliation |

## Required W14-H fault scenarios

Integration must include at least: invalid/expired authentication, wrong tenant/device binding, duplicate registration, revoked/compromised device, stale/revoked trust, duplicate/reordered command, disconnect during delivery, reconnect with pending command, ambiguous outcome before disconnect, cancellation race, revoke during in-flight work, late acknowledgement/receipt, forged/wrong-device/stale evidence and bounded-backpressure exhaustion/recovery.

Mocks/fakes are sufficient for W14 acceptance. Physical Android execution belongs to W15/W20 and must not be pulled into W14 merely to make a reality claim.
