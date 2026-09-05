import { readFileSync } from 'node:fs';

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

const REQUIRED_REVERSE_PORTS = Object.freeze([8080, 8081]);
const REQUIRED_COLLECTOR_KEYS = Object.freeze([
  'rawDirectory',
  'preflightMetadata',
  'finalizeMetadata',
  'sha256Manifest',
  'adbReverseCleanup',
]);
const REQUIRED_STATUSES = new Set(['NOT_RUN', 'FAIL', 'BLOCKED']);
const ISO_UTC = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?Z$/u;

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

function observedRecord(record, label, allowedStatuses) {
  if (!record || typeof record !== 'object') throw new Error(`${label} is required`);
  if (REQUIRED_STATUSES.has(record.status))
    throw new Error(`${label} must not be ${record.status}`);
  if (!allowedStatuses.has(record.status)) throw new Error(`${label}.status is invalid`);
  if (!ISO_UTC.test(requiredString(record.observedAtUtc, `${label}.observedAtUtc`))) {
    throw new Error(`${label}.observedAtUtc must be UTC`);
  }
  if (!Array.isArray(record.evidenceReferences) || record.evidenceReferences.length === 0) {
    throw new Error(`${label}.evidenceReferences must not be empty`);
  }
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
  if (
    dossier.authorityInvariant &&
    dossier.authorityInvariant !== 'INTELLIGENCE != AUTHORITY != EXECUTION'
  ) {
    throw new Error('authorityInvariant must preserve the Aurora boundary');
  }

  const candidateSha = exactSha(dossier.candidateSha, 'candidateSha', GIT_SHA);
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
  if (environment?.gatewayTransport !== 'LOCAL_ADB_REVERSE_ONLY') {
    throw new Error('environment.gatewayTransport must be LOCAL_ADB_REVERSE_ONLY');
  }
  requiredString(environment?.operator, 'environment.operator');
  for (const field of ['preflightObservedAtUtc', 'finalizedAtUtc']) {
    if (!ISO_UTC.test(requiredString(environment?.[field], `environment.${field}`))) {
      throw new Error(`environment.${field} must be UTC`);
    }
  }

  const expected = preflight.expected;
  if (!expected || typeof expected !== 'object') {
    throw new Error('preflight.expected trusted provenance tuple is required');
  }
  if (
    candidateSha !== exactSha(expected.candidateSha, 'preflight.expected.candidateSha', GIT_SHA)
  ) {
    throw new Error('candidateSha does not match trusted preflight');
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
  for (const field of ['gatewayIdentity', 'gatewayVersion']) {
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
    if (!mapping || mapping.status !== 'PRESENT' || mapping.host !== 'tcp') {
      throw new Error(`ADB reverse mapping tcp:${port} is not PRESENT`);
    }
  }

  for (const path of REQUIRED_DP5_SCENARIO_PATHS) {
    observedRecord(canonicalScenario(dossier, path), `scenario ${path}`, new Set(['PASS']));
  }
  for (const key of REQUIRED_THREAT_REVIEW_KEYS) {
    const record = dossier.threatReview?.[key];
    observedRecord(record, `threatReview.${key}`, new Set(['PASS', 'HANDED_OFF']));
    if (record.status === 'HANDED_OFF')
      requiredString(record.downstreamOwner, `threatReview.${key}.downstreamOwner`);
  }
  for (const key of REQUIRED_RESOURCE_KEYS) {
    observedRecord(
      dossier.resourceObservations?.[key],
      `resourceObservations.${key}`,
      new Set(['OBSERVED']),
    );
  }
  for (const key of REQUIRED_RISK_GATES) {
    observedRecord(dossier.riskGates?.[key], `riskGates.${key}`, new Set(['PASS']));
  }

  for (const key of REQUIRED_COLLECTOR_KEYS) {
    requiredString(dossier.collectorEvidence?.[key], `collectorEvidence.${key}`);
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
  requiredString(
    dossier.finalization?.operatorAttestationReference,
    'finalization.operatorAttestationReference',
  );
  requiredString(
    dossier.finalization?.independentReviewReference,
    'finalization.independentReviewReference',
  );
  if (dossier.finalization?.mandatoryScenarioMatrixComplete !== true) {
    throw new Error('finalization.mandatoryScenarioMatrixComplete must be true');
  }
  if (dossier.finalization?.resourceObservationsComplete !== true) {
    throw new Error('finalization.resourceObservationsComplete must be true');
  }
  if (dossier.finalization?.riskGatesComplete !== true)
    throw new Error('finalization.riskGatesComplete must be true');

  return {
    candidateSha,
    requiredScenarioCount: REQUIRED_DP5_SCENARIO_PATHS.length,
    requiredReverseMappings: [...REQUIRED_REVERSE_PORTS],
    readyForIndependentReview: true,
  };
}

export function loadAndValidateW15JPreflight(path, preflight = {}) {
  return validateW15JPreflight(JSON.parse(readFileSync(path, 'utf8')), preflight);
}

if (process.argv[1]?.endsWith('w15j-preflight.mjs')) {
  const dossierPath = process.argv[2];
  const preflightPath = process.argv[3];
  if (!dossierPath || !preflightPath) {
    console.error(
      'Usage: node tools/acceptance/w15j-preflight.mjs <w15j-evidence.json> <trusted-preflight.json>',
    );
    process.exitCode = 2;
  } else {
    try {
      const result = loadAndValidateW15JPreflight(
        dossierPath,
        JSON.parse(readFileSync(preflightPath, 'utf8')),
      );
      console.log(
        `W15J_PREFLIGHT_READY candidate=${result.candidateSha} scenarios=${result.requiredScenarioCount}`,
      );
    } catch (error) {
      console.error(`W15J_PREFLIGHT_BLOCKED: ${error.message}`);
      process.exitCode = 1;
    }
  }
}
