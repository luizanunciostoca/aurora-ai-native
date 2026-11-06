# W16 Legacy Surface Salvage Register

Status: **PREBUILD REFERENCE ONLY**

Reviewed source: `apps/aurora-desktop/legacy-reference/face/interface` on baseline main `77f0f8532197025ee913dd02fcb56878d9d667a9`.

The legacy face remains historical reference material. It is not an active Cortex app and must not become a runtime dependency.

## Concepts safe to preserve as product inspiration

- a persistent Aurora core/status focal point;
- explicit listening/status affordances;
- a command input surface;
- a response region with live-announcement intent;
- floating contextual panels;
- non-audio visual feedback for voice/listening state.

These are concepts only. Their new implementation must consume the W16 headless contracts, design tokens and accepted runtime projections rather than copying legacy runtime code.

## Patterns that must not be carried forward

The legacy HTML contains direct browser-side credential handling for dashboard launch, including local browser storage and inline transfer logic. That pattern is not suitable for Cortex and must not be reused.

Other runtime-specific legacy bridges, including direct voice/WebSocket coupling, remain outside the W16 prebuild ownership boundary. Android/Voice and Device Plane integrations continue to be owned by their accepted layers and are consumed only through post-gate adapters.

The legacy surface also hard-codes presentation copy and mixes shell markup with runtime behavior. The Cortex renderer should instead use localization references, typed projection state, framework-level error boundaries and explicit adapter ownership.

## Salvage decision

- **SALVAGE AS CONCEPT:** visual core metaphor, status/listening affordances, command/response spatial patterns.
- **DO NOT SALVAGE AS CODE:** credential storage/transfer, inline runtime scripts, direct provider/device/voice transport bindings, legacy authority assumptions.
- **POST-DP5 VALIDATION:** compare the rendered Cortex shell against the useful interaction cues above without restoring the unsafe runtime coupling.
