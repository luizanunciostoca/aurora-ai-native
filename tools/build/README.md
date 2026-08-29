# W00-C Build Foundation

Canonical root build command: `npm run build`.

It delegates to W00-A's single `tools/workspace/run-task.mjs build` dispatcher. Legacy `electron-builder` configuration under `apps/**/legacy-reference/**` is not part of the canonical build graph.
