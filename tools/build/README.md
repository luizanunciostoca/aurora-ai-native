# W00-C Build Foundation

Status: ACTIVE_BASELINE_TOOLING_WITH_W00A_COMPLETION_DEPENDENCY

Canonical direct command:

```text
node tools/build/run-workspace-build.mjs
```

W00-A integration request for the root manifest:

```json
{
  "scripts": {
    "build": "node tools/build/run-workspace-build.mjs"
  }
}
```

The build orchestrator requires the root `package.json` to declare an exact `packageManager` value. Until W00-A integrates that canonical manifest, the command intentionally exits with code 2 and `W00C_BLOCKED_W00A`; this is a real dependency failure, not a masked success.

After W00-A integration, the orchestrator scans canonical roots (`apps`, `services`, `packages`, `catalog`, `infra`, `evals`), excludes legacy/reference trees, validates discovered package manifests, and runs each declared package-level `build` script with the canonical package manager. A scaffold-only baseline with zero package-level build scripts is valid and reported explicitly.

Legacy `electron-builder` configuration is not part of the canonical build graph and is never traversed by this command.
