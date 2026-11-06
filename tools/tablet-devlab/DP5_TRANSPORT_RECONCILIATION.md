# DP5 v0.17 Transport Reconciliation

Status: **CANONICAL FOR THE CURRENT v0.17 PHYSICAL ACCEPTANCE WINDOW — NOT ACCEPTANCE**.

The frozen Android candidate contains older dual-port documentation that describes `LOCAL_ADB_REVERSE_ONLY`. That text predates the packaging/runtime reconciliation used by the exact v0.17 physical artifact and must not be used to configure this acceptance window.

For the current exact tuple, the authoritative runtime transport is:

```text
gatewayTransport=LOCAL_TABLET_LOOPBACK
adbReversePort=null
controlPlane=SELF_ADB_WIRELESS_DEBUGGING
```

The stable-signed APK, embedded artifact identity, tablet preflight, tablet-loopback collector overlay and DevLab dossier automation all bind this current transport. Ports 8080 and 8081 are opened directly on the same tablet loopback by the governed LOCAL host.

## Required invariant

Before preflight, during the scenario matrix and at finalize:

- no `adb reverse` mapping may exist for 8080 or 8081;
- both listeners must resolve to the same per-start `hostInstanceId`;
- 8080 remains the authenticated W14 device plane;
- 8081 remains the one-shot bootstrap exchange;
- both listeners remain loopback-only;
- transport capability never grants W07 authority or physical acceptance.

## Why the frozen Android branch is not edited

The APK under physical acceptance is byte-bound to Android SHA `40246031b2e1b1ef8e232db4d4d2ea6687f8ecf7`. Editing documentation on that branch would move the Android candidate SHA without rebuilding/repackaging the APK, breaking candidate-to-artifact provenance. Therefore this DevLab reconciliation record supersedes the obsolete transport instructions only for this frozen v0.17 acceptance tuple.

Any future Android candidate must update its own physical-acceptance documentation and packaging identity so there is no inherited transport ambiguity.

## Fail-closed rule

If any collector, overlay, artifact identity, runtime configuration or reviewer evidence reports `LOCAL_ADB_REVERSE_ONLY`, a reverse mapping on 8080/8081, or any transport scope other than `LOCAL_TABLET_LOOPBACK`, stop the window and reconcile the tuple. Do not relabel the mismatch as PASS.

This record does not authorize execution, prove execution success, authorize retry, declare DP5 acceptance or unblock W16.
