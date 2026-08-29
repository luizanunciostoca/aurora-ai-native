# W00-D Security Baseline — Security CI & Supply Chain Foundation

Status: IMPLEMENTED_PENDING_CI_ACCEPTANCE  
Wave: W00-D  
Baseline authority: GitHub live `luizanunciostoca/aurora-ai-native`  
Initial audited SHA: `c61d1f4c534c54e29006b2fa2d87812822e0903d`

## Scope

This baseline covers secret scanning, prohibited sensitive-file checks, dependency vulnerability scanning, dependency hygiene, security-ignore governance, a non-secret `.env.example`, and fail-closed future environment validation.

## Current HEAD audit

The curated baseline was checked for apparent private-key material, common API-key/token patterns, `.env` files, credential files, and tracked archive risks. No current tracked secret value was intentionally copied into this report or into CI evidence.

The known legacy Manus configuration that previously contained a hardcoded credential remains excluded. Only a security notice is retained in the curated reference tree. `LEGACY_REFERENCE` is not `ACTIVE_RUNTIME` authority.

The repository currently has no canonical ACTIVE_RUNTIME Node dependency manifest/lockfile. The only observed Node manifest at the initial baseline is under a legacy-reference path and is intentionally excluded from active dependency authority.

## Historical risk is separate

A known credential exposure exists in project provenance outside the sanitized current configuration. This wave does **not** claim that deleting or omitting a file in a new commit cleans Git history or external archives. Credential rotation/revocation and any approved history-rewrite procedure are separate remediation actions and must be handled without reproducing credential values.

The original large provenance archive remains security-sensitive and must not be committed to the development tree.

## Controls introduced

- `Security` GitHub Actions workflow runs on every pull request, pushes to `main`, and manual dispatch.
- Gitleaks scans changed commits with full checkout history. Findings are redacted; PR comments, uploaded finding artifacts, and job summaries are disabled.
- `tools/security/check-sensitive-files.sh` rejects `.env` variants (except `.env.example`), private-key/keystore classes, common credential files, source archives, and restoration of the excluded Manus configuration path.
- `tools/security/check-dependency-hygiene.sh` keeps `LEGACY_REFERENCE` dependency metadata out of `ACTIVE_RUNTIME` authority and fails closed when an active Node manifest appears without exactly one canonical root lockfile.
- OSV-Scanner is the canonical dependency vulnerability scanner and runs on every security workflow. It recursively discovers active dependency lockfiles, excludes legacy/reference directories, and fails on known vulnerabilities. Dependency hygiene separately fails closed if an active Node manifest appears without a canonical root lockfile.
- `tools/security/require-env.sh` rejects missing/blank mandatory configuration without printing values.
- `.env.example` contains blank sensitive placeholders only.
- Dependabot is enabled only for GitHub Actions at this stage. Package-ecosystem updates are deferred until W00-A establishes the canonical package manager, avoiding redundant or conflicting automation.

## Security ignore governance

Gitleaks extends its default rules and has no baseline allowlist. Security findings must not be silenced with broad path exclusions or placeholder fingerprints merely to make CI green. Any future false-positive exception must be narrow, reviewed, documented with a non-sensitive reason, and must not include credential values.

Legacy/reference exclusions in dependency scanning are authority boundaries, not secret-scanning exemptions. Secret scanning continues to cover commits changed by pull requests.

## `.gitignore` review

The existing root `.gitignore` already excludes local `.env` variants while allowing `.env.example`, common private-key files, common credential JSON files, and the designated provenance ZIP location. W00-D therefore does not rewrite this shared root file. CI path checks provide an additional fail-closed layer for sensitive files that must never be tracked.

## Required-check handoff

The stable acceptance job is `security-gate` in workflow `Security`. W00-E owns repository rules/branch protection and must bind the accepted live check name after this workflow has produced a successful run.
