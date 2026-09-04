# Status: W15-A BUILD CANDIDATE — FOUNDATION / PRESENCE / LIFECYCLE

W15-00 is accepted and the W15-A Android application foundation is now implemented on its canonical candidate branch. Acceptance is not complete until exact-final-HEAD Quality, Test Build and Security, Android build/unit evidence, Risk Gates A-D, protected merge and post-merge exact-main gates succeed.

Implemented in W15-A:

- native Android application/build foundation;
- `local` / `staging` / `production` non-secret environment separation;
- deterministic process/presence/local-service lifecycle state model;
- non-secret process-generation checkpointing and restart recovery;
- Android activity lifecycle bridge;
- observational session lifecycle hooks;
- positive, negative, boundary and process-death/restart tests.

Explicitly not implemented in W15-A:

- W15-B DeviceId/DeviceRef registration client, secure session or Android Keystore credentials;
- W15-C native capability bridge;
- W15-D installed-app integration;
- W15-E permission/consent broker;
- W15-F native side effects or DEVICE executor;
- W15-G voice/wake path;
- W15-H offline execution queue/reconciliation;
- W15-I Device Owner/Launcher profile;
- W15-J physical-device acceptance.

Authority remains upstream-owned: Android permission, local lifecycle state, environment selection, device/session state or future Keystore possession cannot create or widen Aurora policy/action authority. W07 execution/outcome/reconciliation semantics and W14 device/session/trust ownership remain unchanged.
