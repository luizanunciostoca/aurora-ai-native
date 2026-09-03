# W14 — Gateway & Device Session Wave Charter

Status: `CANDIDATE_COORDINATION_FREEZE_W14_00_RECONCILED`
Task: `W14-00`
Issue: `#114`
Reconciled main snapshot: `76aaa67a1f4f8f74b53c3340638c3b579a6c86e3`
Historical candidate base: `5715ffa4e9d4cd628c1f6d4d6e7a3410ea3d5324`

## Authority and dependency proof

W14-00 is a governance-only coordination node. Live `main`, accepted exact-SHA/PR evidence, `CURRENT_PROGRAM_STATUS.md`, Developer Manual v0.5, ADR-002, canonical Device Plane governance in Drive and accepted owning-wave documents remain superior authority.

The graph prerequisites for W14-00 remain satisfied on the reconciled main snapshot:

- W05-H accepted; W05 complete at accepted merge anchor `8deb67875ba6f3fecd7494f7cc955d5965543e3a`.
- W07-H accepted; W07 complete at accepted merge anchor `3bf15c8d09e01be68bc5a4de1cd04defcb8b5025`.
- Device Plane DP0 is accepted for planning. DP1/W04 and DP2/W07 remain satisfied by the accepted program state; DP3 is owned by W14 and remains pending until W14-H acceptance.

## Mission

Freeze and then implement the generic gateway/device-session plane: authenticated transport, canonical device registration/reference, realtime command/job session transport, progress/cancellation surfaces, session trust/attestation references, reconnect/replay protection, revoke/kill and receipt/evidence ingress.

W14 transports and validates device/session context. It never performs native device capabilities and never creates business/action authority.

## Canonical DAG

`W14-00 -> (W14-A || W14-D)`

`W14-A + W14-D -> (W14-B || W14-C || W14-E)`

`W14-B + W14-C + W14-E -> (W14-F || W14-G)`

`W14-F + W14-G -> W14-H`

Acceptance of W14-00 releases only W14-A and W14-D. No other descendant or W15 node is released by this candidate PR.

## Canonical DeviceId / DeviceRef decision

W14 reserves exactly one canonical `DeviceId` and one canonical `DeviceRef` concept, to be implemented/published by W14-D under controlled shared-contract governance.

- `DeviceId` identifies a registered device record within Aurora's device plane.
- `DeviceRef` is the transport/domain-safe reference used by consumers to refer to that registered device plus required tenant/version/context metadata as defined by W14-D.
- Neither primitive is a replacement for W01 identity/tenant primitives.
- Neither primitive is a provider/account ID, Android package name, advertising ID, hardware serial, TabletId/MobileId alias or authority token.
- No other wave may create a competing device identifier taxonomy.

## Cross-wave boundaries

- W01 owns identity/tenant/correlation/classification primitives consumed by registration/session context.
- W02 owns policy and action authority. Authentication, Android permission, attestation, trust level or device presence never equals action authority.
- W03 owns durable delivery/idempotency/replay foundations used for offline/reconnect-safe coordination.
- W04 owns target-neutral Capability Registry/CapabilityPlan. W14 does not discover or execute native capabilities.
- W07 owns `ExecutionTargetReference`/target resolution and generic executor semantics. W14 transports DEVICE-target command references but cannot reinterpret them.
- W08 provider adapters are separate and have no device dependency.
- W09 workflow transport is separate and cannot substitute for Device Gateway.
- W15 owns Android/native execution, permissions/consent broker, capability bridge, keystore/device-executor runtime and physical-device integration.
- W17 owns production telemetry/SLO claims; W19 device-specific security hardening; W20 physical release acceptance.

## Non-negotiable invariants

1. `Session authentication != Session trust != Policy authority != Execution`.
2. `DeviceId/DeviceRef != user identity != provider identity`.
3. W14 transport must never perform app/hardware side effects.
4. Every device command remains subject to current W02/W07 authority/executor validation at the owning execution boundary.
5. Reconnect/replay cannot blindly redeliver an `EXECUTION_UNCERTAIN` side effect.
6. Device/session trust has explicit freshness/expiry/revocation semantics and fails closed when stale/ambiguous.
7. Receipt/ack ingress is evidence, not proof of verified external state; forged/stale/wrong-device evidence must be rejected.
8. Secret values, local device credentials, attestation secrets and keystore material never enter governance/contracts/logs/cache/evidence payloads.
9. UI/progress/session state never changes authority.

## W14-00 acceptance scope

This node may change governance only under `docs/governance/w14/**`. It must not create runtime contracts/schemas/services, Android code, device secrets, real command delivery or side effects.

Acceptance follows the current Single-Owner Governed Acceptance lifecycle: same-exact-HEAD Quality, Test Build and Security; cleanup/source-of-truth/scope audit; Risk Gates A-D; live-main revalidation immediately before protected expected-head merge; then post-merge exact-main verification before `aurora:accepted` and descendant release.