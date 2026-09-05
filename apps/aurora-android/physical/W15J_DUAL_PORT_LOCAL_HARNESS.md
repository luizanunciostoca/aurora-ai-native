# W15-J dual-port LOCAL physical harness

Status: `PREBUILD_ONLY_PHYSICAL_EVIDENCE_REQUIRED`

This harness prepares the final W15-J physical window after the exact runtime candidate is software-green. It does not create physical evidence, mark any scenario `PASS`, authorize execution, prove outcome, or authorize retry.

## Transport topology

The controlled LOCAL tablet window requires both mappings on the same physical device:

```text
adb reverse tcp:8080 tcp:8080   # authenticated W14 device plane + governed voice candidate ingress
adb reverse tcp:8081 tcp:8081   # one-shot pre-session bootstrap exchange
```

The bootstrap exchange exists only to obtain server-staged W14 binding/credential material. After connection, voice candidates use the authenticated 8080 W14 session; there is no second voice-only stack.

## Preflight

Use one exact candidate APK and one explicit evidence directory:

```bash
AURORA_EVIDENCE_DIR=<new-evidence-directory> \
AURORA_CANDIDATE_SHA=<40-hex-candidate> \
AURORA_APK=<exact-local-apk> \
AURORA_APK_VARIANT=<variant> \
AURORA_OPERATOR=<operator-id> \
AURORA_GATEWAY_IDENTITY=<gateway-id> \
AURORA_GATEWAY_VERSION=<gateway-version> \
bash apps/aurora-android/physical/run-w15j-dual-port-physical-window.sh
```

The wrapper configures bootstrap port 8081 and delegates physical-device/APK/resource collection plus port 8080 to the canonical `collect-w15j-physical-evidence.sh`. It fails closed unless both mappings are observable afterward. On a failed preflight it removes the mapping it owns; the underlying collector cleans up its own mapping.

After a successful preflight generate the immutable trusted tuple consumed by the canonical DP5 validator:

```bash
node tools/acceptance/w15j-trusted-preflight-from-collector.mjs \
  <evidence-directory> \
  <new-trusted-preflight.json>
```

The generator cross-checks candidate SHA, APK digest/identity, physical-device identity, gateway identity/version, LOCAL transport scope, emulator rejection, and both ADB reverse mappings. It refuses to overwrite an existing output file.

## Scenario window

Run every mandatory scenario from `W15J_PHYSICAL_ACCEPTANCE.md` and populate `W15J_EVIDENCE_TEMPLATE.json`. Keep all initial dispositions as `NOT_RUN` until a real observation exists. CI, emulator output and this harness are not substitutes for physical evidence.

The wake/voice matrix still requires at least 100 deliberate wake attempts, passive false-wake observation, TTS self-wake/barge-in tests, lifecycle/privacy/permission transitions, real deterministic command submission to W07 evaluation, ambiguous transcript escalation, and the device/session/replay/uncertainty/resource scenarios.

## Finalize

Use the same candidate, APK, physical device, gateway identity/version and evidence directory:

```bash
AURORA_EVIDENCE_MODE=finalize \
AURORA_EVIDENCE_DIR=<same-evidence-directory> \
AURORA_CANDIDATE_SHA=<same-candidate> \
AURORA_APK=<same-apk> \
AURORA_APK_VARIANT=<same-variant> \
AURORA_OPERATOR=<same-operator> \
AURORA_GATEWAY_IDENTITY=<same-gateway-id> \
AURORA_GATEWAY_VERSION=<same-gateway-version> \
bash apps/aurora-android/physical/run-w15j-dual-port-physical-window.sh
```

Finalize requires both mappings to still be present before collection, lets the canonical collector remove 8080, removes 8081, proves both are absent, and regenerates the final SHA-256 manifest including dual-port cleanup evidence.

Final DP5 acceptance still requires completed per-scenario evidence, operator attestation, independent review and Risk Gates A-D. `INTELLIGENCE != AUTHORITY != EXECUTION`.
