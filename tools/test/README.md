# W00-C Test Foundation

Status: ACTIVE_BASELINE_TOOLING

## Canonical runner

The W00 baseline uses the Node.js built-in `node:test` runner for baseline smoke coverage. This introduces no third-party test framework dependency while W00-A owns package-manager/workspace bootstrap.

Canonical direct command:

```text
node tools/test/run-tests.mjs
```

W00-A integration request for the root manifest:

```json
{
  "scripts": {
    "test": "node tools/test/run-tests.mjs",
    "test:smoke": "node --test tools/test/smoke.test.mjs"
  }
}
```

## Test strategy

- Unit tests: co-located or package-scoped tests for canonical runtime modules as they are implemented in later waves.
- Contract tests: introduced only after W01 publishes canonical contracts; W00-C does not fabricate missing contracts.
- Integration tests: introduced when multiple implemented components/providers have a stable integration boundary; not part of this baseline.
- Baseline smoke: verifies canonical roots, rejects canonical source dependencies on legacy-reference trees, detects failure-masking operators in W00-C tooling, and reports broken legacy references as non-runtime debt.

## Legacy policy

`apps/**/legacy-reference/**`, `services/**/legacy-manus-reference/**`, and `reference/**` are not runtime authority. Existing Jest/electron-builder configuration under legacy-reference remains audit-only and is not restored or repaired by W00-C.
