# Import Classification — Aurora AI-Native v0.3

Status: `HISTORICAL_BASELINE_POLICY`  
Purpose: migration provenance. This file is not current roadmap, wave or runtime authority.

This document closed the original repository migration by **classification**, not by blindly mirroring every byte from the local development bundle into Git history. The classifications below remain historical evidence; current development authority is GitHub `main` plus accepted wave/ADR governance.

## Source bundle inventory

The reorganized v0.3 bundle contained **2,598 files**. They were intentionally divided into source-control and reference/provenance classes:

| Class | Files | Git policy |
|---|---:|---|
| Canonical scaffold + selected reusable source/reference | curated subset | COMMIT |
| Full n8n source library / duplicate n8n reference tree | 2,053 | REFERENCE_ONLY_NOT_COMMITTED |
| Duplicate original Aurora/Manus provenance trees | 175 | REFERENCE_ONLY_NOT_COMMITTED |
| Binary manuals/images | 11 | EXTERNAL_ARTIFACT |
| n8n source archive | 1 | EXTERNAL_ARTIFACT |
| original Nova Aurora archive (~283 MB) | 1 | EXTERNAL_ARTIFACT_OVERSIZE_SECURITY_SENSITIVE |
| known legacy secret-bearing Manus configuration | excluded | EXCLUDED_SECURITY |

The remaining files in the original local package included target scaffold/status files, selected Aurora/Manus references, curated n8n candidates, migration inventories and helper material. Git should contain only what is useful for development, review and reproducibility; duplicated provenance libraries and large binary archives are deliberately kept outside normal Git history.

## Why the 2,053 n8n workflows were not mirrored into normal Git history

They are a third-party/community pattern library, not 2,053 production-approved Aurora automations. The catalog is preserved by provenance and audit inventory, while individual workflows must be promoted only after curation, security review, schema mapping, capability binding and governed lifecycle assignment.

## Why original Aurora/Manus duplicate trees were not mirrored twice

The v0.3 package intentionally contained duplicate provenance copies under `reference/` in addition to mapped development references. Duplicating the same legacy code in Git increases drift and review noise. Git keeps selected mapped references; full duplicate originals remain provenance artifacts.

## Security exclusion

The original Nova Aurora archive was previously found to contain a hardcoded API credential in legacy Manus configuration. The secret-bearing configuration is not eligible for source control. Historical archives must not be restored into canonical runtime or fixtures.

## Historical completion definition

For baseline v0.3, migration was considered complete when every local-package class was one of:

- `COMMITTED_SELECTED_SOURCE`
- `REFERENCE_ONLY_NOT_COMMITTED`
- `EXTERNAL_ARTIFACT`
- `EXTERNAL_ARTIFACT_OVERSIZE_SECURITY_SENSITIVE`
- `EXCLUDED_SECURITY`

That historical classification remains valid provenance. New development occurs only in canonical owned paths according to the current Developer Manual, ADRs, wave ownership and accepted publication barriers; legacy references are never runtime authority.
