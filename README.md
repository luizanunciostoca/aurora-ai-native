# AURORA AI-NATIVE

Aurora AI-Native is an actively governed development program. This repository is the authority for implementation state; the Google Drive folder `AURORA_AI_NATIVE_DEVELOPMENT_GOVERNANCE` is the operational authority for wave coordination, evidence, acceptance and document governance.

## Current program state

Audit baseline for this documentation cleanup: `main@f0a4c2e00ca3eee6e5d9d52489d75a614bd799ae`.

- W00 — COMPLETE / ACCEPTED.
- W01 — COMPLETE / ACCEPTED and closed.
- W02-00 — COMPLETE / ACCEPTED.
- W02-A/B/C — COMPLETE / ACCEPTED / MERGED.
- PB1 — COMPLETE / RELEASED. Immutable technical acceptance reference: `b48953cd4a7913e154fe2804248217ffe0c0952d`.
- W02-D — IN_PROGRESS in draft PR #41. It is not accepted and PB2 is not released.
- W02-E/F/G — dependency-gated by PB2/PB3/PB4.
- W03-W20 — planned/dependency-gated unless a later accepted governance record explicitly releases a wave.

The current planning authority is the Developer Manual v0.4.1, ADR-001 and ADR-002. Older v0.3/v0.4 roadmap documents are historical predecessors, not current execution authority.

## Architectural invariants

- Intelligence != Authority != Execution.
- Current policy and authority validation win over cache, confidence, routing, templates and prechecks.
- Fast Lane never bypasses the Executor for governed side effects.
- Precheck is informational and never mints execution authority.
- `EXECUTION_UNCERTAIN` requires reconciliation before retry.
- Canonical runtime code must not depend on `reference/**` or `**/legacy-reference/**` as authority.
- Device execution is planned as a first-class target, but Android/Device Plane runtime remains dependency-gated.

## Repository structure

```text
aurora-ai-native/
├── apps/          # clients/scaffolds; Android runtime is future W15 work
├── services/      # current and future runtime services
├── packages/      # canonical versioned contracts/schemas/registries and future runtime packages
├── catalog/       # governed reference/pattern catalogs
├── infra/         # dependency-gated infrastructure targets
├── evals/         # dependency-gated evaluation targets
├── docs/          # repository governance, architecture, migration and security records
├── tools/         # accepted quality/test/build/security/audit tooling
└── reference/     # non-authoritative provenance/reference material
```

## Document authority

Use `docs/governance/CURRENT_PROGRAM_STATUS.md` for the current-document map and status rules. Historical migration/deprecation evidence is intentionally retained for auditability; a historical document must never silently override a later accepted wave, ADR or registry entry.
