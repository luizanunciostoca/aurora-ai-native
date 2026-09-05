# W15-J Physical Android Acceptance Protocol

Status: `PHYSICAL_EVIDENCE_REQUIRED`

This protocol implements the terminal W15-J evidence contract for DP5. Passing CI, JVM tests, an Android emulator, or an in-process gateway mock is prerequisite evidence only and **cannot** close DP5. The final evidence set must be collected on representative physical Android tablet hardware.

## Device Plane barrier state

`DP4 OPEN` is the positive published state defined by the Device Plane dependency matrix. It means the W15 Android capability/precondition/DEVICE-executor core has been accepted for downstream W15 integration. The canonical publication is recorded on W15-00 issue #115 (`issuecomment-5547053471`).

DP4 being open does **not** imply DP5 acceptance. DP5 remains closed until this physical protocol and final integrated Risk Gates are complete.

## Authority boundary

Physical acceptance must preserve the accepted ownership chain:

- W03 owns durable idempotency/replay state.
- W04 owns capability identity/bindings.
- W07 owns current execution authority, outcome, reconciliation, and retry eligibility.
- W14 owns device registration/session/trust and gateway replay/reconnect semantics.
- W15-C/E expose local capability and permission preconditions only.
- W15-F is the concrete Android DEVICE side-effect boundary.
- W15-H may defer only safe work and must never blindly replay stale, cancelled, expired, or `EXECUTION_UNCERTAIN` work.
- W15-J owns the Android-side physical integration/acceptance adapter and evidence protocol. It cannot mint policy, authority, trust, outcome, or retry decisions.

No physical observation may be interpreted as a PolicyToken, OwnerDecision, approval, or retry authorization.

## Accepted W14 network dependency

W14 remediation #417 / PR #419 is accepted and exposes the canonical device-plane composition through the already-authenticated W14 gateway TCP socket. The Android W15-J client must consume that same-socket composition; it must not open a second trust ledger or create a parallel device authority source.

For controlled physical acceptance, the supported transport in this candidate is **LOCAL loopback only** through ADB reverse:

```text
adb -s <serial> reverse tcp:8080 tcp:8080
```

The Android client connects to `127.0.0.1:8080` only when runtime configuration is explicitly `LOCAL` with cleartext enabled. The host-side W14 transport remains loopback-bound. Staging/production TLS deployment is not claimed by W15-J and remains fail-closed until separately governed.

The app manifest includes `android.permission.INTERNET`; this is a transport capability only and grants no Aurora execution authority.

## Android proof compatibility

Registration, attestation, and receipt proofs use the existing W15-B Android Keystore P-256 signing key. The private key remains non-exportable. The client emits only the W14-compatible ES256 proof envelope containing public SPKI and a signature. Gateway credentials and proof values are transient and must not be persisted or logged.

The client must never self-assert tenant/actor authority, current trust, current command truth, server time, or retry permission. Receipt `integrityDigest` is computed locally only as the canonical value covered by the signed W14 receipt-proof message; it is **not** sent as a client-authoritative wire field because W14 recomputes the digest server-side.

## Build identity and structured evidence

The tested APK must be traceable to one exact candidate. Before the physical window, record:

- exact Aurora candidate SHA;
- APK SHA-256, variant, application ID, versionCode and versionName;
- tablet manufacturer/model/product/serial hash;
- Android API level/build fingerprint;
- physical-device proof (`ro.kernel.qemu != 1` and non-emulator serial);
- operator and observation timestamps;
- gateway/test-environment identity and version;
- ADB reverse port/mapping.

`W15J_EVIDENCE_TEMPLATE.json` schema v1.2 records every mandatory subscenario individually. A group-level PASS is insufficient. Every mandatory scenario record must contain:

- `status`: `PASS`, `FAIL`, `BLOCKED`, or `NOT_RUN`;
- `observedAtUtc`;
- at least one concrete `evidenceReferences` entry for PASS, FAIL, or BLOCKED.

DP5 cannot close while any mandatory scenario is `NOT_RUN`, `FAIL`, or `BLOCKED`. Threat items may be `HANDED_OFF` only when the downstream owner and evidence/reference are explicit and the item is not a W15-owned DP5 blocker.

Resource observations and Risk Gates have their own structured records. The final evidence must also bind the raw collector directory, preflight/finalize metadata, SHA-256 manifest, ADB-reverse cleanup evidence, operator attestation reference, and independent review reference.

## Mandatory physical scenarios

### Lifecycle and process restart

1. cold launch from stopped process;
2. foreground -> background -> foreground;
3. forced process stop followed by relaunch;
4. process death while safe deferred work exists;
5. process death after entering the native dispatch boundary: restart must not issue a second dispatch and must remain reconciliation-only.

### Device identity, registration, and session

1. registration with non-exportable Keystore key material over the real W14 same-socket gateway path;
2. session establishment bound to the current W14 DeviceRef;
3. reconnect on a fresh TCP socket, rebind the same accepted DeviceId/DeviceRef, then W14 session resume with previous-connection evidence;
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
2. reconnect on a **fresh TCP socket** using W14 gateway reconnect, same-DeviceRef rebind and device-session resume while preserving previous-connection evidence;
3. duplicate command/idempotency key across reconnect;
4. process restart with queued work;
5. stale/expired authority must not replay;
6. W03 `INFLIGHT`/uncertain state remains reconciliation-only;
7. late Receipt/Evidence is signed against the reported prior connection/generation and classified without blind replay;
8. crash-fenced `RECONCILIATION_REQUIRED` work never auto-dispatches after restart;
9. transport failure after request write is `TRANSPORT_UNCERTAIN` and must not auto-retry.

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

