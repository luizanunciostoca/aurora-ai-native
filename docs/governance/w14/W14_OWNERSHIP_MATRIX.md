# W14 — Ownership Matrix

Status: `CANDIDATE_FREEZE_W14_00`

## W14-owned semantic leaves after W14-00 acceptance

- authenticated generic gateway transport and connection/session correlation;
- canonical device registration record and the single `DeviceId` / `DeviceRef` namespace;
- realtime command/job transport session state;
- safe progress/cancellation transport surfaces;
- device-session trust/attestation reference state, freshness, expiry and revocation;
- reconnect/dedupe/replay-protected device command delivery coordination;
- session revoke/kill behavior;
- authenticated receipt/evidence ingress validation;
- W14 integration/eval fixtures and DP3 publication evidence.

## Not owned by W14

| Concern | Canonical owner |
| --- | --- |
| tenant/identity/correlation/classification primitives | W01 |
| action policy/current authority/OwnerDecision/PolicyToken | W02 |
| generic event durability/outbox/inbox/idempotency/replay | W03 |
| Capability Registry/CapabilityPlan | W04 |
| intelligence/routing/confidence | W05 |
| context/cache/snapshot truth | W06 |
| generic executor/current-authority/target/readback/reconciliation | W07 |
| provider-specific adapters/credentials | W08 |
| n8n workflow binding/bridge | W09 |
| Android app/native capability bridge/local permission broker/Device Executor/Keystore | W15 |
| production telemetry/SLOs | W17 |
| device threat hardening | W19 |
| physical device release acceptance | W20 |

## Intended implementation leaves

Exact runtime paths remain subject to descendant BUILD reconciliation, but the existing `services/mobile-gateway/**` scaffold is the preferred canonical W14 service target unless live-main audit proves otherwise. W14 must not create a second gateway service simply for convenience.

Shared/public `DeviceId`/`DeviceRef`, execution-contract compatibility changes, root barrels/manifests and cross-wave publication remain Program Control-owned surfaces. W14-D may propose the canonical device contracts, but publication requires compatibility review and exact-head acceptance.

## Namespace locks

1. Exactly one Aurora `DeviceId` and one `DeviceRef` concept may exist after W14-D publication.
2. `TabletId`, `MobileId`, `PhoneId`, Android advertising ID, hardware serial, app install ID and provider account ID cannot become parallel canonical device identities.
3. Device registration must remain explicitly tenant-bound and may reference canonical actor/subject identities without replacing them.
4. W07 `ExecutionTargetReference(kind=DEVICE)` remains the execution target taxonomy; W14 must not create a competing target enum.
5. Device/session trust records cannot implement authority scopes or permission grants.

## Secret boundary

Only opaque secret/credential/attestation references may cross W14 public/service boundaries where required. Raw tokens, private keys, attestation secrets, Android keystore material and provider credentials must not appear in source fixtures, logs, governance documents, semantic cache or evidence payloads.
