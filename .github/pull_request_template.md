# Aurora AI-Native — Wave Pull Request

## Wave

- **Wave ID:** `W__`
- **Branch:** `wave/...`
- **Base branch:** `main`
- **Exact HEAD SHA for this acceptance:** `TO_FILL_BEFORE_ACCEPTANCE`

> Refresh the exact HEAD SHA after every push. Acceptance against an older SHA is invalid.

## Objective

Describe the bounded objective of this PR.

## Files changed

List every relevant file/path added, modified, moved or removed.

## Contracts changed

- `NONE` or list canonical contract/schema/event/API changes, including compatibility impact.

## Migrations

- `NONE` or list migration identifiers, order, rollback/recovery constraints and evidence.

## Deprecations / removals

- `NONE` or list deprecated/removed paths, successor, reason and cleanup evidence.

## Test and gate evidence

Record the commands/checks actually executed and their outcomes. Do not mark an absent gate as PASS.

- [ ] Formatting/lint applicable and PASS, or N/A with reason.
- [ ] Typecheck applicable and PASS, or N/A with reason.
- [ ] Tests applicable and PASS, or N/A with reason.
- [ ] Build applicable and PASS, or N/A with reason.
- [ ] Security checks applicable and PASS, or N/A with reason.
- [ ] Additional wave-specific gates recorded below.

**Evidence:**

- Command/check:
- Result:
- Artifact/run/reference:

## Risks

List regression, compatibility, security, data, deployment, migration, provider or operational risks and mitigations.

## Dependencies / stacking

- **Parent branch/PR:** `NONE` or reference.
- **Exact parent SHA if stacked:** `NONE` or SHA.
- **Dependencies unblocked by this PR:**
- **Dependencies still blocked:**

## Acceptance criteria

Copy the wave acceptance criteria and mark each item with evidence.

- [ ] Criterion 1 — PASS / FAIL / BLOCKED
- [ ] Criterion 2 — PASS / FAIL / BLOCKED

## Governance checks

- [ ] Wave ID matches the branch scope.
- [ ] Ownership locks were respected.
- [ ] No unrelated scope expansion was hidden in this PR.
- [ ] Contracts/registries/docs were updated when required.
- [ ] Dead code / duplicates / deprecations were reviewed.
- [ ] No secret or credential material was added.
- [ ] `WAVE_EVIDENCE`, `WAVE_HANDOFF` and `WAVE_ACCEPTANCE` will bind to this exact HEAD SHA.
