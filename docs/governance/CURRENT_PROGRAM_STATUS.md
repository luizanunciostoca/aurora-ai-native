# Aurora AI-Native — Current Program Status & Document Authority

Status: `ACTIVE_CANONICAL_FOR_PROGRAM_COORDINATION`  
Audit date: 2026-08-31  
Current PB3 technical publication main: `fc5634488c84e382ee69efc0444ff9b70c004d77`  
Immutable W02-E technical acceptance: `17e452356abd6e43f959a2cbb0bcf47de35abbfd`  
Risk-framework acceptance main: `5490f8e7961fa258042b462d4699d698c2b23e9a`

## Authority order

1. GitHub `main` is implementation/code authority.
2. Accepted PR/exact-SHA evidence governs implementation and publication acceptance.
3. Google Drive `AURORA_AI_NATIVE_DEVELOPMENT_GOVERNANCE` is the live operational governance/evidence registry.
4. Developer Manual v0.5 Audit-Consolidated + ADR-001 + ADR-002 govern current architecture/planning after acceptance of the v0.5 governance change.
5. Risk & Architecture Validation Framework v1.0 is active canonical cross-wave governance for W03+ acceptance.
6. Accepted wave charters/ownership/dependency matrices govern allocated scope.
7. Historical and superseded documents are provenance only.

A historical file cannot override a later accepted PR, publication barrier, ADR or acceptance record.

## Drive audit and manual consolidation

The 2026-08-31 Drive technical-governance audit identified document-authority drift without finding a runtime architecture failure. The full audit is stored in Drive as `AURORA_DRIVE_TECHNICAL_GOVERNANCE_AUDIT_2026-08-31` and mirrored in this repository at `docs/governance/AURORA_DRIVE_TECHNICAL_GOVERNANCE_AUDIT_2026-08-31.md`.

The consolidated Developer Manual v0.5 is stored in Drive as `AURORA_AI_NATIVE_MANUAL_TECNICO_DESENVOLVEDOR_v0.5_AUDIT_CONSOLIDATED`, with repository authority pointer at `docs/governance/DEVELOPER_MANUAL_V0_5_REFERENCE.md`.

The audit does not change runtime/contracts/schemas/migrations or W02 technical acceptance. It clarifies that `MASTER_WAVE_REGISTRY` is a historical ledger rather than the primary current-state lookup, and that W02-F is released by PB3 but not started.

## Current wave state

- W00: `COMPLETE_ACCEPTED`.
- W01: `COMPLETE_ACCEPTED`; ownership locks closed.
- W02: `IN_PROGRESS_COORDINATED`.
- W02-00: `COMPLETE_ACCEPTED`.
- W02-A/B/C: `COMPLETE_ACCEPTED_MERGED`.
- PB1: `COMPLETE_RELEASED`; immutable technical acceptance main `b48953cd4a7913e154fe2804248217ffe0c0952d`.
- W02-D: `COMPLETE_ACCEPTED_MERGED`; PR #46; exact accepted HEAD `e9ca04a4b5ffe66619f092bd37614c68b7aa2600`; D merge main `9bbcc26481d40885b443928ac21b38438e72ff78`.
- PB2: `COMPLETE_RELEASED`; PR #47; exact publication HEAD `2dd9d77e1062ae03d95268bd2de99b28376878fc`; publication main `8894021ae00b257b940fe3ac8bd7c73f5da36c28`.
- W02-E: `COMPLETE_ACCEPTED_MERGED`; PR #50; exact accepted/merged SHA `17e452356abd6e43f959a2cbb0bcf47de35abbfd`.
- PB3: `COMPLETE_RELEASED_MERGED`; PR #53; exact publication HEAD `cece292115c0dfa91da2b9694934348ea04b6b4d`; publication main `fc5634488c84e382ee69efc0444ff9b70c004d77`.
- W02-F: `RELEASED_NOT_STARTED / READY_FOR_IMPLEMENTATION`.
- PB4: `PENDING`.
- W02-G: `DEPENDENCY_GATED_PB4`.
- PB5 / W02 final acceptance: `PENDING`.
- W03-W20: `PLANNED_DEPENDENCY_GATED` unless later accepted governance explicitly releases them.

## PB3 publication evidence

PB3 publishes the already accepted W02-E authority-validation boundary through coordinator-owned public package surfaces. It does not change W02-E semantic runtime behavior and it does not implement W02-F.

Published canonical boundaries:

- `@aurora/contracts/policy-validation`.
- `@aurora/contracts` root re-export of policy-validation contracts.
- `@aurora/schemas/policy-validation`.
- `@aurora/schemas` root re-export of policy-validation schemas.
- `@aurora/policy-core/authority` exposing `evaluateAuthority`, `validatePolicyToken` and explicit subject-reference bridge functions.
- consumer fixture proving all public package/subpath boundaries resolve after build.

Exact PB3 publication HEAD `cece292115c0dfa91da2b9694934348ea04b6b4d`:

- Quality `33439372557`: SUCCESS.
- Test Build `33439372604`: SUCCESS, including consumer fixture, build and cleanup.
- Security `33439373811`: SUCCESS.

No `package-lock.json`, workflow, CODEOWNERS, root workspace, provider, executor, persistence, planner, router or model semantic change occurred in PB3.

## W02-F release guard

