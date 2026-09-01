import assert from 'node:assert/strict';
import test from 'node:test';
import { validatePrebuildArtifact } from './puzzle-prebuild-artifact.mjs';

function task(overrides = {}) {
  return {
    id: 'W04-A',
    wave: 'W04',
    prebuildPolicy: 'READINESS_ONLY',
    prebuildAllowedPaths: [],
    ...overrides,
  };
}

function artifact(overrides = {}) {
  return {
    schemaVersion: 1,
    taskId: 'W04-A',
    wave: 'W04',
    baseSha: 'a'.repeat(40),
    artifactKind: 'READINESS',
    canonicalAuthority: false,
    requiresReconciliation: true,
    missingDependencies: ['W04-00'],
    assumptions: ['ObjectiveRecord shape is not yet accepted'],
    expectedInputContracts: [],
    observedInputContracts: [],
    outputContracts: [],
    integrationPoints: [],
    changedPaths: [],
    testsPlanned: ['terminal transition matrix'],
    risks: [],
    blockers: [],
    ...overrides,
  };
}

test('readiness artifact is accepted only as non-authoritative reconciliation input', () => {
  const result = validatePrebuildArtifact(artifact(), task());
  assert.equal(result.canonicalAuthority, false);
  assert.equal(result.requiresReconciliation, true);
  assert.deepEqual(result.changedPaths, []);
});

test('readiness artifact cannot claim runtime changes', () => {
  assert.throws(
    () =>
      validatePrebuildArtifact(
        artifact({ changedPaths: ['packages/control/src/task.ts'] }),
        task(),
      ),
    /may not claim changedPaths/,
  );
});

test('patch prebuild obeys its explicit path fence', () => {
  const patchTask = task({
    prebuildPolicy: 'ISOLATED_PATCH',
    prebuildAllowedPaths: ['packages/control/src/lifecycle/**'],
  });
  const result = validatePrebuildArtifact(
    artifact({
      artifactKind: 'ISOLATED_PATCH',
      changedPaths: ['packages/control/src/lifecycle/state.ts'],
    }),
    patchTask,
  );
  assert.deepEqual(result.changedPaths, ['packages/control/src/lifecycle/state.ts']);
});

test('patch prebuild rejects paths outside the declared fence', () => {
  const patchTask = task({
    prebuildPolicy: 'ISOLATED_PATCH',
    prebuildAllowedPaths: ['packages/control/src/lifecycle/**'],
  });
  assert.throws(
    () =>
      validatePrebuildArtifact(
        artifact({
          artifactKind: 'ISOLATED_PATCH',
          changedPaths: ['package-lock.json'],
        }),
        patchTask,
      ),
    /PREBUILD_PATH_FENCE_VIOLATION/,
  );
});

test('prebuild artifact can never declare canonical authority', () => {
  assert.throws(
    () => validatePrebuildArtifact(artifact({ canonicalAuthority: true }), task()),
    /canonicalAuthority must be false/,
  );
});
