# Aurora Interactive Preview v0.16

Status: `NON_CANONICAL_PRODUCT_PREVIEW / NOT_W15J_ACCEPTANCE / NOT_W16_BUILD`

## Purpose

Expose already-implemented Aurora Android capabilities through a product-like conversational tablet experience without changing canonical authority, execution, W15-J physical acceptance, or W16 dependency status.

## Included

- animated Aurora assistant surface;
- explicit READY / LISTENING / UNDERSTANDING / ACTING / SPEAKING / COMPLETED / BLOCKED / DEGRADED states;
- manual “Falar com Aurora” entry point in addition to wake/system-assistant invocation;
- visible user transcript and Aurora response;
- bounded local pt-BR TTS response;
- existing W15-G deterministic voice routing;
- existing W07 authority ingress;
- existing W15-J governed Android command consumer;
- capability-specific success copy for the currently allowlisted `audio.volume.set` DP5 path;
- safe, user-facing fallback copy when the request is understood but unavailable, blocked, ambiguous, or requires reconciliation.

## Invariants

This preview does not:

- mint PolicyToken, OwnerDecision, W07 authorization, device trust, or permission;
- convert speech confidence or UI state into authority;
- bypass W07 for external/native side effects;
- retry `EXECUTION_UNCERTAIN` automatically;
- claim physical DP5 acceptance;
- unblock W16 BUILD;
- replace the canonical W15-J APK tuple.

The preview is intentionally stacked on `wave/15j-physical-device-integration-acceptance` so product/UX iteration can be tested without mutating the W15-J acceptance candidate.
