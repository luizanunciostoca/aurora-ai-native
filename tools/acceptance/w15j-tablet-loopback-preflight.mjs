import { readFileSync } from 'node:fs';

import { REQUIRED_DP5_SCENARIO_PATHS, REQUIRED_THREAT_REVIEW_KEYS } from './w15j-preflight.mjs';
import { buildTrustedW15JTabletLoopbackPreflight } from './w15j-tablet-loopback-trusted-preflight.mjs';
import { validateW15JGovernedExecutionBinding } from './w15j-governed-execution-binding.mjs';

const SHA256 = /^[a-f0-9]{64}$/u;
const GIT_SHA = /^[a-f0-9]{40}$/u;
const ISO_UTC = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/u;
const TRANSPORT = 'LOCAL_TABLET_LOOPBACK';
const CONTROL_PLANE = 'SELF_ADB_WIRELESS_DEBUGGING';
const BLOCKING = new Set(['NOT_RUN', 'FAIL', 'BLOCKED', 'NOT_OBSERVED', 'NOT_EVALUATED']);
const RESOURCE_KEYS = Object.freeze([
  'coldStartup',
  'warmStartup',
  'gatewayReconnect',
  'batteryWindow',
  'cpu',
  'memory',
  'storage',
  'foregroundService',
]);
const RISK_GATES = Object.freeze([
  'A_AUTHORITY',
  'B_RUNTIME_RECONCILIATION',
  'C_REPLAY_IDEMPOTENCY',
  'D_EVIDENCE_OBSERVABILITY',
]);
const RESOURCE_EVIDENCE = Object.freeze({
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
const COLLECTOR_KEYS = Object.freeze([
  'rawDirectory',
  'preflightMetadata',
  'finalizeMetadata',
  'sha256Manifest',
  'adbReverseCleanup',
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

function semanticUtc(value, label) {
  const text = requiredString(value, label);
  if (!ISO_UTC.test(text)) throw new Error(`${label} must be a canonical UTC timestamp`);
  const time = Date.parse(text);
  if (!Number.isFinite(time)) throw new Error(`${label} is not a real UTC instant`);
  const normalizedInput = text.replace(/\.000Z$/u, 'Z');
  const normalizedDate = new Date(time).toISOString().replace(/\.000Z$/u, 'Z');
  if (normalizedInput !== normalizedDate) throw new Error(`${label} is not a real UTC instant`);
  return time;
}

function evidenceReference(reference, label, files, allowWake = false) {
  const value = requiredString(reference, label);
  if (
    value.includes('/') ||
    value.includes('\\') ||
    value === 'evidence-manifest.sha256' ||
    value === 'evidence-manifest-preflight.sha256' ||
    (!allowWake && value === 'wake-evidence.json')
  ) {
    throw new Error(`${label} is not a bounded top-level evidence reference`);
  }
  if (!Object.hasOwn(files, value) || files[value]?.sizeBytes <= 0) {
    throw new Error(`${label} is not present/non-empty in final manifest`);
  }
  return value;
}

function observedRecord(record, label, allowed, files, window, primaryReferences) {
  if (!record || typeof record !== 'object') throw new Error(`${label} is required`);
  if (BLOCKING.has(record.status)) throw new Error(`${label} must not be ${record.status}`);
  if (!allowed.has(record.status)) throw new Error(`${label}.status is invalid`);
  const observed = semanticUtc(record.observedAtUtc, `${label}.observedAtUtc`);
  if (observed < window.start || observed > window.finish) {
    throw new Error(`${label}.observedAtUtc is outside the physical collector window`);
  }
  if (!Array.isArray(record.evidenceReferences) || record.evidenceReferences.length === 0) {
    throw new Error(`${label}.evidenceReferences must not be empty`);
  }
  record.evidenceReferences.forEach((reference, index) =>
    evidenceReference(reference, `${label}.evidenceReferences[${index}]`, files),
  );
  const primary = record.evidenceReferences[0];
  if (primaryReferences.has(primary))
    throw new Error(`${label} reuses another record's primary evidence`);
  primaryReferences.add(primary);
}

function scenario(dossier, path) {
  const [group, name] = path.split('.');
  return dossier.scenarios?.[group]?.[name];
}

export function validateW15JTabletLoopbackPreflight(dossier, trusted = {}) {
  if (!dossier || typeof dossier !== 'object')
    throw new Error('canonical W15-J dossier is required');
  if (dossier.schemaVersion !== '1.2.0' || dossier.wave !== 'W15-J') {
    throw new Error('W15-J dossier schemaVersion 1.2.0 is required');
  }
  if (dossier.authorityInvariant !== 'INTELLIGENCE != AUTHORITY != EXECUTION') {
    throw new Error('authority invariant is invalid');
  }
  if (
    dossier.dp4Status !== 'OPEN' ||
    dossier.dp4PublicationReference !== 'issue:115#issuecomment-5547053471'
  ) {
    throw new Error('canonical DP4 publication is required');
  }
  if (dossier.dp5Status !== 'CLOSED_PHYSICAL_EVIDENCE_INCOMPLETE') {
    throw new Error('DP5 must remain incomplete during lint');
  }
  if (trusted.schemaVersion !== 'w15j-tablet-loopback-trusted-preflight-v1') {
    throw new Error('tablet-loopback trusted preflight v1 is required');
  }
  if (
    trusted.physicallyAccepted !== false ||
    trusted.trustRoot?.liveGitHubRevalidation !== 'EXTERNAL_REQUIRED_IMMEDIATELY_BEFORE_ACCEPTANCE'
  ) {
    throw new Error('trusted preflight must preserve external final Control Tower revalidation');
  }

  const expected = trusted.expected;
  if (!expected || typeof expected !== 'object')
    throw new Error('trusted expected tuple is required');
  const files = trusted.evidenceManifest?.files;
  if (!files || trusted.evidenceManifest?.fileName !== 'evidence-manifest.sha256') {
    throw new Error('trusted final evidence manifest is required');
  }
  exact(trusted.evidenceManifest.sha256, SHA256, 'evidence manifest SHA');

  const candidateSha = exact(dossier.candidateSha, GIT_SHA, 'candidateSha');
  if (candidateSha !== expected.androidCandidateSha)
    throw new Error('candidate SHA differs from trusted tuple');

  const provenance = dossier.provenance;
  if (provenance?.repository !== expected.repository)
    throw new Error('repository provenance drift');
  for (const field of ['id', 'url', 'status', 'headSha', 'sourceRef']) {
    if (provenance.workflowRun?.[field] !== expected.workflowRun?.[field]) {
      throw new Error(`workflowRun.${field} provenance drift`);
    }
  }
  for (const field of [
    'androidCandidateSha',
    'hostCandidateSha',
    'reconciledMainSha',
    'packagingHeadSha',
  ]) {
    if (exact(provenance?.[field], GIT_SHA, `provenance.${field}`) !== expected[field]) {
      throw new Error(`provenance.${field} drift`);
    }
  }
  for (const field of ['id', 'name', 'zipSha256', 'digestSourceRef']) {
    if (String(provenance.artifact?.[field]) !== String(expected.artifact?.[field])) {
      throw new Error(`provenance.artifact.${field} drift`);
    }
  }

  const apk = dossier.apk;
  for (const field of ['applicationId', 'variant', 'versionCode', 'versionName']) {
    if (requiredString(apk?.[field], `apk.${field}`) !== expected.apk[field]) {
      throw new Error(`apk.${field} drift`);
    }
  }
  if (exact(apk?.sha256, SHA256, 'apk.sha256') !== expected.apk.sha256)
    throw new Error('APK SHA drift');

  const device = dossier.device;
  if (exact(device?.serialSha256, SHA256, 'device.serialSha256') !== expected.device.serialSha256) {
    throw new Error('device serial hash drift');
  }
  for (const field of ['manufacturer', 'model', 'product', 'apiLevel', 'buildFingerprint']) {
    if (requiredString(device?.[field], `device.${field}`) !== expected.device[field]) {
      throw new Error(`device.${field} drift`);
    }
  }
  if (device?.physicalDeviceVerified !== true)
    throw new Error('physical device must be independently verified');

  const environment = dossier.environment;
  if (environment?.gatewayTransport !== TRANSPORT)
    throw new Error(`gatewayTransport must be ${TRANSPORT}`);
  if (environment?.adbReversePort !== null)
    throw new Error('adbReversePort must be null for tablet loopback');
  if (environment?.controlPlane !== CONTROL_PLANE)
    throw new Error(`controlPlane must be ${CONTROL_PLANE}`);
  for (const field of ['gatewayIdentity', 'gatewayVersion', 'hostInstanceId', 'operator']) {
    const expectedValue = field === 'operator' ? expected.operator : expected.environment?.[field];
    if (requiredString(environment?.[field], `environment.${field}`) !== expectedValue) {
      throw new Error(`environment.${field} drift`);
    }
  }
  if (!trusted.transportBindings || trusted.transportBindings.gatewayTransport !== TRANSPORT) {
    throw new Error('trusted transport binding is missing');
  }
  if (
    trusted.transportBindings.controlPlane !== CONTROL_PLANE ||
    trusted.transportBindings.adbReverse8080And8081 !== 'ABSENT_THROUGHOUT_WINDOW'
  ) {
    throw new Error('trusted control-plane/reverse absence binding is invalid');
  }

  const window = {
    start: semanticUtc(environment?.preflightObservedAtUtc, 'environment.preflightObservedAtUtc'),
    finish: semanticUtc(environment?.finalizedAtUtc, 'environment.finalizedAtUtc'),
  };
  if (window.start > window.finish) throw new Error('collector window is reversed');
  if (
    environment.preflightObservedAtUtc !== expected.preflightObservedAtUtc ||
    environment.finalizedAtUtc !== expected.finalizedAtUtc
  ) {
    throw new Error('collector timestamps drift from trusted evidence');
  }

  const primaryReferences = new Set();
  for (const path of REQUIRED_DP5_SCENARIO_PATHS) {
    observedRecord(
      scenario(dossier, path),
      `scenario ${path}`,
      new Set(['PASS']),
      files,
      window,
      primaryReferences,
    );
  }
  for (const key of REQUIRED_THREAT_REVIEW_KEYS) {
    const record = dossier.threatReview?.[key];
    observedRecord(
      record,
      `threatReview.${key}`,
      new Set(['PASS', 'HANDED_OFF']),
      files,
      window,
      primaryReferences,
    );
    if (record.status === 'HANDED_OFF') {
      requiredString(record.downstreamOwner, `threatReview.${key}.downstreamOwner`);
    }
  }
  for (const key of RESOURCE_KEYS) {
    const record = dossier.resourceObservations?.[key];
    observedRecord(
      record,
      `resourceObservations.${key}`,
      new Set(['OBSERVED']),
      files,
      window,
      primaryReferences,
    );
    for (const requiredReference of RESOURCE_EVIDENCE[key]) {
      if (!record.evidenceReferences.includes(requiredReference)) {
        throw new Error(`resourceObservations.${key} must reference ${requiredReference}`);
      }
    }
  }
  for (const gate of RISK_GATES) {
    observedRecord(
      dossier.riskGates?.[gate],
      `riskGates.${gate}`,
      new Set(['PASS']),
      files,
      window,
      primaryReferences,
    );
  }

  for (const key of COLLECTOR_KEYS) {
    const value = requiredString(dossier.collectorEvidence?.[key], `collectorEvidence.${key}`);
    if (value !== trusted.sourceEvidence?.[key]) throw new Error(`collectorEvidence.${key} drift`);
    if (key !== 'rawDirectory' && key !== 'sha256Manifest') {
      evidenceReference(value, `collectorEvidence.${key}`, files);
    }
  }
  if (
    Object.keys(dossier.collectorEvidence || {})
      .sort()
      .join(',') !== COLLECTOR_KEYS.slice().sort().join(',')
  ) {
    throw new Error('collectorEvidence must contain exactly the canonical five keys');
  }

  if (!Array.isArray(dossier.evidenceReferences) || dossier.evidenceReferences.length === 0) {
    throw new Error('dossier evidenceReferences must not be empty');
  }
  dossier.evidenceReferences.forEach((reference, index) =>
    evidenceReference(reference, `evidenceReferences[${index}]`, files),
  );

  const finalization = dossier.finalization;
  evidenceReference(finalization?.operatorAttestationReference, 'operator attestation', files);
  requiredString(finalization?.independentReviewReference, 'independent reviewer reference');
  if (
    finalization.operatorAttestationReference !== expected.attestations?.operator?.reference ||
    finalization.independentReviewReference !== expected.attestations?.reviewer?.reference
  ) {
    throw new Error('attestation references drift from trusted parsed attestations');
  }
  if (finalization.operatorAttestationReference === finalization.independentReviewReference) {
    throw new Error('operator and reviewer references must be distinct');
  }
  if (
    finalization.mandatoryScenarioMatrixComplete !== true ||
    finalization.resourceObservationsComplete !== true ||
    finalization.riskGatesComplete !== true
  ) {
    throw new Error('finalization completeness flags must all be true');
  }

  const expectedHandoffs = ['w17Telemetry', 'w19SecurityHardening', 'w20ReleaseRollout'];
  if (
    Object.keys(dossier.handoffs || {})
      .sort()
      .join(',') !== expectedHandoffs.slice().sort().join(',')
  ) {
    throw new Error('handoffs must contain exactly W17/W19/W20 owners');
  }
  for (const key of expectedHandoffs) {
    if (!Array.isArray(dossier.handoffs[key])) throw new Error(`handoffs.${key} must be an array`);
    dossier.handoffs[key].forEach((handoff, index) => {
      requiredString(handoff?.downstreamOwner, `handoffs.${key}[${index}].downstreamOwner`);
      if (!Array.isArray(handoff?.evidenceReferences) || handoff.evidenceReferences.length === 0) {
        throw new Error(`handoffs.${key}[${index}].evidenceReferences must not be empty`);
      }
      handoff.evidenceReferences.forEach((reference, referenceIndex) =>
        evidenceReference(
          reference,
          `handoffs.${key}[${index}].evidenceReferences[${referenceIndex}]`,
          files,
        ),
      );
    });
  }

  const wake = dossier.wakeEvidence;
  const trustedWake = trusted.wakeEvidence;
  if (!wake || !trustedWake) throw new Error('canonical wake evidence is required');
  for (const field of ['reference', 'schemaVersion']) {
    if (requiredString(wake[field], `wakeEvidence.${field}`) !== trustedWake[field]) {
      throw new Error(`wakeEvidence.${field} drift`);
    }
  }
  if (exact(wake.sha256, SHA256, 'wakeEvidence.sha256') !== trustedWake.sha256) {
    throw new Error('wake evidence SHA drift');
  }
  if (
    !Number.isSafeInteger(wake.deliberateAttempts) ||
    wake.deliberateAttempts < 100 ||
    wake.deliberateAttempts !== trustedWake.deliberateAttempts
  ) {
    throw new Error('wake deliberate attempts must be >=100 and match trusted evidence');
  }
  if (
    wake.scenarioCount !== trustedWake.scenarioCount ||
    trustedWake.lintReadyForIndependentReview !== true ||
    trustedWake.physicallyAccepted !== false
  ) {
    throw new Error('trusted wake lint state is invalid');
  }
  evidenceReference(wake.reference, 'wakeEvidence.reference', files, true);

  return Object.freeze({
    candidateSha,
    requiredScenarioCount: REQUIRED_DP5_SCENARIO_PATHS.length,
    gatewayTransport: TRANSPORT,
    controlPlane: CONTROL_PLANE,
    readyForIndependentReview: true,
    physicallyAccepted: false,
  });
}

export function validateW15JTabletLoopbackCompleteGate(dossier, trusted, evidenceDirectory) {
  const structural = validateW15JTabletLoopbackPreflight(dossier, trusted);
  const semantic = validateW15JGovernedExecutionBinding(dossier, trusted, evidenceDirectory);
  if (
    semantic.evidenceRoleCount !== 7 ||
    semantic.readyForIndependentReview !== true ||
    semantic.physicallyAccepted !== false ||
    semantic.authorizesExecution !== false ||
    semantic.retryAuthorized !== false ||
    semantic.w16BuildUnblocked !== false
  ) {
    throw new Error('governed execution semantic binding state is invalid');
  }
  return Object.freeze({
    ...structural,
    semanticEvidenceRoleCount: semantic.evidenceRoleCount,
  });
}

export function loadAndValidateW15JTabletLoopbackPreflight(path, trusted = {}, evidenceDirectory) {
  const dossier = JSON.parse(readFileSync(path, 'utf8'));
  if (evidenceDirectory === undefined) {
    return validateW15JTabletLoopbackPreflight(dossier, trusted);
  }
  return validateW15JTabletLoopbackCompleteGate(dossier, trusted, evidenceDirectory);
}

if (process.argv[1]?.endsWith('w15j-tablet-loopback-preflight.mjs')) {
  const dossierPath = process.argv[2];
  const evidenceDirectory = process.argv[3];
  const controlTowerPath = process.argv[4];
  if (!dossierPath || !evidenceDirectory || !controlTowerPath) {
    console.error(
      'Usage: node tools/acceptance/w15j-tablet-loopback-preflight.mjs <w15j-evidence.json> <finalized-evidence-directory> <independent-control-tower-tuple.json>',
    );
    process.exitCode = 2;
  } else {
    try {
      const trusted = buildTrustedW15JTabletLoopbackPreflight(
        evidenceDirectory,
        JSON.parse(readFileSync(controlTowerPath, 'utf8')),
      );
      const result = loadAndValidateW15JTabletLoopbackPreflight(
        dossierPath,
        trusted,
        evidenceDirectory,
      );
      console.log(
        `W15J_TABLET_LOOPBACK_LINT_READY_NOT_ACCEPTED candidate=${result.candidateSha} scenarios=${result.requiredScenarioCount}`,
      );
    } catch (error) {
      console.error(`W15J_TABLET_LOOPBACK_BLOCKED: ${error.message}`);
      process.exitCode = 1;
    }
  }
}
