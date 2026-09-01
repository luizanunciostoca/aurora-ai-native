# @aurora/intelligence status

Status: `W05_A_BUILD_CANDIDATE`

This package is the canonical W05 intelligence namespace. Program Control owns the shared package/publication scaffold; semantic leaf ownership follows `docs/governance/w05/W05_OWNERSHIP_MATRIX.md`.

Current implemented leaf:
- W05-A `src/classification/**` — deterministic task class/modality/complexity/reversibility/routing-risk classification.

Non-authority invariant: classifier outputs are informational routing evidence only. They do not mint, widen, satisfy, replace, or validate `PolicyToken`, `OwnerDecision`, executor authority, provider/device/workflow permission, or side-effect authorization.

Other W05 leaves remain dependency/ownership governed and are not implied by this status file.
