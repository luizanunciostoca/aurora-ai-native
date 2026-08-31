# Device & Edge Execution Plane — Roadmap Amendment v0.4.1

Date: 2026-08-31  
Status: `ACCEPTED_FOR_PLANNING`  
Base main audited: `c4f25eb41fcb7ff9e390466146ebdeb8239bfe6f`

## Preserved current state

- W00 COMPLETE/ACCEPTED.
- W01 COMPLETE/ACCEPTED and closed.
- W02-00 COMPLETE_ACCEPTED.
- W02-A/B/C COMPLETE_ACCEPTED_MERGED.
- PB1 COMPLETE_RELEASED; technical acceptance main remains `b48953cd4a7913e154fe2804248217ffe0c0952d`.
- W02-D READY.
- W02-E/F/G remain dependency-gated by PB2/PB3/PB4.

This amendment does not expand W02 or implement device runtime.

## Cross-wave roadmap updates

### W04-B — Capability Registry Foundation

Capability Registry must be execution-target-neutral. Capability bindings may resolve to provider, device, workflow or local-service targets. Capabilities express what can be done; they do not encode agent identity as the primary planning unit.

Example planned capabilities: `app.open`, `app.deep_link.open`, `navigation.navigate`, `camera.capture.photo`, `media.play`, `media.pause`, `media.volume.set`, `location.current.read`, `file.open`, `file.share`, `notification.show`.

### W07 — Executor Plane

Add explicit planning responsibility for versioned execution-target semantics:

```text
ExecutionTargetReference =
  PROVIDER | DEVICE | WORKFLOW | LOCAL_SERVICE
```

W07 must preserve ActionIntent-driven deterministic execution and evolve Receipt/Evidence compatibly without requiring fake providers for non-provider targets. `providerBinding` already accepted in W01 remains compatible until a formal migration path exists.

### W08/W09

W08 remains provider adapters only. W09 remains governed workflow integration only. Neither owns Android Device Runtime.

### W14 — Gateway / Device Session / Trust

Expand planned scope to device registration/identity-reference, authenticated session, trust/attestation references, realtime command delivery, reconnect/dedupe/replay protection, session revoke/kill and receipt/evidence ingress. `services/mobile-gateway` remains scaffold until W14 release.

### W15 — Aurora Android & Device Plane

Planned title: **Aurora Android & Device Plane — Presence, Voice, Native Services & Device Execution**.

Subwaves:

- W15-00 Device Plane Coordination & Ownership Freeze
- W15-A Android Application Foundation, Presence & Lifecycle
- W15-B Device Identity, Registration, Secure Session & Android Keystore
- W15-C Native Device Capability Bridge
- W15-D Installed App Integration Layer — Intents/App Links/Deep Links/official SDK adapters
- W15-E Permission & Consent Broker
- W15-F Device Executor Runtime — ActionIntent -> native action -> Receipt/Evidence -> readback
- W15-G Voice/Wake/Presence Fast Path
- W15-H Offline-Safe Queue, Reconnect, Dedupe & Reconciliation
- W15-I Dedicated Device / Device Owner / Aurora Launcher — optional
- W15-J Physical Device Integration, Security & Acceptance

Installed-app integration precedence: official API/SDK -> Android Intent/App Link/Deep Link -> governed app adapter -> computer-use/Accessibility high-risk fallback.

W15 depends on accepted W02 policy/authority, W03 durable foundations, W04 capabilities, W07 executor-target contracts and W14 device gateway/session contracts.

### W17

Add device target/session/capability binding/adapter/latency/outcome/readback/reconnect/reconciliation/failure-class telemetry without secrets.

### W19

Add threat cases for device session hijacking, command replay, stolen/revoked/compromised device, malicious deep links/package impersonation, permission drift, offline replay, capability spoofing/staleness, local privilege escalation, Keystore misuse, overlay/UI spoofing, Accessibility abuse, kill-switch failure and receipt/evidence forgery.

### W20

Add physical Android E2E acceptance covering happy path plus offline, permission denied, app missing, session expired, policy revoked, duplicate command, late receipt, disconnect, `EXECUTION_UNCERTAIN` and kill switch.

## Target structure — planning only

```text
apps/aurora-android/**                  # W15
services/mobile-gateway/**              # W14
services/executors/**                   # W07
packages/registries/src/capabilities/** # W04
execution-target/device contracts       # W07/W14/W15 per ownership freeze
```

Do not materialize missing paths before their owner wave is released.

## Device Plane status

- Architecture: ACCEPTED_FOR_PLANNING.
- Runtime implementation: PLANNED_DEPENDENCY_GATED.
- No device capability is claimed as implemented by this document.
