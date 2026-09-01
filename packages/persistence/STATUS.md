# Status: W03-A_BASELINE

`@aurora/persistence` defines the W03-A Postgres migration baseline and durable schema primitives for event, outbox, inbox, idempotency, timer and lease state.

This package intentionally reuses W01 canonical `EventEnvelope` and W02 identity/tenant/authority contracts without introducing parallel policy or device schemas. It is limited to the W03 ownership surface and is not a replacement for W04 capability or provider/runtime logic.
