# W00-C Test Foundation

Status: ACTIVE_BASELINE_TOOLING_WITH_W00A_ROOT_INTEGRATION_PENDING

## Canonical smoke runner

The W00 baseline uses the Node.js built-in `node:test` runner for baseline smoke coverage. This introduces no third-party test framework dependency.

Canonical direct command:

```text
node tools/test/run-tests.mjs
```

## W00-A root integration

W00-A PR #3 already defines the generic workspace test dispatcher as `node ./tools/workspace/run-task.mjs test`. W00-C must not replace that dispatcher. The ownership-safe root integration request is to chain the baseline smoke gate before the generic workspace tests and add a direct smoke alias:

```json
{
  "scripts": {
    "test": "node ./tools/test/run-tests.mjs && node ./tools/workspace/run-task.mjs test",
    "test:smoke": "node ./tools/test/run-tests.mjs"
  }
}
```

This preserves W00-A workspace discovery while making the W00-C smoke gate mandatory. Standard shell `&&` is intentional: a smoke failure prevents later tests and preserves a non-zero exit code; no failure is masked.

## Test strategy

- Unit tests: co-located or package-scoped tests for canonical runtime modules as they are implemented in later waves.
- Contract tests: introduced only after W01 publishes canonical contracts; W00-C does not fabricate missing contracts.
- Integration tests: introduced when multiple implemented components/providers have a stable integration boundary; not part of this baseline.
- Baseline smoke: verifies canonical roots, rejects canonical source dependencies on legacy-reference trees, detects failure-masking operators in W00-C tooling, and reports broken legacy references as non-runtime debt.

## Legacy policy

`apps/**/legacy-reference/**`, `services/**/legacy-manus-reference/**`, and `reference/**` are not runtime authority. Existing Jest/electron-builder configuration under legacy-reference remains audit-only and is not restored or repaired by W00-C.
