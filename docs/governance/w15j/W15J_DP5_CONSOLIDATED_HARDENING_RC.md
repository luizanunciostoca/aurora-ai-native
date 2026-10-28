# W15-J DP5 consolidated Android hardening RC

Status: SOFTWARE CANDIDATE / DP5 NOT_ACCEPTED.

Exact consolidated commit at document creation: `44d73028042ade3f9e05d24276afa880ad502d4f`.

Parents:
- `cc68249e0a031f5acbdc5f9e58e3db3f8f7a82a5` — Android/voice pre-DP5 hardening plus deterministic post-write transport regression.
- `6998534ab8e88397eb43dcf9f62014c2e8f89fcf` — r9/r10 assistant-role, background restriction, late receipt binding and execution race hardening.

The only overlapping production file requiring semantic reconciliation was `AudioRecordAuroraWakeEngine.kt`. The consolidated version preserves the #554 process-local wake suppression and exactly-once audio ownership behavior while restoring the r10 physical wake evaluation latency telemetry.

This document does not mark any physical DP5 scenario PASS, grant execution authority, grant retry authority, or accept W15-J. A replacement physical APK may only be generated after exact-head Android Foundation, Quality, Test Build and Security all pass. The physical matrix and dossier must then be rerun against the exact replacement artifact tuple.
