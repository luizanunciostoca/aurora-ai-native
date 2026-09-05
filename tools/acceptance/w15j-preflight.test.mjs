import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

import {
  REQUIRED_DP5_SCENARIO_PATHS,
  REQUIRED_THREAT_REVIEW_KEYS,
  validateW15JPreflight,
} from './w15j-preflight.mjs';

const OBSERVED_AT = '2026-09-05T17:00:00Z';
const evidence = (status = 'PASS') => ({
  status,
  observedAtUtc: OBSERVED_AT,
  evidenceReferences: ['physical/evidence.txt'],
});

function canonicalDossier() {
  const scenarios = {};
  for (const path of REQUIRED_DP5_SCENARIO_PATHS) {
    const [group, scenario] = path.split('.');
    scenarios[group] ??= {};
    scenarios[group][scenario] = evidence();
  }
  return {
    schemaVersion: '1.2.0',
    wave: 'W15-J',
    candidateSha: 'a'.repeat(40),
    apk: {
      applicationId: 'ai.aurora.device.local',
      variant: 'localRelease',
      versionCode: '15',
      versionName: '0.15.0',
      sha256: 'b'.repeat(64),
    },
    device: {
      serialSha256: 'c'.repeat(64),
      manufacturer: 'Example',
      model: 'Tablet',
      product: 'tablet',
      apiLevel: '35',
      buildFingerprint: 'example/tablet/15',
      physicalDeviceVerified: true,
    },
    environment: {
      gatewayIdentity: 'gateway-local-01',
      gatewayVersion: 'w14-local-1',
      gatewayTransport: 'LOCAL_ADB_REVERSE_ONLY',
      operator: 'operator-1',
      preflightObservedAtUtc: OBSERVED_AT,
      finalizedAtUtc: OBSERVED_AT,
    },
    scenarios,
    threatReview: Object.fromEntries(REQUIRED_THREAT_REVIEW_KEYS.map((key) => [key, evidence()])),
    resourceObservations: Object.fromEntries(
      [
        'coldStartup',
        'warmStartup',
        'gatewayReconnect',
        'batteryWindow',
        'cpu',
        'memory',
        'storage',
        'foregroundService',
      ].map((key) => [key, evidence('OBSERVED')]),
    ),
    riskGates: Object.fromEntries(
      [
        'A_AUTHORITY',
        'B_RUNTIME_RECONCILIATION',
        'C_REPLAY_IDEMPOTENCY',
        'D_EVIDENCE_OBSERVABILITY',
      ].map((key) => [key, evidence()]),
    ),
    collectorEvidence: {
      rawDirectory: 'physical/raw',
      preflightMetadata: 'physical/preflight-metadata.txt',
      finalizeMetadata: 'physical/finalize-metadata.txt',
      sha256Manifest: 'physical/evidence-manifest.sha256',
      adbReverseCleanup: 'physical/adb-reverse-list-after-finalize.txt',
    },
    finalization: {
      mandatoryScenarioMatrixComplete: true,
      resourceObservationsComplete: true,
      riskGatesComplete: true,
      operatorAttestationReference: 'attestations/operator.txt',
      independentReviewReference: 'attestations/reviewer.txt',
    },
    evidenceReferences: ['physical/w15j-evidence.json'],
  };
}

const preflight = {
  expected: {
    candidateSha: 'a'.repeat(40),
    apk: {
      applicationId: 'ai.aurora.device.local',
      variant: 'localRelease',
      versionCode: '15',
      versionName: '0.15.0',
      sha256: 'b'.repeat(64),
    },
    device: {
      serialSha256: 'c'.repeat(64),
      manufacturer: 'Example',
      model: 'Tablet',
      product: 'tablet',
      apiLevel: '35',
      buildFingerprint: 'example/tablet/15',
    },
    environment: {
      gatewayIdentity: 'gateway-local-01',
      gatewayVersion: 'w14-local-1',
      gatewayTransport: 'LOCAL_ADB_REVERSE_ONLY',
    },
  },
  adbReverseMappings: [
    { host: 'tcp', port: 8080, status: 'PRESENT' },
    { host: 'tcp', port: 8081, status: 'PRESENT' },
  ],
};

function clone(value) {
  return structuredClone(value);
}

test('validates the canonical W15-J evidence contract', () => {
  const result = validateW15JPreflight(canonicalDossier(), preflight);
  assert.equal(result.readyForIndependentReview, true);
  assert.equal(result.requiredScenarioCount, 48);
  assert.deepEqual(result.requiredReverseMappings, [8080, 8081]);
});

test('fails closed when any canonical mandatory scenario is missing', () => {
  const dossier = canonicalDossier();
  delete dossier.scenarios.voiceAndPresence.confidenceNeverBecomesAuthority;
  assert.throws(
    () => validateW15JPreflight(dossier, preflight),
    /scenario voiceAndPresence\.confidenceNeverBecomesAuthority is required/,
  );
});

test('fails closed for every disallowed scenario disposition', () => {
  for (const status of ['NOT_RUN', 'FAIL', 'BLOCKED']) {
    const dossier = canonicalDossier();
    dossier.scenarios.lifecycleAndProcessRestart.coldLaunchFromStoppedProcess = evidence(status);
    assert.throws(
      () => validateW15JPreflight(dossier, preflight),
      new RegExp(
        `scenario lifecycleAndProcessRestart\\.coldLaunchFromStoppedProcess must not be ${status}`,
      ),
    );
  }
});

