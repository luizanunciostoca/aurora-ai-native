# Jarvis-2025 clean-room adaptation for Aurora

Status: `PREBUILD_NON_AUTHORITATIVE`
Owner: W14/W15/W16 cross-wave implementation planning

## Purpose

Aurora may use the public `ankitpathak62/Jarvis-2025` repository as a functional reference only. The repository currently has no declared license, so no Jarvis source file, implementation body, bundled asset, model, training data, vendored dependency, or generated artifact is copied into Aurora.

This lane implements independently designed Aurora-native behavior from existing Aurora architecture and public product observations.

## Clean-room rules

1. No Jarvis source code is copied or mechanically translated.
2. No Jarvis UI asset, sound, face model, credential/cookie, database, or environment file is imported.
3. Third-party capabilities are integrated from their official SDK/package under their own license when approved.
4. Aurora contracts, schemas, tests, naming, authority semantics, and implementations are independently authored.
5. `INTELLIGENCE != AUTHORITY != EXECUTION` remains mandatory.
6. Experience state, wake/STT confidence, Android permission, biometrics, device trust, and UI state never mint authority.
7. Device effects must flow through W04 capability semantics, W07 authority/safeguards, and W15 typed execution ports.
8. Raw audio is not persisted by these experience contracts.

## Functional observations adopted as product requirements

The useful product patterns are:

- a single interaction ingress for voice and text;
- wake-word activation plus explicit microphone activation;
- deterministic capability handling before conversational fallback;
- visible listening/understanding/speaking/execution states;
- bounded health supervision for wake, microphone, STT, TTS, audio focus, and gateway;
- user-friendly aliases for apps/sites/workspaces;
- media controls;
- contact lookup and communication preparation;
- owner-presence checks for higher-risk actions;
- desktop/web companion surfaces later in W16.

## Aurora-native mapping

### W14

- `InteractionSession` / `InteractionTurn` continuity;
- `UnifiedInteractionInput` transport-safe voice/text ingress;
- `AuroraExperienceStateSnapshot` projection;
- authenticated gateway/session/device binding;
- reconnect/resume behavior.

### W15

- wake word, explicit mic activation, VAD/STT/TTS/barge-in;
- `VoiceRuntimeSupervisor` implementation using `VoiceRuntimeHealthSnapshot`;
- Android app discovery and typed app/media/device capabilities;
- BiometricPrompt/Keystore-backed presence evidence where policy requires it;
- earcons/haptics/presence renderer.

### W04/W07

- alias/shortcut resolution is target-neutral capability planning, not shell execution;
- every side effect remains subject to current W07 authority and safeguards;
- no arbitrary shell, `os.system`, UI tabbing, or generic desktop automation is introduced as an execution escape hatch.

### W05/W06

- known deterministic intents may take a bounded fast path;
- unknown/questions use W05 intelligence plus W06 context;
- model output remains a candidate, never authority.

### W16

- conversational history and multimodal workspace;
- approval/evidence/action cards;
- desktop/web companion and dynamic read models after dependency release.

## Initial implementation in this lane

This PREBUILD adds independently authored:

- `UnifiedInteractionInput`;
- `AuroraExperienceStateSnapshot`;
- `VoiceRuntimeHealthSnapshot`;
- bounded enums for input sources, experience states, voice components, and voice-health states;
- runtime schemas that reject unsupported fields, source/modality spoofing, raw-audio injection, authority injection, duplicate voice-component identities, and inconsistent `HEALTHY` aggregates;
- deterministic contract tests.

No network route, model provider, authority decision, executor side effect, Android APK change, or W16 BUILD release is introduced by this lane.
