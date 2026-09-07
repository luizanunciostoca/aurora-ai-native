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
6. **Interactive physical-effect consent record** — short-lived exact-tuple human permission boundary; not execution authority.
7. **Independent reviewer** — identity distinct from operator; final manifest-bound review remains mandatory.

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

The application transport for a same-tablet host is **direct loopback**, not ADB reverse. The canonical name is `LOCAL_TABLET_LOOPBACK`. Self-ADB is a control/evidence plane only.

## Transport status

The bounded remediation #500 is software/provenance complete on canonical PR #413.

Supported LOCAL physical modes are explicitly distinct:

- `LOCAL_ADB_REVERSE_ONLY` — external operator host;
- `LOCAL_TABLET_LOOPBACK` — host and Aurora app on the same representative tablet.

For tablet-loopback mode, no `adb reverse` mapping for 8080/8081 may exist.

## Current exact tablet-loopback tuple

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
control   SELF_ADB_WIRELESS_DEBUGGING
```

The exact artifact remains `canonical_acceptance=false`, `physical_evidence_required=true`, `dp5_status=INCOMPLETE`.

If the representative tablet already contains a different Aurora debug signing identity, exact installed-byte verification may require an explicitly authorized clean uninstall/install. The installer reads back and hashes the installed APK before any mutation and refuses replacement unless `AURORA_ALLOW_CLEAN_INSTALL=YES` is supplied.

## Development model

### Source and review

Termux provides Git and GitHub CLI. Code edits, commits, branches and PR operations can be performed on the tablet.

### Build/package

Android build/package stays reproducible in GitHub Actions. The tablet downloads the exact artifact from GitHub and verifies artifact/APK SHA-256 plus embedded candidate/host/main/transport identity before use.

### Physical control

Wireless Debugging provides an external adbd endpoint. Termux self-ADB can independently execute installed APK readback, lifecycle/process exercises, permission grant/revoke, resource observations and screenshot/log capture. The app under test does not control these observations.

### Host

Debian under PRoot runs the exact W15-J host with Node `>=22.16 <23`. A Debian `aurora` user mirrors the Termux application UID/GID so the shared readiness parent remains owned by the operator identity, while `/usr/bin/git` stays root-owned/non-writable as required by the host launcher fence.

### Durable state

`setup-postgres.sh` prepares LOCAL PostgreSQL and applies the current W03 migrations for baseline idempotency, execution attempt quota and containment state. Database state remains local, mode `0600`, outside Git and non-authoritative.

## Trusted provider and physical-effect consent

Tablet-only operation does not relax the provider contract. `trusted-w15j-provider.mjs` remains outside Git and contains integration code only. It composes existing W03/W07/W14 owners and an already-authenticated W14 principal. Wake state, assistant role, microphone permission, self-ADB connection or tablet ownership never creates business authority.

The positive physical-effect scenario has a separate human consent boundary:

1. `authorize-dp5-effect.sh` requires an interactive Termux TTY and exact one-time challenge response;
2. it binds consent to the exact main/Android/host tuple and scope `ONE_BOUNDED_MEDIA_VOLUME_STEP_UP`;
3. the consent expires after 10 minutes and is mode `0600` outside Git;
4. it explicitly declares `authorizesExecution=false`, `retryAuthorized=false`, and `physicalAcceptance=false`;
5. `prepare-dp5-provider.sh` additionally requires `AURORA_DP5_EFFECT_APPROVED=YES`, validates the fresh exact-tuple consent and consumes it into a timestamped local record;
6. the consent approval reference is carried into the existing host material but cannot replace W02/W07 authority.

This prevents unattended CI/automation from opening the normal physical-effect consent path. The operator consent is necessary for the test window but remains insufficient for execution: current W02/W07 must still authorize the action.

`provider-doctor.sh` validates secure external files, exact host identity, W03 database access, owner-backed provider shape and non-authoritative Receipt/Evidence ingress. Its PASS disposition is `PASS_SOFTWARE_ONLY`.

## Evidence boundary

`tools/tablet-devlab/tablet-preflight.sh` fails closed unless all of the following are true:

- exact tablet-loopback APK bytes are installed;
- embedded Android/host/main tuple matches the frozen candidate;
- transport is exactly `LOCAL_TABLET_LOOPBACK`;
- exactly one physical self-ADB device is connected;
- 8080/8081 reverse mappings are absent;
- the same host instance owns both canonical loopback listeners;
- host instance metadata remains non-authoritative.

Its disposition is `TABLET_LOOPBACK_PREFLIGHT_READY_NOT_ACCEPTED`. This is readiness evidence only and cannot close DP5.

## Final DP5 requirements

Final DP5 still requires:

- exact current APK install and installed-byte readback;
- local PostgreSQL with W03 migrations;
- current W02/W07 authority and W14 session/transport truth;
- interactive exact-tuple operator consent for the one bounded positive-effect window;
- provider doctor PASS on the exact host candidate;
- authenticated current W04/W15-G projection;
- wake/STT -> W07 -> one bounded permitted native effect -> Receipt/Evidence;
- DENY, stale authority, duplicate, kill, cancellation, uncertainty, late receipt and reconciliation negatives;
- complete mandatory physical scenario matrix;
- wake matrix with at least 100 deliberate attempts plus false-wake/noise/distance/voice/TTS/barge-in/audio-route coverage;
- privacy/raw-PCM/resource/threat evidence;
- cleanup and immutable final manifest;
- operator attestation;
- independent reviewer sidecar;
- integrated physical Risk Gates A-D;
- live Control Tower race check before acceptance.

## Promotion rule

Do not merge #499 into `main` while this active physical tuple is being evaluated because that would move the reconciled main SHA and supersede the tuple. The tooling branch may be used directly on the tablet.

Promotion of DevLab tooling to main is safe only after Control Tower either completes the active W15-J tuple or explicitly supersedes it with a new tuple anchored to the new main.

W16 BUILD remains blocked until W15-J/DP5 genuine physical acceptance.
