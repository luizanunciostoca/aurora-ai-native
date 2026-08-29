# W00-C Build Foundation

Status: BLOCKED_PENDING_W00A_ACCEPTANCE

## Canonical build gate

W00-A PR #3 introduced the canonical root workspace dispatcher:

```text
npm run build
```

The root script delegates to `tools/workspace/run-task.mjs build`, which validates the workspace, discovers only canonical direct workspaces and runs every active package that declares a `build` script. Protected legacy/reference manifests are excluded by W00-A workspace policy.

W00-C intentionally does **not** maintain a second workspace build orchestrator. An initial C-owned prototype was removed during cleanup after the live W00-A branch exposed the canonical generic dispatcher. This prevents duplicate build graphs and double execution.

## Acceptance dependency

Final W00-C build validation must wait until W00-A is accepted and merged. Then W00-C must run a clean canonical install followed by:

```text
npm run build
```

The command must return the underlying non-zero exit code when any active workspace build fails. A baseline with no active package build tasks may pass only when the canonical workspace dispatcher explicitly reports that state.

## Legacy policy

Legacy `electron-builder` configuration under `apps/**/legacy-reference/**` is not part of the canonical build graph. Broken legacy references are recorded as debt/reference and are not reconstructed by W00-C.
