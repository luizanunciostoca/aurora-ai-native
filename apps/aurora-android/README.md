# Aurora Android — W15-A Foundation

This directory contains the W15-A Android application foundation only. It establishes a native Android application shell, deterministic presence/lifecycle state, process-restart checkpoints, non-secret environment separation, and observational session lifecycle hooks.

## Build baseline

- Android Gradle Plugin: `9.2.0`
- Android `compileSdk` / `targetSdk`: `37`
- Java toolchain level: `17`
- Minimum Android API: `26`
- Build variants: `local`, `staging`, `production`

A Gradle installation compatible with AGP 9.2.0 and Android SDK 37 is required. From this directory, use for example:

```bash
gradle :app:testLocalDebugUnitTest :app:assembleLocalDebug
```

The repository does not vendor a Gradle wrapper JAR in W15-A. CI/release infrastructure may supply Gradle externally without placing binary build tooling inside this ownership lane.

## Environment separation

`local` is the only flavor allowed to opt into cleartext transport, and only for the Android emulator/loopback hosts allowlisted by `RuntimeEnvironmentConfig`. `staging` and `production` require HTTPS and use reserved `.invalid` origins until an owning integration wave supplies real environment configuration. No secret, token, key, authority decision, tenant binding or device credential is embedded in these build values.

## Presence and restart semantics

`PresenceReducer` is deterministic and fail-closed. A fresh process begins `BACKGROUND` with local service state `STOPPED`. Activity lifecycle callbacks may move the app between `BACKGROUND` and `FOREGROUND`. Persisted checkpoints contain only non-secret generation/visibility/sequence metadata. A new process consumes the checkpoint, increments the process generation, resets volatile service state, and never restores a stale foreground claim.

The service phase in W15-A is only a lifecycle state vocabulary for future descendants; W15-A does not start a foreground/background service, acquire a wake lock, create a retry loop, or perform native/app side effects.

## Authority boundary

The lifecycle hooks in this node are observational only. They carry process generation, sequence, visibility and local service phase. They do not contain or create `PolicyToken`, `OwnerDecision`, approval, Android permission authority, DeviceId, session credential, Keystore material, capability authority or execution authority.

W15-B owns secure device identity/session/Keystore integration. W15-C owns the native capability bridge. W15-E owns the permission/consent broker. W15-F is the only W15 node authorized to establish the concrete W07-compatible DEVICE executor boundary.

## Deterministic verification

Pure Kotlin lifecycle/environment behavior can be verified without an Android SDK:

```bash
bash verification/run-core-verification.sh
```

Android unit tests additionally cover lifecycle idempotency, invalid state transitions, process-death/restart behavior, environment validation and observational session hooks.
