import assert from 'node:assert/strict';
import test from 'node:test';

import { REQUIRED_THREAT_SCENARIOS, validateW15JPreflight } from './w15j-preflight.mjs';

function dossier(overrides = {}) {
  return {
    authorityInvariant: 'INTELLIGENCE != AUTHORITY != EXECUTION',
    candidate: {
      gitSha: 'a'.repeat(40),
      apkSha256: 'b'.repeat(64),
      apkVariant: 'localRelease',
      applicationId: 'ai.aurora.device',
      versionCode: '15',
      versionName: '0.15.0',
    },
    device: {
      manufacturer: 'Example',
      model: 'Tablet',
      product: 'tablet',
      serialSha256: 'c'.repeat(64),
      buildFingerprint: 'example/tablet/15',
      physicalDeviceVerified: true,
    },
    gateway: {
      identity: 'gateway-local-01',
      version: 'w14-local-1',
      environment: 'LOCAL',
    },
    adbReverseMappings: [
      { host: 'tcp', port: 8080, status: 'PRESENT' },
      { host: 'tcp', port: 8081, status: 'PRESENT' },
    ],
    scenarios: REQUIRED_THREAT_SCENARIOS.map((id) => ({
      id,
      mandatory: true,
      status: 'PASS',
      evidenceReference: `evidence/${id}`,
    })),
    riskGates: Object.fromEntries(
      ['A', 'B', 'C', 'D'].map((id) => [
        id,
        { status: 'PASS', evidenceReference: `risk-gate-${id}` },
      ]),
    ),
    ...overrides,
  };
}

test('validates an exact candidate/device/gateway tuple and threat matrix', () => {
  const result = validateW15JPreflight(dossier());
  assert.equal(result.readyForIndependentReview, true);
  assert.equal(result.requiredScenarioCount, 13);
  assert.deepEqual(result.requiredReverseMappings, [8080, 8081]);
});

test('fails closed when a mandatory threat scenario is not run', () => {
  const scenarios = dossier().scenarios.map((scenario) =>
    scenario.id === 'bootstrap-replay' ? { ...scenario, status: 'NOT_RUN' } : scenario,
  );
  assert.throws(
    () => validateW15JPreflight(dossier({ scenarios })),
    /scenario bootstrap-replay must not be NOT_RUN/,
  );
});

test('fails closed when the bootstrap mapping is absent', () => {
  assert.throws(
    () =>
      validateW15JPreflight(
        dossier({
          adbReverseMappings: [{ host: 'tcp', port: 8080, status: 'PRESENT' }],
        }),
      ),
    /ADB reverse mapping tcp:8081 is not PRESENT/,
  );
});

test('rejects non-local gateway evidence and unverified devices', () => {
  assert.throws(
    () =>
      validateW15JPreflight(dossier({ gateway: { ...dossier().gateway, environment: 'STAGING' } })),
    /gateway.environment must be LOCAL/,
  );
  assert.throws(
    () =>
      validateW15JPreflight(
        dossier({ device: { ...dossier().device, physicalDeviceVerified: false } }),
      ),
    /device.physicalDeviceVerified must be true/,
  );
});

test('requires evidence for every risk gate without synthesizing PASS', () => {
  const riskGates = { ...dossier().riskGates, B: { status: 'PASS' } };
  assert.throws(
    () => validateW15JPreflight(dossier({ riskGates })),
    /riskGate B.evidenceReference is required/,
  );
});
