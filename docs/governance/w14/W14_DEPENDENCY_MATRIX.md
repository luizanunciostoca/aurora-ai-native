# W14 — Dependency Matrix

Status: `CANDIDATE_FREEZE_W14_00`
Exact base: `5715ffa4e9d4cd628c1f6d4d6e7a3410ea3d5324`

## Internal DAG

| Node | Hard predecessors | Primary output | Release note |
| --- | --- | --- | --- |
| W14-00 | W05-H, W07-H | gateway/device namespace + risk freeze | governance-only; independent acceptance required |
| W14-A | W14-00 | authenticated gateway transport | transport auth never action authority |
| W14-D | W14-00 | canonical DeviceId/DeviceRef + registration lifecycle | sole W14 device identifier publication node |
| W14-B | W14-A, W14-D | realtime command/job session model | transport only; no side effects |
| W14-C | W14-A, W14-D | progress/lane/DAG status + cancellation surface | no private reasoning; UI state not authority |
| W14-E | W14-A, W14-D | device session trust/attestation refs | trust is precondition metadata only |
| W14-F | W14-B, W14-C, W14-E | delivery/reconnect/replay protection | reuse W03 durability; no blind uncertain replay |
| W14-G | W14-B, W14-C, W14-E | revoke/kill + receipt/evidence ingress | reject forged/stale/wrong-device evidence |
| W14-H | W14-F, W14-G | integration + DP3 acceptance/publication | releases W15 only through canonical W15 prerequisites |

## Device Plane barriers

- `DP0`: ADR-002 + Device Plane planning governance accepted.
- `DP1`: target-neutral W04 Capability Registry/CapabilityPlan accepted.
- `DP2`: W07 DEVICE-compatible target/executor semantics accepted.
- `DP3`: W14 gateway/session contracts and integration accepted — **owned by W14-H and currently pending**.
- `DP4+`: remain downstream W15/W17/W19/W20 barriers and are not satisfied by W14-00.

## Cross-wave dependency rules

### W01 / W02

Registration/session surfaces must bind canonical tenant/identity/correlation primitives. Session authentication/trust is not PolicyToken/OwnerDecision and cannot widen W02 authority.

### W03

Reconnect/offline-safe command delivery, dedupe and replay must consume W03 durable/idempotency semantics. W14 may own delivery/session transport state, but not a second generic outbox/inbox/idempotency framework.

### W04

W14 may transport capability/target references but cannot create a second capability registry or decide whether a native capability is present/allowed on Android; that is downstream W15 consumption of W04 bindings plus local checks.

### W07

Any command referencing execution must remain compatible with accepted W07 `ExecutionTargetReference(kind=DEVICE)` and executor/receipt/uncertainty semantics. W14 cannot turn a transport ack into successful execution truth.

### W15

W15 remains blocked until W14-H/DP3 is accepted plus all other W15 prerequisites. Existing Android/mobile scaffolds do not release implementation.

## Stale evidence rule

If live main or a candidate HEAD moves, previously green CI/review for a different exact SHA is stale. Reconcile with current accepted dependencies and rerun all required gates before acceptance or descendant release.
