import assert from 'node:assert/strict';
import test from 'node:test';

import type {
  CausationId,
  CommandId,
  CorrelationId,
  ExecutionId,
  IdentityId,
  TenantId,
} from '@aurora/contracts/ids';

import type { DeviceId, DeviceRef, DeviceResolutionResult } from '../../device/types.js';
import type { GatewayProtocolResult, GatewaySessionSnapshot } from '../../gateway-auth/types.js';
import { RealtimeCommandSessionManager } from '../manager.js';
import type { DeviceRegistrationReader, GatewaySessionReader } from '../types.js';

const TENANT = 'ten_01ARZ3NDEKTSV4RRFFQ69G5FAV' as TenantId;
const ACTOR = 'idn_01ARZ3NDEKTSV4RRFFQ69G5FAV' as IdentityId;
const CORRELATION = 'cor_01ARZ3NDEKTSV4RRFFQ69G5FAV' as CorrelationId;
const CAUSATION = 'cau_01ARZ3NDEKTSV4RRFFQ69G5FAV' as CausationId;
const COMMAND = 'cmd_01ARZ3NDEKTSV4RRFFQ69G5FAV' as CommandId;
const EXECUTION = 'exe_01ARZ3NDEKTSV4RRFFQ69G5FAV' as ExecutionId;
const DEVICE = 'dvc_01ARZ3NDEKTSV4RRFFQ69G5FAV' as DeviceId;

const DEVICE_REF: DeviceRef = {
  kind: 'AURORA_DEVICE',
  deviceId: DEVICE,
  tenantId: TENANT,
  registrationVersion: 1,
};

class GatewayReader implements GatewaySessionReader {
  snapshot: GatewaySessionSnapshot = {
    protocolVersion: '1.0',
    sessionId: 'gateway-session-1',
    connectionId: 'connection-1',
    generation: 1,
    state: 'OPEN',
    tenantId: TENANT,
    actorKind: 'HUMAN',
    actorIdentityId: ACTOR,
    correlationId: CORRELATION,
    authIssuedAtMs: 900,
    authExpiresAtMs: 5_000,
    openedAtMs: 900,
    outstandingRequests: 0,
    authorizesExecution: false,
  };

  getSession(): GatewayProtocolResult<GatewaySessionSnapshot> {
    return { ok: true, value: this.snapshot };
  }
}

class DeviceReader implements DeviceRegistrationReader {
  resolve(): DeviceResolutionResult {
    return {
      ok: true,
      record: {
        kind: 'DeviceRegistrationRecord',
        schemaVersion: '1.0.0',
        ref: DEVICE_REF,
        boundIdentityId: ACTOR,
        state: 'ACTIVE',
        registeredAt: '2026-09-04T00:00:00Z',
        updatedAt: '2026-09-04T00:00:00Z',
        provenance: {
          source: 'W14_DEVICE_REGISTRATION',
          reference: 'registration-current-command',
          observedAt: '2026-09-04T00:00:00Z',
        },
        authoritySemantics: 'DEVICE_REGISTRATION_ONLY_NO_ACTION_AUTHORITY',
        authorizesExecution: false,
        canGrantPermission: false,
      },
      authorizesExecution: false,
      canGrantPermission: false,
    };
  }
}

function createSubmittedCommand() {
  const gateway = new GatewayReader();
  const manager = new RealtimeCommandSessionManager(gateway, new DeviceReader());
  const opened = manager.openSession({
    gatewaySessionId: gateway.snapshot.sessionId,
    deviceRef: DEVICE_REF,
    nowMs: 1_000,
  });
  assert.equal(opened.ok, true);

  const submitted = manager.submitCommand({
    gatewaySessionId: gateway.snapshot.sessionId,
    gatewayConnectionId: gateway.snapshot.connectionId,
    nowMs: 1_100,
    commandId: COMMAND,
    executionId: EXECUTION,
    executionTarget: {
      schemaVersion: '1.0.0',
      kind: 'DEVICE',
      bindingReference: DEVICE,
    },
    correlationId: CORRELATION,
    causationId: CAUSATION,
    deadlineMs: 2_000,
  });
  assert.equal(submitted.ok, true);
  return { gateway, manager };
}

test('W14-B current command read returns canonical non-authoritative state without mutation', () => {
  const { gateway, manager } = createSubmittedCommand();
  const current = manager.getCommand(
    gateway.snapshot.sessionId,
    gateway.snapshot.connectionId,
    COMMAND,
    1_200,
  );
  assert.equal(current.ok, true);
  if (!current.ok) return;
  assert.equal(current.value.commandId, COMMAND);
  assert.equal(current.value.state, 'SUBMITTED');
  assert.equal(current.value.lastRemoteSequence, 0);
  assert.equal(current.value.authorizesExecution, false);
  assert.equal(current.value.provesExecutionSuccess, false);
  assert.equal(current.authorizesExecution, false);

  const second = manager.getCommand(
    gateway.snapshot.sessionId,
    gateway.snapshot.connectionId,
    COMMAND,
    1_201,
  );
  assert.deepEqual(second, current);
});

test('W14-B current command read fails closed on malformed, missing and wrong-connection lookups', () => {
  const { gateway, manager } = createSubmittedCommand();
  const malformed = manager.getCommand(
    gateway.snapshot.sessionId,
    gateway.snapshot.connectionId,
    'command-forged',
    1_200,
  );
  assert.equal(malformed.ok, false);
  if (!malformed.ok) assert.equal(malformed.error.code, 'MALFORMED_REQUEST');

  const missing = manager.getCommand(
    gateway.snapshot.sessionId,
    gateway.snapshot.connectionId,
    'cmd_01ARZ3NDEKTSV4RRFFQ69G5FAW' as CommandId,
    1_200,
  );
  assert.equal(missing.ok, false);
  if (!missing.ok) assert.equal(missing.error.code, 'COMMAND_NOT_FOUND');

  const wrongConnection = manager.getCommand(
    gateway.snapshot.sessionId,
    'connection-forged',
    COMMAND,
    1_200,
  );
  assert.equal(wrongConnection.ok, false);
  if (!wrongConnection.ok) assert.equal(wrongConnection.error.code, 'GATEWAY_CONNECTION_MISMATCH');
});

test('W14-B current command read requires explicit realtime resume after gateway reconnect', () => {
  const { gateway, manager } = createSubmittedCommand();
  gateway.snapshot = {
    ...gateway.snapshot,
    connectionId: 'connection-2',
    generation: 2,
  };

  const beforeResume = manager.getCommand(
    gateway.snapshot.sessionId,
    gateway.snapshot.connectionId,
    COMMAND,
    1_300,
  );
  assert.equal(beforeResume.ok, false);
  if (!beforeResume.ok) assert.equal(beforeResume.error.code, 'GATEWAY_CONNECTION_MISMATCH');

  const resumed = manager.resumeSession({
    gatewaySessionId: gateway.snapshot.sessionId,
    deviceRef: DEVICE_REF,
    nowMs: 1_301,
    previousGatewayConnectionId: 'connection-1',
  });
  assert.equal(resumed.ok, true);

  const current = manager.getCommand(
    gateway.snapshot.sessionId,
    gateway.snapshot.connectionId,
    COMMAND,
    1_302,
  );
  assert.equal(current.ok, true);
  if (current.ok) {
    assert.equal(current.value.state, 'SUBMITTED');
    assert.equal(current.value.submittedGatewayGeneration, 1);
  }
});
