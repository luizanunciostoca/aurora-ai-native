# Aurora AI-Native — Current Program Status & Document Authority

Status: `ACTIVE_CANONICAL_FOR_PROGRAM_COORDINATION`  
Audit date: 2026-08-31  
Current implementation main at W02-E acceptance: `17e452356abd6e43f959a2cbb0bcf47de35abbfd`  
Risk-framework acceptance main: `5490f8e7961fa258042b462d4699d698c2b23e9a`

## Authority order

1. GitHub `main` is implementation/code authority.
2. Accepted PR/exact-SHA evidence governs implementation acceptance.
3. Google Drive `AURORA_AI_NATIVE_DEVELOPMENT_GOVERNANCE` is the live operational governance/evidence registry.
4. Current planning authority is Developer Manual v0.4.2 Risk Validation + ADR-001 + ADR-002 until a later accepted manual/amendment supersedes it.
5. Risk & Architecture Validation Framework v1.0 is active canonical cross-wave governance for W03+ acceptance.
6. Accepted wave charters/ownership/dependency matrices govern their allocated scope.
7. Historical migration, predecessor manual and superseded wave documents are provenance only.

A historical file cannot override a later accepted PR, ADR, publication barrier or registry record.

## Current wave state

- W00: `COMPLETE_ACCEPTED`.
- W01: `COMPLETE_ACCEPTED`; ownership locks closed.
- W02: `IN_PROGRESS_COORDINATED`.
- W02-00: `COMPLETE_ACCEPTED`.
- W02-A/B/C: `COMPLETE_ACCEPTED_MERGED`.
- PB1: `COMPLETE_RELEASED`; technical acceptance main remains `b48953cd4a7913e154fe2804248217ffe0c0952d`.
- W02-D: `COMPLETE_ACCEPTED_MERGED`; accepted implementation HEAD `e9ca04a4b5ffe66619f092bd37614c68b7aa2600`, acceptance PR #46; D merge main `9bbcc26481d40885b443928ac21b38438e72ff78`.
- PB2: `COMPLETE_RELEASED`; accepted publication HEAD `2dd9d77e1062ae03d95268bd2de99b28376878fc`, PR #47; publication main `8894021ae00b257b940fe3ac8bd7c73f5da36c28`.
- W02-E: `COMPLETE_ACCEPTED_MERGED`; accepted/merged exact SHA `17e452356abd6e43f959a2cbb0bcf47de35abbfd`, PR #50.
- PB3: `ELIGIBLE_NOT_EXECUTED`.
- W02-F: `DEPENDENCY_GATED_PB3 / NOT_STARTED`.
- PB4: `PENDING`.
- W02-G: `DEPENDENCY_GATED_PB4`.
- PB5 / W02 final acceptance: `PENDING`.
- W03-W20: `PLANNED_DEPENDENCY_GATED` unless later accepted governance explicitly releases them.

## W02-D / PB2 / W02-E accepted chain

W02-D deterministic policy runtime is accepted/merged. Its public policy surfaces were subsequently published by coordinator-owned PB2. W02-E then implemented the canonical fail-closed `PolicyToken` / `OwnerDecision` authority-validation boundary without creating a second Policy Engine or any execution/provider semantics.

W02-E exact-head evidence:

- Quality `33435840491`: SUCCESS.
- Test Build `33435840492`: SUCCESS, including executable W02-E authority-validation matrix, build and cleanup.
- Security `33435841084`: SUCCESS.
- 23-scenario authority/attack matrix: PASS.
- cleanup: PASS; canonical broken relative refs = 0.

Accepted invariants include least authority, no scope widening, stale/current-policy precedence, cross-tenant rejection, explicit `SubjectRef` ↔ `AuthoritySubjectReference` bridging, deterministic replay and confidence-not-authority.

Historical draft PR #41 remains superseded W02-D evidence. The W02-E connector draft-transition defect is also historical tooling evidence: the accepted tested W02-E HEAD was a direct descendant of live main and `main` was advanced non-force to that exact HEAD, after which GitHub recorded PR #50 merged with the same SHA. No untested merge tree was introduced.

PB3 has **not** been executed. W02-E acceptance does not itself publish E shared package surfaces and does not authorize W02-F to start.

## W02 ownership state

