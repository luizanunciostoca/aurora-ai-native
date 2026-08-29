# Aurora AI-Native — Git Governance

Status: `ACTIVE_CANONICAL` after W00-E acceptance.

Authority order: GitHub live > canonical contracts > active ADR > active developer manual > wave records > legacy/reference.

## 1. Scope

This policy governs branches, commits, pull requests, ownership, branch lifecycle and the intended protection of `main`.

The contributor-facing workflow is `.github/CONTRIBUTING.md`. The repository-level ownership baseline is `.github/CODEOWNERS`. The canonical PR form is `.github/pull_request_template.md`.

## 2. W00-E repository audit baseline

At the start of W00-E:

- Default branch: `main`.
- Baseline SHA: `c61d1f4c534c54e29006b2fa2d87812822e0903d`.
- Existing branches observed: `main` only before W00-E created `wave/00e-git-governance`.
- Open PRs observed: none.
- `.github/` directory: absent.
- Repository rulesets endpoint: no rulesets returned.
- Branch-protection read: unavailable to the current integration (`403 Resource not accessible by integration`).
- Branch-protection/ruleset write capability: not exposed by the available repository tools in W00-E.
- Merge methods currently allowed by repository metadata: merge commit, squash and rebase.
- Auto-merge: disabled.

Therefore W00-E does not claim branch protection is active. The target configuration is specified below for an authorized future application after capability and check names are verified.

## 3. Branch naming

Canonical development branches:

- `wave/<NN>-<slug>`
- `wave/<NN><letter>-<slug>`

Constraints:

- `<NN>` is exactly two decimal digits.
- `<letter>` is lowercase when present.
- `<slug>` is lowercase kebab-case.
- One branch corresponds to one bounded wave/subwave scope.

Examples:

- `wave/01-shared-contracts`
- `wave/00e-git-governance`

Non-canonical branch prefixes must not be introduced without a governance change.

## 4. Commit subjects

Allowed canonical prefixes:

- `feat:`
- `fix:`
- `refactor:`
- `test:`
- `docs:`
- `chore:`
- `security:`

Commits must be coherent and attributable. Do not use a generic maintenance prefix to hide runtime, security or behavior changes.

## 5. Pull request requirements

Every integration PR must identify the Wave ID and use the canonical PR template. Required acceptance fields:

1. Wave ID.
2. Objective.
3. Files changed.
4. Contracts changed or `NONE`.
5. Migrations or `NONE`.
6. Deprecations/removals or `NONE`.
7. Test/gate evidence.
8. Exact HEAD SHA used for acceptance.
9. Risks and mitigations.
10. Acceptance criteria with evidence.

The exact HEAD SHA is mutable until the last push. Any push invalidates an earlier acceptance snapshot until the new HEAD is revalidated.

## 6. Main branch change rule

Risk-bearing changes must not be edited directly on `main`. This includes:

- runtime/application/service code;
- canonical contracts, schemas and registries;
- dependencies and package-manager state;
- CI/workflows;
- security policy/tooling;
- infrastructure/deploy configuration;
- migrations;
- provider/external-write behavior;
- repository governance;
- removals, moves or deprecations with compatibility impact.

A trivial editorial documentation correction may bypass a PR only under an explicit coordinator waiver. Force-pushing `main` is prohibited.

## 7. Ownership

`CODEOWNERS` provides the repository baseline. Active wave locks may be stricter and always remain binding.

Sensitive areas currently reinforced in `CODEOWNERS` include repository governance, contracts/schemas, registries, infrastructure, runtime surfaces, evaluations/security tooling and legacy/reference material.

Changing ownership is itself a governance change and must preserve a viable reviewer/maintainer path.

## 8. Branch lifecycle policy

### ACTIVE

Has an active Wave ID, owner, base SHA/parent and bounded scope.

### STACKED

A child branch built on an unmerged parent must record:

- parent branch;
- parent PR when available;
- exact parent SHA consumed.

A stacked child must not merge to `main` while it still contains parent-only commits that are not independently accepted. After the parent lands, reconcile/rebase/update and rerun relevant gates.

### STALE_CANDIDATE

Staleness is semantic, not merely chronological. A branch becomes a stale candidate when one or more apply:

- no active owner or current wave work depends on it;
- its assumptions/base are superseded;
- its PR is closed and the line of work has no accepted continuation;
- it cannot be accepted without reconciliation because canonical contracts or governance changed.

Before deletion, classify outstanding commits as `RECOVER`, `TRANSPLANT`, `ABANDON_WITH_RECORD`, or `ALREADY_SUPERSEDED`.

### SUPERSEDED

When a successor branch/PR replaces an older implementation:

- identify the successor;
- close the older PR without merge;
- do not merge both competing implementations;
- preserve evidence needed for audit/handoff;
- delete the old branch only after recovery classification is complete.

### MERGED / CLEANUP_ELIGIBLE

After merge, first record accepted HEAD, merge SHA and handoff. The merged branch then becomes cleanup-eligible unless explicitly retained as a release/reference branch.

## 9. Target protection for `main`

Protection must be fail-safe but must not be enabled in a configuration that the current contributor/CI topology cannot satisfy.

### Controls to enable when write capability is available and the path is validated

- Require the normal integration path to be a pull request for risk-bearing changes.
- Block force pushes to `main`.
- Block branch deletion for `main`.
- Require resolution of review conversations when review threads are in use.
- Add required status checks only from exact accepted W00-B/C/D check names.
- Keep required checks strict against the current HEAD; an obsolete successful SHA must not authorize a newer head.
- Preserve administrator/emergency recovery only if the exception path is documented and audited.

### Controls that must wait for prerequisites

- **Required status checks:** wait for W00-B/C/D accepted workflow/check names.
- **Required approving reviews / code-owner review:** do not require a count that would deadlock the repository. With only one eligible owner/maintainer, self-review cannot satisfy an independent approval requirement. Enable this only after at least one additional eligible independent reviewer/owner path is validated or an equivalent non-deadlocking governance design is approved.
- **Signed-commit enforcement, merge-method restrictions or additional rules:** require a separate compatibility check against the actual development and automation path before activation.

### Validation after future activation

A future governance change that activates protection must prove:

1. a wave branch can open a PR to `main`;
2. expected checks trigger on the actual PR HEAD;
3. required checks can pass with current CI permissions;
4. legitimate maintainers can merge through the approved path;
5. force push and accidental direct risk-bearing updates are prevented as intended;
6. emergency/recovery behavior is documented;
7. the applied rule/ruleset identifiers and exact configuration are recorded in Drive evidence.

## 10. Template lifecycle

Only one canonical default PR template should exist unless multiple templates have distinct, non-overlapping use cases. Obsolete templates are removed only after proving they are superseded and unreferenced.

W00-E started with no existing `.github/` templates, so no legacy template deletion was required.

## 11. Evidence rule

No governance control is described as `ACTIVE` unless it is observable in the live repository or backed by an applied configuration identifier. Documentation of a target setting is `REQUIRED_CONFIGURATION`, not evidence that GitHub currently enforces it.
