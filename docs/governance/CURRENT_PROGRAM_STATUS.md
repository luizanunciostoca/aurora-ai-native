# Aurora AI-Native — Current Program Status & Document Authority

Status: `ACTIVE_CANONICAL_FOR_PROGRAM_COORDINATION`  
Audit date: 2026-08-31  
Audit starting main: `f0a4c2e00ca3eee6e5d9d52489d75a614bd799ae`

## Authority order

1. GitHub `main` is implementation/code authority.
2. Accepted PR/exact-SHA evidence governs implementation acceptance.
3. Google Drive `AURORA_AI_NATIVE_DEVELOPMENT_GOVERNANCE` is the live operational governance/evidence registry.
4. Current planning authority is Developer Manual v0.4.1 + ADR-001 + ADR-002.
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
- W02-D: `IN_PROGRESS_DRAFT_PR_41` on `wave/02d-policy-engine`; draft state is not acceptance.
- W02-E: `DEPENDENCY_GATED_PB2`.
- W02-F: `DEPENDENCY_GATED_PB3`.
- W02-G: `DEPENDENCY_GATED_PB4`.
- W03-W20: `PLANNED_DEPENDENCY_GATED` unless later accepted governance explicitly releases them.

## W02-D acceptance guard

PR #41 was created from the earlier governance main `c4f25eb41fcb7ff9e390466146ebdeb8239bfe6f` while `main` later advanced through Device Plane planning/governance. Before W02-D acceptance, its branch must be reconciled against the then-current `main` and revalidated on the exact final HEAD.

The W02 ownership matrix keeps root workspace/lockfile and `.github/workflows/**` coordinator-controlled. Any such change inside W02-D requires explicit coordinator ownership/reconciliation before acceptance; a draft PR does not silently transfer that ownership.

PB2 remains closed until W02-D is accepted and its required public surfaces are published by the coordinator.

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

Empty W03-W20 Drive wave folders are valid. Do not pre-create runtime contracts, charters or implementation evidence before the owning wave is released. Empty future folders represent dependency-gated structure, not missing work.

## Safety invariants

- Intelligence != Authority != Execution.
- Confidence, model output, session state, Android permission, cache or precheck cannot elevate authority.
- Current policy validation is mandatory where execution semantics require it.
- No side-effect path may treat `EXECUTION_UNCERTAIN` as ordinary failure/retry.
- No canonical runtime may silently depend on legacy/reference material.
