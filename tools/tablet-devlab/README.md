# Aurora Tablet-Only DevLab

Status: **tooling lane / not W15-J acceptance by itself**.

This directory turns a representative Android tablet into the physical development workstation for Aurora without requiring a PC.

## Operating model

```text
Samsung / Android tablet
├─ Aurora APK under test
├─ Termux operator/control plane
│  ├─ git / gh / jq / curl
│  ├─ android-tools (ADB over Android Wireless Debugging)
│  ├─ native PostgreSQL for W03 durable state
│  └─ evidence + development workspace
└─ Debian under PRoot
   ├─ /usr/bin/git (fixed Linux path required by W15-J host fencing)
   ├─ Node 22 >=22.16 <23
   ├─ npm/build tooling
   └─ exact W15-J LOCAL host
```

The Aurora app remains the **system under test**. Termux/self-ADB remains the **operator/control plane**. The app cannot self-declare PASS.

`INTELLIGENCE != AUTHORITY != EXECUTION`.

PostgreSQL intentionally runs natively in Termux/Android, outside PRoot. The Debian host reaches it over `127.0.0.1:5432`. This avoids relying on System V shared-memory behavior that PRoot does not provide reliably while preserving W03's PostgreSQL-backed durable-state contracts.

## Canonical same-tablet transport

The W15-J host running on the same tablet binds:

- `127.0.0.1:8080` — authenticated W14 device/voice plane
- `127.0.0.1:8081` — one-shot bootstrap

The canonical same-tablet transport is `LOCAL_TABLET_LOOPBACK`.

Self-ADB is used only for external observation/control (`pm path`, `adb pull`, `am force-stop`, `dumpsys`, permission changes, process/lifecycle testing). It is not the application transport. `adb reverse` mappings for 8080/8081 are forbidden in this mode.

Current exact tuple defaults:

```text
main      d2089407e88480686b879928cf2863c0dc81718e
android   6d44480eae9b99467b20df44290b5c9b17626c3e
host      294e8754a568838ade40f1907546339385d7e599
packaging e0f120525a08fa51e6be4b1ac29cc1e203648765
run       34686121049
artifact  10296091034
name      aurora-w15j-tablet-loopback-apk-6d44480e-host-294e8754
zip       e115c2fcd31416e855cab0a69576ec254a71cc37e2979933ab375de82ed91810
apk       a0f8ed0b3e5d461592873a522a75a42fd7c079bad2a78dfd2d9968c1763af7e6
transport LOCAL_TABLET_LOOPBACK
```

The exact APK is signed with a CI-generated debug signing identity. If a different Aurora debug build is already installed, a clean uninstall/install may be required before byte-exact DP5 readback.

## One-time setup

1. Install Termux from an official Termux distribution source.
2. Enable Android Developer Options and **Wireless debugging**.
3. In Termux run:

```bash
bash tools/tablet-devlab/bootstrap-termux.sh
bash tools/tablet-devlab/setup-debian.sh
```

`bootstrap-termux.sh` installs the native Termux PostgreSQL runtime used by W03. `setup-debian.sh` prepares only the Linux host/build userland; PostgreSQL is deliberately not run inside PRoot.

4. Pair/connect self-ADB:

```bash
bash tools/tablet-devlab/self-adb.sh discover
bash tools/tablet-devlab/self-adb.sh pair <ip:pairing-port>
bash tools/tablet-devlab/self-adb.sh connect <ip:debug-port>
bash tools/tablet-devlab/self-adb.sh status
```

5. Create the exact worktrees:

```bash
bash tools/tablet-devlab/worktrees.sh
```

6. Download and verify the exact tablet-loopback artifact:

```bash
bash tools/tablet-devlab/fetch-current-artifact.sh
```

7. Verify/install the exact APK:

```bash
bash tools/tablet-devlab/install-exact-apk.sh
```

The installer first pulls and hashes the currently installed Aurora APK before any mutation. If the exact artifact is already installed, it exits without reinstalling. If a different Aurora APK is installed, it fails without modifying the tablet.

When clean replacement is required, use the explicit opt-in:

```bash
AURORA_ALLOW_CLEAN_INSTALL=YES bash tools/tablet-devlab/install-exact-apk.sh
```

