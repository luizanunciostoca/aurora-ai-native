import assert from 'node:assert/strict';
import test from 'node:test';
import { URL } from 'node:url';

import {
  buildActionIntent,
  buildDispatchRequest,
  executionStateCompatible,
  gatewaySessionIdFromConnectionId,
  parseSessionPrefs,
} from '../tablet-devlab/dp5-life004-inprocess.mjs';

const material = Object.freeze({
  tenantId: 'ten_4EXKXWCW5MV3YT04GR12RN96D5',
  actorIdentityId: 'idn_53G0CPK25EGYVRSYTT6T48860V',
  correlationId: 'cor_3FZW5XYZ5K039XW5QDRYTRKCXF',
  deviceId: 'dvc_7VFJA4C3V6YP4NZMT4VTQZR3P1',
  deviceSessionId: 'dss_fixture',
  actionIntentId: 'act_3BFVBHKYX8P592V1GFSKJA310B',
  commandId: 'cmd_5FPDM395T50YGPAMWASNQ39FXZ',
  executionId: 'exe_2EFWQHQJCMJ55HN5Z2ESSASQTZ',
  causationId: 'cau_7ER3PXQJVHZ41V1EW92HS4QSR3',
  policyTokenId: 'ptk_12345678901234567890123456',
  idempotencyKey: 'idem_fixture',
  orderingKey: 'device:audio:volume',
  orderingSequence: 1,
  expiresAt: '2026-09-20T08:00:00.000Z',
});

test('derives gateway session id from Android connection id', () => {
  assert.equal(
    gatewaySessionIdFromConnectionId('conn:gws_hLus5CYn8svitfjjZDTRAw:1'),
    'gws_hLus5CYn8svitfjjZDTRAw',
  );
  assert.throws(() => gatewaySessionIdFromConnectionId('bad'));
});

test('parses current Android session metadata', () => {
  const xml = `<map>
<string name="tenant_id">${material.tenantId}</string>
<string name="device_session_id">${material.deviceSessionId}</string>
<string name="device_id">${material.deviceId}</string>
<string name="connection_id">conn:gws_fixture:2</string>
<int name="registration_version" value="3" />
</map>`;
  assert.deepEqual(parseSessionPrefs(xml), {
    tenantId: material.tenantId,
    deviceSessionId: material.deviceSessionId,
    deviceId: material.deviceId,
    connectionId: 'conn:gws_fixture:2',
    gatewaySessionId: 'gws_fixture',
    registrationVersion: 3,
  });
});

test('builds a bounded non-authoritative dispatch request', () => {
  const session = {
    tenantId: material.tenantId,
    deviceSessionId: material.deviceSessionId,
    deviceId: material.deviceId,
    connectionId: 'conn:gws_fixture:2',
    gatewaySessionId: 'gws_fixture',
    registrationVersion: 3,
  };
  const request = buildDispatchRequest(material, session, 123456);
  assert.equal(request.command.commandId, material.commandId);
  assert.equal(request.command.executionId, material.executionId);
  assert.equal(request.command.authorizesExecution, false);
  assert.equal(request.command.actionIntent.capability.capability, 'audio.volume.set');
  assert.equal(request.command.actionIntent.executionTarget.bindingReference, material.deviceId);
  assert.equal(request.command.canonicalPayloadHash.startsWith('sha256:'), true);
  assert.equal(request.context.gatewaySessionId, 'gws_fixture');
  assert.equal(request.context.connectionId, 'conn:gws_fixture:2');
  assert.equal(request.context.registrationVersion, 3);
  assert.equal(request.dispatchedAtMs, 123456);
});

test('action intent preserves required idempotency and policy token', () => {
  const intent = buildActionIntent(material);
  assert.deepEqual(intent.idempotency, { mode: 'REQUIRED', key: material.idempotencyKey });
  assert.deepEqual(intent.authority, {
    kind: 'POLICY_TOKEN',
    policyTokenId: material.policyTokenId,
  });
  assert.equal(intent.dataClassification, 'INTERNAL');
});

