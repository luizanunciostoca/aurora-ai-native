const GIT_SHA = /^[a-f0-9]{40}$/u;
const SHA256 = /^[a-f0-9]{64}$/u;
const HOST_INSTANCE_ID = /^whi_[a-f0-9]{64}$/u;
const ISO_UTC = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/u;

export const REQUIRED_WAKE_SCENARIO_IDS = Object.freeze([
  'WAKE-ACC-001',
  'WAKE-ACC-002',
  'WAKE-LIFE-001',
  'WAKE-LIFE-002',
  'WAKE-LIFE-003',
  'WAKE-LIFE-004',
  'WAKE-AUDIO-001',
  'WAKE-AUDIO-002',
  'WAKE-AUDIO-003',
  'WAKE-AUDIO-004',
  'WAKE-BOUNDARY-001',
  'WAKE-BOUNDARY-002',
  'WAKE-BOUNDARY-003',
  'WAKE-BOUNDARY-004',
  'WAKE-BOUNDARY-005',
  'WAKE-BOUNDARY-006',
  'WAKE-BOUNDARY-007',
  'WAKE-BOUNDARY-008',
  'WAKE-BOUNDARY-009',
  'WAKE-RACE-001',
  'WAKE-RACE-002',
  'WAKE-RACE-003',
  'WAKE-SEC-001',
  'WAKE-SEC-002',
  'WAKE-SEC-003',
  'WAKE-RESOURCE-001',
]);

const REQUIRED_BACKGROUNDS = Object.freeze([
  'quiet',
  'tv',
  'music',
  'conversation',
  'fan',
  'air-conditioning',
]);
const REQUIRED_DISTANCES = Object.freeze([0.5, 1, 2, 3]);
const REQUIRED_VOLUMES = Object.freeze(['low', 'normal', 'loud']);
const REQUIRED_OBSERVATIONS = Object.freeze([
  'ttsSelfWake',
  'bargeIn',
  'audioRoutes',
  'permissionRevocation',
  'privacyMode',
  'rawPcmPersistence',
  'cpu',
  'pss',
  'battery',
  'thermal',
]);

function requiredString(value, label) {
  if (typeof value !== 'string' || value.trim() === '' || value === 'REQUIRED') {
    throw new Error(`${label} is required`);
  }
  return value;
}

function exact(value, pattern, label) {
  const normalized = requiredString(value, label).toLowerCase();
  if (!pattern.test(normalized)) throw new Error(`${label} has invalid format`);
  return normalized;
}

function canonicalHostInstance(value, label) {
  const text = requiredString(value, label);
  if (!HOST_INSTANCE_ID.test(text)) throw new Error(`${label} has invalid format`);
  return text;
}

function positiveInteger(value, label, minimum = 0) {
  if (!Number.isSafeInteger(value) || value < minimum) {
    throw new Error(`${label} must be an integer >= ${minimum}`);
  }
  return value;
}

function semanticUtc(value, label) {
  const text = requiredString(value, label);
  if (!ISO_UTC.test(text)) throw new Error(`${label} must be a canonical UTC timestamp`);
  const timestamp = Date.parse(text);
  if (!Number.isFinite(timestamp)) throw new Error(`${label} is not a real UTC instant`);
  const normalizedInput = text.replace(/\.000Z$/u, 'Z');
  const normalizedDate = new Date(timestamp).toISOString().replace(/\.000Z$/u, 'Z');
  if (normalizedInput !== normalizedDate) {
    throw new Error(`${label} is not a real UTC instant`);
  }
  return timestamp;
}

function validateReference(reference, label, evidenceFiles) {
  const normalized = requiredString(reference, label);
  if (
    normalized.includes('/') ||
    normalized.includes('\\') ||
    normalized === 'evidence-manifest.sha256' ||
    normalized === 'evidence-manifest-preflight.sha256' ||
    normalized === 'wake-evidence.json'
  ) {
    throw new Error(`${label} must identify a top-level non-manifest, non-self evidence file`);
  }
  if (!Object.hasOwn(evidenceFiles, normalized)) {
    throw new Error(`${label} is not bound by the final evidence manifest`);
  }
  if (evidenceFiles[normalized]?.sizeBytes <= 0)
    throw new Error(`${label} points to empty evidence`);
  return normalized;
}

