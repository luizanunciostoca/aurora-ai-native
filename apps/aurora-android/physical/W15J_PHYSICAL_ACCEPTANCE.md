# W15-J Physical Android Acceptance Protocol

Status: `PHYSICAL_EVIDENCE_REQUIRED`

This protocol implements the terminal W15-J evidence contract for DP5. Passing CI, JVM tests, an Android emulator, or an in-process gateway mock is useful prerequisite evidence but **cannot** close DP5. The final evidence set must be collected on representative physical Android tablet hardware.

## Authority boundary

Physical acceptance must preserve the accepted ownership chain:

- W03 owns durable idempotency/replay state.
- W04 owns capability identity/bindings.
- W07 owns current execution authority, outcome, reconciliation, and retry eligibility.
- W14 owns device registration/session/trust and gateway replay/reconnect semantics.
- W15-C/E expose local capability and permission preconditions only.
- W15-F is the concrete Android DEVICE side-effect boundary.
- W15-H may defer only safe work and must never blindly replay stale, cancelled, expired, or `EXECUTION_UNCERTAIN` work.
- W15-J owns only the Android-side physical integration/acceptance adapter and evidence protocol. It cannot mint policy, authority, trust, outcome, or retry decisions.

No physical observation may be interpreted as a PolicyToken, OwnerDecision, approval, or retry authorization.

## Accepted W14 network dependency

W14 remediation #417 / PR #419 is accepted and exposes the canonical device-plane composition through the already-authenticated W14 gateway TCP socket. The Android W15-J client must consume that same-socket composition; it must not open a second trust ledger or create a parallel device authority source.

For controlled physical acceptance, the supported transport in this candidate is **LOCAL loopback only** through ADB reverse:

```text
adb -s <serial> reverse tcp:8080 tcp:8080
```

The Android client connects to `127.0.0.1:8080` only when the runtime configuration is explicitly `LOCAL` with cleartext enabled. The host-side W14 transport remains loopback-bound. Staging/production TLS deployment is not claimed by W15-J and remains fail-closed until separately governed.

The app manifest includes `android.permission.INTERNET`; this is a transport capability only and grants no Aurora execution authority.

## Android proof compatibility

Registration, attestation, and receipt proofs use the existing W15-B Android Keystore P-256 signing key. The private key remains non-exportable. The client emits only the W14-compatible ES256 proof envelope containing public SPKI and a signature. Gateway credentials and proof values are transient and must not be persisted or logged.

The client must never self-assert tenant/actor authority, current trust, current command truth, server time, or retry permission. Receipt `integrityDigest` is computed locally only as the canonical value covered by the signed W14 receipt-proof message; it is **not** sent as a client-authoritative wire field because W14 recomputes the digest server-side.

## Build identity

Record all of the following before testing:

- Aurora Git commit SHA and PR/candidate SHA;
- APK variant and application ID;
- Android app versionCode/versionName;
- tablet manufacturer/model/product/serial hash;
- Android API level/build fingerprint;
- whether the device is physical (`ro.kernel.qemu != 1`);
- date/time and operator;
- gateway/test-environment identity and version;
- ADB reverse mapping used for the LOCAL physical gateway path.

The evidence is invalid if the tested APK cannot be traced to the exact candidate being accepted.

## Mandatory physical scenarios

Each scenario must be recorded as `PASS`, `FAIL`, or `BLOCKED`, with a timestamp and evidence reference. `NOT_RUN` or missing evidence cannot close DP5.

### Lifecycle and process restart

1. cold launch from stopped process;
2. foreground -> background -> foreground;
3. forced process stop followed by relaunch;
4. process death while safe deferred work exists;
5. process death after entering the native dispatch boundary: restart must not issue a second dispatch and must remain reconciliation-only.

### Device identity, registration, and session

1. registration with non-exportable Keystore key material over the real W14 same-socket gateway path;
2. session establishment bound to the current W14 DeviceRef;
3. reconnect onto a newer gateway generation and W14 session resume;
4. session rotation;
5. expired session rejection;
6. revoked session rejection;
7. compromised/reinstalled/key-invalidated recovery;
8. stale registration/session metadata fails closed;
9. client-supplied tenant/actor/trust/command authority fields are absent/rejected.

JVM tests prove wire composition only. They do not replace physical device-to-gateway evidence.

### Capability and permission preconditions

1. supported capability discovered as fresh/available;
2. stale capability fails closed;
3. runtime permission denied;
4. permission revoked after earlier grant;
5. background restriction where applicable;
6. permission state never grants Aurora execution authority.

### Installed-app integration

Where implemented, test:

