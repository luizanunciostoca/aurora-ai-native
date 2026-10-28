# W15-J / DP5 LOCAL physical window

This is an operator procedure, not acceptance evidence. Start every dossier with
all scenarios and Risk Gates A-D set to `NOT_RUN`. The preflight validator may
only validate operator-supplied results; it never changes a disposition or
creates a `PASS`.

## Before installation

- [ ] Record the exact Android/host/main/packaging SHAs, GitHub artifact
      id/name/ZIP SHA-256, embedded identity/checksum files, APK SHA-256,
      variant, application ID, version code and version name.
- [ ] Record the physical manufacturer, model, product, build fingerprint/API,
      and SHA-256 of the device serial.
- [ ] Verify the nine-file host readiness directory; gateway identity must be
      `aurora-w15j-local-host` and version `git:<exact host SHA>`.
- [ ] Verify both `/v1/local-host/instance` listeners return the same canonical
      `whi_` host instance id with their distinct 8080/8081 roles.
- [ ] Start the authenticated W14 device/voice service on port **8080**.
- [ ] Start the one-shot bootstrap exchange on port **8081**.
- [ ] Install the exact APK; record install result and package/version readback.
- [ ] Confirm microphone/privacy state, assistant handoff, battery saver and
      foreground-service state.

## Transport and lifecycle

- [ ] Set `adb reverse tcp:8080 tcp:8080` and
      `adb reverse tcp:8081 tcp:8081`; record both mappings.
- [ ] Exercise process death, relaunch, reboot, locked/unlocked idle and
      battery-saver transitions.
- [ ] Uninstall and reinstall; confirm bootstrap material is not reused after
      process restart, uninstall, data clear or reboot.
- [ ] Exercise bootstrap replay, session-binding substitution and stale/revoked
      session reuse; record fail-closed results.
- [ ] Exercise tenant/actor injection, ACK-as-success, device-trust-to-authority
      promotion and post-write retry; no local signal may authorize execution
      or retry.

## Voice and threat matrix

- [ ] Complete at least **100 deliberate wake attempts** across the agreed
      speaker, distance, volume and noise matrix.
- [ ] Reconcile confirmed + rejected to the deliberate-attempt total and record
      2+ anonymized voices, 0.5/1/2/3 m, low/normal/loud and all canonical
      backgrounds in `wake-evidence.json`.
- [ ] Add one unique structured record for every attempt, including speaker,
      distance, volume, background, result, latency, UTC observation inside the
      wake window, and a non-empty manifested
      evidence reference. Do not add noncanonical values or extra fields.
- [ ] Observe passive false-wakes during the long-idle window.
- [ ] Exercise barge-in and verify TTS does not self-wake.
- [ ] Exercise ambiguous transcript execution and confirm escalation/no dispatch.
- [ ] Exercise static/BuildConfig credential leakage and durable bootstrap
      reference/credential persistence checks.
- [ ] Exercise process-restart credential reuse and all remaining validator
      threat scenarios.
- [ ] Record CPU, PSS/memory, battery, thermal, startup and re-arm observations.

## Closeout and cleanup

- [ ] Record only concrete references to logs/observations; never attach raw
      microphone PCM, credentials, bootstrap references or session material.
- [ ] Obtain operator and independent-review attestations with UTC timestamps.
- [ ] Before finalize, add manifested `operator-attestation.json` from the
      operator template and keep every observed record inside the collector/wake
      boundaries. After finalize, the independent reviewer reviews the final
      manifest and adds only the unmanifested `reviewer-attestation.json`
      sidecar, binding its exact SHA-256. Never regenerate the manifest afterward.
- [ ] Set `FAIL` or `BLOCKED` when appropriate; never relabel an unavailable
      physical observation as `PASS`.
- [ ] Run `adb reverse --remove tcp:8080` and
      `adb reverse --remove tcp:8081`; verify cleanup.
- [ ] Put the completed wake matrix and every bounded evidence/attestation file
      in the evidence directory before finalize; verify the final manifest.
- [ ] Stop local services, uninstall the APK if required by the runbook, and
      record remaining hardware-only observations.
