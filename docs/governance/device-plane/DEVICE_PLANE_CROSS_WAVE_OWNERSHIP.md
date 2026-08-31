# Device Plane — Cross-Wave Ownership

Status: `ACTIVE_CANONICAL_FOR_PLANNING`  
Date: 2026-08-31  
Authority: Manual v0.4.1 + ADR-002

## Purpose

Prevent Android/device work from creating duplicate capability, policy, executor, identity/session or evidence semantics across future waves.

## Ownership matrix

| Wave | Owns | Must not own |
|---|---|---|
| W02 | Policy evaluation, authority validation, current-policy/precheck semantics | Android permissions, device sessions, app launch mechanics, device runtime |
| W03 | Durable events, outbox/inbox, replay/idempotency semantics reusable by device command delivery | Android runtime, device capability registry |
| W04 | Capability Registry, CapabilityPlan, target-neutral bindings | Provider/device execution implementation |
| W07 | Generic execution-target abstraction, target resolution, executor SDK semantics, receipts/readback/reconciliation/circuit-breaker/kill-switch | Android lifecycle, provider-specific adapter logic |
| W08 | Provider-specific adapters/bindings | Android Device Runtime |
| W09 | Governed workflow bridge | Android Device Runtime |
| W14 | Device registration/identity-reference, session auth, trust/attestation, realtime delivery, reconnect/dedupe/replay protection, revoke/kill, receipt/evidence ingress | Business decisions, native app/hardware execution |
| W15 | Android app/runtime, presence/voice, native capability bridge, installed-app integration, permission/consent broker, Device Executor, offline-safe queue, Keystore, optional Device Owner/Launcher, physical integration | Parallel policy/capability/executor/session systems |
| W17 | Device execution/evidence telemetry and SLO integration | Authority or execution decisions |
| W19 | Device threat tests and remediation validation | Runtime feature ownership |
| W20 | Physical Android E2E acceptance and release gating | Feature redesign during acceptance |

## Cross-wave locks

1. No wave may create parallel `DeviceId`/`TabletId`/`MobileId` primitives before W14 ownership freeze.
2. No wave may use provider as a fake synonym for device after W07 target abstraction is accepted.
3. No wave may create a second capability registry outside W04.
4. No Android component may mint or reinterpret `PolicyToken`/`OwnerDecision`.
5. No Device Gateway session/trust record may be treated as action authority.
6. No app-specific adapter may bypass W07 for side effects.
7. Accessibility/computer-use requires explicit high-risk capability/policy classification.
8. Existing `apps/aurora-android`, `services/mobile-gateway` and `services/executors` remain scaffolds until their owner waves are released.

## Current state

W02 remains the current active wave. W02-D is READY after PB1 release. This ownership document does not modify W02 scope or unlock W04/W07/W14/W15 implementation.