1. expected package present;
2. app missing;
3. wrong/replaced package or signature mismatch;
4. invalid/untrusted intent or deep-link target;
5. supported governed launch/action;
6. readback/evidence where the OS/app permits it.

Accessibility/computer-use fallback is not implicitly authorized by this protocol.

### Governed native execution

1. current W07 DEVICE authorization + current session/capability/permission preconditions -> one native dispatch;
2. current authority missing/stale -> no dispatch;
3. kill switch before dispatch -> no dispatch;
4. cancellation before dispatch -> no dispatch;
5. cancellation/kill race after dispatch -> `EXECUTION_UNCERTAIN`;
6. ambiguous native result/exception -> `EXECUTION_UNCERTAIN`;
7. verified success/failure produces Receipt/Evidence without local retry permission.

### Offline, reconnect, dedupe, and late evidence

1. prolonged offline period with only explicitly safe-to-defer work;
2. reconnect on a **fresh TCP socket** using W14 gateway reconnect + device-session resume while preserving the previous connection evidence;
3. duplicate command/idempotency key across reconnect;
4. process restart with queued work;
5. stale/expired authority must not replay;
6. W03 `INFLIGHT`/uncertain state remains reconciliation-only;
7. late Receipt/Evidence is signed against the reported prior connection/generation and classified without causing blind replay;
8. crash-fenced `RECONCILIATION_REQUIRED` work never auto-dispatches after restart;
9. a transport failure after request write is recorded as `TRANSPORT_UNCERTAIN` and must not auto-retry.

### Voice and presence

1. valid deterministic common command path;
2. false wake does not dispatch;
3. ambiguous transcript escalates rather than executes;
4. lifecycle/privacy restriction blocks the fast path when required;
5. permission/capability denial blocks the fast path;
6. speech/intent confidence never becomes action authority.

## Device-specific threat review

Explicitly record the result or downstream owner for:

- package impersonation/confusion;
- secret/Keystore leakage;
- gateway credential/proof persistence or logging;
- stale/revoked session reuse;
- replay after process death/reconnect;
- late/forged Receipt/Evidence;
- same-socket binding bypass or rebinding attempt;
- permission drift and privilege escalation;
- optional Device Owner/Launcher privilege (currently standard-app-only per accepted W15-I decision);
- UI-automation/accessibility fallback;
- local storage corruption/tampering;
- debug/test build misuse;
- accidental use of LOCAL cleartext/ADB-reverse transport outside the physical acceptance environment.

Security-hardening items not owned by W15-J must be handed to W19 rather than silently waived.

## Performance, battery, and resource observations

Use `collect-w15j-physical-evidence.sh` on the representative tablet and retain raw outputs. At minimum record:

- cold/warm startup timing;
- gateway reconnect timing through the real W14 physical acceptance path;
- battery state before and after the governed scenario window;
- process memory (`dumpsys meminfo`);
- CPU snapshot (`dumpsys cpuinfo`);
- app/data storage footprint;
- foreground-service state, if one is actually used by the accepted build.

These are **W15 device observations**, not production SLOs. Production telemetry/SLO ownership remains W17.

## CI and physical-evidence boundary

The W15-J candidate now includes:

- Android `INTERNET` permission;
- a bounded persistent HTTP/1.1 channel that preserves the W14 same-TCP-socket requirement;
- exact W14 ES256 proof construction using the W15-B Keystore key;
- gateway open/reconnect plus device register/activate/session open/resume;
- command claim/ack and authenticated receipt ingress;
- deterministic tests for same-socket sequencing, authority-field exclusion, receipt proof binding, reconnect, and post-write uncertainty.

These automated tests are acceptance prerequisites only. They must not be promoted to DP5 physical evidence.

## Physical setup

1. Build/install the exact candidate LOCAL APK on one authorized representative physical tablet.
2. Start the accepted W14 gateway composition on host loopback port 8080 (or record the explicitly selected port).
3. Configure ADB reverse for that same port.
4. Run the collector and preserve its raw output directory.
5. Execute every mandatory scenario and reference raw evidence in `W15J_EVIDENCE_TEMPLATE.json` or its signed successor.
6. Remove the ADB reverse mapping after the governed physical test window.

No gateway credential should appear in shell history, collector output, logcat capture, evidence templates, or repository files.

## DP5 close rule

DP5 may be opened only when all W15 nodes are `aurora:accepted`, DP4 remains valid, every mandatory physical scenario above has genuine representative-device evidence, Risk Gates A-D pass at the integrated boundary, physical resource observations are recorded, and remaining telemetry/security/release work is explicitly handed to W17/W19/W20.

Until then the only valid status is:

`DP5 CLOSED — physical Android evidence incomplete.`
