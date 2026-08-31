# Status: REFERENCE_GOVERNED / NOT_RUNTIME_AUTHORITY

`catalog/n8n` is the canonical pointer to the governed n8n pattern/reference library. It is **not** a set of production-approved Aurora workflows and must not mirror the raw 2,053-workflow source archive into Git.

Supplemental audit accepted for planning input:
- source archive: `n8n-workflows-main.zip`
- source SHA-256: `4173960e9aed58b773482b2e660976533dabcc982ddd3e14d6790a670eebd89b`
- 2,053 workflows parsed successfully
- 1,979 structurally unique
- 1,937 sanitized reference patterns preserved in Drive
- 74 structural duplicates index-only
- 10 empty/invalid excluded
- 32 direct command/SSH patterns index-only high risk

Full file-level evidence lives in Drive governance under:
`AURORA_AI_NATIVE_DEVELOPMENT_GOVERNANCE/LEGACY_SALVAGE_REFERENCE/W09_N8N_REFERENCE`.

Promotion into active integration requires W09-governed binding, security review, provenance/license review, canonical contracts/capability mapping, credential boundary review, lifecycle assignment and evidence. n8n never becomes source of truth or action authority.

Coverage notes:
- W10 Revenue/CRM: 167 sanitized/deduplicated reference patterns.
- W11 Organic/Community: 343 sanitized/deduplicated reference patterns.
- W12 Meta Ads: only one lead-ad-specific pattern; not full operations coverage.
- W13 Google Ads: no direct Google Ads/AdWords workflow found; coverage remains a declared gap.
- W17 Observability: 41 sanitized/deduplicated reference patterns.
- W18 AI/Evals: 758 sanitized/deduplicated reference patterns.
