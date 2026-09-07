# W15-J Tablet-Only DevLab — governed physical development model

Status: `TOOLING_PRE_ACCEPTANCE`

Issue: #498

## Objective

Allow Aurora physical development, diagnosis and eventual DP5 execution to be operated from the representative Android tablet itself, without a PC, while retaining an external control plane and independent evidence review.

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
|  127.0.0.1:8080  <----------> self-ADB control            |
|  127.0.0.1:8081               Git / GitHub CLI            |
|       |                        evidence workspace          |
|       v                                                   |
|  Debian/PRoot                                             |
|  exact Node 22 W15-J LOCAL host                           |
|  /usr/bin/git fixed host fence                            |
+-----------------------------------------------------------+
```

The application transport for a same-tablet host is **direct loopback**, not ADB reverse. The canonical name is:

`LOCAL_TABLET_LOOPBACK`

Self-ADB is a control/evidence plane only.

## Why ADB reverse is not used

The accepted W15-J host owns `127.0.0.1:8080` and `127.0.0.1:8081`. On the same physical Android network namespace, an `adb reverse` listener on the same device ports would compete with those host listeners. Treating direct loopback as `LOCAL_ADB_REVERSE_ONLY` would therefore be false evidence.

The current exact artifact still embeds `LOCAL_ADB_REVERSE_ONLY`; tablet-only preflight must report `PRE_ACCEPTANCE_ONLY_TRANSPORT_CONTRACT_RECONCILIATION_REQUIRED` until the W15-J build identity/collector/trusted lint are explicitly extended to `LOCAL_TABLET_LOOPBACK`.

## Development model

### Source and review

Termux provides Git and GitHub CLI. All code edits, commits, branches and PR operations can be performed on the tablet.

### Build/package

Android build/package stays reproducible in GitHub Actions. The tablet downloads the resulting exact artifact from GitHub and verifies artifact/APK SHA-256 before installation/readback. This avoids depending on whether a particular Android tablet can execute every official Linux Android SDK build-tool binary natively on ARM64.

### Physical control

Wireless Debugging provides an external adbd endpoint. Termux `adb` connects back to the same tablet and can independently execute:

- `pm path` + `adb pull` installed APK readback;
- `am force-stop` and relaunch;
- permission grant/revoke;
- screen/background/reboot lifecycle operations;
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

The tooling in `tools/tablet-devlab` can independently prove tablet/device/APK/host facts. Until the W15-J canonical transport schema is reconciled, it is development/pre-acceptance evidence only.

Final DP5 still requires:

- canonical artifact/build identity matching the actual transport;
- complete mandatory scenario matrix;
- wake matrix and resource/privacy/threat evidence;
- operator attestation;
- independent reviewer sidecar;
- integrated physical Risk Gates A-D;
- live Control Tower race check before acceptance.

## Promotion rule

Do not merge #498 into `main` while an active W15-J physical tuple is being evaluated if doing so would alter the reconciled main SHA required by that tuple. The tooling branch may be used directly on the tablet before merge. Promote only after Control Tower either:

1. completes the active W15-J tuple; or
2. explicitly supersedes it with a new tablet-loopback tuple.

## Next canonical change

After the DevLab tooling is software-green, W15-J must receive a bounded acceptance-contract remediation to add `LOCAL_TABLET_LOOPBACK` as an explicit allowed LOCAL physical transport while retaining `LOCAL_ADB_REVERSE_ONLY` for external-host operation. That remediation must update build identity, collector/preflight/finalize/trusted lint and threat evidence without modifying W02/W03/W07/W14 ownership.
