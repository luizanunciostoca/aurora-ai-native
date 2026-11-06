# W15-J Experience-First Gate and Deferred DP5 Certification

Status: `OWNER_DIRECTIVE / PENDING_CANONICAL_MERGE_AND_PHYSICAL_PROOF`  
Decision date: 2026-10-28  
Decision authority: repository owner / Program Control, explicit instruction to execute the four-step experience-first plan  
Baseline at authoring: `main@77f0f8532197025ee913dd02fcb56878d9d667a9`  
Affected nodes: W15-J (#344), W16-00 (#116), W20-H (final physical release gate)

## Decision and non-negotiable boundary

W15-J is re-scoped to an **8-scenario physical Experience Gate** that proves the first supervised, local, limited user experience on representative Android hardware. The full DP5 dossier is **deferred to W20-H**, where it is combined with the already planned DP7 physical release validation. No evidence is deleted or reclassified.

The stages have distinct meanings:

| State | Authoritative meaning | Allowed progression |
| --- | --- | --- |
| `EXPERIENCE_NOT_RUN` / `EXPERIENCE_BLOCKED` | No valid current-tuple physical smoke proof | W16 PREBUILD/readiness only |
| `EXPERIENCE_READY` | 8/8 physically observed, all bounded safety checks passed; evidence independently reviewed by Program Control | Eligible for exact-head W15-J integration/acceptance review, **not** automatic W16 BUILD |
| W15-J `aurora:accepted` | Re-scoped W15-J integration accepted on main after Q/TB/S and post-merge checks | W16-00 may enter governed BUILD after live dependency reconciliation |
| `DP5_CERTIFICATION_PENDING` | Comprehensive hardware/device-plane certification still open | Development and supervised internal pilot only; no production/release assertion |
| `DP5_CERTIFIED` + `DP7_CERTIFIED` | W20-H complete full matrix and physical release E2E; exact current release candidate reviewed | Can enter W20-J release decision, subject to all other gates |

The `aurora:accepted` label on W15-J is **not** a DP5 publication statement after this change. CI, smoke evidence or an issue label alone cannot mint W02/W07 authority, verified outcome or retry permission. The canonical Puzzle DAG still requires W15-J acceptance for W16; it must not be bypassed by a label-only or PREBUILD shortcut.

## W15-J physical smoke: exactly eight mandatory scenarios

Every scenario starts `NOT_RUN`. `PASS` requires real representative-tablet observation linked to redacted, time-bound evidence; simulated, emulator-only or historical evidence is not physical PASS.

| ID | Physical check and minimum observable proof |
| --- | --- |
| EX-01 | Freeze main/Android/Host/DevLab/packaging/APK/build identity; independently match APK SHA and real Samsung SM-X820 install/readback; cold launch without crash. |
| EX-02 | User onboarding, required OS permissions, W14 bootstrap/authenticated current device session and correct tenant/device binding; no permission or session treated as business authority. |
| EX-03 | Five to ten deliberate wake/voice activations; record each attempt and at least one repeatable understood user command; do not infer statistical wake quality or full false-wake coverage. |
| EX-04 | One explicitly authorized, benign and reversible W02 → W07 → W15 native-device command; observe the actual hardware/app effect, not merely a voice transcript or transport ACK. |
| EX-05 | Correlate native effect with Receipt/Evidence and readback/reconciliation; never display ACK as verified external success. |
| EX-06 | Denied/unauthorized request (including stale or revoked trust as applicable) produces no native side effect and no authority escalation. |
| EX-07 | Cancel and kill switch stop or contain bounded execution; no unsafe post-cancel effect or automatic repeat. |
| EX-08 | Controlled restart and network loss/reconnect/duplicate delivery leave explicit safe state; no blind replay, duplicate effect or retry from `EXECUTION_UNCERTAIN`. |

**Pass criteria:** EX-01..EX-08 all `PASS` on the same exact candidate tuple; no open P0/P1 in authority, tenant isolation, native effect, secrets, cancellation, uncertainty or recovery; W15-J final Android/Host/DevLab source and package provenance consistent; Quality/Test Build/Security on exact final integrated heads; scoped Risk Gates A-D explicitly reviewed; Program Control approval and auditable post-merge main verification before `aurora:accepted`.

**Hard stop:** no ADB/physical observability; mismatched hashes/heads or host instance; missing session/current authority; absent native effect/readback; unsafe DENY/cancel/kill/replay; any P0/P1. Record `BLOCKED` or `FAIL`, never substitute environment checks for physical PASS.

**Permissible deferrals:** larger 48-scenario matrix, >=100 deliberate wakes and negative/noise campaign, exhaustive seven-role semantic binding, full resource/battery/performance distributions, threat matrix, full lifecycle/permission/privilege variants, final sealing/attestation and independent certification. They remain mandatory at W20-H and must not be silently waived.

## Evidence contract (distinct from full DP5)

Use a separate `w15j-experience-evidence.json` record, initialized with 8 `NOT_RUN` statuses. Record:
- UTC and device/host/transport identity, without raw device serial, tokens or secrets;
- exact main, Android, Host, DevLab, APK hash/signing identity and packaging source/run/artifact;
- for every EX check: `status`, `observedAtUtc`, redacted evidence references, human operator, notes and observed/forbidden signal;
- safety/Risk Gate A-D *scoped* review, known defects, teardown and final decision;
- explicit `dp5_certified=false`, `release_authorized=false`, `authorizes_execution=false`, `retry_authorized=false` fields.

Do not feed this reduced record into the 48-scenario DP5 validator, fake missing fields or change the canonical full-DP5 validator to accept eight scenarios. Full DP5 artifacts begin fresh against the final exact release tuple.

## Dependencies, rollout and regression

1. The W15-J issue, W16 issue, task mirrors, publication freeze and program status must agree on this owner decision before the reduced gate becomes authoritative.
2. W15-J existing canonical Android/Host/DevLab candidates retain their owners. Reconcile source HEADs, base/main and the APK/host tuple; a historical r7/r9/r11 package is diagnostic only if not current-source bound.
3. Only after 8/8 physically witnessed smoke, gate review, controlled integration, exact main post-merge checks and W15-J `aurora:accepted` may W16-00 graduate from PREBUILD to BUILD. No automatic merge, no false `DP5 OPEN`.
4. Keep W16 UI non-authoritative, using accepted W14/W15 request/read/evidence contracts. Internal limited pilot can show the first experience, but must not perform unvalidated production, irreversible or sensitive external actions.
5. Re-run impacted EX checks after material Android/Host/permission/voice/receipt changes during W16-W19. A final release-candidate change requires a fresh full DP5/DP7 campaign.
6. W20-H owns full physical DP5 plus DP7. It must complete all original 48 mandatory scenarios, >=100 deliberate wakes plus false-wake/noise/privacy/resource/threat observation, seven-role binding, cleanup/seal, operator attestation, independent review and Risk Gates A-D before W20-J may decide Release 1.0.
7. Unresolved defects remain tracked; W20-J remains blocked if DP5/DP7 or any other release gate fails.

This is an **explicit change of stage acceptance scope**, not a retroactive assertion that the device plane was fully certified. Original DP5 requirements and evidence machinery remain preserved for W20-H.
