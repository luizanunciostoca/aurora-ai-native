# W15-J / DP5 Physical Test Harness

Status: **physical evidence automation / NOT_ACCEPTED**.

This harness guides the canonical 48-scenario W15-J matrix, captures repeatable evidence around each physical action, and writes only explicit operator dispositions back into the prepared `w15j-evidence.json`. It never infers `PASS`, never grants execution/retry authority, never substitutes CI/emulator evidence for physical evidence, and never accepts DP5/W15-J.

`INTELLIGENCE != AUTHORITY != EXECUTION`.

## Architecture

```text
Control Tower tuple + collector preflight
              |
              v
      prepare-dp5-dossier.sh
              |
              v
      dp5-campaign.mjs init
              |
       48-scenario catalog
              |
              v
 start scenario -> automated baseline
              |
              v
       HUMAN PHYSICAL ACTION
              |
              v
 finish -> automated after-state
              |
              v
 explicit PASS / FAIL / BLOCKED
              |
              v
 receipt + SHA-256 manifest + campaign report
              |
              v
 collector finalize -> seal -> reviewer -> dossier doctor
```

The stable IDs `DP5-LIFE-*`, `DP5-ID-*`, `DP5-CAP-*`, `DP5-APP-*`, `DP5-EXEC-*`, `DP5-OFF-*`, and `DP5-VOICE-*` map one-to-one to the 48 canonical paths exported by `tools/acceptance/w15j-preflight.mjs`.

## Automatically captured

At scenario start and finish, the harness records UTC and monotonic time and attempts to capture:

- filtered/redacted logcat, including correlation ID plus W15/W14/W07/wake/STT/TTS/Receipt/reconciliation signals;
- package, process, activity and Android service state;
- RECORD_AUDIO AppOps/runtime-permission state;
- CPU, PSS/memory, battery and thermal state;
- connectivity state;
- same-tablet LOCAL host-instance readback on ports 8080/8081;
- listener state when `ss` exists;
- screenshot when the scenario declares REQUIRED or RECOMMENDED evidence;
- per-attempt scenario receipt and SHA-256 evidence manifest;
- capture failures rather than hiding them.

Raw microphone PCM, credentials, bootstrap/session secrets and private signing material are forbidden. Common bearer/JWT/bootstrap/session/credential patterns are redacted before text evidence is written.

## Human-only physical work

The operator still performs what software cannot honestly manufacture: speaking, changing distance/volume/noise, foreground/background/lock state, privacy/permission/network toggles, Android control presses, fresh bounded-effect consent, external-app/native-effect observation, and the final physical verdict.

## Commands

Prerequisites: exact r11 artifact installed/read back, current LOCAL host/W03/provider readiness, collector preflight complete, and `prepare-dp5-dossier.sh` already run.

```bash
export AURORA_EVIDENCE_DIR="$HOME/aurora-devlab/evidence/w15j-dp5"
export AURORA_CONTROL_TOWER_TUPLE="$HOME/aurora-devlab/evidence/control-tower-tuple.json"

node tools/tablet-devlab/dp5-campaign.mjs init --operator "$USER"
node tools/tablet-devlab/dp5-campaign.mjs list
node tools/tablet-devlab/dp5-campaign.mjs next
node tools/tablet-devlab/dp5-campaign.mjs show DP5-LIFE-001
```

Per scenario:

```bash
node tools/tablet-devlab/dp5-campaign.mjs start DP5-LIFE-001
# perform exactly the physical action printed by the harness
node tools/tablet-devlab/dp5-campaign.mjs finish DP5-LIFE-001 --status PASS --observed
```

`PASS` is rejected unless `--observed` is explicitly supplied. `FAIL` and `BLOCKED` require a cause:

```bash
node tools/tablet-devlab/dp5-campaign.mjs finish DP5-ID-004 \
  --status FAIL \
  --cause "session rotation did not invalidate the previous current session"
```

Record findings, waiver candidates and regressions without mutating a scenario verdict:

```bash
node tools/tablet-devlab/dp5-campaign.mjs annotate --kind finding --text "Wake re-arm exceeded the observation window"
node tools/tablet-devlab/dp5-campaign.mjs annotate --kind waiver --text "Requires independent acceptance authority"
node tools/tablet-devlab/dp5-campaign.mjs annotate --kind regression --text "Historical r7 evidence was not imported as r11 PASS"
```

Generate/refresh the campaign view:

```bash
node tools/tablet-devlab/dp5-campaign.mjs report
```

Outputs live under:

```text
$AURORA_EVIDENCE_DIR/harness/dp5-campaign.json
$AURORA_EVIDENCE_DIR/harness/dp5-campaign-summary.json
$AURORA_EVIDENCE_DIR/harness/DP5_FINAL_PHYSICAL_ACCEPTANCE_DOSSIER.md
$AURORA_EVIDENCE_DIR/harness/<SCENARIO_ID>/attempt-XX/
```

## LIFE-004 in-process governed-dispatch helper

`dp5-life004-inprocess.mjs` exists only in the DevLab harness. It imports the exact prebuilt Host candidate, creates the canonical `W15JLocalPhysicalHost`, uses its real `governedDeviceDispatch` port to materialize the W14 delivery, and only then asks the LOCAL APK control surface to queue safe deferred work.

It must fail closed on stale material, Host SHA drift, dirty Host worktree, incomplete baseline capture, rejected governed dispatch, failed `OFFLINE_PREPARE`, process-death mismatch, or queue-hash drift. It never calls `OFFLINE_DRAIN`, never executes the bounded volume effect, never changes W02/W07 authority, and never records PASS/FAIL/BLOCKED by itself.

## Evidence contract and retry policy

Every scenario carries ID, canonical path/name/category, APK/commit/device bindings, preconditions, setup, actions, expected result, expected/forbidden signals, timeout, telemetry/log requirements, screenshot policy, receipt requirement, UTC/monotonic timing, initial status, failure cause, evidence links, cleanup, retry policy, manual physical actions, automated collectors and `humanVerdictRequired=true`. The JSON contract is `dp5-evidence-schema.json`.

A retry is a new preserved numbered attempt. The harness never converts a previous FAIL/BLOCKED/uncertain/late-receipt/reconciliation state into retry authority.

## Dossier closeout

Even with 48 explicit operator PASS records, the strongest harness conclusion is:

```text
READY_FOR_INDEPENDENT_REVIEW_NOT_ACCEPTED
```

Final closeout still requires canonical wake evidence (including >=100 deliberate attempts plus negative/passive coverage), resources/threats, seven-role governed execution binding, collector finalize, immutable seal/provenance chain, operator attestation, independent reviewer sidecar, dossier doctor and integrated Risk Gates A-D review.

## Known risks

- Self-ADB can disappear during lock/reboot/network transitions; capture failure is evidence, not automatic PASS/FAIL.
- OEM `dumpsys` formatting is not a stable API; physical behavior must not be inferred only from text shape.
- Screenshots may contain private user-visible data; use dedicated test content.
- Filtered logcat can miss unexpected tags; correlation IDs and domain receipts remain preferred binding signals.
- Same-tablet resource measurements include Termux/host overhead and are observations, not laboratory benchmarks.
- Historical r7/r9/r10 evidence is context only and must never be imported as r11 PASS.
