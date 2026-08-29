# Aurora AI-Native Workspace Foundation

Canonical package manager: **npm 10.9.2** on **Node 22.16.x**. The root `package-lock.json` is the only active lockfile.

## Clean install

```bash
nvm use
npm ci
npm run workspace:check
npm run workspace:list
npm run lint
npm run typecheck
npm test
npm run build
```

`npm ci` is the canonical fresh-install command. The root `install` lifecycle script verifies the completed workspace install and intentionally does not invoke `npm install` recursively.

## Runtime graph boundary

Only direct package manifests under `apps/*`, `services/*`, `packages/*`, `catalog/*`, `infra/*`, `evals/*`, and `tools/*` are eligible workspaces. Any `package.json` below `reference/`, `legacy-reference/`, `legacy-manus-reference/`, or `source-archives/` is excluded from the canonical runtime dependency graph.

At W00-A baseline closeout, the target runtime directories are structural placeholders. `@aurora/workspace-tools` is the only active workspace package and exists only to make workspace discovery/install validation deterministic until later waves create approved runtime package manifests.
