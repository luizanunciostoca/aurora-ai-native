# W15-J Experience Gate — guided physical smoke (eight checks)

Status: `OPERATOR_RUNBOOK / NO_AUTOMATIC_PASS`  
Authority: [W15-J experience-first decision](../../../../docs/governance/w15/W15_J_EXPERIENCE_FIRST_AND_DEFERRED_DP5_2026-10-28.md)

This is **not** the original full DP5 acceptance runbook. Keep the 48-scenario DP5 harness, wake campaign and dossier machinery intact for W20-H.

## Preflight — stop on identity or transport mismatch

- Verify live `main`, Android PR #413, LOCAL Host PR #462 and DevLab PR #499 exact HEADs; use current SHA-bound Q/TB/S, not an old PR description or historical APK.
- Verify packaging run/artifact identity and APK SHA-256; only install an APK whose identity is independently reconciled with that exact source tuple.
- Verify representative Samsung SM-X820 and bind hashed device identity, operator and UTC times. Never commit serial, session token, private key, bootstrap secret or raw microphone PCM.
- Establish the actual `LOCAL_TABLET_LOOPBACK` host/session topology and identify live host instance. Do **not** copy old `adb reverse 8080/8081` instructions when the selected tuple forbids reverse. No unapproved transport or auth workaround.
- Confirm stable authenticated W14 bootstrap and permission prompt; use explicit supervised consent for a reversible test action.
- Generate an unfilled JSON template with `node tools/acceptance/w15j-experience-gate.mjs --template`. Save and populate it only from witnessed physical observations. All eight scenarios begin `NOT_RUN`.

## Physical checks

1. **EX-01 — Install/start:** install exact APK, launch cold, inspect package/APK hash readback and screen; no crash.
2. **EX-02 — Session:** onboard/authorize correct operator, device, tenant and required OS permissions; confirm current W14 device session, no authority inferred locally.
3. **EX-03 — Voice:** perform 5–10 real deliberate wakes, record each attempt and at least one repeatably recognized command; do not claim wake-quality statistics.
4. **EX-04 — Effect:** with current W02/W07 authorization and explicit operator consent, execute **one benign reversible** W15 native action; witness actual app/hardware state transition, not only speech/ACK.
5. **EX-05 — Receipt/readback:** correlate command/Receipt/Evidence/readback/reconciliation to actual observed effect; unknown outcome stays unknown.
6. **EX-06 — DENY:** send a clearly unauthorized or stale request in the sanctioned test context and confirm no native effect.
7. **EX-07 — Cancel/kill:** exercise both safety controls, verify prevention/containment without unsafe replay.
8. **EX-08 — Recovery:** exercise controlled restart, offline/reconnect and duplicate delivery; check no doubled action, stale-authority replay or blind retry on `EXECUTION_UNCERTAIN`.

## Stop, record, close

- A missing ADB/device connection, inaccessible host/session or mismatched build/host makes relevant cases `BLOCKED`, never `PASS`.
- Any P0/P1 in execution safety, tenant/authority, receipt/reconciliation, secrecy or recovery stops promotion. Other findings remain traceable, not silently ignored.
- Each PASS requires UTC timestamp, human operator, physically observed expected and forbidden signals, and redacted evidence references.
- Record scoped Risk Gates A-D with evidence. A completed smoke is still only `READY_FOR_REVIEW_NOT_ACCEPTED` until Program Control approves.
- Run `node tools/acceptance/w15j-experience-gate.mjs path/to/w15j-experience-evidence.json` for structural validation; it does not certify truth or mark W15-J accepted.
- Clean up test sessions/permissions/mappings/services in accordance with the actual tuple and record final state. Do not alter previously collected DP5 evidence.
- Only after controlled PR integration and post-merge exact-main checks may Program Control update #344 to `aurora:accepted` and then reconcile W16 #116 for BUILD. Full DP5/DP7 remains W20-H-owned.
