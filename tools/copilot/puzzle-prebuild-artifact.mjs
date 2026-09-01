import { pathAllowedByPatterns } from './frontier-policy.mjs';

const ARTIFACT_KINDS = new Set(['READINESS', 'GOVERNANCE_ARTIFACT', 'ISOLATED_PATCH']);

function stringArray(value, field) {
  if (!Array.isArray(value) || !value.every((entry) => typeof entry === 'string')) {
    throw new Error(`PREBUILD_ARTIFACT_INVALID ${field} must be a string array`);
  }
  return value;
}

export function validatePrebuildArtifact(artifact, task) {
  if (!artifact || typeof artifact !== 'object') {
    throw new Error('PREBUILD_ARTIFACT_INVALID artifact must be an object');
  }
  if (artifact.schemaVersion !== 1) {
    throw new Error('PREBUILD_ARTIFACT_INVALID schemaVersion must be 1');
  }
  if (artifact.taskId !== task.id) {
    throw new Error(`PREBUILD_ARTIFACT_INVALID taskId ${artifact.taskId} does not match ${task.id}`);
  }
  if (artifact.wave !== task.wave) {
    throw new Error(`PREBUILD_ARTIFACT_INVALID wave ${artifact.wave} does not match ${task.wave}`);
  }
  if (typeof artifact.baseSha !== 'string' || !/^[0-9a-f]{40}$/.test(artifact.baseSha)) {
    throw new Error('PREBUILD_ARTIFACT_INVALID baseSha must be a 40-character git SHA');
  }
  if (!ARTIFACT_KINDS.has(artifact.artifactKind)) {
    throw new Error(`PREBUILD_ARTIFACT_INVALID artifactKind ${artifact.artifactKind}`);
  }
  if (artifact.canonicalAuthority !== false) {
    throw new Error('PREBUILD_ARTIFACT_INVALID canonicalAuthority must be false');
  }
  if (artifact.requiresReconciliation !== true) {
    throw new Error('PREBUILD_ARTIFACT_INVALID requiresReconciliation must be true');
  }

  const missingDependencies = stringArray(artifact.missingDependencies, 'missingDependencies');
  const assumptions = stringArray(artifact.assumptions, 'assumptions');
  const expectedInputContracts = stringArray(
    artifact.expectedInputContracts,
    'expectedInputContracts',
  );
  const observedInputContracts = stringArray(
    artifact.observedInputContracts,
    'observedInputContracts',
  );
  const outputContracts = stringArray(artifact.outputContracts, 'outputContracts');
  const integrationPoints = stringArray(artifact.integrationPoints, 'integrationPoints');
  const changedPaths = stringArray(artifact.changedPaths, 'changedPaths');
  const testsPlanned = stringArray(artifact.testsPlanned, 'testsPlanned');
  const risks = stringArray(artifact.risks, 'risks');
  const blockers = stringArray(artifact.blockers, 'blockers');

  if (artifact.artifactKind === 'ISOLATED_PATCH') {
    if (task.prebuildPolicy !== 'ISOLATED_PATCH' || !task.prebuildAllowedPaths.length) {
      throw new Error(`PREBUILD_ARTIFACT_INVALID ${task.id} is not authorized for patch prebuild`);
    }
    const invalid = changedPaths.filter(
      (filePath) => !pathAllowedByPatterns(filePath, task.prebuildAllowedPaths),
    );
    if (invalid.length) {
      throw new Error(
        `PREBUILD_PATH_FENCE_VIOLATION ${task.id}: ${invalid.join(', ')} outside ${task.prebuildAllowedPaths.join(', ')}`,
      );
    }
  } else if (changedPaths.length) {
    throw new Error(
      `PREBUILD_ARTIFACT_INVALID ${artifact.artifactKind} artifacts may not claim changedPaths`,
    );
  }

  return {
    schemaVersion: 1,
    taskId: artifact.taskId,
    wave: artifact.wave,
    baseSha: artifact.baseSha,
    artifactKind: artifact.artifactKind,
    canonicalAuthority: false,
    requiresReconciliation: true,
    missingDependencies,
    assumptions,
    expectedInputContracts,
    observedInputContracts,
    outputContracts,
    integrationPoints,
    changedPaths,
    testsPlanned,
    risks,
    blockers,
  };
}
