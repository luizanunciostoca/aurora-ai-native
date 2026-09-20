import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { URL } from 'node:url';

import {
  validateDispatchMaterial,
  validateSupervisorRequest,
} from '../tablet-devlab/dp5-host-supervisor.mjs';

test('supervisor protocol accepts only bounded local operations', () => {
  assert.equal(validateSupervisorRequest({ op: 'STATUS' }), true);
  assert.equal(validateSupervisorRequest({ op: 'REFRESH' }), true);
  assert.equal(validateSupervisorRequest({ op: 'STOP' }), true);
  assert.equal(validateSupervisorRequest({ op: 'DISPATCH', request: {} }), true);
  assert.equal(validateSupervisorRequest({ op: 'STATUS', extra: true }), false);
  assert.equal(validateSupervisorRequest({ op: 'OFFLINE_DRAIN' }), false);
  assert.equal(validateSupervisorRequest(null), false);
});

test('dispatch must bind exactly to fresh material and remain non-authoritative', () => {
  const material = {
    commandId: 'cmd_01ARZ3NDEKTSV4RRFFQ69G5FAV',
    executionId: 'exe_01ARZ3NDEKTSV4RRFFQ69G5FAV',
    actionIntentId: 'act_01ARZ3NDEKTSV4RRFFQ69G5FAV',
    tenantId: 'ten_01ARZ3NDEKTSV4RRFFQ69G5FAV',
    deviceId: 'dvc_01ARZ3NDEKTSV4RRFFQ69G5FAV',
    deviceSessionId: 'dss_fixture',
  };
  const request = {
    command: {
      commandId: material.commandId,
      executionId: material.executionId,
      actionIntent: { actionIntentId: material.actionIntentId },
      authorizesExecution: false,
    },
    context: {
      tenantId: material.tenantId,
      deviceId: material.deviceId,
      deviceSessionId: material.deviceSessionId,
    },
  };
  assert.equal(validateDispatchMaterial(request, material), true);
  assert.equal(
    validateDispatchMaterial(
      { ...request, command: { ...request.command, authorizesExecution: true } },
      material,
    ),
    false,
  );
  assert.equal(
    validateDispatchMaterial(
      { ...request, context: { ...request.context, deviceId: 'dvc_attacker' } },
      material,
    ),
    false,
  );
});

test('supervisor preserves W14 continuity without becoming an authority surface', async () => {
  const source = await readFile(
    new URL('../tablet-devlab/dp5-host-supervisor.mjs', import.meta.url),
    'utf8',
  );
  assert.equal(source.includes('createW15JLocalPhysicalHostW14Continuity'), true);
  assert.equal(source.includes('w14Continuity: continuity'), true);
  assert.equal(source.includes('chmodSync(socketPath, 0o600)'), true);
  assert.equal(source.includes('createServer({ allowHalfOpen: true }'), true);
  assert.equal(source.includes('DP5_HOST_SUPERVISOR_SOCKET_ERROR='), true);
  assert.equal(source.includes('OFFLINE_DRAIN'), false);
  assert.equal(source.includes("campaign('finish'"), false);
  assert.equal(source.includes('physicalAcceptance: true'), false);
  assert.equal(source.includes('authorizesExecution: true'), false);
});

test('refresh validates candidate input before stopping the active Host', async () => {
  const source = await readFile(
    new URL('../tablet-devlab/dp5-host-supervisor.mjs', import.meta.url),
    'utf8',
  );
  const refreshStart = source.indexOf("if (input.op === 'REFRESH')");
  const dispatchStart = source.indexOf("if (input.op === 'DISPATCH')", refreshStart);
  assert.notEqual(refreshStart, -1);
  assert.notEqual(dispatchStart, -1);
  const refreshBlock = source.slice(refreshStart, dispatchStart);
  const prepareIndex = refreshBlock.indexOf('await prepareRuntimeInput(databaseUrl)');
  const stopIndex = refreshBlock.indexOf('await stopActive(active)');
  assert.notEqual(prepareIndex, -1);
  assert.notEqual(stopIndex, -1);
  assert.equal(prepareIndex < stopIndex, true);
});

test('supervisor start wrapper is fail-closed and never kills an unknown Host', async () => {
  const source = await readFile(
    new URL('../tablet-devlab/start-dp5-host-supervisor.sh', import.meta.url),
    'utf8',
  );
  assert.equal(source.includes('verify-host-prebuild.sh'), true);
  assert.equal(source.includes('EXPECTED_HOST_SHA='), true);
  assert.equal(source.includes('existing supervisor is bound to a different Host SHA'), true);
  assert.equal(source.includes('refusing to replace an unknown Host'), true);
  assert.equal(source.includes('kill -9'), false);
  assert.equal(source.includes('am force-stop'), false);
  assert.equal(source.includes('authorizesExecution'), true);
});
