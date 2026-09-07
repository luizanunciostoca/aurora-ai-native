# Aurora Tablet-Only DevLab

Status: **tooling lane / not W15-J acceptance by itself**.

This directory turns a representative Android tablet into the physical development workstation for Aurora without requiring a PC.

## Operating model

```text
Samsung / Android tablet
├─ Aurora APK under test
├─ Termux operator shell
│  ├─ git / gh / jq / curl
│  ├─ android-tools (ADB over Android Wireless Debugging)
│  └─ evidence + development workspace
└─ Debian under PRoot
   ├─ /usr/bin/git (fixed Linux path required by W15-J host fencing)
   ├─ Node 22 >=22.16 <23
   ├─ npm/build tooling
   ├─ PostgreSQL for the W03 durable state owners
   └─ exact W15-J LOCAL host
```

The Aurora app remains the **system under test**. Termux/self-ADB remains the **operator/control plane**. The app cannot self-declare PASS.

`INTELLIGENCE != AUTHORITY != EXECUTION`.

## Canonical same-tablet transport

The W15-J host running on the same tablet binds:

- `127.0.0.1:8080` — authenticated W14 device/voice plane
- `127.0.0.1:8081` — one-shot bootstrap

The canonical same-tablet transport is `LOCAL_TABLET_LOOPBACK`.

Self-ADB is used only for external observation/control (`pm path`, `adb pull`, `am force-stop`, `dumpsys`, permission changes, process/lifecycle testing). It is not the application transport. `adb reverse` mappings for 8080/8081 are forbidden in this mode.

Current exact tuple defaults:

```text
main      d2089407e88480686b879928cf2863c0dc81718e
android   a45c349c840b6c5125867fee3c7294ad61998cc3
host      e280e742321638a852c68346b26cd0cdd69010eb
packaging 12231a4070178d12c3812e05fa9e3179aefa68ac
run       34093517317
artifact  10007765042
zip       2bc3fe221eb36a07146d2a9fb05f505e715c4a52e0b2488a9bc65d1b6cb005d5
apk       5135a164d551c8f93e0dcfcfdf80ad66b60e69131d51d504ee7c000babbbb993
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

The generated database environment file remains local, mode `0600`, outside Git. Database readiness does not authorize execution and does not constitute physical acceptance.

9. Open the explicit operator-controlled positive-effect window and prepare the short-lived DP5 provider material:

```bash
AURORA_DP5_EFFECT_APPROVED=YES bash tools/tablet-devlab/prepare-dp5-provider.sh
```

This opt-in is intentionally required for material that can be used in the single bounded positive physical-effect scenario. CI and unattended automation must not manufacture this consent. The generated material expires after 90 minutes, stays outside Git, is mode `0600`, and contains `authorizesExecution=false` and `canGrantPermission=false`.

The generated provider module composes the existing W03/W07/W14 owners and already-authenticated principal. It must not introduce another authority evaluator, mint permissions, or treat Receipt/Evidence as execution authorization.

10. Run the provider composition doctor before starting the host:

```bash
bash tools/tablet-devlab/provider-doctor.sh
```

A PASS here means `PASS_SOFTWARE_ONLY`. It verifies current host identity, secure external state, W03 database connectivity, owner-backed provider shape and non-authoritative receipt/evidence ingress. It does not prove a physical effect, authorize retry, or close DP5.

11. Start the exact host in another Termux session:

```bash
bash tools/tablet-devlab/run-host.sh
```

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

## Cloud build / tablet development

Source editing, Git operations, PR creation and code review can happen in Termux. Android build/package can stay on GitHub Actions; the user does not need a PC. The resulting exact artifact is downloaded back to the tablet for physical testing.

This is the preferred long-term model because Android's official Linux SDK/build-tool binaries are not guaranteed to be native ARM64 executables suitable for every Android/Termux environment, while GitHub Actions provides a reproducible build environment.

## Final DP5 still required

Tablet-only means **no PC**, not "no independent reviewer". Final DP5 still requires:

- exact current APK install/readback on the representative physical tablet;
- local PostgreSQL with W03 migrations and durable state owners;
- current W02/W07 authority and W14 transport/session truth;
- provider doctor PASS from the exact host candidate;
- authenticated current W04/W15-G projection;
- wake/STT -> W07 -> exactly one bounded permitted native effect -> Receipt/Evidence;
- DENY, stale, kill, cancel, duplicate, uncertainty and reconciliation scenarios;
- at least 100 deliberate wake attempts plus false-wake/noise/distance/voice/TTS/barge-in/audio-route/privacy/resource coverage;
- cleanup and manifest-bound evidence;
- operator attestation;
- independent reviewer identity and manifest-bound reviewer attestation;
- integrated Risk Gates A-D.

Until that physical dossier is complete, W15-J remains unaccepted and W16 BUILD remains blocked.
