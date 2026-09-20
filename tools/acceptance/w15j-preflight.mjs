import { readFileSync } from 'node:fs';

import { buildTrustedW15JPreflight } from './w15j-trusted-preflight-from-collector.mjs';

const SHA256 = /^[a-f0-9]{64}$/u;
const GIT_SHA = /^[a-f0-9]{40}$/u;
const REQUIRED_SCENARIO_GROUPS = Object.freeze({
  lifecycleAndProcessRestart: [
    'coldLaunchFromStoppedProcess',
    'foregroundBackgroundForeground',
    'forcedProcessStopAndRelaunch',
    'processDeathWithSafeDeferredWork',
    'processDeathAfterNativeDispatchBoundaryReconciliationOnly',
  ],
  deviceIdentityRegistrationAndSession: [
    'keystoreRegistrationOverRealSameSocketGateway',
    'sessionBoundToCurrentDeviceRef',
    'freshSocketReconnectAndSessionResume',
    'sessionRotation',
    'expiredSessionRejected',
    'revokedSessionRejected',
    'compromisedReinstalledKeyInvalidatedRecovery',
    'staleRegistrationOrSessionFailsClosed',
    'clientAuthorityFieldsAbsentOrRejected',
  ],
  capabilityAndPermissionPreconditions: [
    'freshSupportedCapabilityAvailable',
    'staleCapabilityFailsClosed',
    'runtimePermissionDenied',
    'permissionRevokedAfterGrant',
    'backgroundRestrictionApplied',
    'permissionNeverGrantsAuroraAuthority',
  ],
  installedAppIntegration: [
    'expectedPackagePresent',
    'appMissing',
    'wrongOrReplacedPackageSignatureMismatch',
    'invalidOrUntrustedIntentDeepLink',
    'supportedGovernedLaunchOrAction',
    'osAppReadbackEvidence',
  ],
  governedNativeExecution: [
    'currentDeviceAuthorizationDispatchesExactlyOnce',
    'missingOrStaleAuthorityBlocksDispatch',
    'killSwitchBeforeDispatchBlocks',
    'cancellationBeforeDispatchBlocks',
    'cancelKillRaceAfterDispatchIsUncertain',
    'ambiguousNativeResultIsUncertain',
    'verifiedOutcomeProducesEvidenceWithoutRetryAuthority',
  ],
  offlineReconnectDedupeAndLateEvidence: [
    'prolongedOfflineSafeDeferredOnly',
    'freshSocketReconnectPreservesPreviousConnectionEvidence',
    'duplicateCommandIdempotencyAcrossReconnect',
    'processRestartWithQueuedWork',
    'staleOrExpiredAuthorityDoesNotReplay',
    'w03InflightOrUncertainIsReconciliationOnly',
    'lateReceiptBoundToPriorConnectionGeneration',
    'crashFencedReconciliationRequiredDoesNotAutoDispatch',
    'postWriteTransportLossIsUncertainNoAutoRetry',
  ],
  voiceAndPresence: [
    'validDeterministicCommonCommand',
    'falseWakeDoesNotDispatch',
    'ambiguousTranscriptEscalates',
    'lifecyclePrivacyRestrictionBlocksFastPath',
    'permissionCapabilityDenialBlocksFastPath',
    'confidenceNeverBecomesAuthority',
  ],
});

export const REQUIRED_DP5_SCENARIO_PATHS = Object.freeze(
  Object.entries(REQUIRED_SCENARIO_GROUPS).flatMap(([group, scenarios]) =>
    scenarios.map((scenario) => `${group}.${scenario}`),
  ),
);

export const REQUIRED_THREAT_REVIEW_KEYS = Object.freeze([
  'packageImpersonationOrConfusion',
  'secretOrKeystoreLeakage',
  'gatewayCredentialOrProofLeakage',
  'staleOrRevokedSessionReuse',
  'replayAfterProcessDeathOrReconnect',
  'lateOrForgedReceiptEvidence',
  'sameSocketBindingBypassOrRebinding',
  'permissionDriftOrPrivilegeEscalation',
  'deviceOwnerLauncherPrivilege',
  'uiAutomationAccessibilityFallback',
  'localStorageCorruptionOrTampering',
  'debugTestBuildMisuse',
  'localCleartextAdbReverseEscape',
]);

