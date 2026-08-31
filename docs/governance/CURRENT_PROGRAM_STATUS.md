# Aurora AI-Native — Current Program Status & Document Authority

Status: `ACTIVE_CANONICAL_FOR_PROGRAM_COORDINATION`  
Audit date: 2026-08-31  
Audit starting main: `8894021ae00b257b940fe3ac8bd7c73f5da36c28`

## Authority order

1. GitHub `main` is implementation/code authority.
2. Accepted PR/exact-SHA evidence governs implementation acceptance.
3. Google Drive `AURORA_AI_NATIVE_DEVELOPMENT_GOVERNANCE` is the live operational governance/evidence registry.
4. Current planning authority is Developer Manual v0.4.1 + ADR-001 + ADR-002 until a later accepted manual/amendment supersedes it.
5. Accepted wave charters/ownership/dependency matrices govern their allocated scope.
6. Historical migration, predecessor manual and superseded wave documents are provenance only.

A historical file cannot override a later accepted PR, ADR, publication barrier or registry record.

## Current wave state

- W00: `COMPLETE_ACCEPTED`.
- W01: `COMPLETE_ACCEPTED`; ownership locks closed.
- W02: `IN_PROGRESS_COORDINATED`.
- W02-00: `COMPLETE_ACCEPTED`.
- W02-A/B/C: `COMPLETE_ACCEPTED_MERGED`.
- PB1: `COMPLETE_RELEASED`; technical acceptance main remains `b48953cd4a7913e154fe2804248217ffe0c0952d`.
- W02-D: `COMPLETE_ACCEPTED_MERGED`; accepted implementation HEAD `e9ca04a4b5ffe66619f092bd37614c68b7aa2600`, merged through PR #46; W02-D merge main `9bbcc26481d40885b443928ac21b38438e72ff78`.
- PB2: `COMPLETE_RELEASED`; accepted publication HEAD `2dd9d77e1062ae03d95268bd2de99b28376878fc`, merged through PR #47; current publication main `8894021ae00b257b940fe3ac8bd7c73f5da36c28`.
- W02-E: `RELEASED_NOT_STARTED` at this audit point; consumes PB2.
- W02-F: `DEPENDENCY_GATED_PB3`.
- W02-G: `DEPENDENCY_GATED_PB4`.
- W03-W20: `PLANNED_DEPENDENCY_GATED` unless later accepted governance explicitly releases them.

## W02-D / PB2 accepted state

W02-D deterministic policy runtime is accepted/merged. Its public policy surfaces were subsequently published by coordinator-owned PB2. PB2 publication did not start W02-E runtime work; it only released the dependency boundary required for W02-E to begin.

Historical draft PR #41 remains superseded evidence and must not be interpreted as the current W02-D state.

## Risk & architecture validation governance

A cross-wave Risk & Architecture Validation Framework is being introduced as a documentation/governance change for W03+ with retrospective baseline analysis against current W02 state. It does not reopen W00/W01 and does not move W18 adaptive-evaluation runtime ownership earlier.

The framework is authoritative only after its normal exact-HEAD PR acceptance/merge and Drive governance mirror are complete. Once accepted, future wave acceptance records must separately assess correctness, safety/authority, performance/economics and failure/recoverability where applicable.

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
- legacy/reference provenance;
- predecessor manual/action-plan revisions;
- superseded PR/branch references where required for auditability.

They must be labelled or indexed as historical/superseded when their title or location could otherwise be mistaken for current authority.

## Future-wave folder rule

Empty W03-W20 Drive wave folders are valid. Do not pre-create runtime contracts, charters or implementation evidence before the owning wave is released. Planning/governance artifacts may be prepared when explicitly allowed, but they do not release implementation.

## Drift control

The previous status document drifted behind live W02-D/PB2 acceptance while implementation advanced concurrently. From this update onward, live-state mismatch is treated as an explicit program risk.

Before releasing a dependent wave/subwave, reconcile:

- latest `main` SHA;
- merged/open PR state;
- accepted exact-HEAD evidence;
- publication barriers;
- this status file;
- Drive acceptance/handoff/evidence records;
- active developer manual/ADR authority.

A disagreement must be reconciled or explicitly recorded before dependent work relies on the stale record.

## Safety invariants

- Intelligence != Authority != Execution.
- Confidence, model output, session state, Android permission, cache or precheck cannot elevate authority.
- Current policy validation is mandatory where execution semantics require it.
- No side-effect path may treat `EXECUTION_UNCERTAIN` as ordinary failure/retry.
- No canonical runtime may silently depend on legacy/reference material.
- Duplicate/replayed events or reconnects must never create duplicate side effects where idempotency/reconciliation is required.