PB3 satisfies the dependency barrier for W02-F only. W02-F has not been started by this publication.

When explicitly started under its own subwave/ownership, W02-F may implement read-only, side-effect-free current-policy query/precheck APIs by composing accepted D/E semantics. Precheck remains informational and never:

- mints executable authority;
- substitutes execution-time authority validation;
- weakens current-policy checks;
- authorizes provider/device/executor side effects.

## W02 ownership state

- W02-A/B/C/D/E leaf locks are closed/released after acceptance.
- PB3 coordinator publication lock is closed/released after PR #53.
- W02-F leaf paths are released but inactive until W02-F is explicitly started.
- Shared barrels, manifests/export maps, root workspace files, `package-lock.json`, CI/workflows and CODEOWNERS remain coordinator-controlled.
- W02-G ownership remains gated by PB4.

## Risk & architecture validation governance

Risk & Architecture Validation Framework v1.0 remains `ACTIVE_CANONICAL_CROSS_WAVE_GOVERNANCE` for W03+ and retrospective baseline analysis against W02. It does not reopen W00/W01 and does not move W18 adaptive-evaluation runtime ownership earlier.

Risk-framework acceptance remains PR #48, exact accepted HEAD `10dde7dbbe404cb4c127a28cac603307fea64fbf`, merge main `5490f8e7961fa258042b462d4699d698c2b23e9a`, with Quality `33431280921`, Test Build `33431280901` and Security `33431281893` SUCCESS.

Highest-priority architecture risks remain tracked, including duplicate/uncertain execution, evidence gaps, stale precheck/authority misuse, event poisoning/replay/ordering, economic runaway and governance/live-state drift.

## Device Plane planning state

ADR-002 remains `ACCEPTED_FOR_PLANNING`. DEVICE is a future execution target alongside PROVIDER, WORKFLOW and LOCAL_SERVICE. Device/runtime ownership remains in W04/W07/W14/W15/W17/W19/W20 as previously accepted; PB3 changes none of those assignments.

## Drift control

Before releasing a dependent wave/subwave, reconcile:

- latest `main` SHA;
- merged/open PR state;
- accepted exact-HEAD evidence;
- publication barriers;
- this status file;
- Drive acceptance/evidence/task registries;
- active W02 charter/ownership/dependency/acceptance mirrors;
- active developer manual/ADR/risk-framework authority.

A disagreement must be reconciled or explicitly recorded before dependent work relies on stale state.

## Safety invariants

- Intelligence != Authority != Execution.
- Confidence, model output, session state, Android permission, cache or precheck cannot elevate authority.
- Current policy validation remains mandatory where execution semantics require it.
- Precheck is informational and never an execution credential.
- `EXECUTION_UNCERTAIN` is not ordinary failure/retry.
- Canonical runtime may not silently depend on legacy/reference material.
- Duplicate/replayed events or reconnects must never create duplicate side effects where idempotency/reconciliation is required.

## Current-state addendum — PB4 + Copilot fabric — 2026-09-01

`SUPERSEDES ONLY STALE W02-F/PB4/W02-G/COPILOT-ORCHESTRATION STATUS LINES ABOVE; HISTORICAL EVIDENCE RETAINED.`

Live `main` at reconciliation: `e75526f407480d7fe58891d8746fd2aa2ff9070d`.

- W02-F: `COMPLETE_ACCEPTED_MERGED`; PR #61; exact acceptance HEAD `185f9681bf258d06ff9bb45721c6cde6988b639d`; merge main `0e8fccf51490f1e05fb356bd562a812e4738475b`; Quality `33449520272`, Test Build `33449520312`, Security `33449520715`: SUCCESS.
- PB4: `COMPLETE_RELEASED_MERGED`; PR #62; exact publication HEAD `c2a9c06e11f0039b4670efdd44c2219931ff593b`; merge main `8ca6d252b75907bb62616a8054f740b8fa5d32c7`; Quality `33450029976`, Test Build `33450029963`, Security `33450030286`: SUCCESS.
- W02-G: `RELEASED_READY_FOR_INTEGRATION`; governed issue #64 is `aurora:copilot-ready`. No Copilot agent has started because dispatch is fail-closed while repository secret `AURORA_COPILOT_USER_TOKEN` is absent. This operational dispatch blocker does not revoke PB4 and does not release PB5.
- PB5 / W02 final acceptance: `PENDING`.
- W03-W20: `PLANNED_DEPENDENCY_GATED` until W02 final acceptance explicitly releases downstream implementation.

Aurora Copilot Multi-Agent Development Fabric v1.0 is active on `main` via PR #66 / merge `e75526f407480d7fe58891d8746fd2aa2ff9070d`, covering the validated 166-task W02-W20 DAG and 9 custom agents. Accepted PR HEAD `5eba12d94096ada2b10f68d842fa0f7faa271ec4` passed Quality `33455513039`, Test Build `33455513016`, Security `33455513475` and Fabric Validation `33455513065`. Post-merge `main` passed Quality `33455604239`, Test Build `33455604227`, Security `33455604556`, Fabric Validation `33455604235` and Orchestrator `33455604234`.

W02-G ownership is now released only for the integration/security/Reality Gate scope defined by the W02 acceptance matrix and issue #64. Shared/root/publication surfaces remain coordinator-controlled unless explicitly transferred. No W03+ runtime work is released by this addendum.
