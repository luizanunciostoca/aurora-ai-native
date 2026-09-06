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
AURORA_ARTIFACT_ZIP=<downloaded-github-artifact-zip> \
AURORA_ARTIFACT_METADATA=<four-key-artifact-metadata-file> \
AURORA_APK_VARIANT=<variant> \
AURORA_OPERATOR=<operator-id> \
AURORA_W15J_HOST_READINESS_DIR=<exact-host-readiness-directory> \
bash apps/aurora-android/physical/run-w15j-dual-port-physical-window.sh
```

The wrapper configures bootstrap port 8081 and delegates physical-device/APK/resource collection plus port 8080 to the canonical `collect-w15j-physical-evidence.sh`. It fails closed unless both mappings are observable afterward. On a failed preflight it removes the mapping it owns; the underlying collector cleans up its own mapping.

The readiness directory must contain the allowlisted nine files
`host-ready-announcement.txt`, listener/health captures for 8080 and 8081, and
one `.exit-code` beside each capture. All four exit codes must be zero. The
announcement has exactly nine keys and binds the embedded host SHA, ports,
`physical_evidence_status=NOT_RUN`, `gateway_identity=aurora-w15j-local-host`,
`gateway_version=git:<host SHA>`, start time, process id, and the per-start
`host_instance_id=whi_<64 lowercase hex>`. These values are
derived, not operator claims. All four probe process/time values must equal the
announcement.
Each of the four readiness captures is parsed as exact key/value evidence, not
opaque text. Listener captures bind HTTP 200 from `/v1/local-host/instance`, the
same host instance id, and the distinct `DEVICE_GATEWAY` / `BOOTSTRAP_EXCHANGE`
roles, plus `cache_control=no-store` and `pragma=no-cache`. Health captures remain
bounded HTTP 405 / `METHOD_NOT_ALLOWED` probes.
Readiness must be no more than five minutes old at preflight. Finalize requires
the byte-identical readiness copy from preflight; current liveness and process
continuity come from fresh collector-owned instance probes instead of applying
an impossible five-minute cap to the whole physical window.

Preflight copies the exact ZIP, APK, embedded identity/checksum files and artifact
metadata into the evidence directory. Trusted-preflight generation is intentionally
deferred until after finalize so cleanup and identity drift are checked too.

## Scenario window

Run every mandatory scenario from `W15J_PHYSICAL_ACCEPTANCE.md`, populate
`W15J_EVIDENCE_TEMPLATE.json`, and place the completed separate wake matrix at
`<evidence-directory>/wake-evidence.json` before finalize. Keep all initial
dispositions as `NOT_RUN` until a real observation exists. CI, emulator output
and this harness are not substitutes for physical evidence.

The wake/voice matrix still requires at least 100 deliberate wake attempts, passive false-wake observation, TTS self-wake/barge-in tests, lifecycle/privacy/permission transitions, real deterministic command submission to W07 evaluation, ambiguous transcript escalation, and the device/session/replay/uncertainty/resource scenarios.
Every attempt and observed record must fall inside its physical window. Each
scenario/threat/resource/gate record has a distinct primary evidence file.

## Finalize

Use the same candidate, APK, physical device, gateway identity/version and evidence directory:

```bash
AURORA_EVIDENCE_MODE=finalize \
AURORA_EVIDENCE_DIR=<same-evidence-directory> \
AURORA_CANDIDATE_SHA=<same-candidate> \
AURORA_APK=<same-apk> \
AURORA_ARTIFACT_ZIP=<same-downloaded-github-artifact-zip> \
AURORA_ARTIFACT_METADATA=<same-four-key-artifact-metadata-file> \
AURORA_APK_VARIANT=<same-variant> \
AURORA_OPERATOR=<same-operator> \
AURORA_W15J_HOST_READINESS_DIR=<same-exact-host-readiness-directory> \
bash apps/aurora-android/physical/run-w15j-dual-port-physical-window.sh
```

Finalize requires both mappings to still be present before collection, lets the canonical collector remove 8080, removes 8081, proves both are absent, and regenerates the final SHA-256 manifest including dual-port cleanup evidence.
The collector independently probes `/v1/local-host/instance` on both listeners
in preflight and finalize,
recording `collector-probe-{preflight,finalize}-{8080,8081}.txt` plus zero exit
codes. It requires the exact bounded HTTP 200 identity JSON, the same per-start
host instance id, the correct listener role, `Cache-Control: no-store`,
`Pragma: no-cache`, and all three non-authoritative booleans false.

Only after finalize, generate the trusted tuple outside the evidence directory:

First, an independent reviewer reviews the already-finalized
`evidence-manifest.sha256`, then creates `reviewer-attestation.json` as the sole
allowed post-finalize sidecar from `W15J_REVIEWER_ATTESTATION_TEMPLATE.json`.
It binds that exact manifest digest and has a trimmed identity distinct from the
operator. Do not add it to the evidence manifest. The operator attestation uses
`W15J_OPERATOR_ATTESTATION_TEMPLATE.json` and remains a manifested in-window
record.

```bash
node tools/acceptance/w15j-trusted-preflight-from-collector.mjs \
  <finalized-evidence-directory> \
  <independent-control-tower-tuple.json> \
  <new-trusted-preflight.json>
```

The generator verifies the complete tuple, actual ZIP/APK/embedded files, final
manifest, installed APK byte readback, physical-device/gateway identity, wake
matrix and dual-port cleanup. It refuses to overwrite an existing output file.
Populate the independent tuple from
`W15J_CONTROL_TOWER_TUPLE_TEMPLATE.json`. The final Control Tower must still
revalidate live GitHub state immediately before acceptance; this local lint
does not authenticate GitHub or replace that gate.
The validator opens every file with `O_NOFOLLOW`, rejects symlinks and hardlinks,
applies type/size bounds, snapshots bytes once with inode/size/time stability,
and validates only that private snapshot. Raw PCM/audio inventory is prohibited.

Final DP5 acceptance still requires completed per-scenario evidence, operator attestation, independent review and Risk Gates A-D. `INTELLIGENCE != AUTHORITY != EXECUTION`.
