# WAVE_EVIDENCE — W00-G

## Identity

- Wave: `W00-G — Repository Cleanup & Deprecation Audit`
- Baseline SHA: `c61d1f4c534c54e29006b2fa2d87812822e0903d`
- Branch: `wave/00g-cleanup-audit`

## Evidence set

| Evidence | Result |
|---|---|
| E-001 main HEAD revalidation | PASS — `main` resolved to baseline SHA `c61d1f4c...` before branch creation. |
| E-002 ownership lock read | PASS — W00-G is audit-first; writes restricted to `docs/deprecation/**`, `tools/audit/**`, and its evidence. |
| E-003 baseline tree inventory | PASS — 59 committed files classified individually. |
| E-004 canonical runtime reachability | PASS — baseline is scaffold/status + references; no canonical runtime entrypoint imports legacy/reference. |
| E-005 broken relative reference review | FINDINGS — missing EventBus/dev/test/assets/dashboard references occur inside legacy/reference material. |
| E-006 migration-document drift | FINDINGS — `STRUCTURE_STATUS.csv` and `ANDROID_UI_PORTING_PLAN.md` contain assertions inconsistent with GitHub live. |
| E-007 duplicate-content review | FINDING — two legacy/provenance security notices share Git blob `b1a168d2a0aa64185c76aea49d44de1a4268d186`. |
| E-008 placeholder review | FINDINGS — selected legacy Manus tools explicitly declare placeholder/compatibility behavior. |
| E-009 removal safety gate | PASS — zero removals; no candidate satisfied both lifecycle and ownership gates. |
| E-010 audit tool syntax | PASS — exact `repository-cleanup-audit.mjs` source passed `node --check` before commit. |
| E-011 post-removal build/test | NOT_APPLICABLE — no removal occurred. Canonical build/test foundation is owned by parallel W00-A/W00-C and is not present on the audited baseline main. |

## Evidence-backed invariants

1. No legacy/reference file was promoted into runtime.
2. No protected path was rewritten or deleted.
3. Every baseline file has a primary classification.
4. Duplicate evidence is recorded without deleting provenance.
5. Broken legacy references are recorded rather than repaired in place.
6. The deprecation lifecycle was not skipped.
7. The audit branch contains only W00-G-owned additions.

## Revalidation required after parallel convergence

When W00-A..F accepted SHAs are merged, rerun:

`node tools/audit/repository-cleanup-audit.mjs .`

Then re-evaluate `DEPRECATED -> QUARANTINED` candidates against the new canonical build/test gates and ownership state.
