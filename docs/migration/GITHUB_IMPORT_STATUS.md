# GitHub Import Status — Baseline v0.3

Status: **PARTIAL_IMPORT — REPOSITORY INITIALIZED**

The GitHub repository has been initialized with the canonical v0.3 monorepo structure, migration/status documentation, security boundaries, a sanitized subset of the legacy Manus source, and the core Aurora legacy voice-interface references needed to begin development.

## Imported

- Root baseline README and safety `.gitignore`.
- Target architecture/status markers for Android, gateways, control core, agent runtime, executors, n8n bridge, infrastructure and evals.
- Migration mapping/status documentation.
- Security notice preserving the rule that hardcoded provider credentials must not return to source control.
- Sanitized legacy Manus reference subset.
- Aurora legacy voice UI HTML and WebSocket voice-interface bridge.

## Still pending from the local v0.3 package

The local baseline contains 2,598 files. The complete package is not yet mirrored byte-for-byte in GitHub. The remaining set includes the rest of the Aurora/dashboard reference files, the rest of the Manus reference tree, the 2,053-workflow n8n source library, 78 curated n8n candidates, manuals/inventories, and binary/reference artifacts.

## Large/binary provenance artifacts

`reference/source-archives/Nova aurora.zip` is approximately 283 MB and exceeds the normal GitHub single-file limit, so it must not be committed as a normal Git blob. Preserve it outside normal Git history or use an approved large-file/artifact store if long-term repository-linked provenance is required.

Other binary manuals/archives should be handled deliberately (Git LFS, release artifacts, object storage, or an external documentation store) rather than silently inflating the source repository.

## Security

The original Nova Aurora archive was previously identified as containing a hardcoded API credential in legacy Manus configuration. The curated tree excludes that secret-bearing file. Do not restore it. Rotate/revoke the original credential before treating historical archives as safe.

## Completion rule

Do not mark the repository import as `COMPLETE` until an inventory comparison against `AURORA_AI_NATIVE_DEVELOPMENT_BASE_v0.3.zip` confirms all intended source files are present or explicitly classified as `EXTERNAL_ARTIFACT`, `LFS`, `REFERENCE_ONLY_NOT_COMMITTED`, or `EXCLUDED_SECURITY`.
