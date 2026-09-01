---
applyTo: "packages/policy/**"
---

# Policy / authority rules

- Policy answers `MAY THIS HAPPEN?`; it must not become planning/intelligence.
- Deny by default. Unknown, stale, revoked, mismatched or ambiguous authority fails closed.
- Preserve least authority and current-policy precedence.
- Confidence, precheck, cache, model output, previous success or provider verification never authorize execution.
- Precheck is informational-only: no PolicyToken issuance, no OwnerDecision creation, no implicit approval and no execution-time validation bypass.
- Never introduce a second Policy Engine or parallel decision vocabulary.
- Deterministic evaluation/replay with explicit reasons, policy reference/version and correlation is required.
- Any authority-affecting change requires strong negative tests and exact-head acceptance evidence.
