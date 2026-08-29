# Android UI porting plan

The current Aurora UI is preserved under `apps/aurora-desktop/legacy-reference/face` and duplicated as a visual reference at `apps/aurora-android/reference/legacy-presence-ui`.

The Android implementation should preserve the orb/core, rings, glow, voice-reactive states and voice-first interaction, but must be rebuilt using React Native plus native Kotlin modules for microphone foreground service, wake word, audio capture, overlay, notifications and power/lifecycle handling.

Workspace/Dashboard is not the boot screen. Presence Mode is the default. Workspace opens only on explicit user request or after user acceptance of Aurora's visual suggestion.