That explicit mode uninstalls only package `ai.aurora.device.local`, which removes Aurora's local application data, installs the exact APK, then independently pulls `/base.apk` and requires byte-for-byte equality with the artifact. The resulting evidence remains `READY_NOT_ACCEPTED` and is not execution authority.

8. Prepare the LOCAL PostgreSQL state owned by W03 and apply the exact W03 migrations:

```bash
bash tools/tablet-devlab/setup-postgres.sh
```

The script creates a private native-Termux PostgreSQL cluster under the DevLab root, binds only to `127.0.0.1`, applies W03 migrations 001/002/003 and verifies the idempotency, execution-attempt quota and containment tables. The generated database environment file remains local, mode `0600`, outside Git. Database readiness does not authorize execution and does not constitute physical acceptance.

9. On the physical tablet, record an interactive exact-tuple operator consent for the one bounded positive-effect window:

```bash
bash tools/tablet-devlab/authorize-dp5-effect.sh
```

This command requires an interactive TTY and a one-time challenge response. It writes a mode-`0600` consent record for the exact main/Android/host tuple, limited to `ONE_BOUNDED_MEDIA_VOLUME_STEP_UP`, expiring after 10 minutes. The record explicitly carries `authorizesExecution=false`, `retryAuthorized=false`, and `physicalAcceptance=false`.

Unattended CI or automation cannot create this consent through the normal tooling path because the consent command refuses non-interactive execution. The consent is a human permission boundary for the physical test window; it is still not W02/W07 execution authority.

10. Prepare the short-lived DP5 provider material from that fresh consent record:

```bash
AURORA_DP5_EFFECT_APPROVED=YES bash tools/tablet-devlab/prepare-dp5-provider.sh
```

The environment opt-in is necessary but not sufficient: a fresh, secure, unconsumed interactive consent record must also exist and match the exact tuple. Preparation consumes that record into an immutable timestamped local copy and binds its approval reference into the existing host provider material. The generated material remains outside Git, is mode `0600`, and contains `authorizesExecution=false` and `canGrantPermission=false`.

The generated provider module composes the existing W03/W07/W14 owners and already-authenticated principal. It must not introduce another authority evaluator, mint permissions, or treat Receipt/Evidence as execution authorization.

11. Run the provider composition doctor before starting the host:

```bash
bash tools/tablet-devlab/provider-doctor.sh
```

A PASS here means `PASS_SOFTWARE_ONLY`. It verifies current host identity, secure external state, W03 database connectivity, owner-backed provider shape and non-authoritative receipt/evidence ingress. It does not prove a physical effect, authorize retry, or close DP5.

12. Start the exact host in another Termux session:

```bash
bash tools/tablet-devlab/run-host.sh
```

## Bootstrap refresh on the same live host

The W14 bootstrap reference is deliberately one-shot and short-lived. Do not restart a healthy host merely because an earlier `gbr_...` reference expired or was already consumed. Once `run-host.sh` is still alive and both listeners remain on the same `hostInstanceId`, request a fresh reference with:

```bash
bash tools/tablet-devlab/refresh-bootstrap.sh
```

The helper verifies the recorded host PID, the live instance identity on ports 8080 and 8081, listener roles, file ownership/mode and the non-authoritative refresh schema before returning a new `bootstrap_reference=gbr_...`. Paste only that freshly emitted reference into Aurora immediately. A refresh does not authorize execution, retry or physical acceptance.

## Physical development controls

```bash
bash tools/tablet-devlab/app-control.sh status
bash tools/tablet-devlab/app-control.sh launch
bash tools/tablet-devlab/app-control.sh force-stop
bash tools/tablet-devlab/app-control.sh revoke-mic
bash tools/tablet-devlab/app-control.sh grant-mic
bash tools/tablet-devlab/app-control.sh resources
bash tools/tablet-devlab/app-control.sh screenshot
```

## Tablet-native preflight

```bash
bash tools/tablet-devlab/tablet-preflight.sh
```

The preflight requires the exact `LOCAL_TABLET_LOOPBACK` artifact, exact installed APK bytes, one physical self-ADB target, zero 8080/8081 reverse mappings, and one continuous host identity across both loopback listeners. Its disposition is `TABLET_LOOPBACK_PREFLIGHT_READY_NOT_ACCEPTED`.