const REQUIRED_RESOURCE_KEYS = Object.freeze([
  'coldStartup',
  'warmStartup',
  'gatewayReconnect',
  'batteryWindow',
  'cpu',
  'memory',
  'storage',
  'foregroundService',
]);

const REQUIRED_RISK_GATES = Object.freeze([
  'A_AUTHORITY',
  'B_RUNTIME_RECONCILIATION',
  'C_REPLAY_IDEMPOTENCY',
  'D_EVIDENCE_OBSERVABILITY',
]);
const REQUIRED_RESOURCE_EVIDENCE = Object.freeze({
  coldStartup: ['cold-start.txt', 'cold-start.txt.exit-code'],
  warmStartup: ['warm-start.txt', 'warm-start.txt.exit-code'],
  gatewayReconnect: ['gateway-reconnect.txt', 'gateway-reconnect.txt.exit-code'],
  batteryWindow: [
    'battery-before.txt',
    'battery-before.txt.exit-code',
    'battery-after.txt',
    'battery-after.txt.exit-code',
  ],
  cpu: [
    'cpuinfo-after-restart.txt',
    'cpuinfo-after-restart.txt.exit-code',
    'cpuinfo-after.txt',
    'cpuinfo-after.txt.exit-code',
  ],
  memory: [
    'meminfo-after-warm-start.txt',
    'meminfo-after-warm-start.txt.exit-code',
    'meminfo-after.txt',
    'meminfo-after.txt.exit-code',
  ],
  storage: [
    'storage-after-restart.txt',
    'storage-after-restart.txt.exit-code',
    'storage-after.txt',
    'storage-after.txt.exit-code',
  ],
  foregroundService: [
    'services-after-restart.txt',
    'services-after-restart.txt.exit-code',
    'services-after.txt',
    'services-after.txt.exit-code',
  ],
});

const REQUIRED_REVERSE_PORTS = Object.freeze([8080, 8081]);
const REQUIRED_COLLECTOR_KEYS = Object.freeze([
  'rawDirectory',
  'preflightMetadata',
  'finalizeMetadata',
  'sha256Manifest',
  'adbReverseCleanup',
]);
const REQUIRED_STATUSES = new Set(['NOT_RUN', 'FAIL', 'BLOCKED']);
const ISO_UTC = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/u;

function requiredString(value, label) {
  if (typeof value !== 'string' || value.trim() === '') throw new Error(`${label} is required`);
  if (value === 'REQUIRED') throw new Error(`${label} is not populated`);
  return value;
}

