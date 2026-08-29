# Security notice — baseline v0.3

1. The original Nova Aurora archive is preserved only for provenance/reference and must be treated as sensitive until all embedded credentials are rotated and audited.
2. The curated development tree intentionally uses the sanitized source set from v0.2; do not restore hardcoded secrets from original archives.
3. Provider credentials must be referenced through managed secrets/environment bindings, never committed to source.
4. n8n workflows containing credential references are not authorized for execution merely because they are present in this repository.
5. External writes must remain behind TOCA policy + deterministic executor + readback/evidence boundaries.
