# W15 — Device Plane Risk Register and Premortem

Status: `CANDIDATE_FREEZE_W15_00`
Candidate base / reconciled main snapshot: `8d2f4498983c04921ad18512fc02e759c244ff3a`

## Premortem

Assume W15 failed in production despite passing ordinary happy-path tests. The most credible causes are duplicate native side effects after reconnect/process restart; stale or forged device/session trust being treated as authority; Android permission drift between planning and execution; secret/Keystore misuse; package/deep-link impersonation; unsafe Accessibility/UI-automation fallback; privacy leakage through microphone/location/files/clipboard/notifications/calendar; Android lifecycle/API-level behavior diverging from tests; blind replay of stale/uncertain work; or unbounded foreground/battery/resource consumption.

W15 acceptance must therefore prove negative/failure behavior rather than infer safety from successful native calls.

## Risk register

| ID | Failure mode | Primary owner | Required prevention/detection | Acceptance trigger |
| --- | --- | --- | --- | --- |
| W15-R01 | duplicate side effect after reconnect/process restart | W15-H + W03/W07 semantics | durable idempotency identity; dedupe across restart; uncertain outcome not blindly replayed | duplicate/restart/late-receipt tests |
| W15-R02 | stale/revoked/forged device trust accepted | W15-B + W14 | consume current W14 session/trust/revoke state; fail closed on stale/ambiguous target/session | expiry/revoke/compromise/wrong-device tests |
| W15-R03 | Android permission changes after capability planning | W15-E/F | permission is local precondition; revalidate at execution; explicit denied/permanent/background states | permission drift/revoke tests |
| W15-R04 | biometric/Keystore possession becomes authority | W15-B/F | local unlock only permits key use; no PolicyToken/OwnerDecision synthesis | secret/authority boundary review + negative tests |
| W15-R05 | raw secret/key/session material leaks | W15-B | non-serializable secret boundary; redacted errors/logs/evidence; no secret fixtures | static/security/log/evidence audit |
| W15-R06 | wrong/replaced package or deceptive deep link receives action/data | W15-D | package/intent/deep-link validation appropriate to API; explicit missing/wrong target handling | missing/replaced/wrong-package/deep-link tests |
| W15-R07 | Accessibility/computer-use silently becomes default integration | W15-D/F | precedence policy; high-risk explicit governance; bounded action and readback | source/scope audit + negative fallback tests |
| W15-R08 | voice false wake/ambiguous transcript causes action | W15-G | speech/intent separated from authority; deterministic low-risk fast path only; ambiguity escalation | false-wake/ambiguous/high-risk tests |
| W15-R09 | stale capability/app availability used | W15-C/D/F | freshness metadata; revalidation at action boundary; unsupported/missing fails closed | stale/missing/compatibility tests |
| W15-R10 | offline queue replays expired authority/cancelled work | W15-H + W02/W03/W07 | bounded deferral; current-state revalidation; cancelled/expired/uncertain entries quarantined/reconciled | prolonged-offline/expiry/cancel tests |
| W15-R11 | clock skew corrupts expiry/retry/order assumptions | W15-H | rely on owning contract timestamps/order rules; monotonic local durations where possible; fail closed on ambiguous expiry | skew/boundary tests |
| W15-R12 | kill/cancel races with native action | W15-F/H | bounded state machine; pre-action current checks; outcome classified correctly if race occurs | cancellation/kill race tests |
| W15-R13 | privacy boundary leaks microphone/location/file/clipboard/notification/calendar data | W15-C/E/F/G | least-data capability adapters; explicit OS/user preconditions; no ambient evidence payloads | permission-denial/data-minimization review |
| W15-R14 | Android lifecycle/process death loses or duplicates execution state | W15-A/H | explicit lifecycle state; restart-safe correlation/dedupe; no in-memory-only authority | process-death/reboot/reconnect tests |
| W15-R15 | foreground service/wake/resource loop drains device | W15-A/G/H/J | bounded listeners/retries/work; lifecycle-aware foreground use; physical observations | unit bounds + W15-J battery/CPU/memory evidence |
| W15-R16 | API-level/OEM behavior invalidates permission/service assumptions | W15-A/C/E/J | supported SDK/API matrix; compatibility checks; physical representative validation | build/API/physical-device matrix evidence |
| W15-R17 | Device Owner/Launcher privilege bypasses policy or cannot recover | W15-I | optional isolated profile; explicit justification; provisioning/unprovisioning/rollback | deployment decision + recovery tests if implemented |
| W15-R18 | local callback/transport ack promoted to verified success | W15-F + W07 | receipt/evidence/readback semantics; ambiguity => `EXECUTION_UNCERTAIN`; reconciliation before retry | no-readback/late/ambiguous outcome tests |
| W15-R19 | W15 forks DeviceId/capability/executor taxonomies | W15-00 Program Control | ownership/namespace freeze; duplicate/source-of-truth audit per PR | changed-path + symbol/source-of-truth review |
| W15-R20 | test/emulator timing misreported as physical/production SLO | W15-J + W17 | evidence labels; physical measurements only at W15-J; production SLO remains W17 | DP5 publication audit |

## Mandatory negative scenarios by boundary

### Identity/session/secret boundary

- expired session;
- revoked device/session;
- wrong tenant/device binding;
- reinstall/data clear and Keystore invalidation;
- compromised-key/session recovery;
- attempted logging/serialization of secret-bearing state.

### Capability/permission/app boundary

- capability absent or stale;
- permission denied, permanently denied, revoked or background-restricted;
- app missing, replaced or wrong package;
- malformed/deceptive intent/deep link;
- unsupported Android/API behavior;
- attempted ungoverned Accessibility/UI-automation fallback.

### Execution/replay boundary

- duplicate command;
- process death mid-flight;
- reconnect with inflight work;
- late receipt/evidence;
- cancellation/kill race;
- no reliable readback/ambiguous native outcome;
- prolonged offline with expired authority/session;
- clock skew/order ambiguity;
- `EXECUTION_UNCERTAIN` replay attempt.

### Voice/privacy/resource boundary

- false wake;
- ambiguous transcript/intent;
- high-risk voice request requiring escalation;
- microphone/location/file/clipboard/notification/calendar permission denial;
- lifecycle/background restriction;
- resource/battery pressure on representative physical hardware at W15-J.

## Risk ownership and deferral

W15 must remediate risks required for correctness/safety of its own implementation. W15-J may hand off deeper device threat-hardening controls to W19 only when the W15 implementation already fails safely without them. Production telemetry/SLO tuning may be handed to W17 only after W15 provides sufficient instrumentation/evidence hooks without claiming the downstream SLO. Final rollout/release risks remain W20-owned.

A risk may not be deferred merely because remediation is inconvenient. Any risk that can cause unauthorized native side effects, secret exposure, silent duplicate execution or unrecoverable device privilege state blocks W15 acceptance until a safe boundary is demonstrated.