# W00-B Code Quality Foundation

Canonical tools: Prettier 3, ESLint 9 flat config, TypeScript 5.8+, and root `.editorconfig`.

After `npm ci`, use:

- `npm run format:check`
- `npm run lint`
- `npm run typecheck`
- `npm run quality`

Runtime quality gates exclude `reference/**`, `**/legacy-reference/**`, `**/legacy-manus-reference/**`, generated outputs and `docs/migration/**`. No canonical runtime source root is globally excluded.

`typecheck` succeeds with an explicit `TYPECHECK_NO_PROJECTS_YET` only while no canonical runtime `tsconfig.json` exists; once projects exist, compiler failures fail the gate.