This proves environment/readiness only. It does not close DP5, prove execution success, or authorize retry.

## Governed physical dossier and semantic binding

After capturing a fresh Control Tower tuple and collector preflight, create the operator dossier with:

```bash
AURORA_EVIDENCE_DIR="$HOME/aurora-devlab/evidence/w15j-dp5" \
AURORA_CONTROL_TOWER_TUPLE="$HOME/aurora-devlab/evidence/control-tower-tuple.json" \
  bash tools/tablet-devlab/prepare-dp5-dossier.sh
```

Preparation creates `w15j-evidence.json` from the exact Android candidate and also creates `governed-execution-binding.json` from `W15J_GOVERNED_EXECUTION_BINDING_TEMPLATE.json`. Both remain incomplete, non-authoritative operator evidence until real physical observations are recorded.

The operator must populate the 48 mandatory physical scenarios and the seven semantic owner roles bound by the final manifest:

- current W02/W07 authority proof;
- W14 current session proof;
- W14 delivery/command identity proof;
- W03 durable idempotency/receipt state proof;
- Android native execution observation;
- Receipt/Evidence ingress proof;
- W07 final outcome reconciliation proof.

The semantic binding is evidence-only. Its own fields must preserve `authorizesExecution=false`, `provesExecutionSuccess=false`, `retryAuthorized=false`, `physicalAcceptance=false` and `w16BuildUnblocked=false`.

After the physical collector finalizes, `seal-dp5-dossier.sh` preserves the predecessor manifest, binds the collector-owned finalization time into the dossier, and requires `governed-execution-binding.json` to be part of the sealed evidence inventory. The independent reviewer sidecar is created only after sealing.

Then run:

```bash
AURORA_EVIDENCE_DIR="$HOME/aurora-devlab/evidence/w15j-dp5" \
  bash tools/tablet-devlab/dossier-doctor.sh
```

The doctor revalidates GitHub live, binds clean DevLab/Android/host worktrees to the fresh tuple, reconstructs trusted physical facts with `w15j-tablet-loopback-trusted-preflight.mjs`, validates all 48 scenarios with `w15j-tablet-loopback-preflight.mjs`, and independently runs `w15j-governed-execution-binding.mjs`. It requires exactly seven semantic evidence roles and still emits only `LINT_READY_FOR_INDEPENDENT_CONTROL_TOWER_REVIEW_NOT_ACCEPTED`.

That result is review readiness only. It cannot mint W02/W07 authority, prove execution success by itself, authorize retry, declare physical acceptance, or unblock W16.

## Cloud build / tablet development

Source editing, Git operations, PR creation and code review can happen in Termux. Android build/package can stay on GitHub Actions; the user does not need a PC. The resulting exact artifact is downloaded back to the tablet for physical testing.

This is the preferred long-term model because Android's official Linux SDK/build-tool binaries are not guaranteed to be native ARM64 executables suitable for every Android/Termux environment, while GitHub Actions provides a reproducible build environment.

## Final DP5 still required

Tablet-only means **no PC**, not "no independent reviewer". Final DP5 still requires:

- exact current APK install/readback on the representative physical tablet;
- local native-Termux PostgreSQL with W03 migrations and durable state owners;
- current W02/W07 authority and W14 transport/session truth;
- fresh interactive exact-tuple operator consent for the one bounded positive-effect window;
- provider doctor PASS from the exact host candidate;
- authenticated current W04/W15-G projection;
- wake/STT -> W07 -> exactly one bounded permitted native effect -> Receipt/Evidence;
- all 48 mandatory scenarios, including DENY, stale, kill, cancel, duplicate, uncertainty and reconciliation cases;
- seven-role governed execution evidence binding in the sealed manifest;
- at least 100 deliberate wake attempts plus false-wake/noise/distance/voice/TTS/barge-in/audio-route/privacy/resource coverage;
- threat review, resource observations and complete `w15j-evidence.json` inside the immutable collector manifest;
- cleanup and manifest-bound evidence;
- operator attestation;
- independent reviewer identity and manifest-bound reviewer attestation;
- integrated Risk Gates A-D;
- final independent acceptance decision after a fresh live GitHub revalidation.

Until that physical dossier is complete, W15-J remains unaccepted and W16 BUILD remains blocked.
