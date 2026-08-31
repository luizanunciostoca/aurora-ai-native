# GitHub Import Status — Historical Baseline v0.3

Status: **HISTORICAL_BASELINE_COMPLETE_BY_CLASSIFICATION**

This document records the repository-import baseline that preceded the accepted W00/W01 foundations. It is retained for migration provenance and must not be interpreted as the current roadmap or runtime status.

## Baseline outcome

The repository was initialized with the Aurora AI-Native v0.3 monorepo structure, migration/status documentation, security boundaries, selected sanitized legacy references and future target directories. The baseline deliberately classified rather than blindly mirrored the entire local bundle.

The v0.3 migration classification remains valid historical evidence:

- full third-party/community n8n pattern libraries were not treated as production-approved workflows;
- duplicate Aurora/Manus provenance was not duplicated unnecessarily in normal Git history;
- binary/oversized archives remained external artifacts;
- known secret-bearing legacy configuration was excluded from canonical source control.

See `IMPORT_CLASSIFICATION_v0.3.md` for the historical classification details.

## What changed after this baseline

- W00 established and accepted monorepo quality/test/build/security/governance foundations.
- Permanent Quality, Test Build and Security workflows now exist; the earlier baseline note that automated security scanning still had to be added is superseded.
- W01 implemented and accepted canonical contracts/schemas/registries.
- W02-A/B/C are accepted/merged and PB1 is released.
- W02-D is currently in draft implementation PR #41 and is not yet accepted.
- Current planning authority is Developer Manual v0.4.1 + ADR-001 + ADR-002, not the v0.3 baseline.

## Current authority rule

GitHub `main` is implementation authority. Google Drive `AURORA_AI_NATIVE_DEVELOPMENT_GOVERNANCE` holds live operational governance/evidence. Historical migration/reference artifacts cannot silently override canonical runtime code, accepted contracts, current ADRs, wave ownership or publication barriers.

This file intentionally preserves the fact that the original repository import was completed by classification; it does not claim that the current Aurora runtime is complete.
