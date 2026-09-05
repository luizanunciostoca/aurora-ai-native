# Aurora Wake / Voice — Physical Readiness Protocol

Status: `PHYSICAL_EVIDENCE_REQUIRED`

This protocol is preparation for remediation #445 and W15-J/DP5. It does **not** create physical evidence and cannot close DP5 by itself.

## Authority invariant

`INTELLIGENCE != AUTHORITY != EXECUTION`.

A wake candidate, STT transcript/confidence, Android runtime permission, assistant role, local enrollment model, Keystore integrity key, device trust, transport ACK, TTS completion, or device presence is only a precondition/evidence signal. None may mint W02/W07 authority, a verified business outcome, or retry eligibility. `EXECUTION_UNCERTAIN` remains reconcile-before-retry.

## Exact candidate binding

Every physical run must bind one exact tuple:

1. 40-hex candidate SHA from the canonical remediation/W15-J candidate;
2. exact tested APK SHA-256, flavor, applicationId, versionCode and versionName;
3. physical device manufacturer/model/product + SHA-256 of serial + build fingerprint/API;
4. Android assistant-role holder and RECORD_AUDIO state;
5. local wake model version, sensitivity, privacy state and foreground-service state;
6. audio route and battery-optimization state;
7. operator + UTC observation timestamps;
8. W04 registry version/sourceRef/content SHA-256 and W15-G vocabulary version/sourceRef/content SHA-256 when a governed projection is actually supplied;
9. canonical W07 ingress/environment reference when the deterministic path is exercised.

If any material element changes, open a new evidence set. Never substitute CI, emulator, JVM tests, logs from a different SHA, or a locally rebuilt APK for physical evidence.

## Privacy rules

Do not record, persist, attach, upload, or retain raw microphone PCM. Do not export the local derived enrollment template/model. Evidence may retain hashes, bounded counters, non-secret system diagnostics and scenario dispositions only.

## Mandatory wake accuracy matrix

Exercise natural pt-BR pronunciations of “Aurora” across multiple speakers, 0.5/1/2/3 m, low/normal/loud speech, quiet/TV/music/conversation/fan/air-conditioning backgrounds, and representative tablet mounting. Record deliberate attempts, confirmed wakes, rejected wakes and latency. Do not invent product thresholds before physical data exists.

At least 100 deliberate wake attempts are required across the matrix plus a passive long-idle false-activation window.

## Lifecycle / always-listening matrix

Validate:

- app foreground/background;
- screen on/off where the OS permits microphone FGS operation;
- Activity destroy/recreate;
- forced process stop and relaunch;
- assistant service ready/shutdown lifecycle;
- reboot and post-reboot restoration behavior;
- locked/unlocked device;
- battery saver and long idle;
- permission revoked while armed;
- Privacy Mode enabled while armed;
- assistant role removed while armed.

A platform restriction must be recorded as `BLOCKED` or a documented expected fail-closed state. It must not be relabeled PASS.

## Audio / STT / TTS matrix

Validate built-in audio plus representative Bluetooth and supported wired/USB routes. Prove:

- hotword monitor ownership yields before bounded STT;
- enrollment is exclusive and cannot race STT/hotword capture;
- STT timeout/error releases audio ownership and permits safe rearm;
- TTS saying “Aurora” does not self-trigger;
- genuine user barge-in while TTS is active behaves only when the configured audio policy allows it;
- TTS completion is presentation evidence only, never execution success.

## Governed W15-G boundary

Physical runs must cover the same fail-closed chain as deterministic tests:

- no governed W04/W15-C projection -> Conversation fallback;
- stale registry/vocabulary/native capability observation -> no fast-path candidate;
- tenant mismatch or non-DEVICE capability -> unavailable to fast path;
- W04 MEDIUM/HIGH/CRITICAL risk -> conservative HIGH voice handling and escalation;
- denied/revoked microphone permission or Privacy Mode -> blocked;
- ambiguous/unknown/low-confidence transcript -> escalation, never execution;
- W07 ingress unavailable -> candidate returns to safe fallback; no local side effect;
- only an exact LOW-risk current candidate may be submitted for **W07 evaluation**; submission is not W07 authorization or execution.

Never populate a fake W04 registry, fake provenance, fake W07 ingress, or fake success receipt solely to make this matrix pass.

## Security / abuse matrix

Record results for recorded replay, external-speaker playback, media containing the keyword, accidental conversation, rapid duplicate hotwords, distorted/adversarial audio, local model tamper/integrity failure, permission revocation, assistant-role drift, debug-build misuse, storage corruption and service restart. Device-specific non-trigger results do not prove general anti-spoofing/liveness.

## Authority race matrix

Exercise wake during pending approval, active W07-governed execution and `EXECUTION_UNCERTAIN`. A new conversation may begin, but wake/voice must not approve, duplicate the side effect, claim success, or authorize retry.

## Resource observations

Capture start/end battery state, process PSS, CPU snapshot, foreground-service state, thermal observations when available, startup/rearm latency and long-idle behavior. These are W15 device observations, not W17 production SLOs.

## Disposition rule

All scenario records begin `NOT_RUN`. Only a physical operator/reviewer may change them to `PASS`, `FAIL` or `BLOCKED`, with UTC timestamp and concrete evidence reference. A physical run for this wake remediation does not independently close W15-J/DP5; the final W15-J candidate must bind these observations into its own complete device-plane matrix and integrated Risk Gates A-D.
