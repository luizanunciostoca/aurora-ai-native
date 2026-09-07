# W15-J Tablet-Only DevLab — governed physical development model

Status: `TOOLING_READY / DP5_NOT_ACCEPTED`

Issue: #498

## Objective

Allow Aurora physical development, diagnosis and DP5 execution to be operated from the representative Android tablet itself, without a PC, while retaining an external control plane and independent evidence review.

## Separation model

The tablet hosts multiple security/ownership domains:

1. **Aurora APK** — system under test; owns W15 Android/native behavior only.
2. **Termux operator shell** — development/control environment; not Aurora authority.
3. **Android adbd through Wireless Debugging** — external OS control/observation path used by Termux self-ADB.
4. **Debian/PRoot host runtime** — Linux userland for exact Node 22 host execution.
5. **Trusted provider/runtime channel** — existing W03/W07/W14 owner composition; never created from Android UI/wake state.
6. **Independent reviewer** — identity distinct from operator; final manifest-bound review remains mandatory.

`INTELLIGENCE != AUTHORITY != EXECUTION` remains unchanged.

## Physical topology

```text
+-----------------------------------------------------------+
| Representative Android tablet                             |
|                                                           |
|  Aurora APK                    Termux                      |
|       |                         |                          |
|       | 127.0.0.1:8080/8081    | self-ADB control         |
|       v                         | Git / GitHub CLI         |
|  Debian/PRoot <-----------------+ evidence workspace       |
|  exact Node 22 W15-J LOCAL host                            |
|  /usr/bin/git fixed host fence                             |
+-----------------------------------------------------------+
```

The application transport for a same-tablet host is **direct loopback**, not ADB reverse. The canonical name is:

`LOCAL_TABLET_LOOPBACK`

Self-ADB is a control/evidence plane only.

## Transport status

The bounded remediation #500 is software/provenance complete on canonical PR #413.

Supported LOCAL physical modes are now explicitly distinct:

- `LOCAL_ADB_REVERSE_ONLY` — external operator host;
- `LOCAL_TABLET_LOOPBACK` — host and Aurora app on the same representative tablet.

For tablet-loopback mode, no `adb reverse` mapping for 8080/8081 may exist.

## Current exact tablet-loopback tuple

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
control   SELF_ADB_WIRELESS_DEBUGGING
```

The exact artifact remains `canonical_acceptance=false`, `physical_evidence_required=true`, `dp5_status=INCOMPLETE`.

The previous physical APK and current APK contain the same 23 internal APK ZIP entries byte-for-byte. The APK Signing Block v2 differs because CI generated a different debug signer identity. Therefore the current exact tuple requires a clean uninstall/install before byte-exact installed-APK readback.

## Development model

### Source and review

Termux provides Git and GitHub CLI. Code edits, commits, branches and PR operations can be performed on the tablet.

### Build/package

Android build/package stays reproducible in GitHub Actions. The tablet downloads the exact artifact from GitHub and verifies artifact/APK SHA-256 plus embedded candidate/host/main/transport identity before use.

### Physical control

Wireless Debugging provides an external adbd endpoint. Termux self-ADB can independently execute:

- `pm path` + `adb pull` installed APK readback;
- `am force-stop` and relaunch;
- permission grant/revoke;
- lifecycle/process exercises;
- `dumpsys meminfo`, `cpuinfo`, `battery`, package/service state;
- screenshot/log capture.

The app under test does not control these observations.

### Host

Debian under PRoot runs the exact W15-J host with Node `>=22.16 <23`. A Debian `aurora` user mirrors the Termux application UID/GID so the shared readiness parent remains owned by the operator identity, while `/usr/bin/git` stays root-owned/non-writable as required by the host launcher fence.

## Trusted provider

Tablet-only operation does not relax the provider contract. `trusted-w15j-provider.mjs` remains outside Git and contains integration code only. It must return:

- database URL from a trusted runtime/secret channel;
- existing Receipt/Evidence ingress;
- existing W07 voice intake factory;
- existing containment lifecycle factory;
- existing attempt lifecycle factory;
- already-authenticated W14 principal with `authorizesExecution=false` and `canGrantPermission=false`.

Wake state, assistant role, microphone permission, self-ADB connection or tablet ownership never creates business authority.

## Evidence boundary

`tools/tablet-devlab/tablet-preflight.sh` now fails closed unless all of the following are true:

- exact tablet-loopback APK bytes are installed;
- embedded Android/host/main tuple matches the frozen candidate;
- transport is exactly `LOCAL_TABLET_LOOPBACK`;
- exactly one physical self-ADB device is connected;
- 8080/8081 reverse mappings are absent;
- the same host instance owns both canonical loopback listeners;
- host instance metadata remains non-authoritative.

Its disposition is `TABLET_LOOPBACK_PREFLIGHT_READY_NOT_ACCEPTED`.

This is readiness evidence only and cannot close DP5.

## Final DP5 requirements

Final DP5 still requires:

- exact new APK clean install and installed-byte readback;
- real trusted W03/W07/W14 provider composition;
- complete mandatory physical scenario matrix;
- wake matrix with at least 100 deliberate attempts plus false-wake/noise/distance/voice/TTS/barge-in/audio-route coverage;
- privacy/raw-PCM/resource evidence;
- real governed permitted native effect;
- DENY, stale authority, cancellation, uncertainty and reconciliation negatives;
- operator attestation;
- independent reviewer sidecar;
- integrated physical Risk Gates A-D;
- live Control Tower race check before acceptance.

## Promotion rule

Do not merge #498/#499 into `main` while this active physical tuple is being evaluated because that would move the reconciled main SHA and supersede the tuple. The tooling branch may be used directly on the tablet.

Promotion of DevLab tooling to main is safe only after Control Tower either:

1. completes the active W15-J tuple; or
2. explicitly supersedes it with a new tuple anchored to the new main.

W16 BUILD remains blocked until W15-J/DP5 genuine physical acceptance.
