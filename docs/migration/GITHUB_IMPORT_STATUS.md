# GitHub Import Status — Baseline v0.3

Status: **COMPLETE_BY_CLASSIFICATION — DEVELOPMENT BASELINE READY**

The GitHub repository is initialized with the canonical Aurora AI-Native v0.3 monorepo structure, migration/status documentation, security boundaries, selected sanitized Manus references, the core Aurora legacy voice-interface references required to preserve the existing visual/voice behavior, and the target directories needed to begin implementation.

## Committed development baseline

- Root baseline README and safety `.gitignore`.
- Canonical target structure for `apps/`, `services/`, `packages/`, `catalog/`, `infra/`, `evals/`, `docs/` and `tools/`.
- Android/mobile target status and porting plan.
- Aurora legacy voice UI HTML, Electron runtime reference, preload API and WebSocket voice bridge.
- Selected sanitized Manus/reference material required for redesign of the bounded `ManusExecutionKernel`.
- Target status markers for gateways, control core, agent runtime, executors, n8n bridge, infrastructure and evaluation areas.
- Migration mapping/status documentation.
- Security notice and exclusion rule for the hardcoded legacy credential.
- Import classification policy for all remaining local-package files.

## Local bundle classification

The reorganized local v0.3 bundle contains **2,598 files**. The repository does not mirror all of them byte-for-byte because a large portion is duplicate provenance, a third-party/community n8n pattern library, binary documentation or oversized/sensitive source archives.

The remaining package classes are explicitly governed as follows:

- **2,053 files** — full n8n source/reference library: `REFERENCE_ONLY_NOT_COMMITTED`. Workflows are promoted individually after curation, security review and TOCA capability binding.
- **175 files** — duplicate original Aurora/Manus provenance trees: `REFERENCE_ONLY_NOT_COMMITTED`. Selected mapped references are kept in canonical development locations instead of duplicating the entire legacy tree.
- **11 files** — binary manuals/images: `EXTERNAL_ARTIFACT`.
- **1 file** — n8n source archive: `EXTERNAL_ARTIFACT`.
- **1 file** — original Nova Aurora archive (~283 MB): `EXTERNAL_ARTIFACT_OVERSIZE_SECURITY_SENSITIVE`.
- **Known secret-bearing Manus configuration**: `EXCLUDED_SECURITY`.

See `docs/migration/IMPORT_CLASSIFICATION_v0.3.md` for the authoritative classification rule.

## Security

The original Nova Aurora archive was previously identified as containing a hardcoded API credential in legacy Manus configuration. The curated Git tree excludes that secret-bearing configuration. Do not restore it. Rotate/revoke the original credential before treating historical archives as safe.

Repository searches for the previously observed credential pattern and common API-key field naming returned no committed match at baseline closeout; this is not a substitute for automated secret scanning, which must be added to CI.

## Development authority

From this point forward, the GitHub repository is the development authority for **new Aurora AI-Native implementation**. Legacy references and external artifacts are evidence/provenance only and must not silently override canonical runtime code.

Baseline migration v0.3 is therefore **closed and ready for Phase 1 implementation**. This status does **not** claim that the Aurora AI-Native runtime itself is complete; it only confirms that the repository baseline and migration policy are ready for development.
