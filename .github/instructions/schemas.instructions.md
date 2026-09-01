---
applyTo: "packages/schemas/**"
---

# Runtime schema rules

- Runtime schemas must match canonical contract semantics and reject malformed, ambiguous or authority-widening inputs fail-closed.
- Preserve type/schema parity and deterministic normalization.
- Do not silently default tenant, identity, authority, consent, policy version or execution target in sensitive flows.
- Add parse/reject tests for every meaningful boundary and negative scenario changed.
- Do not expose provider secrets or credentials through canonical schemas; use secret references/bindings only.
- Public schema barrels/manifests remain coordinator-owned unless publication ownership is explicitly granted.
