# Contributing to Aurora AI-Native

This is the canonical contribution workflow for `luizanunciostoca/aurora-ai-native` while the W00 governance baseline is active.

## Source of truth

- GitHub live is authoritative for code, schemas, CI, migrations and repository state.
- The active developer manual and wave records in `AURORA_AI_NATIVE_DEVELOPMENT_GOVERNANCE` govern execution and evidence.
- Legacy/reference material never overrides accepted live code or canonical contracts.

## Before changing anything

1. Revalidate `main`, relevant open PRs, accepted SHAs and the current ownership lock.
2. Confirm the Wave ID and bounded scope.
3. Do not write another wave's owned paths. Raise an integration/dependency request instead.
4. Create a wave branch from an explicitly recorded base SHA.

## Canonical branch naming

Only these development branch shapes are canonical:

- `wave/<NN>-<slug>` — full wave, for example `wave/01-shared-contracts`.
- `wave/<NN><letter>-<slug>` — subwave, for example `wave/00e-git-governance`.

Rules:

- Use two decimal digits for `<NN>`.
- Use a lowercase subwave letter when present.
- Use lowercase kebab-case for `<slug>`.
- A branch represents one bounded wave/subwave scope.
- Do not silently repurpose an existing branch for another Wave ID.

## Commit conventions

Every commit subject must begin with one of the canonical types:

- `feat:` new product/runtime capability.
- `fix:` defect correction.
- `refactor:` internal restructuring without intended behavior change.
- `test:` test-only additions or corrections.
- `docs:` documentation-only change.
- `chore:` repository/tooling/maintenance work that does not fit another type.
- `security:` security hardening or remediation.

Keep commits small, coherent and reviewable. Never hide a failing gate with `|| true`, fabricated evidence or an unrelated cleanup commit.

## Pull request contract

A PR is the default integration path. Each PR must use the canonical template and record:

- Wave ID.
- Objective.
- Files changed.
- Contracts changed, or explicit `NONE`.
- Migrations, or explicit `NONE`.
- Deprecations/removals, or explicit `NONE`.
- Test/gate evidence.
- Exact HEAD SHA used for acceptance.
- Risks and mitigations.
- Acceptance criteria with PASS/FAIL/BLOCKED evidence.

The exact HEAD SHA must be refreshed after every push. Acceptance against an older SHA is invalid.

## Main branch rule

Do not edit `main` directly for risk-bearing changes, including runtime code, contracts/schemas, dependencies, CI, security, infrastructure, migrations, provider behavior, repository governance or deletions.

A trivial editorial documentation change may bypass a PR only with an explicit coordinator waiver and must still leave an attributable commit. When uncertain, use a PR.

Never force-push `main`.

## Gates and merge discipline

- Do not merge when relevant checks are red.
- Do not treat an absent required gate as green.
- A missing check may only be waived in the Wave Acceptance record with owner, reason, risk and closure condition.
- Required-check names must come from accepted W00-B/C/D workflows; do not invent names in branch protection.
- Security, migrations, external writes and infrastructure may require stricter gates than the repository baseline.

## Branch lifecycle

### Active
A branch has a current Wave ID, owner, base/parent and intended PR.

### Stacked
A stacked branch must declare its parent branch/PR and exact parent SHA. A child must not merge to `main` while it still contains unaccepted parent-only commits. After the parent lands, rebase/update the child and re-run relevant gates.

### Stale
Age alone does not make a branch stale. A branch is `STALE_CANDIDATE` when it has no active owner/work, its base or assumptions are superseded, or its PR can no longer be accepted without reconciliation. Before deletion, record whether work must be recovered, transplanted or explicitly abandoned.

### Superseded
When a successor branch/PR replaces an older line of work, mark the older work `SUPERSEDED`, link the successor, close its PR without merge, and preserve any needed evidence in the wave records. Never merge both competing implementations.

### Cleanup after merge
After an accepted merge, record merge SHA and handoff first. The merged branch is then eligible for deletion unless it is an explicitly retained release/reference branch.

## Sensitive ownership

`CODEOWNERS` is the repository-level ownership baseline. Changes to `.github/**`, canonical contracts/schemas, registries, infrastructure, security tooling, runtime surfaces and legacy/reference material require the listed owner(s) and any stricter wave lock in force.

`CODEOWNERS` does not grant permission to violate a wave ownership lock; the more restrictive active governance rule wins.

## Deprecation and removal

Removal requires reference/import/config/CI/documentation checks and recorded successor/reason. Never attempt to remediate an exposed secret by merely deleting it in a new commit; rotate/revoke and handle history separately.

## Evidence and handoff

A wave is not complete merely because code exists. Finish with `WAVE_EVIDENCE`, `WAVE_HANDOFF` and `WAVE_ACCEPTANCE`, all bound to exact SHAs and the real PR state.
