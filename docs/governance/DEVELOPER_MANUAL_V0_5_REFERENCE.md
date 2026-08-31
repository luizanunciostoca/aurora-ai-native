# Aurora AI-Native — Developer Manual v0.5 Reference

Status: `ACTIVE_CANONICAL_ON_ACCEPTED_MERGE`  
Date: 2026-08-31

Canonical Drive document:

- Title: `AURORA_AI_NATIVE_MANUAL_TECNICO_DESENVOLVEDOR_v0.5_AUDIT_CONSOLIDATED`
- Drive ID: `1Ms4-p2Sa6jvHUXYTkOt0bmhxUU_cPA_3-h_1TG0GGew`

This manual is derived from the full Drive technical-governance audit and consolidates the current architecture without append-only historical state snapshots.

## Authority role

After acceptance of this governance change, Developer Manual v0.5 supersedes v0.4.2, v0.4.1, v0.4 and v0.3 as the operational developer manual. Historical predecessors remain preserved as provenance and may not override current accepted GitHub/Drive governance.

Authority order:

1. GitHub `main` and accepted PR/exact-SHA evidence for implementation/runtime state.
2. `docs/governance/CURRENT_PROGRAM_STATUS.md` for current release/publication-barrier state.
3. Developer Manual v0.5 for consolidated architecture, ownership, development workflow and roadmap.
4. Accepted ADRs.
5. Accepted wave charters/ownership/dependency/acceptance/evidence.
6. Drive registries.
7. Historical/deprecated/salvage/reference material.

## Current execution sequence

The next canonical implementation unit remains W02-F after PB3 release. W02-F is read-only and side-effect-free; policy precheck is informational and never executable authority.

Future implementation remains dependency-gated through W03-W20. The Risk & Architecture Validation Framework v1.0 remains mandatory cross-wave governance for W03+.

## Invariants retained

- Intelligence != Authority != Execution.
- Deny by default and least authority.
- Confidence, cache, precheck, session state, Android permission, provider verification, n8n/MCP tool exposure and UI state cannot elevate authority.
- `EXECUTION_UNCERTAIN` requires reconcile-before-retry.
- Replay/reconnect/offline queues must not duplicate side effects.
- Legacy/Nova Aurora/n8n/TOCA MCP material is reference/salvage input only unless explicitly promoted by the owner wave.

The complete manual remains in Drive to avoid duplicating a long operational artifact across authority surfaces.