test('LIFE-004 helper cannot drain work or synthesize a verdict', async () => {
  const { readFile } = await import('node:fs/promises');
  const source = await readFile(
    new URL('../tablet-devlab/dp5-life004-inprocess.mjs', import.meta.url),
    'utf8',
  );
  assert.equal(source.includes('OFFLINE_DRAIN'), false);
  assert.equal(source.includes("campaign('finish'"), false);
  assert.equal(source.includes('DP5_LIFE_004_ACTION=RECORDED_NOT_VERDICT'), true);
});

test('compatible existing W03 state is accepted read-only', () => {
  const seed = {
    tenantId: material.tenantId,
    actionIntentId: material.actionIntentId,
    executionRef: material.executionId,
    attemptNumber: 1,
    maxAttempts: 1,
    quota: { limit: 1, used: 0 },
    circuitKey: 'w15j:device:audio:volume',
    containment: {
      circuit: { state: 'CLOSED', consecutiveFailures: 0, halfOpenProbeInFlight: false },
      killSwitch: { state: 'INACTIVE' },
      dependencyHealth: 'HEALTHY',
      cancellationRequested: false,
      currentInFlight: 0,
      maxInFlight: 1,
      retryDepth: 0,
      maxRetryDepth: 0,
    },
  };

  const attempt = {
    tenantId: seed.tenantId,
    actionIntentId: seed.actionIntentId,
    executionRef: seed.executionRef,
    attemptNumber: 1,
    maxAttempts: 1,
    quota: { limit: 1, used: 0 },
  };
  const containment = {
    tenantId: seed.tenantId,
    circuitKey: seed.circuitKey,
    authorizesExecution: false,
    snapshot: JSON.parse(JSON.stringify(seed.containment)),
  };
  assert.equal(executionStateCompatible(seed, attempt, containment), true);
  assert.equal(
    executionStateCompatible(seed, { ...attempt, quota: { limit: 1, used: 1 } }, containment),
    false,
  );
  const changed = JSON.parse(JSON.stringify(containment));
  changed.snapshot.killSwitch.state = 'ACTIVE';
  assert.equal(executionStateCompatible(seed, attempt, changed), false);
});

test('LIFE-004 bootstrap enters through exported MainActivity', async () => {
  const { readFile } = await import('node:fs/promises');
  const source = await readFile(
    new URL('../tablet-devlab/dp5-life004-inprocess.mjs', import.meta.url),
    'utf8',
  );
  assert.equal(source.includes('GatewayBootstrapSetupActivity'), false);
  assert.equal(source.includes('Modo desenvolvedor'), true);
  assert.equal(source.includes('Conectar runtime LOCAL'), true);
  assert.equal(source.includes("['shell', 'am', 'start', '-W', '-n', MAIN]"), true);
  assert.equal(
    source.includes("['shell', 'for i in $(seq 1 180); do input keyevent KEYCODE_DEL; done']"),
    true,
  );
});

test('LIFE-004 enforces canonical bootstrap freshness and persistent phase telemetry', async () => {
  const { readFile } = await import('node:fs/promises');
  const source = await readFile(
    new URL('../tablet-devlab/dp5-life004-inprocess.mjs', import.meta.url),
    'utf8',
  );
  assert.equal(source.includes('MAX_BOOTSTRAP_PRINCIPAL_AGE_SECONDS = 240'), true);
  assert.equal(source.includes("recordPhase('BOOTSTRAP_PRINCIPAL_FRESH')"), true);
  assert.equal(source.includes("recordPhase('BOOTSTRAP_COMPOSED'"), true);
  assert.equal(source.includes("recordPhase('ERROR'"), true);
  assert.equal(source.includes('bootstrap reference/button did not become ready'), true);
  assert.equal(source.includes('for (let index = 0; index < 20; index += 1)'), true);
  assert.equal(source.includes('for (let index = 0; index < 40; index += 1)'), true);
  assert.equal(source.includes('/enabled="true"/u.test(tag)'), true);
  assert.equal(source.includes('Android bootstrap rejected after connect timeout'), true);
  assert.equal(source.includes("throw new Error('Android bootstrap rejected');"), false);
});
