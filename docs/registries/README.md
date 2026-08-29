# Aurora AI-Native Governance Registries

These files define registry contracts only. Live operational registry rows are maintained in Google Drive under `AURORA_AI_NATIVE_DEVELOPMENT_GOVERNANCE`. GitHub remains authoritative for repository state; Drive records reference exact GitHub path/PR/SHA values and never replace code.

Canonical states: `PLANNED`, `READY`, `IN_PROGRESS`, `BLOCKED`, `PARTIAL`, `COMPLETE`, `SUPERSEDED`.

## MASTER_WAVE_REGISTRY
Required fields:
`wave_id`, `name`, `status`, `owner_chat`, `depends_on`, `branch`, `PR`, `accepted_SHA`, `started_at`, `completed_at`, `blockers`, `evidence`, `next_wave`.

## MASTER_TASK_REGISTRY
Required baseline fields:
`task_id`, `wave_id`, `title`, `status`, `owner_chat`, `scope`, `repo_path`, `depends_on`, `branch`, `PR`, `base_sha`, `head_sha`, `accepted_sha`, `blockers`, `evidence_ref`, `started_at`, `completed_at`, `notes`.

## OWNERSHIP_LOCKS
Tracks canonical write ownership for parallel work. Lock transfers require explicit evidence and coordinator update; silent ownership transfer is invalid.

## CHANGE_REGISTRY
Required fields:
`change_id`, `date`, `wave_id`, `repo_path`, `object_type`, `previous_state`, `new_state`, `action`, `reason`, `successor`, `commit_sha`, `PR`, `evidence_ref`, `owner`, `notes`.

## DEPRECATION_REGISTER
Required fields:
`path/object`, `state`, `reason`, `successor`, `dependencies`, `introduced_by`, `deprecated_by`, `removal_condition`, `removal_SHA`, `evidence`.

## ADR_INDEX
Baseline fields:
`adr_id`, `title`, `status`, `wave_id`, `decision_date`, `owner`, `drive_ref`, `repo_ref`, `PR`, `accepted_SHA`, `supersedes`, `superseded_by`, `evidence_ref`, `notes`.

## EVIDENCE_INDEX
Baseline fields:
`evidence_id`, `wave_id`, `artifact_type`, `status`, `created_at`, `owner`, `drive_ref`, `repo_ref`, `commit_sha`, `PR`, `acceptance_ref`, `revision_or_checksum`, `notes`.

## ACCEPTANCE_INDEX
Baseline fields:
`acceptance_id`, `wave_id`, `status`, `accepted_by`, `accepted_at`, `base_sha`, `head_sha`, `merge_sha`, `PR`, `criteria_ref`, `evidence_ref`, `blockers`, `notes`.

## Safety and authority rules
- Never store secrets, credentials, tokens, private keys, environment values or personal data in governance registries.
- Do not duplicate implementation content whose authority is GitHub.
- Every accepted wave/subwave must identify verifiable evidence and exact repository SHA/PR state.
- Deprecations must identify a successor when one exists and an explicit removal condition.
- Empty registries are valid when no real record exists; fabricated history is not.
