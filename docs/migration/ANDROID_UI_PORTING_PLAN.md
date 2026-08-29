# Android UI porting plan

The current committed Aurora UI reference is preserved under `apps/aurora-desktop/legacy-reference/face`. No duplicated Android visual-reference tree is committed in the W00 accepted baseline; Android work must treat the desktop reference as visual provenance only.

The Android implementation should preserve the orb/core, rings, glow, voice-reactive states and voice-first interaction, but must be rebuilt using React Native plus native Kotlin modules for microphone foreground service, wake word, audio capture, overlay, notifications and power/lifecycle handling.

Workspace/Dashboard is not the boot screen. Presence Mode is the default. Workspace opens only on explicit user request or after user acceptance of Aurora's visual suggestion.