- W02-A/B/C/D/E leaf locks are closed/released after acceptance.
- The temporary W02-E acceptance transfer for `packages/policy/test/w02e-authority-validation.test.ts` and `packages/schemas/tsconfig.build.json` is closed and reverted to coordinator/shared-integration ownership.
- Shared barrels, package manifests/export maps, root workspace files, `package-lock.json`, CI and CODEOWNERS remain coordinator-controlled.
- PB3 publication remains coordinator-owned.
- W02-F ownership remains gated by PB3.
- W02-G ownership remains gated by PB4.

## Risk & architecture validation governance

Risk & Architecture Validation Framework v1.0 is `ACTIVE_CANONICAL_CROSS_WAVE_GOVERNANCE` for W03+ and retrospective baseline analysis against W02. It does not reopen W00/W01 and does not move W18 adaptive-evaluation runtime ownership earlier.

Acceptance evidence:

- PR #48: merged.
- exact accepted HEAD: `10dde7dbbe404cb4c127a28cac603307fea64fbf`.
- merge main: `5490f8e7961fa258042b462d4699d698c2b23e9a`.
- Quality run `33431280921`: SUCCESS.
- Test Build run `33431280901`: SUCCESS.
- Security run `33431281893`: SUCCESS.
- Drive framework, audit, acceptance record and Developer Manual v0.4.2 mirror: completed.

Future applicable wave acceptance records must separately assess correctness, safety/authority, performance/economics and failure/recoverability. The framework does not itself release W03 runtime work.

## Initial cross-wave risk baseline

Highest-priority architecture risks recorded on 2026-08-31:

- `RSK-008` duplicate/uncertain external execution — CRITICAL.
- `RSK-011` evidence/observability gaps — CRITICAL.
- architecture complexity/control-plane overgrowth — HIGH.
- Context Engine bottleneck/staleness — HIGH.
- precheck/authority stale-state misuse — HIGH.
- event poisoning/replay/ordering — HIGH.
- economic runaway — HIGH.
- `RSK-012` governance/live-state drift — OBSERVED and controlled through mandatory reconciliation.

Risk scores are architecture baselines and must be recalibrated with runtime evidence/telemetry as owner waves mature.

## Device Plane planning state

ADR-002 is `ACCEPTED_FOR_PLANNING`. DEVICE is a first-class future execution target alongside PROVIDER, WORKFLOW and LOCAL_SERVICE. Runtime work remains dependency-gated:

- W04 owns target-neutral capability planning/registry.
- W07 owns generic execution-target/executor semantics.
- W14 owns device gateway/session/trust.
- W15 owns Android Device Runtime.
- W17/W19/W20 own telemetry, hardening and physical release acceptance respectively.

No Device Plane document claims that Android execution is currently implemented.

## Historical-document rule

The following classes are intentionally retained rather than deleted:

- v0.3 migration baseline inventories/classifications;
- W00/W01 accepted evidence and superseded remediation records;
- W02 historical draft/publication/acceptance snapshots;
- legacy/reference provenance;
- predecessor manual/action-plan revisions;
- superseded PR/branch references where required for auditability.

They must be labelled or indexed as historical/superseded when their title or location could otherwise be mistaken for current authority.

## Future-wave folder rule

Empty W03-W20 Drive wave folders are valid. Do not pre-create runtime contracts, charters or implementation evidence before the owning wave is released. Planning/governance artifacts may be prepared when explicitly allowed, but they do not release implementation.

## Drift control

Before releasing any dependent wave/subwave, reconcile:

- latest `main` SHA;
- merged/open PR state;
- accepted exact-HEAD evidence;
- publication barriers;
- this status file;
- Drive acceptance/handoff/evidence records;
- W02 charter/ownership/dependency/acceptance mirrors where applicable;
- active developer manual/ADR/framework authority.

A disagreement must be reconciled or explicitly recorded before dependent work relies on the stale record.

## Safety invariants

- Intelligence != Authority != Execution.
- Confidence, model output, session state, Android permission, cache or precheck cannot elevate authority.
- Current policy validation is mandatory where execution semantics require it.
- Precheck is informational and never an execution credential.
- No side-effect path may treat `EXECUTION_UNCERTAIN` as ordinary failure/retry.
- No canonical runtime may silently depend on legacy/reference material.
- Duplicate/replayed events or reconnects must never create duplicate side effects where idempotency/reconciliation is required.
