# ADR-002 — Device & Edge Execution Plane Architecture

Status: `ACCEPTED_FOR_PLANNING`  
Date: 2026-08-31  
Owner: AURORA AI-NATIVE PROGRAM ARCHITECTURE  
Extends: ADR-001 without changing its invariants

## Context

The live architecture already contains the primitives required to support device execution without redesigning Aurora: W01 ActionIntent/Receipt/Evidence, W02 policy/authority boundaries, planned W04 Capability Registry, W07 Executor Plane, W14 Gateway/Realtime, W15 Android, and repository scaffolds `apps/aurora-android`, `services/mobile-gateway` and `services/executors`.

The architectural gap is semantic rather than structural: W01 execution contracts are provider-oriented in places, while future tablet/phone actions such as opening apps, invoking navigation, camera, media, files or sensors are not inherently provider actions.

## Decisions

1. `DEVICE` becomes a first-class execution target alongside `PROVIDER`, `WORKFLOW` and `LOCAL_SERVICE`. A device is not a provider, not an agent and not authority.
2. W01 remains closed/accepted. Any generic execution-target evolution belongs to W07 through versioned compatibility-safe contracts.
3. W04-B Capability Registry must be execution-target-neutral. Capabilities express what can be done, not which app/agent performs it.
4. W07 owns generic `ExecutionTargetReference`, target resolution and compatible Receipt/Evidence evolution. Provider must not be a universal target assumption.
5. W14 owns device registration/identity-reference, authenticated session, trust/attestation reference, realtime delivery, reconnect/dedupe/replay protection, revoke/kill and receipt/evidence ingress.
6. W15 owns Android Device Runtime, native capability bridge, installed-app integration, local permission/consent broker, Device Executor, offline-safe queue and optional Device Owner/Launcher profile.
7. W02 Policy remains platform-neutral. Android permissions/session/trust are additional prerequisites, never replacements for Aurora authority.
8. W15 hard-depends on accepted W02 policy/authority core, W03 durable foundations, W04 Capability Registry, W07 execution-target contracts and W14 Device Gateway/session contracts.
9. W17 records device execution/evidence telemetry; W19 adds device threat cases; W20 performs physical Android E2E acceptance.

## Canonical future flow

```text
CapabilityPlan
  -> Current Policy
  -> Authority Validation
  -> ActionIntent
  -> ExecutionTargetResolver
       -> PROVIDER
       -> DEVICE
       -> WORKFLOW
       -> LOCAL_SERVICE
  -> Executor
  -> Receipt / Evidence / Readback
```

## W15 planned subwaves

- W15-00 — Device Plane Coordination & Ownership Freeze
- W15-A — Android Application Foundation, Presence & Lifecycle
- W15-B — Device Identity, Registration, Secure Session & Android Keystore
- W15-C — Native Device Capability Bridge
- W15-D — Installed App Integration Layer
- W15-E — Permission & Consent Broker
- W15-F — Device Executor Runtime
- W15-G — Voice/Wake/Presence Fast Path
- W15-H — Offline-Safe Queue, Reconnect, Dedupe & Reconciliation
- W15-I — Dedicated Device / Device Owner / Aurora Launcher — optional
- W15-J — Physical Device Integration, Security & Acceptance

Installed-app integration precedence: official API/SDK -> Android Intent/App Link/Deep Link -> governed app-specific adapter -> computer-use/Accessibility only as explicit high-risk least-authority fallback.

## Non-negotiable invariants

- Intelligence != Authority != Execution.
- Fast Lane never bypasses W07 for device side effects.
- W02-F precheck is informational and never executable authority.
- Device session/trust/Android permission never silently elevates Aurora authority.
- Device command replay must not duplicate side effects.
- `EXECUTION_UNCERTAIN` remains reconcile-before-retry.
- Accessibility/computer-use is not the default app integration mechanism.
- No local device secret/credential may be embedded in PolicyToken, ActionIntent metadata, plan templates, cache or telemetry.

## Current program state at acceptance

- W00: COMPLETE/ACCEPTED.
- W01: COMPLETE/ACCEPTED.
- W02-00: COMPLETE_ACCEPTED.
- W02-A/B/C: COMPLETE_ACCEPTED_MERGED.
- PB1: COMPLETE_RELEASED on technical acceptance main `b48953cd4a7913e154fe2804248217ffe0c0952d`.
- Governance-synchronized starting main: `c4f25eb41fcb7ff9e390466146ebdeb8239bfe6f`.
- W02-D: READY.
- W02-E/F/G: dependency-gated.

This ADR introduces planning authority only. It does not implement Android/device runtime and does not alter the current W02 sequence.