test('requires timestamp and concrete evidence references on scenarios', () => {
  const missingTimestamp = canonicalDossier();
  missingTimestamp.scenarios.voiceAndPresence.falseWakeDoesNotDispatch.observedAtUtc = null;
  assert.throws(
    () => validateW15JPreflight(missingTimestamp, preflight),
    /scenario voiceAndPresence\.falseWakeDoesNotDispatch\.observedAtUtc is required/,
  );

  const missingReference = canonicalDossier();
  missingReference.scenarios.voiceAndPresence.falseWakeDoesNotDispatch.evidenceReferences = [];
  assert.throws(
    () => validateW15JPreflight(missingReference, preflight),
    /scenario voiceAndPresence\.falseWakeDoesNotDispatch\.evidenceReferences must not be empty/,
  );
});

test('requires threat review, resources, canonical risk gates, and attestations', () => {
  const missingThreat = canonicalDossier();
  delete missingThreat.threatReview[REQUIRED_THREAT_REVIEW_KEYS[0]];
  assert.throws(
    () => validateW15JPreflight(missingThreat, preflight),
    /threatReview\.packageImpersonationOrConfusion is required/,
  );

  const missingResource = canonicalDossier();
  delete missingResource.resourceObservations.cpu;
  assert.throws(
    () => validateW15JPreflight(missingResource, preflight),
    /resourceObservations\.cpu is required/,
  );

  const wrongGate = canonicalDossier();
  delete wrongGate.riskGates.A_AUTHORITY;
  assert.throws(
    () => validateW15JPreflight(wrongGate, preflight),
    /riskGates\.A_AUTHORITY is required/,
  );

  const missingAttestation = canonicalDossier();
  missingAttestation.finalization.independentReviewReference = null;
  assert.throws(
    () => validateW15JPreflight(missingAttestation, preflight),
    /finalization\.independentReviewReference is required/,
  );
});

test('requires exact provenance and both LOCAL reverse mappings', () => {
  const wrongCandidate = clone(canonicalDossier());
  wrongCandidate.candidateSha = 'd'.repeat(40);
  assert.throws(
    () => validateW15JPreflight(wrongCandidate, preflight),
    /candidateSha does not match trusted preflight/,
  );

  const wrongApk = clone(canonicalDossier());
  wrongApk.apk.sha256 = 'd'.repeat(64);
  assert.throws(
    () => validateW15JPreflight(wrongApk, preflight),
    /apk.sha256 does not match trusted preflight/,
  );

  const wrongDevice = clone(canonicalDossier());
  wrongDevice.device.model = 'OtherTablet';
  assert.throws(
    () => validateW15JPreflight(wrongDevice, preflight),
    /device.model does not match trusted preflight/,
  );

  const wrongGateway = clone(canonicalDossier());
  wrongGateway.environment.gatewayIdentity = 'gateway-other';
  assert.throws(
    () => validateW15JPreflight(wrongGateway, preflight),
    /environment.gatewayIdentity does not match trusted preflight/,
  );

  const missingBootstrapMapping = {
    expected: preflight.expected,
    adbReverseMappings: [{ host: 'tcp', port: 8080, status: 'PRESENT' }],
  };
  assert.throws(
    () => validateW15JPreflight(canonicalDossier(), missingBootstrapMapping),
    /ADB reverse mapping tcp:8081 is not PRESENT/,
  );
});

test('requires exact collector keys and dossier-level evidence references', () => {
  for (const collectorEvidence of [{}, { rawDirectory: 'physical/raw' }]) {
    const dossier = canonicalDossier();
    dossier.collectorEvidence = collectorEvidence;
    assert.throws(() => validateW15JPreflight(dossier, preflight), /collectorEvidence/);
  }
  const dossier = canonicalDossier();
  delete dossier.evidenceReferences;
  assert.throws(
    () => validateW15JPreflight(dossier, preflight),
    /evidenceReferences must not be empty/,
  );
});

test('CLI requires a trusted preflight file and validates both inputs', () => {
  const directory = mkdtempSync(join(tmpdir(), 'w15j-preflight-'));
  const dossierPath = join(directory, 'dossier.json');
  const preflightPath = join(directory, 'preflight.json');
  writeFileSync(dossierPath, JSON.stringify(canonicalDossier()));
  writeFileSync(preflightPath, JSON.stringify(preflight));
  const modulePath = new URL('./w15j-preflight.mjs', import.meta.url);
  const missing = spawnSync(process.execPath, [modulePath.pathname, dossierPath], {
    encoding: 'utf8',
  });
  assert.equal(missing.status, 2);
  assert.match(missing.stderr, /Usage: .*trusted-preflight\.json/);
  const output = execFileSync(process.execPath, [modulePath.pathname, dossierPath, preflightPath], {
    encoding: 'utf8',
  });
  assert.match(output, /W15J_PREFLIGHT_READY candidate=/);
  rmSync(directory, { recursive: true, force: true });
});

test('does not mutate the canonical evidence record', () => {
  const dossier = canonicalDossier();
  const before = JSON.stringify(dossier);
  validateW15JPreflight(dossier, preflight);
  assert.equal(JSON.stringify(dossier), before);
});