function observed(record, label, allowedStatuses, evidenceFiles, window, primaryReferences) {
  if (!record || typeof record !== 'object') throw new Error(`${label} is required`);
  if (!allowedStatuses.has(record.status))
    throw new Error(`${label}.status must be physical PASS/OBSERVED`);
  const observedAt = semanticUtc(record.observedAtUtc, `${label}.observedAtUtc`);
  if (observedAt < window.start || observedAt > window.finish) {
    throw new Error(`${label}.observedAtUtc is outside the wake physical window`);
  }
  if (!Array.isArray(record.evidenceReferences) || record.evidenceReferences.length === 0) {
    throw new Error(`${label}.evidenceReferences must not be empty`);
  }
  record.evidenceReferences.forEach((reference, index) =>
    validateReference(reference, `${label}.evidenceReferences[${index}]`, evidenceFiles),
  );
  const primary = record.evidenceReferences[0];
  if (primaryReferences.has(primary)) {
    throw new Error(`${label} reuses another wake record's primary evidence reference`);
  }
  primaryReferences.add(primary);
}

function exactSet(actual, required, label) {
  if (!Array.isArray(actual)) throw new Error(`${label} is required`);
  const values = new Set(actual);
  if (values.size !== actual.length || values.size !== required.length) {
    throw new Error(`${label} must contain each canonical value exactly once and no extras`);
  }
  for (const value of required) {
    if (!values.has(value)) throw new Error(`${label} is missing ${value}`);
  }
}

function match(value, expected, label) {
  if (value !== expected) throw new Error(`${label} does not match trusted provenance`);
}