Retain raw collector outputs and populate the corresponding structured evidence records. At minimum record:

- cold and warm startup timing;
- gateway reconnect timing through the real W14 physical path;
- battery state spanning the governed scenario window;
- process memory (`dumpsys meminfo`);
- CPU snapshots (`dumpsys cpuinfo`);
- app/data storage footprint;
- foreground-service state, if one is actually used by the accepted build.

Collector raw captures include a companion `.exit-code` file. A non-zero optional capture is evidence of an observation blocker, not a successful observation, and must be reflected as `BLOCKED` until resolved or explicitly handed off where allowed.

These are **W15 device observations**, not production SLOs. Production telemetry/SLO ownership remains W17.

## Two-phase physical collector

The collector intentionally brackets the entire governed scenario window so battery/resource evidence and ADB-reverse cleanup are not falsely captured only during preflight.

### 1. Preflight

Use one exact LOCAL APK built from the candidate and one evidence directory:

```bash
AURORA_CANDIDATE_SHA=<40-hex-candidate> \
AURORA_APK=<path-to-exact-local-apk> \
AURORA_APK_VARIANT=<variant> \
AURORA_OPERATOR=<operator-id> \
AURORA_GATEWAY_IDENTITY=<test-gateway-id> \
AURORA_GATEWAY_VERSION=<test-gateway-version> \
AURORA_EVIDENCE_DIR=<evidence-directory> \
./apps/aurora-android/physical/collect-w15j-physical-evidence.sh
```

Preflight fails closed unless exactly one authorized physical ADB device is present, candidate SHA/APK metadata are supplied, the APK installs, INTERNET permission is present, and the required LOCAL reverse mapping is observed. Critical capture failures stop collection. If the script created the reverse mapping and preflight fails, it removes that mapping automatically.

A successful preflight deliberately leaves the reverse mapping active only for the governed physical scenario window.

### 2. Execute the mandatory scenario matrix

Run every mandatory scenario above against the same installed candidate/device/gateway identity and populate `W15J_EVIDENCE_TEMPLATE.json` per scenario. Keep gateway credentials out of shell history, collector variables, evidence files and repository content.

### 3. Finalize

After all scenarios, rerun the same collector with the same candidate/APK/device/gateway and evidence directory:

```bash
AURORA_EVIDENCE_MODE=finalize \
AURORA_CANDIDATE_SHA=<same-40-hex-candidate> \
AURORA_APK=<same-exact-local-apk> \
AURORA_APK_VARIANT=<same-variant> \
AURORA_OPERATOR=<operator-id> \
AURORA_GATEWAY_IDENTITY=<same-test-gateway-id> \
AURORA_GATEWAY_VERSION=<same-test-gateway-version> \
AURORA_EVIDENCE_DIR=<same-evidence-directory> \
./apps/aurora-android/physical/collect-w15j-physical-evidence.sh
```

Finalize verifies candidate SHA, APK hash, physical device hash, package and gateway identity/version against preflight, captures after-window resource evidence, removes the ADB reverse mapping, verifies the mapping is absent, and writes `evidence-manifest.sha256` over the raw evidence files.

The collector itself never changes DP5 to accepted. `acceptance-status.txt` remains `INCOMPLETE_UNTIL_SCENARIO_MATRIX_SIGNED` until the structured matrix and integrated Risk Gates are independently reviewed.

## CI and physical-evidence boundary

The W15-J candidate includes:

- Android `INTERNET` permission;
- a bounded persistent HTTP/1.1 channel preserving the W14 same-TCP-socket requirement;
- exact W14 ES256 proof construction using the W15-B Keystore key;
- gateway open/reconnect plus device register/activate/session open/resume;
- reconnect rebind of the same canonical DeviceRef before session resume;
- command claim/ack and authenticated receipt ingress;
- deterministic tests for same-socket sequencing, authority-field exclusion, receipt proof binding, reconnect, and post-write uncertainty.

These automated tests are acceptance prerequisites only. They must not be promoted to DP5 physical evidence.

## DP5 close rule

DP5 may open only when:

1. all required W15 nodes remain canonical `aurora:accepted` and DP4 remains valid/open;
2. the tested APK is bound to the exact W15-J candidate;
3. every mandatory physical subscenario is individually PASS with timestamp and concrete evidence reference;
4. physical resource observations are complete or any legitimate downstream handoff is explicit and non-blocking;
5. Risk Gates A-D pass at the integrated physical boundary;
6. collector preflight/finalize evidence is internally consistent, SHA-256 manifested, and the LOCAL ADB reverse mapping is proven removed;
7. remaining telemetry/security/release work is handed to W17/W19/W20;
8. operator attestation and independent review references are recorded.

Until then the only valid status is:

`DP5 CLOSED — physical Android evidence incomplete.`