function exactSha(value, label, pattern) {
  const normalized = requiredString(value, label).toLowerCase();
  if (!pattern.test(normalized)) throw new Error(`${label} has an invalid format`);
  return normalized;
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

function evidenceReference(reference, label, manifestFiles, allowWakeRecord = false) {
  const value = requiredString(reference, label);
  if (
    value.includes('/') ||
    value.includes('\\') ||
    value === 'evidence-manifest.sha256' ||
    value === 'evidence-manifest-preflight.sha256' ||
    (!allowWakeRecord && value === 'wake-evidence.json')
  ) {
    throw new Error(`${label} must identify a top-level non-manifest, non-self evidence file`);
  }
  if (!Object.hasOwn(manifestFiles, value)) {
    throw new Error(`${label} is not bound by the final evidence manifest`);
  }
  if (manifestFiles[value]?.sizeBytes <= 0) throw new Error(`${label} points to empty evidence`);
}

function observedRecord(record, label, allowedStatuses, manifestFiles, window, primaryReferences) {
  if (!record || typeof record !== 'object') throw new Error(`${label} is required`);
  if (REQUIRED_STATUSES.has(record.status))
    throw new Error(`${label} must not be ${record.status}`);
  if (!allowedStatuses.has(record.status)) throw new Error(`${label}.status is invalid`);
  const observedAt = semanticUtc(record.observedAtUtc, `${label}.observedAtUtc`);
  if (observedAt < window.start || observedAt > window.finish) {
    throw new Error(`${label}.observedAtUtc is outside the collector physical window`);
  }
  if (!Array.isArray(record.evidenceReferences) || record.evidenceReferences.length === 0) {
    throw new Error(`${label}.evidenceReferences must not be empty`);
  }
  record.evidenceReferences.forEach((reference, index) =>
    evidenceReference(reference, `${label}.evidenceReferences[${index}]`, manifestFiles),
  );
  const primary = record.evidenceReferences[0];
  if (primaryReferences.has(primary)) {
    throw new Error(`${label} reuses another W15-J record's primary evidence reference`);
  }
  primaryReferences.add(primary);
}

function canonicalScenario(dossier, path) {
  const [group, scenario] = path.split('.');
  return dossier.scenarios?.[group]?.[scenario];
}

export function validateW15JPreflight(dossier, preflight = {}) {
  if (!dossier || typeof dossier !== 'object')
    throw new Error('canonical W15J dossier is required');
  if (dossier.schemaVersion !== '1.2.0' || dossier.wave !== 'W15-J') {
    throw new Error('canonical W15J schemaVersion 1.2.0 is required');
  }
  if (dossier.authorityInvariant !== 'INTELLIGENCE != AUTHORITY != EXECUTION')
    throw new Error('authorityInvariant must preserve the exact Aurora boundary');
  if (dossier.dp4Status !== 'OPEN') throw new Error('dp4Status must remain OPEN');
  if (dossier.dp4PublicationReference !== 'issue:115#issuecomment-5547053471') {
    throw new Error('canonical DP4 publication reference is required');
  }
  if (dossier.dp5Status !== 'CLOSED_PHYSICAL_EVIDENCE_INCOMPLETE') {
    throw new Error('dp5Status must remain CLOSED_PHYSICAL_EVIDENCE_INCOMPLETE');
  }

  const candidateSha = exactSha(dossier.candidateSha, 'candidateSha', GIT_SHA);
  const expected = preflight.expected;
  if (!expected || typeof expected !== 'object') {
    throw new Error('preflight.expected trusted provenance tuple is required');
  }
  if (preflight.schemaVersion !== 'w15j-trusted-preflight-v2') {
    throw new Error('trusted preflight schema w15j-trusted-preflight-v2 is required');
  }
  if (
    preflight.physicallyAccepted !== false ||
    preflight.trustRoot?.liveGitHubRevalidation !==
      'EXTERNAL_REQUIRED_IMMEDIATELY_BEFORE_ACCEPTANCE'
  ) {
    throw new Error('trusted preflight must preserve external live GitHub revalidation');
  }
  const manifestFiles = preflight.evidenceManifest?.files;
  if (!manifestFiles || typeof manifestFiles !== 'object') {
    throw new Error('trusted final evidence manifest is required');
  }
  if (preflight.evidenceManifest?.fileName !== 'evidence-manifest.sha256') {
    throw new Error('trusted final evidence manifest filename is invalid');
  }
  exactSha(preflight.evidenceManifest?.sha256, 'preflight.evidenceManifest.sha256', SHA256);

  if (
    candidateSha !==
    exactSha(expected.androidCandidateSha, 'preflight.expected.androidCandidateSha', GIT_SHA)
  ) {
    throw new Error('candidateSha does not match trusted preflight');
  }
  const provenance = dossier.provenance;
  if (provenance?.repository !== expected.repository) {
    throw new Error('provenance.repository does not match trusted Control Tower tuple');
  }
  for (const field of ['id', 'url', 'status', 'headSha', 'sourceRef']) {
    if (provenance.workflowRun?.[field] !== expected.workflowRun?.[field]) {
      throw new Error(`provenance.workflowRun.${field} does not match trusted Control Tower tuple`);
    }
  }
  for (const [field, expectedField] of [
    ['androidCandidateSha', 'androidCandidateSha'],
    ['hostCandidateSha', 'hostCandidateSha'],
    ['reconciledMainSha', 'reconciledMainSha'],
    ['packagingHeadSha', 'packagingHeadSha'],
  ]) {
    if (exactSha(provenance?.[field], `provenance.${field}`, GIT_SHA) !== expected[expectedField]) {
      throw new Error(`provenance.${field} does not match trusted preflight`);
    }
  }
  if (provenance.androidCandidateSha !== candidateSha) {
    throw new Error('provenance.androidCandidateSha must equal candidateSha');
  }
  for (const field of ['id', 'name', 'digestSourceRef']) {
    if (
      requiredString(provenance.artifact?.[field], `provenance.artifact.${field}`) !==
      expected.artifact?.[field]
    ) {
      throw new Error(`provenance.artifact.${field} does not match trusted preflight`);
    }
  }
  if (
    exactSha(provenance.artifact?.zipSha256, 'provenance.artifact.zipSha256', SHA256) !==
    expected.artifact?.zipSha256
  ) {
    throw new Error('provenance.artifact.zipSha256 does not match trusted preflight');
  }
  const apk = dossier.apk;
  exactSha(apk?.sha256, 'apk.sha256', SHA256);
  requiredString(apk?.applicationId, 'apk.applicationId');
  requiredString(apk?.variant, 'apk.variant');
  requiredString(apk?.versionCode, 'apk.versionCode');
  requiredString(apk?.versionName, 'apk.versionName');

  const device = dossier.device;
  exactSha(device?.serialSha256, 'device.serialSha256', SHA256);
  for (const field of ['manufacturer', 'model', 'product', 'apiLevel', 'buildFingerprint']) {
    requiredString(device?.[field], `device.${field}`);
  }
  if (device.physicalDeviceVerified !== true)
    throw new Error('device.physicalDeviceVerified must be true');

  const environment = dossier.environment;
  requiredString(environment?.gatewayIdentity, 'environment.gatewayIdentity');
  requiredString(environment?.gatewayVersion, 'environment.gatewayVersion');
  if (!/^whi_[0-9a-f]{64}$/u.test(environment?.hostInstanceId ?? '')) {
    throw new Error('environment.hostInstanceId must be a canonical local host instance id');
  }
  if (environment?.gatewayTransport !== 'LOCAL_ADB_REVERSE_ONLY') {
    throw new Error('environment.gatewayTransport must be LOCAL_ADB_REVERSE_ONLY');
  }
  requiredString(environment?.operator, 'environment.operator');
  if (environment?.adbReversePort !== 8080) {
    throw new Error('environment.adbReversePort must be 8080');
  }
  const collectorWindow = {
    start: semanticUtc(environment?.preflightObservedAtUtc, 'environment.preflightObservedAtUtc'),
    finish: semanticUtc(environment?.finalizedAtUtc, 'environment.finalizedAtUtc'),
  };
  if (collectorWindow.start > collectorWindow.finish) {
    throw new Error('collector physical window timestamps are out of order');
  }
  if (environment.operator !== expected.operator) {
    throw new Error('environment.operator does not match collector operator');
  }
  for (const field of ['preflightObservedAtUtc', 'finalizedAtUtc']) {
    if (environment[field] !== expected[field]) {
      throw new Error(`environment.${field} does not match collector timestamp`);
    }
  }

  const expectedApk = expected.apk;
  for (const field of ['applicationId', 'variant', 'versionCode', 'versionName']) {
    if (apk[field] !== requiredString(expectedApk?.[field], `preflight.expected.apk.${field}`)) {
      throw new Error(`apk.${field} does not match trusted preflight`);
    }
  }
  if (
    apk.sha256.toLowerCase() !==
    exactSha(expectedApk?.sha256, 'preflight.expected.apk.sha256', SHA256)
  ) {
    throw new Error('apk.sha256 does not match trusted preflight');
  }
  const expectedDevice = expected.device;
  for (const field of ['manufacturer', 'model', 'product', 'apiLevel', 'buildFingerprint']) {
    if (
      device[field] !==
      requiredString(expectedDevice?.[field], `preflight.expected.device.${field}`)
    ) {
      throw new Error(`device.${field} does not match trusted preflight`);
    }
  }
  if (
    device.serialSha256.toLowerCase() !==
    exactSha(expectedDevice?.serialSha256, 'preflight.expected.device.serialSha256', SHA256)
  ) {
    throw new Error('device.serialSha256 does not match trusted preflight');
  }
  for (const field of ['gatewayIdentity', 'gatewayVersion', 'hostInstanceId']) {
    if (
      environment[field] !==
      requiredString(expected.environment?.[field], `preflight.expected.environment.${field}`)
    ) {
      throw new Error(`environment.${field} does not match trusted preflight`);
    }
  }
  if (environment.gatewayTransport !== expected.environment?.gatewayTransport) {
    throw new Error('environment.gatewayTransport does not match trusted preflight');
  }

  const mappings = preflight.adbReverseMappings;
  if (!Array.isArray(mappings)) throw new Error('preflight.adbReverseMappings is required');
  for (const port of REQUIRED_REVERSE_PORTS) {
    const mapping = mappings.find((entry) => entry?.port === port);
    if (
      !mapping ||
      mapping.status !== 'PRESENT_DURING_WINDOW_REMOVED_AT_FINALIZE' ||
      mapping.host !== 'tcp'
    ) {
      throw new Error(`ADB reverse mapping tcp:${port} lacks governed-window and cleanup proof`);
    }
  }

  const primaryReferences = new Set();
  for (const path of REQUIRED_DP5_SCENARIO_PATHS) {
    observedRecord(
      canonicalScenario(dossier, path),
      `scenario ${path}`,
      new Set(['PASS']),
      manifestFiles,
      collectorWindow,
      primaryReferences,
    );
  }
  for (const key of REQUIRED_THREAT_REVIEW_KEYS) {
    const record = dossier.threatReview?.[key];
    observedRecord(
      record,
      `threatReview.${key}`,
      new Set(['PASS', 'HANDED_OFF']),
      manifestFiles,
      collectorWindow,
      primaryReferences,
    );
    if (record.status === 'HANDED_OFF')
      requiredString(record.downstreamOwner, `threatReview.${key}.downstreamOwner`);
  }
  for (const key of REQUIRED_RESOURCE_KEYS) {
    const record = dossier.resourceObservations?.[key];
    observedRecord(
      record,
      `resourceObservations.${key}`,
      new Set(['OBSERVED']),
      manifestFiles,
      collectorWindow,
      primaryReferences,
    );
    for (const requiredReference of REQUIRED_RESOURCE_EVIDENCE[key]) {
      if (!record.evidenceReferences.includes(requiredReference)) {
        throw new Error(`resourceObservations.${key} must reference ${requiredReference}`);
      }
    }
  }
  for (const key of REQUIRED_RISK_GATES) {
    observedRecord(
      dossier.riskGates?.[key],
      `riskGates.${key}`,
      new Set(['PASS']),
      manifestFiles,
      collectorWindow,
      primaryReferences,
    );
  }

  const sourceEvidence = preflight.sourceEvidence;
  for (const key of REQUIRED_COLLECTOR_KEYS) {
    const value = requiredString(dossier.collectorEvidence?.[key], `collectorEvidence.${key}`);
    if (value !== sourceEvidence?.[key]) {
      throw new Error(`collectorEvidence.${key} does not match trusted collector source`);
    }
    if (key !== 'rawDirectory' && key !== 'sha256Manifest') {
      evidenceReference(value, `collectorEvidence.${key}`, manifestFiles);
    }
  }
  if (
    Object.keys(dossier.collectorEvidence || {})
      .sort()
      .join(',') !== REQUIRED_COLLECTOR_KEYS.slice().sort().join(',')
  ) {
    throw new Error('collectorEvidence must contain exactly the canonical required keys');
  }
  if (!Array.isArray(dossier.evidenceReferences) || dossier.evidenceReferences.length === 0) {
    throw new Error('evidenceReferences must not be empty');
  }
  dossier.evidenceReferences.forEach((reference, index) =>
    evidenceReference(reference, `evidenceReferences[${index}]`, manifestFiles),
  );
  evidenceReference(
    dossier.finalization?.operatorAttestationReference,
    'finalization.operatorAttestationReference',
    manifestFiles,
  );
  requiredString(
    dossier.finalization?.independentReviewReference,
    'finalization.independentReviewReference',
  );
  if (
    dossier.finalization.operatorAttestationReference !==
      expected.attestations?.operator?.reference ||
    dossier.finalization.independentReviewReference !== expected.attestations?.reviewer?.reference
  ) {
    throw new Error('finalization attestations do not match parsed trusted attestations');
  }
  if (
    dossier.finalization.operatorAttestationReference ===
    dossier.finalization.independentReviewReference
  ) {
    throw new Error('operator and independent reviewer references must be distinct');
  }
  if (dossier.finalization?.mandatoryScenarioMatrixComplete !== true) {
    throw new Error('finalization.mandatoryScenarioMatrixComplete must be true');
  }
  if (dossier.finalization?.resourceObservationsComplete !== true) {
    throw new Error('finalization.resourceObservationsComplete must be true');
  }
  if (dossier.finalization?.riskGatesComplete !== true)
    throw new Error('finalization.riskGatesComplete must be true');

  const expectedHandoffKeys = ['w17Telemetry', 'w19SecurityHardening', 'w20ReleaseRollout'];
  if (
    Object.keys(dossier.handoffs || {})
      .sort()
      .join(',') !== expectedHandoffKeys.slice().sort().join(',')
  ) {
    throw new Error('handoffs must contain exactly the canonical downstream owners');
  }
  for (const key of expectedHandoffKeys) {
    if (!Array.isArray(dossier.handoffs[key])) throw new Error(`handoffs.${key} must be an array`);
    for (const [index, handoff] of dossier.handoffs[key].entries()) {
      requiredString(handoff?.downstreamOwner, `handoffs.${key}[${index}].downstreamOwner`);
      if (!Array.isArray(handoff?.evidenceReferences) || handoff.evidenceReferences.length === 0) {
        throw new Error(`handoffs.${key}[${index}].evidenceReferences must not be empty`);
      }
      handoff.evidenceReferences.forEach((reference, referenceIndex) =>
        evidenceReference(
          reference,
          `handoffs.${key}[${index}].evidenceReferences[${referenceIndex}]`,
          manifestFiles,
        ),
      );
    }
  }

  const wake = dossier.wakeEvidence;
  const trustedWake = preflight.wakeEvidence;
  if (!wake || !trustedWake)
    throw new Error('canonical separately manifested wake evidence is required');
  for (const field of ['reference', 'schemaVersion']) {
    if (requiredString(wake[field], `wakeEvidence.${field}`) !== trustedWake[field]) {
      throw new Error(`wakeEvidence.${field} does not match trusted wake evidence`);
    }
  }
  if (exactSha(wake.sha256, 'wakeEvidence.sha256', SHA256) !== trustedWake.sha256) {
    throw new Error('wakeEvidence.sha256 does not match trusted wake evidence');
  }
  if (
    !Number.isSafeInteger(wake.deliberateAttempts) ||
    wake.deliberateAttempts < 100 ||
    wake.deliberateAttempts !== trustedWake.deliberateAttempts
  ) {
    throw new Error('wakeEvidence.deliberateAttempts must match trusted evidence and be >= 100');
  }
  if (
    wake.scenarioCount !== trustedWake.scenarioCount ||
    trustedWake.lintReadyForIndependentReview !== true ||
    trustedWake.physicallyAccepted !== false
  ) {
    throw new Error('wake evidence lint state is invalid');
  }
  evidenceReference(wake.reference, 'wakeEvidence.reference', manifestFiles, true);

  return {
    candidateSha,
    requiredScenarioCount: REQUIRED_DP5_SCENARIO_PATHS.length,
    requiredReverseMappings: [...REQUIRED_REVERSE_PORTS],
    readyForIndependentReview: true,
    physicallyAccepted: false,
  };
}

export function loadAndValidateW15JPreflight(path, preflight = {}) {
  return validateW15JPreflight(JSON.parse(readFileSync(path, 'utf8')), preflight);
}

if (process.argv[1]?.endsWith('w15j-preflight.mjs')) {
  const dossierPath = process.argv[2];
  const evidenceDirectory = process.argv[3];
  const controlTowerPath = process.argv[4];
  if (!dossierPath || !evidenceDirectory || !controlTowerPath) {
    console.error(
      'Usage: node tools/acceptance/w15j-preflight.mjs <w15j-evidence.json> <finalized-evidence-directory> <independent-control-tower-tuple.json>',
    );
    process.exitCode = 2;
  } else {
    try {
      const result = loadAndValidateW15JPreflight(
        dossierPath,
        buildTrustedW15JPreflight(
          evidenceDirectory,
          JSON.parse(readFileSync(controlTowerPath, 'utf8')),
        ),
      );
      console.log(
        `W15J_PREFLIGHT_LINT_READY_NOT_ACCEPTED candidate=${result.candidateSha} scenarios=${result.requiredScenarioCount}`,
      );
    } catch (error) {
      console.error(`W15J_PREFLIGHT_BLOCKED: ${error.message}`);
      process.exitCode = 1;
    }
  }
}