export function validateW15JWakeEvidence(wake, expected, evidenceFiles = {}) {
  if (!wake || typeof wake !== 'object') throw new Error('canonical wake evidence is required');
  if (!expected || typeof expected !== 'object')
    throw new Error('trusted wake provenance is required');
  if (wake.schemaVersion !== '1.1.0') throw new Error('wake schemaVersion 1.1.0 is required');
  if (wake.status !== 'READY_FOR_INDEPENDENT_REVIEW') {
    throw new Error('wake status must be READY_FOR_INDEPENDENT_REVIEW after physical collection');
  }
  if (wake.authorityInvariant !== 'INTELLIGENCE != AUTHORITY != EXECUTION') {
    throw new Error('wake authority invariant is invalid');
  }

  const candidate = wake.candidate;
  match(
    exact(candidate?.gitSha, GIT_SHA, 'wake.candidate.gitSha'),
    expected.androidCandidateSha,
    'wake.candidate.gitSha',
  );
  match(
    exact(candidate?.hostGitSha, GIT_SHA, 'wake.candidate.hostGitSha'),
    expected.hostCandidateSha,
    'wake.candidate.hostGitSha',
  );
  match(
    canonicalHostInstance(candidate?.hostInstanceId, 'wake.candidate.hostInstanceId'),
    expected.environment.hostInstanceId,
    'wake.candidate.hostInstanceId',
  );
  match(
    exact(candidate?.mainGitSha, GIT_SHA, 'wake.candidate.mainGitSha'),
    expected.reconciledMainSha,
    'wake.candidate.mainGitSha',
  );
  match(
    exact(candidate?.packagingGitSha, GIT_SHA, 'wake.candidate.packagingGitSha'),
    expected.packagingHeadSha,
    'wake.candidate.packagingGitSha',
  );
  match(
    requiredString(candidate?.artifactId, 'wake.candidate.artifactId'),
    expected.artifact.id,
    'wake.candidate.artifactId',
  );
  match(
    requiredString(candidate?.artifactName, 'wake.candidate.artifactName'),
    expected.artifact.name,
    'wake.candidate.artifactName',
  );
  match(
    exact(candidate?.artifactZipSha256, SHA256, 'wake.candidate.artifactZipSha256'),
    expected.artifact.zipSha256,
    'wake.candidate.artifactZipSha256',
  );
  for (const field of ['apkVariant', 'applicationId', 'versionCode', 'versionName']) {
    const expectedField = field === 'apkVariant' ? 'variant' : field;
    match(
      requiredString(candidate?.[field], `wake.candidate.${field}`),
      expected.apk[expectedField],
      `wake.candidate.${field}`,
    );
  }
  match(
    exact(candidate?.apkSha256, SHA256, 'wake.candidate.apkSha256'),
    expected.apk.sha256,
    'wake.candidate.apkSha256',
  );

  const device = wake.device;
  for (const field of ['manufacturer', 'model', 'product', 'buildFingerprint', 'apiLevel']) {
    match(
      requiredString(device?.[field], `wake.device.${field}`),
      expected.device[field],
      `wake.device.${field}`,
    );
  }
  match(
    exact(device?.serialSha256, SHA256, 'wake.device.serialSha256'),
    expected.device.serialSha256,
    'wake.device.serialSha256',
  );
  if (device?.physicalDeviceVerified !== true)
    throw new Error('wake.device.physicalDeviceVerified must be true');

  for (const field of [
    'assistantRoleHolder',
    'recordAudioPermission',
    'wakeModelVersion',
    'sensitivity',
    'privacyMode',
    'foregroundServiceState',
    'audioRoute',
    'batteryOptimizationState',
  ])
    requiredString(wake.runtime?.[field], `wake.runtime.${field}`);

  for (const field of ['w04RegistryVersion', 'w15gVocabularyVersion']) {
    requiredString(wake.governedProjection?.[field], `wake.governedProjection.${field}`);
  }
  for (const field of ['w04ContentSha256', 'w15gContentSha256']) {
    exact(wake.governedProjection?.[field], SHA256, `wake.governedProjection.${field}`);
  }
  for (const field of ['w04SourceRef', 'w15gSourceRef', 'w07IngressReference']) {
    validateReference(
      wake.governedProjection?.[field],
      `wake.governedProjection.${field}`,
      evidenceFiles,
    );
  }

  for (const field of [
    'operatorId',
    'startedAtUtc',
    'finishedAtUtc',
    'attestationReference',
    'independentReviewReference',
  ]) {
    requiredString(wake.operator?.[field], `wake.operator.${field}`);
  }
  const wakeStartedAt = semanticUtc(wake.operator.startedAtUtc, 'wake.operator.startedAtUtc');
  const wakeFinishedAt = semanticUtc(wake.operator.finishedAtUtc, 'wake.operator.finishedAtUtc');
  if (wakeStartedAt > wakeFinishedAt) {
    throw new Error('wake operator timeline must have startedAtUtc <= finishedAtUtc');
  }
  match(wake.operator.operatorId, expected.operator, 'wake.operator.operatorId');
  if (wake.operator.attestationReference === wake.operator.independentReviewReference) {
    throw new Error('wake operator and independent reviewer references must be distinct');
  }
  validateReference(
    wake.operator.attestationReference,
    'wake.operator.attestationReference',
    evidenceFiles,
  );
  if (
    wake.operator.attestationReference !== expected.attestations?.operator?.reference ||
    wake.operator.independentReviewReference !== expected.attestations?.reviewer?.reference
  ) {
    throw new Error('wake attestations do not match parsed trusted attestations');
  }

  const accuracy = wake.accuracy;
  const attempts = positiveInteger(
    accuracy?.deliberateAttempts,
    'wake.accuracy.deliberateAttempts',
    100,
  );
  const confirmed = positiveInteger(accuracy?.confirmedWakes, 'wake.accuracy.confirmedWakes');
  const rejected = positiveInteger(accuracy?.rejectedWakes, 'wake.accuracy.rejectedWakes');
  if (confirmed + rejected !== attempts) throw new Error('wake accuracy totals do not reconcile');
  positiveInteger(
    accuracy?.passiveObservationMinutes,
    'wake.accuracy.passiveObservationMinutes',
    1,
  );
  positiveInteger(accuracy?.passiveFalseWakes, 'wake.accuracy.passiveFalseWakes');
  validateReference(
    accuracy?.passiveEvidenceReference,
    'wake.accuracy.passiveEvidenceReference',
    evidenceFiles,
  );
  if (
    !Array.isArray(accuracy?.speakerIds) ||
    accuracy.speakerIds.some((value) => typeof value !== 'string' || value.trim() === '') ||
    new Set(accuracy.speakerIds.filter((value) => typeof value === 'string' && value.trim())).size <
      2 ||
    new Set(accuracy.speakerIds).size !== accuracy.speakerIds.length
  ) {
    throw new Error('wake.accuracy.speakerIds must contain at least two voices');
  }
  exactSet(accuracy.distancesMeters, REQUIRED_DISTANCES, 'wake.accuracy.distancesMeters');
  exactSet(accuracy.volumes, REQUIRED_VOLUMES, 'wake.accuracy.volumes');
  exactSet(accuracy.backgrounds, REQUIRED_BACKGROUNDS, 'wake.accuracy.backgrounds');

  if (!Array.isArray(wake.attempts) || wake.attempts.length !== attempts) {
    throw new Error('wake.attempts must contain one record for every deliberate attempt');
  }
  const attemptIds = new Set();
  const wakeWindow = { start: wakeStartedAt, finish: wakeFinishedAt };
  let observedConfirmed = 0;
  let observedRejected = 0;
  const observedSpeakers = new Set();
  const observedDistances = new Set();
  const observedVolumes = new Set();
  const observedBackgrounds = new Set();
  for (const [index, attempt] of wake.attempts.entries()) {
    const label = `wake.attempts[${index}]`;
    const canonicalAttemptKeys = [
      'background',
      'distanceMeters',
      'evidenceReference',
      'id',
      'latencyMs',
      'observedAtUtc',
      'result',
      'speakerId',
      'volume',
    ];
    if (
      Object.keys(attempt || {})
        .sort()
        .join(',') !== canonicalAttemptKeys.sort().join(',')
    ) {
      throw new Error(`${label} must contain exactly the canonical attempt fields`);
    }
    const id = requiredString(attempt?.id, `${label}.id`);
    if (attemptIds.has(id)) throw new Error(`duplicate wake attempt id ${id}`);
    attemptIds.add(id);
    if (!accuracy.speakerIds.includes(attempt.speakerId))
      throw new Error(`${label}.speakerId is not canonical`);
    if (!REQUIRED_DISTANCES.includes(attempt.distanceMeters))
      throw new Error(`${label}.distanceMeters is not canonical`);
    if (!REQUIRED_VOLUMES.includes(attempt.volume))
      throw new Error(`${label}.volume is not canonical`);
    if (!REQUIRED_BACKGROUNDS.includes(attempt.background))
      throw new Error(`${label}.background is not canonical`);
    if (attempt.result === 'CONFIRMED') observedConfirmed += 1;
    else if (attempt.result === 'REJECTED') observedRejected += 1;
    else throw new Error(`${label}.result is invalid`);
    if (!Number.isFinite(attempt.latencyMs) || attempt.latencyMs < 0)
      throw new Error(`${label}.latencyMs is invalid`);
    const attemptTime = semanticUtc(attempt.observedAtUtc, `${label}.observedAtUtc`);
    if (attemptTime < wakeWindow.start || attemptTime > wakeWindow.finish) {
      throw new Error(`${label}.observedAtUtc is outside the wake physical window`);
    }
    validateReference(attempt.evidenceReference, `${label}.evidenceReference`, evidenceFiles);
    observedSpeakers.add(attempt.speakerId);
    observedDistances.add(attempt.distanceMeters);
    observedVolumes.add(attempt.volume);
    observedBackgrounds.add(attempt.background);
  }
  if (observedConfirmed !== confirmed || observedRejected !== rejected) {
    throw new Error('wake attempt results do not reconcile with accuracy totals');
  }
  for (const [label, observed, requiredValues] of [
    ['speakers', observedSpeakers, new Set(accuracy.speakerIds)],
    ['distances', observedDistances, new Set(REQUIRED_DISTANCES)],
    ['volumes', observedVolumes, new Set(REQUIRED_VOLUMES)],
    ['backgrounds', observedBackgrounds, new Set(REQUIRED_BACKGROUNDS)],
  ]) {
    if (
      observed.size !== requiredValues.size ||
      [...requiredValues].some((value) => !observed.has(value))
    ) {
      throw new Error(`wake attempts do not cover all canonical ${label}`);
    }
  }

  if (!Array.isArray(wake.scenarios)) throw new Error('wake.scenarios is required');
  const scenarioById = new Map();
  const primaryReferences = new Set();
  for (const scenario of wake.scenarios) {
    const id = requiredString(scenario?.id, 'wake scenario id');
    if (scenarioById.has(id)) throw new Error(`duplicate wake scenario ${id}`);
    scenarioById.set(id, scenario);
  }
  if (scenarioById.size !== REQUIRED_WAKE_SCENARIO_IDS.length) {
    throw new Error('wake scenario matrix must contain exactly the canonical mandatory scenarios');
  }
  for (const id of REQUIRED_WAKE_SCENARIO_IDS) {
    const scenario = scenarioById.get(id);
    if (!scenario) throw new Error(`wake scenario ${id} is required`);
    if (scenario.mandatory !== true) throw new Error(`wake scenario ${id} must remain mandatory`);
    observed(
      scenario,
      `wake scenario ${id}`,
      new Set(['PASS']),
      evidenceFiles,
      wakeWindow,
      primaryReferences,
    );
  }

  for (const key of REQUIRED_OBSERVATIONS.slice(0, 6)) {
    const record = wake.mandatoryObservations?.[key];
    observed(
      record,
      `wake.mandatoryObservations.${key}`,
      new Set(['PASS']),
      evidenceFiles,
      wakeWindow,
      primaryReferences,
    );
  }
  for (const key of REQUIRED_OBSERVATIONS.slice(6)) {
    const record = wake.mandatoryObservations?.[key];
    observed(
      record,
      `wake.mandatoryObservations.${key}`,
      new Set(['OBSERVED']),
      evidenceFiles,
      wakeWindow,
      primaryReferences,
    );
  }
  if (wake.mandatoryObservations.rawPcmPersistence.persisted !== false) {
    throw new Error('wake raw PCM persistence must be false');
  }
  const routes = wake.mandatoryObservations.audioRoutes.routes;
  if (!Array.isArray(routes) || !routes.includes('built-in') || routes.length < 2) {
    throw new Error('wake audio routes must include built-in and a representative secondary route');
  }

  for (const key of ['A', 'B', 'C', 'D']) {
    observed(
      wake.riskGates?.[key],
      `wake.riskGates.${key}`,
      new Set(['PASS']),
      evidenceFiles,
      wakeWindow,
      primaryReferences,
    );
  }
  if (wake.rawEvidence?.directory !== '.') throw new Error('wake.rawEvidence.directory must be .');
  if (wake.rawEvidence?.sha256Manifest !== 'evidence-manifest.sha256') {
    throw new Error('wake.rawEvidence.sha256Manifest must be evidence-manifest.sha256');
  }

  return Object.freeze({
    schemaVersion: wake.schemaVersion,
    deliberateAttempts: attempts,
    scenarioCount: REQUIRED_WAKE_SCENARIO_IDS.length,
    lintReadyForIndependentReview: true,
    physicallyAccepted: false,
  });
}
