# Aurora AI-Native — Current Program Status & Document Authority

Status: `PB5_FINAL_ACCEPTANCE_PUBLICATION_CANDIDATE`  
Audit date: 2026-09-01  
PB5 base main: `283ede2c1de3823cf30391aaa2df188914f456a2`

## Publication semantics

This document is a PB5 candidate while it is not on `main`. It becomes the active current-state declaration only after the owning PB5 pull request is merged to `main` with Aurora exact-head Quality, Test Build and Security gates green and Program Control records the corresponding acceptance evidence.

When this document is present on accepted `main`, the effective program state is:

- W00: `COMPLETE_ACCEPTED`.
- W01: `COMPLETE_ACCEPTED`.
- W02: `COMPLETE_ACCEPTED`.
- W02-00/A/B/C/D/E/F/G: `COMPLETE_ACCEPTED_MERGED`.
- PB1/PB2/PB3/PB4/PB5: `COMPLETE_RELEASED / ACCEPTED` as applicable.
- W03: `RELEASED_FOR_IMPLEMENTATION`, subject to its own Chat 00 reality/dependency/ownership/risk freeze before runtime writes.
- W04: `READINESS / REFERENCE_MINING` only until its own dependencies are satisfied.
- W05-W20: remain dependency-gated except for readiness/reference work explicitly permitted by the accepted execution sequence.

## Authority order

1. GitHub `main` is implementation/code authority.
2. Accepted PR and exact-SHA evidence govern implementation/publication acceptance.
3. Google Drive `AURORA_AI_NATIVE_DEVELOPMENT_GOVERNANCE` is the operational governance/evidence registry.
4. Developer Manual v0.5 Audit-Consolidated, ADR-001 and ADR-002 govern accepted architecture/planning.
5. Risk & Architecture Validation Framework v1.0 is mandatory cross-wave governance for W03+.
6. Accepted wave charters, ownership matrices, dependency matrices and acceptance matrices govern allocated scope.
7. Historical, superseded and salvage/reference material is provenance only.

A historical document, prompt, agent output or task-graph node cannot override later accepted evidence or release a gated dependency by itself.

## W02 final technical evidence

### W02-F

- PR #61: merged.
- exact accepted HEAD: `185f9681bf258d06ff9bb45721c6cde6988b639d`.
- merge main: `0e8fccf51490f1e05fb356bd562a812e4738475b`.
- Quality `33449520272`: SUCCESS.
- Test Build `33449520312`: SUCCESS.
- Security `33449520715`: SUCCESS.

### PB4

- PR #62: merged/released.
- exact publication HEAD: `c2a9c06e11f0039b4670efdd44c2219931ff593b`.
- publication main: `8ca6d252b75907bb62616a8054f740b8fa5d32c7`.
- Quality `33450029976`: SUCCESS.
- Test Build `33450029963`: SUCCESS.
- Security `33450030286`: SUCCESS.

### W02-G — Reality Gate 1

- canonical PR #68: merged.
- reconciled base main: `d629df9f6e8ad200c567d839f9bba9e248e7dd5e`.
- exact accepted HEAD: `ee2572d09392f6ee06014fb9d8335d2e9b6fd758`.
- merge main: `4df704ae787947d2138658cae984726470f7633d`.
- Quality `33460989349`: SUCCESS.
- Test Build `33460989330`: SUCCESS.
- Security `33460989658`: SUCCESS.
- post-merge Quality `33461113096`: SUCCESS.
- post-merge Test Build `33461100616`: SUCCESS.
- post-merge Security `33461100936`: SUCCESS.
- issue #64: closed with `aurora:accepted`.

W02-G adds the consolidated S01-S20 authority Reality Gate harness and preserves zero real provider/device/executor/persistence/model side effects.

## Copilot development fabric

Aurora Copilot Multi-Agent Development Fabric v1.0 remains active.

Current execution mode: `FREE_ACTIONS_CLI`.

- Cloud Agent is disabled while the repository owner uses Copilot Free.
- Copilot CLI may execute at most two dependency-satisfied code tasks per batch.
- AI workers receive repository read access plus `copilot-requests: write`; they do not push, merge or self-accept.
- Program Control owns coordinator/governance/acceptance tasks.
- One task maps to one isolated candidate ownership surface.
- Downstream dependencies require `aurora:accepted` plus canonical evidence.

The first Free execution exposed two automation defects: duplicate work when a canonical PR already existed and generated `dist-test` output being captured as a patch. PR #70 hardened the fabric to detect open canonical PRs, skip Program-Control tasks, filter generated outputs and preserve branch-only candidates when repository policy prevents Actions from creating a PR.

PB5 base main `283ede2c1de3823cf30391aaa2df188914f456a2` passed after hardening:

- Quality `33461804484`: SUCCESS.
- Test Build `33461804485`: SUCCESS.
- Security `33461804843`: SUCCESS.

## W03 release conditions

W03 implementation is released only after PB5 is accepted on `main`.

Before any W03 runtime write, W03 Program Coordinator must revalidate:

- current `main` and exact PB5 acceptance evidence;
- W03 ownership/dependency documents;
- canonical W01/W02 contracts and public surfaces;
- Developer Manual v0.5;
- Risk & Architecture Validation Framework v1.0;
- reuse candidates as reference only;
- migration/shared-surface ownership;
- Risk Gates A/B/C/D and over-agentification classification.

The accepted W03 pattern remains: Chat 00 coordination -> Reality Audit || Reuse Mining -> Contract/Architecture Freeze -> implementation DAG -> Integration || Red Team || Performance -> Reality Gate -> exact-SHA acceptance.

## Safety invariants

- Intelligence != Authority != Execution.
- Confidence, precheck, context, cache, model output, workflow state, device permission, session or credential possession never elevate authority.
- Current policy/authority validation remains mandatory where execution semantics require it.
- Precheck is informational and never an executable credential.
- `EXECUTION_UNCERTAIN` requires reconciliation before retry.
- Duplicate/replayed/reconnected work must not duplicate irreversible side effects.
- No implementation agent self-accepts or self-merges.
- No stale CI may satisfy an acceptance gate.
- Legacy/reference material never silently becomes runtime authority.

## Drift control

Before every merge or downstream release, revalidate:

- latest `main` SHA;
- open/merged PR state;
- exact candidate HEAD;
- Quality/Test Build/Security on that same HEAD;
- publication barriers;
- Drive task/change/evidence/acceptance/deprecation registries;
- current wave ownership and dependencies.

A disagreement is a blocker until reconciled or explicitly recorded.