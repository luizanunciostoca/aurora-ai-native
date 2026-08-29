# W00-B Code Quality Foundation

This directory owns the reproducible static-quality entrypoints for Aurora AI-Native.

## Canonical tools

- Formatting: Prettier 3.
- Linting: ESLint 9 flat config with `@eslint/js` and `typescript-eslint`.
- Type checking: TypeScript 5.8+ using package-level `tsconfig.json` files that extend `/tsconfig.base.json`.
- Editor conventions: root `.editorconfig`.

There is intentionally no `.eslintignore`: ESLint flat config keeps its canonical ignore policy inside `/eslint.config.mjs`, preventing competing ignore sources.

## Local commands

After W00-A installs the root development dependencies:

```text
node tools/quality/run.mjs format:check
node tools/quality/run.mjs format:write
node tools/quality/run.mjs lint
node tools/quality/run.mjs typecheck
node tools/quality/run.mjs all
```

The runner only resolves tools from the root `node_modules/.bin`, so it follows whichever package manager W00-A selects without creating another lockfile or package-manager island.

## W00-A integration request

Add these root devDependencies using the package manager selected by W00-A and let its canonical lockfile pin the resolved versions:

```json
{
  "@eslint/js": "^9.0.0",
  "eslint": "^9.0.0",
  "prettier": "^3.0.0",
  "typescript": "^5.8.0",
  "typescript-eslint": "^8.0.0"
}
```

Add these root scripts (names may only change if W00-A records the mapping explicitly):

```json
{
  "format": "node tools/quality/run.mjs format:write",
  "format:check": "node tools/quality/run.mjs format:check",
  "lint": "node tools/quality/run.mjs lint",
  "typecheck": "node tools/quality/run.mjs typecheck",
  "quality": "node tools/quality/run.mjs all"
}
```

## Scope and exclusions

Runtime quality gates exclude provenance/reference trees and generated outputs, including `reference/**`, `**/legacy-reference/**`, `**/legacy-manus-reference/**`, dependency caches, build output, and `docs/migration/**`. This is deliberate: those paths are reference/protected material during W00 and must not become runtime gate inputs.

Prettier additionally excludes prose (`*.md`, `*.txt`, `*.csv`) because W00-B owns code/config formatting, not editorial normalization of documentation owned by other waves.

No canonical runtime source directory is globally excluded from ESLint or TypeScript discovery.

## TypeScript baseline behavior

There are no canonical TypeScript projects in the v0.3 baseline. `typecheck` therefore exits successfully with `TYPECHECK_NO_PROJECTS_YET` until a canonical `tsconfig.json` appears under a runtime root. Once one exists, failure to execute `tsc` or any compiler error fails the gate.

Package-level TypeScript projects should extend `/tsconfig.base.json`. Any override that weakens strictness must be justified in the owning wave; new `@ts-ignore`, global ESLint disables, or `// @ts-nocheck` are not accepted as baseline fixes.
