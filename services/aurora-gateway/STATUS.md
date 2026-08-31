# Status: SCAFFOLD / PLANNED_DEPENDENCY_GATED

Canonical Aurora Gateway target. Primary ownership belongs to W14 — Aurora Gateway, Realtime & Command Session.

The existing legacy bridge is reference/provenance only and must not become runtime authority. W14 will own authenticated command/session routing, realtime state, reconnect/dedupe/cancellation semantics and the gateway-side integration required by the accepted program contracts.

Device registration/session/trust responsibilities introduced by ADR-002 are also W14-owned and remain unimplemented until the wave is released.
