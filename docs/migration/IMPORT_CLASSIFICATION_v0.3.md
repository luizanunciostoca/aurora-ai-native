# Import Classification — Aurora AI-Native v0.3

This document closes the repository migration by **classification**, not by blindly mirroring every byte from the local development bundle into Git history.

## Source bundle inventory

The reorganized v0.3 bundle contains **2,598 files**. They are intentionally divided into source-control and reference/provenance classes:

| Class | Files | Git policy |
|---|---:|---|
| Canonical scaffold + selected reusable source/reference | curated subset | COMMIT |
| Full n8n source library / duplicate n8n reference tree | 2,053 | REFERENCE_ONLY_NOT_COMMITTED |
| Duplicate original Aurora/Manus provenance trees | 175 | REFERENCE_ONLY_NOT_COMMITTED |
| Binary manuals/images | 11 | EXTERNAL_ARTIFACT |
| n8n source archive | 1 | EXTERNAL_ARTIFACT |
| original Nova Aurora archive (~283 MB) | 1 | EXTERNAL_ARTIFACT_OVERSIZE_SECURITY_SENSITIVE |
| known legacy secret-bearing Manus configuration | excluded | EXCLUDED_SECURITY |

The remaining files in the local package include target scaffold/status files, selected Aurora/Manus references, curated n8n candidates, migration inventories and helper material. Git should contain only what is useful for development, review and reproducibility; duplicated provenance libraries and large binary archives are deliberately kept outside normal Git history.

## Why the 2,053 n8n workflows are not mirrored into normal Git history

They are a third-party/community pattern library, not 2,053 production-approved Aurora automations. The catalog is preserved by provenance and audit inventory, while individual workflows must be promoted into the repository only after curation, security review, schema mapping, capability binding and lifecycle assignment (SHADOW/CANARY/LIMITED/GENERAL).

## Why original Aurora/Manus duplicate trees are not mirrored twice

The v0.3 package intentionally contains duplicate provenance copies under `reference/` in addition to mapped development references. Duplicating the same legacy code in Git increases drift and review noise. Git keeps selected mapped references; full duplicate originals remain provenance artifacts.

## Security exclusion

The original Nova Aurora archive was previously found to contain a hardcoded API credential in legacy Manus configuration. The secret-bearing configuration is not eligible for source control. The original credential must be rotated/revoked independently of repository migration.

## Completion definition

For baseline v0.3, migration is complete when every local-package class is one of:

- `COMMITTED_SELECTED_SOURCE`
- `REFERENCE_ONLY_NOT_COMMITTED`
- `EXTERNAL_ARTIFACT`
- `EXTERNAL_ARTIFACT_OVERSIZE_SECURITY_SENSITIVE`
- `EXCLUDED_SECURITY`

This is the repository policy going forward. New development must occur in canonical `apps/`, `services/`, `packages/`, `catalog/`, `infra/`, `evals/`, `docs/` and `tools/` paths; legacy references are not runtime authority.
