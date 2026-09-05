# Aurora Wake Word — Physical Acceptance v1

Status: PROTOTYPE / PHYSICAL EVIDENCE REQUIRED

This plan validates the real chain `idle -> local hotword -> confirmed WakeCandidate -> AWAKEN -> bounded STT -> Conversation -> response -> optional TTS -> rearm` on representative Android hardware. It does not close W15-J/DP5 by itself and does not grant canonical acceptance to the prototype branch.

## Invariants

- `VOICE != AUTHORITY`; `WAKE WORD != AUTHORITY`; Android permission, assistant role, reachability and Keystore possession are only local/platform preconditions.
- A confirmed wake must never mint `OwnerDecision`, `PolicyToken`, verified outcome or retry eligibility.
- `EXECUTION_UNCERTAIN` always remains reconcile-before-retry.
- Hotword processing stays local. Do not record, copy, attach, upload or retain raw microphone PCM as evidence.
- Do not export the local derived enrollment template/model through this collector.
- Do not mark a scenario PASS from CI/emulator evidence. Physical observations and reviewer disposition are required.

## Required identity binding

Evidence must bind one exact tuple:

1. git HEAD;
2. `Aurora-Tablet-UI-V4-Wake.apk` SHA-256;
3. package/versionName/versionCode;
4. Android version + SDK;
5. manufacturer/model + hashed device serial + build fingerprint;
6. assistant role holder;
7. RECORD_AUDIO permission;
8. wake runtime engine/model/sensitivity/privacy state;
9. battery-optimization state and audio route;
10. operator timestamps.

If any tuple element changes materially, start a new evidence set.

## Accuracy / false wake matrix

Run natural pt-BR pronunciations of “Aurora” across male/female voices, 0.5 m / 1 m / 2 m / 3 m, low/normal/loud speech, quiet/TV/music/conversation/fan/air-conditioning backgrounds and table vs wall/stand mounting. Record attempts, confirmations and latency. Do not invent acceptance thresholds before physical data exists; report TPR, false rejection and false activation as observed evidence.

## Lifecycle matrix

Validate screen on/off when allowed, foreground/background, Activity destroy, process restart, reboot, locked/unlocked, battery saver and long idle. For fallback microphone-FGS mode on modern Android, reboot may legitimately produce `ARMING_REQUIRED`/platform-limited behavior until a user-visible rearm. For the selected Default Assistant track, validate restoration only through the official `VoiceInteractionService` lifecycle.

## Audio / barge-in

Validate built-in route, Bluetooth, supported wired/USB route, TTS active + user “Aurora”, STT handoff and TTS handoff. Explicitly prove that Aurora TTS saying “Aurora” does not self-trigger while TTS without the keyword still permits a genuine user wake/barge-in.

## Security / abuse cases

Exercise recorded replay, external speaker playback, remote media containing the keyword, accidental conversation, distorted/adversarial audio, rapid duplicate hotwords, permission revocation, Privacy Mode, service restart and local model integrity failure. Record results without claiming liveness/anti-spoofing protection beyond what the prototype actually demonstrates.

## Authority race cases

Test wake during pending approval, active execution and `EXECUTION_UNCERTAIN`. A new conversation may begin, but it must not approve, duplicate the existing side effect or authorize retry. Inspect bounded logs/UI/evidence for explicit non-authority behavior.

## Resource observations

Capture process PSS, CPU observations, battery start/end + elapsed time, Android thermal observations when available, and long-idle behavior. CI/build metrics are not substitutes for physical battery/thermal measurements.

## Stress

Run at least 100 deliberate wake attempts across the matrix, in addition to passive false-activation observation during a long-idle window. The template starts all scenarios as `NOT_RUN`; only the physical operator/reviewer changes them.

## Collector

Use `collect-wake-physical-evidence.sh`. It rejects emulators, requires exactly one ADB device, binds the APK and installed package identity, captures non-secret Android/system diagnostics and creates the evidence JSON from `WAKE_EVIDENCE_TEMPLATE.json`. It deliberately performs no microphone recording and never auto-marks scenario PASS.

## Final review

The reviewer must explicitly assess Risk Gates A-D and known limitations. Wake prototype acceptance and W15-J DP5 acceptance are separate decisions. W16 remains blocked until its published W15-J dependency is genuinely accepted.
