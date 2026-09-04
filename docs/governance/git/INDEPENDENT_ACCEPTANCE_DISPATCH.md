# Aurora Independent Acceptance Dispatch

Status: `CANDIDATE_NOT_ACTIVE_UNTIL_INDEPENDENTLY_ACCEPTED_AND_MERGED`

Issue: #241.

## Purpose

Provide an operational route for the already-defined `aurora-acceptance` Reality Gate role in `FREE_ACTIONS_CLI` mode without changing implementation task identity, task dependencies, canonical BUILD scheduling or execution authority.

This design is an equivalent non-deadlocking governance candidate. It is not active merely because this document or workflow exists on a branch.

## Separation of duties

The acceptance path has three distinct responsibilities:

1. **Request/validation** resolves one open PR, one exact candidate HEAD and one exact canonical main SHA. Any drift fails closed before review.
2. **Independent acceptance review** runs `aurora-acceptance` from the trusted main checkout with only the CLI `read` tool and a bounded, sanitized static dossier. The reviewer may recommend `ACCEPT_RECOMMENDED` or `REWORK_REQUIRED` only.
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
- the latest exact-head `quality`, `test-build` and `security-gate` checks from GitHub Actions must each be completed successfully;
- each required workflow blob must be byte-identical between reviewed main and candidate HEAD;
- the candidate must not modify protected gate runners/configuration;
- current main must be an ancestor of the candidate HEAD;
- the review patch must contain 1-300 changed files, 1-100 commits and at most 2,000,000 bytes.

The minimum CI evidence is resolved deterministically from the GitHub Checks API before the model review and is embedded in the normalized acceptance envelope. Each same-name check is traced to its GitHub Actions run and must originate from the canonical workflow path and workflow name for Quality, Test Build or Security. The exact workflow blob is also compared with reviewed main. A candidate-created or candidate-modified workflow emitting a same-name check cannot satisfy this preflight. Protected gate runners and root gate configuration require a separate review path instead of trusting checks whose implementation the candidate changed. The acceptance agent may require additional scope-specific checks, but it cannot waive these baseline gates.

Immediately after the model review, the workflow revalidates HEAD, main and the latest exact check runs before it validates or uploads the result. Before publishing the result, HEAD and main are checked again. Any mismatch prevents evidence publication.

A later push or main movement makes the published acceptance evidence stale for merge until re-reconciliation under normal Aurora rules.

## Sanitized dossier and reviewer permissions

Trusted workflow code constructs a dossier containing the exact diff, changed-file list, commit SHAs, PR metadata and verified check evidence. Diff generation disables external diff and text-conversion drivers, rejects control characters in paths, requires a clean candidate checkout and enforces finite file/commit/byte limits. Candidate files, symlinks, agents, skills, workflows and repository instructions are never added as trusted Copilot configuration.

The untrusted candidate checkout is never added as a Copilot working directory because additional directories can contribute their own agent/skill configuration. Instead, deterministic trusted code renders a bounded exact-main-to-exact-HEAD patch plus binding metadata under `.aurora-review-input/`, hashes every dossier file and makes the bundle non-writable before the model starts. Candidate code, PR bodies, comments, links and instructions are review data, never trusted instructions.

The review job receives read-only GitHub permissions plus `copilot-requests: write`, which is necessary only for Copilot CLI authentication. Checkout credentials are not persisted. The model receives only the `read` tool; the GitHub MCP server, temporary-directory access, remote session export/control, shell, write, URL, memory and subagent tools are disabled. GitHub runner command-file variables are removed from the Copilot process environment. The required-check envelope and static-review manifest are SHA-256 bound before review and revalidated immediately afterward.

The prompt explicitly prohibits repository mutation, commits, pushes, issue closure, label mutation, task acceptance and merge. After the agent exits, the workflow requires the exact expected review bundle as the only untracked governance path and a completely clean candidate checkout; any mutation or hash drift fails the review.

Raw model output and Copilot session transcripts remain ephemeral and are neither printed to public Actions logs nor uploaded as artifacts. Only normalized, schema-validated decision evidence and deterministic provenance are retained.

## Machine decision contract

The final reviewer output must contain one exact machine record:

`AURORA_ACCEPTANCE_RESULT={...}`

The validator requires:

- exactly one machine marker in bounded output, as the final non-empty line;
- repository and PR number equal the validated request;
- decision is `ACCEPT_RECOMMENDED` or `REWORK_REQUIRED`;
- exact candidate HEAD equals the reviewed HEAD;
- main SHA equals the reviewed main;
- Risk Gates A/B/C/D are each `PASS` or `FAIL`;
- blockers are an array of strings;
- summary is non-empty;
- `ACCEPT_RECOMMENDED` is valid only when A/B/C/D are all `PASS` and blockers are empty;
- the normalized `aurora.acceptance.v1` envelope contains the exact repository, PR, HEAD, main and deterministic baseline-check evidence, including canonical workflow ID/path/name/run/event and equal main/HEAD blob provenance;
- `REWORK_REQUIRED` must contain a blocker or at least one failed Risk Gate.

The Copilot CLI is installed at the reviewed fixed version `1.0.82` and its reported version is checked before use; mutable `latest` resolution is prohibited in this privileged workflow. Artifact actions are pinned to exact commits.

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

This governance/tooling candidate cannot bootstrap its own authority. Issue #241's implementation PR #242 must itself receive independent review/acceptance under the currently valid governance path before merge. Until then, `.github/workflows/aurora-independent-acceptance.yml` is candidate code only and must not be cited as an active acceptance mechanism.

## Security / failure model

Fail closed on:

- stale PR HEAD;
- stale main;
- closed, draft, forked or non-main PR;
- missing, duplicated, stale, non-GitHub-Actions, failed, wrong-workflow or candidate-modified-workflow baseline check;
- candidate-modified protected gate infrastructure;
- non-descendant candidate, unsafe changed path, empty/oversized diff or excessive file/commit count;
- repository/PR binding mismatch;
- Copilot CLI failure;
- exact input hash drift or repository mutation by reviewer;
- any attempt to require shell, write, subagent, temporary-directory or broader filesystem access;
- missing/malformed decision marker;
- output HEAD/main mismatch;
- `ACCEPT_RECOMMENDED` with failed gate or blocker;
- evidence publication after HEAD/main drift.

The retained artifact contains only normalized decision evidence, deterministic check provenance, Copilot version, exact refs and the dossier manifest/hash. The PR comment contains the normalized decision evidence and workflow run reference; raw model/session output is never published.
