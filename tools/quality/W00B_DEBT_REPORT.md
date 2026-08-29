# W00-B Static Quality Debt Report

Baseline audited: `c61d1f4c534c54e29006b2fa2d87812822e0903d`.

## Findings

1. No canonical root formatter configuration existed.
2. No canonical ESLint configuration existed.
3. No canonical TypeScript base configuration existed.
4. No `.editorconfig` existed.
5. No canonical TypeScript project (`tsconfig.json`) existed in runtime roots.
6. The only `package.json` in the audited baseline was under `apps/aurora-desktop/legacy-reference/**`; it is reference material and is intentionally outside runtime quality gates.
7. No competing ESLint/Prettier/TypeScript configs or runtime lockfiles were found, so there was no safe obsolete config to delete in W00-B.
8. W00-A still owns the root package manager, lockfile, dependencies, and root scripts. W00-B therefore cannot install or register the quality dependencies/scripts in `/package.json` until W00-A accepts the integration request.

## Temporary / bounded exclusions

- `reference/**`, `**/legacy-reference/**`, `**/legacy-manus-reference/**`: reference/provenance only; never runtime gates in W00-B.
- `docs/migration/**`: protected migration evidence during W00.
- generated/dependency paths (`node_modules`, build/dist/coverage/cache outputs): non-source artifacts.
- prose files are excluded from Prettier only; they are not hidden from security/audit tooling.

These exclusions do not remove canonical runtime source directories from ESLint or TypeScript discovery.

## No-silencing statement

W00-B adds no `eslint-disable`, `@ts-ignore`, `@ts-nocheck`, global rule-off blanket, or TypeScript source exclusion intended to hide compiler errors. ESLint is configured to fail on unused disable directives.

## Completion dependency

W00-B remains completion-blocked until W00-A publishes an accepted workspace/package-manager SHA and incorporates the dependency/script integration request documented in `tools/quality/README.md`, after which the real installed-tool gates must be executed and evidenced.
