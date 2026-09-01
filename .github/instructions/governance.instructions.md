---
applyTo: "docs/governance/**"
---

# Governance rules

- Never rewrite accepted history to make current work look cleaner. Preserve exact SHAs, PRs, failed/superseded states and provenance.
- Current-state claims must be verified against live `main` and accepted evidence before editing.
- `MASTER_WAVE_REGISTRY` and historical documents are provenance, not primary current-state authority.
- Documentation changes do not release a dependency unless the owning publication/acceptance criteria are actually satisfied.
- Record exact HEAD, merge SHA, CI run IDs and blockers for acceptance/release changes.
- Do not put secrets, credentials, private reasoning or personal data in governance artifacts.
- Prefer minimal reconciliation over duplicating entire Drive documents into Git.
