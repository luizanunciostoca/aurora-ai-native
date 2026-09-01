---
applyTo: "packages/contracts/**"
---

# Contract rules

- Reuse canonical W01/W02 IDs and references; never fork them.
- Preserve backward compatibility unless the owning wave explicitly authorizes a breaking/versioned change.
- Contract names, enums and decision vocabularies must have one canonical source.
- Keep fields deterministic, explicit about tenant/subject/correlation/version where required, and aligned with runtime schemas.
- A contract describing precheck, confidence, session, provider health or UI state must not imply executable authority.
- Add/adjust contract tests and consumer resolution evidence for public surfaces.
- Root exports/package manifests remain coordinator-owned unless this task explicitly includes publication.
