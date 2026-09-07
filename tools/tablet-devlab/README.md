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

## Why direct loopback instead of adb reverse

When the W15-J host runs on the same tablet it binds the canonical loopback listeners itself:

- `127.0.0.1:8080` — authenticated W14 device/voice plane
- `127.0.0.1:8081` — one-shot bootstrap

Using `adb reverse tcp:8080 tcp:8080` on the same device would compete for the same device-side port. Tablet-only operation therefore requires an explicit acceptance transport named `LOCAL_TABLET_LOOPBACK`.

Self-ADB is still used for external observation/control (`pm path`, `adb pull`, `am force-stop`, `dumpsys`, permission changes, process/lifecycle testing), but is not the application transport.

Until W15-J's canonical collector/build identity has been reconciled to this transport, the scripts here produce **development/pre-acceptance evidence only** and must not be interpreted as DP5 acceptance.

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

6. Put the operator-controlled provider module at:

```text
~/aurora-devlab/config/trusted-w15j-provider.mjs
```

Never put credentials or secrets in that file. It may read an external managed secret/runtime channel; it must return existing W07/W14 owners and an already-authenticated non-authoritative W14 principal.

7. Start the exact host in another Termux session:

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

It proves the operator can independently observe the installed Aurora APK and live host from the same physical tablet through self-ADB/direct loopback. It deliberately writes `PRE_ACCEPTANCE_ONLY` until the canonical W15-J transport contract includes `LOCAL_TABLET_LOOPBACK`.

## Cloud build / tablet development

Source editing, Git operations, PR creation and code review can happen in Termux. Android build/package can stay on GitHub Actions; the user does not need a PC. The resulting artifact is downloaded back to the tablet for physical testing.

This is the preferred long-term model because Android's official Linux SDK/build-tool binaries are not guaranteed to be native ARM64 executables suitable for every Android/Termux environment, while GitHub Actions provides a reproducible build environment.

## Independence requirement

Tablet-only means **no PC**, not "no independent reviewer". Final DP5 still requires a reviewer identity distinct from the operator and a manifest-bound reviewer attestation.
