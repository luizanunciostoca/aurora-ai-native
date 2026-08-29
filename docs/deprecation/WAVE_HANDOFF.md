# WAVE_HANDOFF — W00-G

## What W00-G completed

- Classified every file in baseline SHA `c61d1f4c534c54e29006b2fa2d87812822e0903d`.
- Added repeatable repository cleanup audit tooling under `tools/audit/**`.
- Recorded duplicate, broken-reference, placeholder, completed-script and provenance findings.
- Created a legacy-to-successor target map.
- Kept all ownership-locked/provenance paths unchanged.
- Advanced only the completed baseline import helper to lifecycle `DEPRECATED`; no lifecycle stage was skipped.

## Coordinator / W00-F handoff

1. Correct or supersede stale live-tree assertions in `docs/migration/STRUCTURE_STATUS.csv` after W00-A..F accepted SHAs are known.
2. Correct the absent Android duplicate-reference assertion in `docs/migration/ANDROID_UI_PORTING_PLAN.md` or explicitly restore that reference strategy through the proper owner.
3. Keep `DEPRECATION_REGISTER` synchronized with DEP-001..DEP-009.
4. After parallel convergence, release/transfer cleanup ownership before any foreign-path quarantine/removal.

## W00-A / W00-C handoff

After canonical package manager/workspace and test/build gates are merged, W00-G (or its successor cleanup wave) must rerun the audit tool and execute the accepted install/test/build commands before any candidate advances beyond `DEPRECATED`.

## Runtime-wave handoff

- Do not import from `**/legacy-reference/**`, `**/legacy-manus-reference/**`, or `reference/**` in canonical runtime.
- If a future implementation needs semantics from a legacy file, create/accept a canonical contract or rewritten implementation first and record lineage.
- Treat historical Manus reports/placeholders as design evidence only.

## Deferred cleanup candidates

- `tools/migration/import-v03-baseline.sh` — DEPRECATED, owner approval required before quarantine.
- duplicated legacy/provenance `SECURITY_NOTICE.txt` pair — retain until provenance decision and successor acceptance explicitly permit deduplication.
- broken legacy Electron package/runtime fragments — retain as reference until canonical successors are accepted; then evaluate quarantine as a unit rather than deleting individual pieces opportunistically.

## Required re-entry condition

A cleanup/removal PR touching protected/shared/foreign paths may start only after:

- accepted SHAs for parallel W00 subwaves are recorded;
- ownership transfer/authorization is explicit;
- audit tool is rerun on the converged tree;
- relevant build/tests are green before the removal.
