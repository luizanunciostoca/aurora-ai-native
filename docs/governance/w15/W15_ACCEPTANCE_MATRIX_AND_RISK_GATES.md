# W15 — Acceptance Matrix and Risk Gates

Status: `CANDIDATE_FREEZE_W15_00`
Candidate base / reconciled main snapshot: `8d2f4498983c04921ad18512fc02e759c244ff3a`

## Universal acceptance lifecycle

Every W15 BUILD node must satisfy all of the following on one exact final candidate HEAD:

1. all hard predecessors are live `aurora:accepted`;
2. branch/PR ownership is canonical and non-duplicated;
3. changed paths stay inside the issue's reconciled ownership fence;
4. deterministic positive, negative and boundary tests are proportional to the behavior changed;
5. no temporary diagnostics, debug bypasses, test-only production branches, secret fixtures or duplicated source of truth remain;
6. Quality, Test Build and Security all succeed on that exact final candidate HEAD;
7. Risk Gates A-D are explicitly reviewed against the candidate, with device-specific additions below;
8. live `main` and merge-base are revalidated immediately before merge;
9. merge uses expected-head protection for the exact accepted candidate;
10. post-merge Quality, Test Build and Security succeed on exact merged `main` before the issue is marked `aurora:accepted` or descendants are released.

CI green is necessary but not sufficient: semantic authority, failure behavior and physical/device claims must also match the node's scope.

## Node Definition of Done

| Node | Required acceptance evidence beyond universal lifecycle |
| --- | --- |
| W15-00 | governance-only diff; dependency/DAG/path/authority freeze; DP4/DP5 criteria; premortem; no Android/runtime code |
| W15-A | buildable Android foundation; environment separation; lifecycle/presence/process-death/restart tests; no action side effects |
| W15-B | consumes W14 DeviceId/DeviceRef/session contracts; Keystore secrets never serialized; rotation/expiry/revoke/reinstall/compromise negative paths |
| W15-C | W04 capability mapping; availability/freshness/compatibility/preconditions separated from execution permission; stale/unsupported capability tests |
| W15-D | integration precedence enforced; package/signature/target validation where platform evidence permits; missing/wrong package and malformed/deceptive deep-link tests; Accessibility not silent fallback |
| W15-E | denied/permanently-denied/revoked/background-restricted states; prompt-context rules; permission drift tests; local consent never authority |
| W15-F | governed W07-compatible DEVICE request only; current target/session/capability/permission checks; bounded action; cancellation/kill; receipt/evidence/readback; ambiguity => `EXECUTION_UNCERTAIN`; reconcile-before-retry behavior |
| W15-G | deterministic fast-path boundary; transcript/intent separated from authority; false wake/ambiguity/privacy/lifecycle/permission negative paths; high-risk escalation |
| W15-H | W03-compatible dedupe/replay; reconnect/process restart/prolonged offline; expired authority/session/cancelled/uncertain work not blindly replayed; duplicate and late-receipt tests |
| W15-I | explicit deployment justification; standard-app correctness independent of privileged profile; provisioning/unprovisioning/recovery tests if implemented; elevated privilege inventory |
| W15-J | physical Android evidence for lifecycle, session, capability, permission, native/app action, offline/reconnect, voice, kill/cancel, uncertainty; measured device performance/battery/resource observations; threat scenarios; DP4/DP5 closeout; downstream W17/W19/W20 handoff |

## Risk Gate A — Correctness and state-machine integrity

PASS requires the node's state transitions and cross-wave contract use to remain deterministic under success, denial, stale state, cancellation, process death and duplicate/reordered delivery where relevant.

Device-specific checks include:

- W14 device/session/revoke state cannot be replaced by cached local assumptions;
- W03 idempotency/replay identifiers survive reconnect/process restart as required without duplicate side effects;
- W07 outcome semantics distinguish success, failure, cancellation and `EXECUTION_UNCERTAIN` correctly;
- permission/capability changes between planning and execution fail closed or re-resolve as defined by the owning contract;
- physical-device claims in W15-J are tied to reproducible build/version/device evidence.

## Risk Gate B — Safety, authority, privacy and privilege

PASS requires strict separation of authority from local/device preconditions and protection against privilege escalation or data leakage.

Mandatory assertions where applicable:

- session auth, device trust, Android permission, app installation, biometric success, Keystore possession and Device Owner status never create or widen Aurora action authority;
- no direct planner/model/voice-to-side-effect path exists outside the governed DEVICE executor boundary;
- secret/key/biometric/session values do not enter logs/evidence/cache/crash fixtures;
- package/deep-link/intent targets are validated against impersonation/confusion risk appropriate to the platform API;
- Accessibility/computer-use is absent unless explicitly governed as high-risk with bounded scope and failure controls;
- microphone/camera/location/file/clipboard/notification/calendar surfaces expose only the minimum data necessary and respect current OS/user restrictions.

## Risk Gate C — Performance, economics and resource bounds

PASS requires evidence appropriate to the node and forbids overstating scope.

- Unit/emulator timing may demonstrate algorithmic bounds but is labelled test-only.
- W15-A through W15-I must avoid unbounded queues, retry loops, wake locks, listeners, foreground work or storage growth.
- W15-H must bound offline queue size/age and reconnect/retry cadence while preserving W03/W07 semantics.
- W15-J must record physical-device observations for startup/session/reconnect and representative native execution latency plus battery/CPU/memory/storage/foreground-service effects appropriate to the target tablet/profile.
- Production SLOs remain W17-owned; W15 evidence cannot be relabelled as global production SLO proof.

## Risk Gate D — Failure, recovery and reversibility

PASS requires fail-closed behavior and a recovery path for device-local and distributed failures.

Scenarios include, as applicable:

- network loss/reconnect, process death/restart, device reboot and clock skew;
- revoked/expired/compromised session or device;
- duplicate command, late receipt, stale capability, revoked permission, missing/replaced app;
- native/app action returning no reliable readback or crashing mid-operation;
- kill switch and cancellation races;
- Keystore invalidation, reinstall/data clear and credential/session recovery;
- optional Device Owner/Launcher provisioning failure and rollback;
- uncertain side effects remain `EXECUTION_UNCERTAIN` until W07-compatible reconciliation resolves them.

## Evidence freshness rule

Acceptance evidence is exact-SHA evidence. Any change to candidate HEAD invalidates prior Q/TB/S and semantic sign-off. Any `main` movement before merge requires a fresh merge-base/race assessment. Post-merge acceptance is not complete until exact merged-main Q/TB/S succeeds.

## Prohibited acceptance shortcuts

- accepting a node from PREBUILD/READINESS artifacts;
- treating emulator/unit evidence as physical-device evidence;
- treating a transport ack/local OS success callback as verified business success without the owning W07 semantics;
- accepting permission/trust/biometric/Keystore state as policy authority;
- broadening W15 scope to shared/root/cross-wave files without explicit Program Control reconciliation;
- marking DP4/DP5 closed from partial descendants or CI alone.