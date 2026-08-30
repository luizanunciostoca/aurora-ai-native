# Canonical envelopes — W01-A

This directory owns the canonical `CommandEnvelope` and `EventEnvelope` contracts only.

## Invariants

1. `kind` is a fixed discriminant (`COMMAND` or `EVENT`).
2. `schemaVersion` is the canonical W01-F `ContractVersion`; unknown versions are rejected by the injected canonical version validator.
3. `commandId` and `eventId` are canonical W01-F branded IDs. No local ID aliases exist here.
4. `tenant`, `actor`/`producer`, `correlation`, `deadline` and `dataClassification` reuse W01-D primitives. `correlation` is the single propagation structure for `correlationId` and optional causation/reference information.
5. Event envelopes represent facts. They are never authority grants, owner decisions or policy tokens and cannot be used as a `PolicyToken` substitute.
6. Envelope payloads and metadata are JSON-only. Business payload semantics belong to the owning bounded context, not to the shared envelope.
7. Metadata is limited to labels and namespaced `x-*` extensions. Reserved security/propagation/version concepts cannot be overridden in metadata.
8. Runtime schemas reject unknown top-level envelope fields. This prevents accidental authority or business-specific fields from becoming part of the shared contract.
9. `requestedAt` and `occurredAt` are strict RFC3339 timestamps.
10. Serialization validates first and emits canonical JSON with recursively sorted object keys, producing deterministic bytes for structurally equivalent JSON values.
11. W01-A does not implement event bus, persistence, handlers, retries, scheduling or authorization behavior.
12. Backward/forward compatibility is explicit: no unknown-version coercion, and compatibility adapters belong to the W01-G integration path.

## Canonical dependency state

W01-A is validated against the accepted W01-F ID/version primitives and W01-D propagation primitives from the synchronized canonical `main`; it does not rely on local substitutes for either dependency.
