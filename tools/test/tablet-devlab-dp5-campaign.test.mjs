import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import { REQUIRED_DP5_SCENARIO_PATHS } from '../acceptance/w15j-preflight.mjs';
import { DP5_SCENARIOS } from '../tablet-devlab/dp5-scenario-catalog.mjs';
import {
  applyOperatorVerdict,
  createCampaign,
  renderReport,
} from '../tablet-devlab/dp5-campaign.mjs';

function dossier() {
  const scenarios = {};
  for (const path of REQUIRED_DP5_SCENARIO_PATHS) {
    const [group, key] = path.split('.');
    scenarios[group] ??= {};
    scenarios[group][key] = {
      status: 'NOT_RUN',
      observedAtUtc: null,
      evidenceReferences: [],
    };
  }
  return {
    schemaVersion: '1.2.0',
    wave: 'W15-J',
    candidateSha: 'a'.repeat(40),
    apk: {
      applicationId: 'ai.aurora.device.local',
      variant: 'localDebug',
      versionCode: '4',
      versionName: '0.17.0-dev.1-local',
      sha256: 'b'.repeat(64),
    },
    device: {
      serialSha256: 'c'.repeat(64),
      manufacturer: 'Samsung',
      model: 'SM-X820',
      product: 'gts10u',
      apiLevel: '36',
      buildFingerprint: 'example/fingerprint',
      physicalDeviceVerified: true,
    },
    environment: {
      gatewayTransport: 'LOCAL_TABLET_LOOPBACK',
      hostInstanceId: 'whi_' + 'd'.repeat(64),
    },
    provenance: { repository: 'luizanunciostoca/aurora-ai-native' },
    scenarios,
    riskGates: {
      A_AUTHORITY: { status: 'NOT_EVALUATED' },
      B_RUNTIME_RECONCILIATION: { status: 'NOT_EVALUATED' },
      C_REPLAY_IDEMPOTENCY: { status: 'NOT_EVALUATED' },
      D_EVIDENCE_OBSERVABILITY: { status: 'NOT_EVALUATED' },
    },
  };
}

test('DP5 harness catalog is exactly the canonical 48-scenario matrix', () => {
  assert.equal(DP5_SCENARIOS.length, 48);
  assert.deepEqual(
    DP5_SCENARIOS.map((scenario) => scenario.path).sort(),
    [...REQUIRED_DP5_SCENARIO_PATHS].sort(),
  );
  assert.equal(new Set(DP5_SCENARIOS.map((scenario) => scenario.id)).size, 48);
});

test('every DP5 scenario exposes the full evidence contract', () => {
  const fields = [
    'id',
    'name',
    'category',
    'apkVersion',
    'commitSha',
    'deviceIdentity',
    'preconditions',
    'setup',
    'actions',
    'expectedResult',
    'expectedSignals',
    'forbiddenSignals',
    'timeoutMs',
    'telemetryRequirements',
    'requiredLogs',
    'screenshotEvidence',
    'receiptsRequired',
    'timestampsRequired',
    'monotonicTimingRequired',
    'initialStatus',
    'failureCause',
    'artifactLinks',
    'cleanup',
    'retryPolicy',
    'manualActions',
    'automationCollectors',
    'humanVerdictRequired',
  ];
  for (const scenario of DP5_SCENARIOS) {
    for (const field of fields) {
      assert.equal(Object.hasOwn(scenario, field), true, scenario.id + '.' + field);
    }
    assert.equal(scenario.initialStatus, 'NOT_RUN');
    assert.equal(scenario.humanVerdictRequired, true);
    assert.equal(scenario.automationCollectors.includes('logcat'), true);
  }
});

test('new campaign starts 48/48 NOT_RUN and cannot self-accept', () => {
  const campaign = createCampaign({
    dossier: dossier(),
    controlTower: { schemaVersion: 'w15j-control-tower-tuple-v1' },
    operator: 'operator-1',
  });
  assert.equal(campaign.scenarios.length, 48);
  assert.equal(
    campaign.scenarios.every((scenario) => scenario.status === 'NOT_RUN'),
    true,
  );
  assert.equal(campaign.scenarios[0].apkVersion, '0.17.0-dev.1-local');
  assert.equal(campaign.scenarios[0].commitSha, 'a'.repeat(40));
  assert.deepEqual(campaign.scenarios[0].deviceIdentity, {
    serialSha256: 'c'.repeat(64),
    manufacturer: 'Samsung',
    model: 'SM-X820',
    product: 'gts10u',
    apiLevel: '36',
    buildFingerprint: 'example/fingerprint',
  });
  assert.equal(campaign.physicalAcceptance, false);
  assert.equal(campaign.w15jAccepted, false);
  assert.equal(campaign.w16BuildUnblocked, false);
});

test('PASS cannot be synthesized without explicit operator observation', () => {
  const record = { ...DP5_SCENARIOS[0], status: 'NOT_RUN', evidenceReferences: [] };
  assert.throws(
    () =>
      applyOperatorVerdict({
        scenario: record,
        status: 'PASS',
        failureCause: '',
        evidenceReferences: ['harness/evidence.txt'],
        observedAtUtc: '2026-09-19T12:00:00Z',
        operatorObserved: false,
      }),
    /explicit --observed/,
  );
  const passed = applyOperatorVerdict({
    scenario: record,
    status: 'PASS',
    failureCause: '',
    evidenceReferences: ['harness/evidence.txt'],
    observedAtUtc: '2026-09-19T12:00:00Z',
    operatorObserved: true,
  });
  assert.equal(passed.status, 'PASS');
});

test('FAIL and BLOCKED require a cause', () => {
  const record = { ...DP5_SCENARIOS[0], status: 'NOT_RUN', evidenceReferences: [] };
  for (const status of ['FAIL', 'BLOCKED']) {
    assert.throws(
      () =>
        applyOperatorVerdict({
          scenario: record,
          status,
          failureCause: '',
          evidenceReferences: ['harness/evidence.txt'],
          observedAtUtc: '2026-09-19T12:00:00Z',
          operatorObserved: false,
        }),
      /requires --cause/,
    );
  }
});

test('48 explicit PASS records still generate NOT_ACCEPTED disposition', () => {
  const campaign = createCampaign({
    dossier: dossier(),
    controlTower: { schemaVersion: 'w15j-control-tower-tuple-v1' },
    operator: 'operator-1',
  });
  for (const record of campaign.scenarios) {
    record.status = 'PASS';
    record.observedAtUtc = '2026-09-19T12:00:00Z';
    record.evidenceReferences = ['evidence.txt'];
  }
  const report = renderReport(campaign, dossier());
  assert.match(report, /READY_FOR_INDEPENDENT_REVIEW_NOT_ACCEPTED/);
  assert.match(report, /does not accept DP5/);
  assert.match(report, /physical_acceptance=false/);
  assert.doesNotMatch(report, /DP5 ACCEPTED/);
});


test('DP5 snapshot preserves the remote shell command as one adb argument', () => {
  const source = readFileSync(
    new URL('../tablet-devlab/dp5-campaign.mjs', import.meta.url),
    'utf8',
  );
  assert.match(source, /\['-s', serial, 'shell', command\]/u);
  assert.doesNotMatch(source, /\['-s', serial, 'shell', 'sh', '-c', command\]/u);
});
