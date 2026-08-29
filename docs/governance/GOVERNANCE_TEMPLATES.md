# Aurora AI-Native Governance Templates

Status vocabulary: `PLANNED`, `READY`, `IN_PROGRESS`, `BLOCKED`, `PARTIAL`, `COMPLETE`, `SUPERSEDED`.

GitHub is authoritative for code, repository state, commits and pull requests. Google Drive governance records must reference GitHub paths/PRs/SHAs rather than duplicate implementation state. Never store secrets, tokens, credentials, private keys or personal data in governance artifacts.

## WAVE_CHARTER

```text
wave_id:
name:
objective:
owner_chat:
status:
depends_on:
base_sha:
branch:
expected_PR:
ownership_scope:
protected_or_foreign_paths:
allowed_changes:
forbidden_changes:
acceptance_criteria:
required_evidence:
blockers:
start_condition:
completion_condition:
next_wave_or_handoff:
notes:
```

## WAVE_EVIDENCE

```text
evidence_id:
wave_id:
status:
created_at:
owner:
base_sha:
head_sha:
PR:
merge_sha:
commands_or_checks:
artifacts_created_or_updated:
Drive_refs:
repo_refs:
acceptance_criteria_results:
security_or_privacy_notes:
deprecations:
blockers:
known_gaps:
conclusion:
```

## WAVE_HANDOFF

```text
wave_id:
from_owner:
to_owner_or_coordinator:
status_at_handoff:
base_sha:
head_sha:
branch:
PR:
accepted_sha_if_any:
completed_scope:
remaining_scope:
changed_repo_paths:
changed_Drive_records:
contracts_or_interfaces_changed:
migrations:
deprecations:
blockers:
evidence_refs:
required_receiver_actions:
next_safe_action:
```

## WAVE_ACCEPTANCE

```text
acceptance_id:
wave_id:
status: PARTIAL|COMPLETE|BLOCKED
accepted_by:
accepted_at:
base_sha:
head_sha:
merge_sha:
PR:
criteria:
  - criterion:
    result: PASS|FAIL|NOT_APPLICABLE
    evidence_ref:
blockers:
risks:
deprecations:
release_or_next_wave_condition:
notes:
```

## ADR

```text
adr_id:
title:
status:
wave_id:
decision_date:
decision_owner:
context:
problem:
decision:
alternatives_considered:
consequences:
security_privacy_impact:
data_or_contract_impact:
migration_or_compatibility_impact:
supersedes:
superseded_by:
repo_refs:
PR:
accepted_SHA:
evidence_ref:
review_trigger:
notes:
```

An empty ADR or deprecation registry is preferable to fabricated history. Accepted waves must record exact SHA/PR/evidence references in the operational registries.
