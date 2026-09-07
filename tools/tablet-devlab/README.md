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
   ├─ optional PostgreSQL/runtime
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
android   5c955eac4cdcd92bc2e0604d50f9feb339095d6a
host      3c7c3aa917c00d91d738121dee5fd32ed07b5444
packaging 694ebdc9715cb95cee3307237daa1ce1bf4e421f
run       34080729689
artifact  10003625251
zip       bca3a8c98f741ead4d827963ee1694316ddf74aab034dd7317e3a6d0302eee62
apk       da605b277fb4c7f9a3820c417fe126a5b617b7c34d9e7f2b48f67da40114cb9a
transport LOCAL_TABLET_LOOPBACK
```

The exact APK is signed with a CI-generated debug signing identity that differs from the earlier physical candidate. A clean uninstall/install is therefore required before byte-exact DP5 readback.

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

7. Put the operator-controlled provider module at:

```text
~/aurora-devlab/config/trusted-w15j-provider.mjs
```

Never put credentials or secrets in that file. It may read an external managed secret/runtime channel; it must return existing W03/W07/W14 owners and an already-authenticated non-authoritative W14 principal.

8. Start the exact host in another Termux session:

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

- exact new APK clean install and readback;
- real trusted W03/W07/W14 provider composition;
- every mandatory physical scenario PASS;
- at least 100 deliberate wake attempts plus false-wake/noise/distance/voice/TTS/barge-in/audio-route/privacy/resource coverage;
- operator attestation;
- independent reviewer identity and manifest-bound reviewer attestation;
- integrated Risk Gates A-D.
