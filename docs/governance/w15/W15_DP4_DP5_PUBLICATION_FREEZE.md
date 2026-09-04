# W15 — DP4 / DP5 Publication Freeze

Status: `CANDIDATE_FREEZE_W15_00`
Candidate base / reconciled main snapshot: `8d2f4498983c04921ad18512fc02e759c244ff3a`

## Barrier chain

The Device Plane barrier chain consumed by W15 is:

- `DP1` — W04 target-neutral capability contracts accepted.
- `DP2` — W07 DEVICE-compatible target/executor semantics accepted.
- `DP3` — W14 gateway/device registration/session/trust/replay/receipt-ingress integration accepted. DP3 opened with W14-H issue `#265`, PR `#384`, merge `8d2f4498983c04921ad18512fc02e759c244ff3a`.
- `DP4` — W15 Android capability/executor core publication gate, defined below.
- `DP5` — W15 integrated physical Android device-plane acceptance gate, defined below.

DP4 and DP5 are publication barriers, not synonyms for “code exists” or “CI is green”. Both require governed acceptance evidence and preserve W02/W03/W04/W07/W14 authority.

## DP4 — Android capability/executor core publication

### Owner

Program Control publishes DP4 only after canonical acceptance of the required W15 nodes. W15-F supplies the terminal executor evidence for this barrier.

### Required accepted nodes

DP4 may open only when all of these are `aurora:accepted`:

- W15-A — Android application/lifecycle foundation;
- W15-B — W14-compatible secure device/session/Keystore boundary;
- W15-C — native capability bridge;
- W15-E — permission/consent precondition broker;
- W15-F — concrete W07-compatible DEVICE executor.

W15-D/G/H/I/J are not prerequisites for DP4 because they extend installed-app, voice, offline, privileged-profile and physical-integration coverage beyond the minimum Android capability/executor core. Their absence does not permit claims about those features.

### Required DP4 evidence

1. exact accepted SHAs and post-merge Q/TB/S for W15-A/B/C/E/F;
2. one canonical Android application/runtime surface rather than competing device clients;
3. W14 DeviceId/DeviceRef/session contracts consumed without a second device identity namespace;
4. W04 capability identifiers/bindings consumed without a second business capability registry;
5. Android capability availability and permission state represented as local preconditions, never authority;
6. W15-F accepts only governed W07-compatible DEVICE execution input and cannot execute direct planner/model/voice transport commands;
7. native/app ambiguity returns `EXECUTION_UNCERTAIN` and preserves W07 reconcile-before-retry authority;
8. cancellation/kill/revocation/current-session/current-authority checks exercised where applicable;
9. secret/Keystore/session material absent from logs/evidence/cache/test fixtures;
10. Risk Gates A-D PASS for the DP4 aggregate boundary.

### DP4 publication statement

When the criteria pass, Program Control may state:

`DP4 OPEN — Android capability/precondition/DEVICE-executor core is accepted for downstream W15 integration.`

DP4 does **not** claim installed-app coverage, voice fast path, offline orchestration, Device Owner/Launcher support, physical-device performance, production SLO, device-security hardening or release readiness.

## DP5 — Integrated physical Android device plane

### Owner

W15-J is the terminal W15 node and the only node that can provide the physical-integration evidence required to close DP5. Program Control publishes DP5 only after W15-J acceptance and aggregate review.

### Required accepted nodes

DP5 requires every canonical W15 runtime node to be resolved under the frozen DAG:

- W15-A, W15-B, W15-C, W15-D, W15-E, W15-F, W15-G, W15-H, W15-I, W15-J.

For W15-I, “resolved” may be an accepted, evidence-backed decision that the optional Device Owner/Launcher profile is not justified for the current deployment; DP5 must not force privileged mode merely to satisfy a checklist. If W15-I implements the profile, its provisioning/recovery/security evidence becomes mandatory.

### Required DP5 evidence

1. DP4 is already open and remains valid against current main;
2. exact accepted SHAs/post-merge Q/TB/S for all W15 nodes;
3. physical Android execution evidence for lifecycle/process restart, registration/session rotation/revocation, capability discovery/staleness, permission denial/revocation, governed native/app execution, cancellation/kill and receipt/evidence handling;
4. physical reconnect/offline/process-restart tests demonstrate W03-compatible dedupe and no blind replay of expired-authority, cancelled or `EXECUTION_UNCERTAIN` work;
5. installed-app tests cover missing/wrong/replaced package and governed intent/deep-link validation where implemented;
6. voice tests cover false wake, ambiguous transcript, lifecycle/privacy restrictions and escalation without authority bypass;
7. package impersonation/confusion, secret leakage, privilege escalation, stale trust, late/forged evidence and UI-automation fallback threats are explicitly reviewed;
8. measured battery/CPU/memory/storage/foreground-service/startup/reconnect observations are recorded on representative physical target hardware/builds and are labelled as W15 device observations rather than production SLOs;
9. rollback/recovery exists for session compromise, Keystore invalidation/reinstall, app integration failure and any optional privileged deployment profile;
10. Risk Gates A-D PASS for the integrated physical boundary;
11. unresolved production telemetry requirements are handed to W17, device threat-hardening items to W19, and final release/rollout acceptance to W20.

### DP5 publication statement

When the criteria pass, Program Control may state:

`DP5 OPEN — W15 integrated physical Android device plane is accepted for downstream telemetry, hardening and release gates.`

DP5 is **not** Release 1.0 and does not supersede W17/W19/W20.

## Freeze and invalidation rules

- A descendant cannot self-publish DP4/DP5 merely by merging.
- Any authority-boundary regression discovered after publication invalidates the affected barrier until remediated and reaccepted.
- A later W04/W07/W14 contract change that is semantically incompatible with the accepted W15 integration requires explicit compatibility reconciliation before relying on the prior DP4/DP5 evidence.
- CI reruns on a different SHA cannot substitute for the exact accepted candidate/post-merge evidence chain.