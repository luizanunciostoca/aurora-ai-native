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

No physical observation may be interpreted as a PolicyToken, OwnerDecision, approval, or retry authorization.

## Build identity

Record all of the following before testing:

- Aurora Git commit SHA and PR/candidate SHA;
- APK variant and application ID;
- Android app versionCode/versionName;
- tablet manufacturer/model/product/serial hash;
- Android API level/build fingerprint;
- whether the device is physical (`ro.kernel.qemu != 1`);
- date/time and operator;
- gateway/test-environment identity and version, when a real gateway path is used.

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

1. registration with non-exportable Keystore key material;
2. session establishment bound to the current W14 DeviceRef;
3. session rotation;
4. expired session rejection;
5. revoked session rejection;
6. compromised/reinstalled/key-invalidated recovery;
7. stale registration/session metadata fails closed.

A local W15-B state transition or in-process mock does not by itself prove gateway connectivity. If no physical-device-to-gateway transport is available in the accepted runtime, record this section `BLOCKED` rather than substituting a mock for DP5 evidence.

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
2. reconnect onto current W14 session;
3. duplicate command/idempotency key across reconnect;
4. process restart with queued work;
5. stale/expired authority must not replay;
6. W03 `INFLIGHT`/uncertain state remains reconciliation-only;
7. late Receipt/Evidence is classified without causing blind replay;
8. crash-fenced `RECONCILIATION_REQUIRED` work never auto-dispatches after restart.

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
- stale/revoked session reuse;
- replay after process death/reconnect;
- late/forged Receipt/Evidence;
- permission drift and privilege escalation;
- optional Device Owner/Launcher privilege (currently standard-app-only per accepted W15-I decision);
- UI-automation/accessibility fallback;
- local storage corruption/tampering;
- debug/test build misuse.

Security-hardening items not owned by W15-J must be handed to W19 rather than silently waived.

## Performance, battery, and resource observations

Use `collect-w15j-physical-evidence.sh` on the representative tablet and retain raw outputs. At minimum record:

- cold/warm startup timing;
- reconnect timing when real gateway transport is available;
- battery state before and after the governed scenario window;
- process memory (`dumpsys meminfo`);
- CPU snapshot (`dumpsys cpuinfo`);
- app/data storage footprint;
- foreground-service state, if one is actually used by the accepted build.

These are **W15 device observations**, not production SLOs. Production telemetry/SLO ownership remains W17.

## Current known physical-integration constraint

The accepted Android manifest at the start of W15-J has no `android.permission.INTERNET`, and the accepted W15-B session client consumes W14 registration/session views but does not itself provide gateway networking. W15-J must not invent a new authority or transport architecture merely to turn the checklist green. A representative physical run must therefore either:

1. use a canonical transport path that is present and accepted by the time the candidate is tested, or
2. record physical gateway/session/reconnect evidence as `BLOCKED` and keep DP5 closed.

In-process mocks remain useful regression evidence but cannot substitute for this requirement.

## DP5 close rule

DP5 may be opened only when all W15 nodes are `aurora:accepted`, DP4 remains valid, every mandatory physical scenario above has evidence, Risk Gates A-D pass at the integrated boundary, physical resource observations are recorded, and remaining telemetry/security/release work is explicitly handed to W17/W19/W20.

Until then the only valid status is:

`DP5 CLOSED — physical Android evidence incomplete.`
