# Aurora Independent Acceptance Dispatch

Status: `CANDIDATE_NOT_ACTIVE_UNTIL_INDEPENDENTLY_ACCEPTED_AND_MERGED`

Issue: #241.

## Purpose

Provide an operational route for the already-defined `aurora-acceptance` Reality Gate role in `FREE_ACTIONS_CLI` mode without changing implementation task identity, task dependencies, canonical BUILD scheduling or execution authority.

This design is an equivalent non-deadlocking governance candidate. It is not active merely because this document or workflow exists on a branch.

## Separation of duties

The acceptance path has three distinct responsibilities:

1. **Request/validation** resolves one open PR, one exact candidate HEAD and one exact canonical main SHA. Any drift fails closed before review.
2. **Independent acceptance review** runs `aurora-acceptance` using a repository checkout with read-only GitHub permissions. The reviewer may recommend `ACCEPT_RECOMMENDED` or `REWORK_REQUIRED` only.
3. **Evidence publication** is performed by `github-actions[bot]` after a second exact HEAD/main revalidation. It publishes the normalized decision and workflow evidence as a PR comment.

The acceptance agent cannot merge. The publisher cannot edit candidate code or mint task acceptance.

## Trigger

The workflow may run through either:

- explicit `workflow_dispatch` with PR number, expected candidate HEAD and expected main SHA; or
- adding the label `aurora:acceptance-requested` to an open PR after the workflow is active on canonical main.

The label is a review request only. It is not approval, authority or acceptance.

## Exact-head fail-closed requirements

Before review:

- PR must still be OPEN and non-draft;
- base branch must still be `main`;
- candidate branch must belong to the canonical repository, not a fork;
- live PR HEAD must equal the requested/event HEAD;
- live canonical main must equal the requested/resolved main SHA;
- the latest exact-head `quality`, `test-build` and `security-gate` checks from GitHub Actions must each be completed successfully.

The minimum CI evidence is resolved deterministically from the GitHub Checks API before the model review and is embedded in the normalized acceptance envelope. The acceptance agent may require additional scope-specific checks, but it cannot waive these baseline gates.

Before publishing the result, HEAD and main are checked again. Any mismatch prevents evidence publication.

A later push or main movement makes the published acceptance evidence stale for merge until re-reconciliation under normal Aurora rules.

## Reviewer permissions

The review job receives only read permissions for repository/PR/issues/actions/checks/statuses plus `copilot-requests: write`, which is necessary to invoke Copilot CLI. Checkout credentials are not persisted.

The prompt explicitly prohibits repository mutation, commits, pushes, issue closure, label mutation, task acceptance and merge. After the agent exits, the workflow requires a completely clean `git status`; any repository mutation fails the review.

## Machine decision contract

The final reviewer output must contain one exact machine record:

`AURORA_ACCEPTANCE_RESULT={...}`

The validator requires:

- exactly one machine marker in bounded output;
- repository and PR number equal the validated request;
- decision is `ACCEPT_RECOMMENDED` or `REWORK_REQUIRED`;
- exact candidate HEAD equals the reviewed HEAD;
- main SHA equals the reviewed main;
- Risk Gates A/B/C/D are each `PASS` or `FAIL`;
- blockers are an array of strings;
- summary is non-empty;
- `ACCEPT_RECOMMENDED` is valid only when A/B/C/D are all `PASS` and blockers are empty;
- the normalized `aurora.acceptance.v1` envelope contains the exact repository, PR, HEAD, main and deterministic baseline-check evidence;
- `REWORK_REQUIRED` must contain a blocker or at least one failed Risk Gate.

The Copilot CLI is installed at the reviewed fixed version `1.0.82`; mutable `latest` resolution is prohibited in this privileged workflow. Artifact actions are pinned to exact commits.

Malformed or inconsistent model output fails closed and produces no acceptance evidence comment.

## Authority boundary

The workflow does **not**:

- change the Puzzle DAG;
- change an implementation task's `customAgent`;
- mark any GitHub issue `aurora:accepted`;
- close task issues;
- merge pull requests;
- write candidate files;
- satisfy dependencies by itself;
- convert generic Copilot Code Review comments into acceptance.

`ACCEPT_RECOMMENDED` is independent exact-head Reality Gate evidence. Canonical `ACCEPTED` state still requires the remaining controlled integration sequence required by active governance: pre-merge revalidation, controlled merge through an approved path, post-merge exact-main verification, Drive evidence/convergence and task lifecycle convergence.

## Bootstrap rule

This governance/tooling candidate cannot bootstrap its own authority. PR #241's implementation must itself receive independent review/acceptance under the currently valid governance path before merge. Until then, `.github/workflows/aurora-independent-acceptance.yml` is candidate code only and must not be cited as an active acceptance mechanism.

## Security / failure model

Fail closed on:

- stale PR HEAD;
- stale main;
- closed, draft, forked or non-main PR;
- missing, duplicated, stale, non-GitHub-Actions or failed baseline check;
- repository/PR binding mismatch;
- Copilot CLI failure;
- repository mutation by reviewer;
- missing/malformed decision marker;
- output HEAD/main mismatch;
- `ACCEPT_RECOMMENDED` with failed gate or blocker;
- evidence publication after HEAD/main drift.

Full model/session output is retained as a workflow artifact for audit. The PR comment contains only normalized decision evidence and the workflow run reference.
