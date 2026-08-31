# Android UI Porting Plan — Historical Migration Guidance

Status: `HISTORICAL_PLANNING_REFERENCE`  
Current Android planning authority: Developer Manual v0.4.1 + ADR-002 + W15 ownership when released.

The committed Aurora UI reference is preserved under `apps/aurora-desktop/legacy-reference/face`. It is visual/interaction provenance only and is not Android runtime authority.

The desired product behavior remains voice-first Presence Mode with the workspace/dashboard opened on demand. The orb/core, rings, glow and voice-reactive behavior may inform future UI work.

Earlier baseline guidance proposed React Native plus native Kotlin modules. That stack choice is not frozen by this historical migration document. W15 must re-evaluate implementation technology, Android lifecycle/foreground-service requirements, permissions, wake/voice, overlay/notifications, Device Executor and dedicated-device needs against current platform requirements and accepted Aurora contracts when W15 is released.

No Android runtime implementation is authorized by this file.
