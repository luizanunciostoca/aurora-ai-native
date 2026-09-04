import assert from 'node:assert/strict';
import test from 'node:test';

import { DeviceCommandDeliveryManager } from '../../../services/mobile-gateway/src/device-command-delivery/manager.ts';

const command = (commandId: string, executionId: string) => ({
  commandId,
  executionId,
  executionTarget: { schemaVersion: '1.0.0', kind: 'DEVICE', bindingReference: 'device-1' },
  correlationId: 'cor_01ARZ3NDEKTSV4RRFFQ69G5FAV',
  causationId: 'cau_01ARZ3NDEKTSV4RRFFQ69G5FAV',
  state: 'SUBMITTED',
  deadlineMs: 10_000,
  submittedAtMs: 1_000,
  updatedAtMs: 1_000,
  submittedGatewayGeneration: 1,
  lastRemoteSequence: 0,
  redeliveryDisposition: 'NOT_DECIDED_BY_W14_B',
  authoritySemantics: 'TRANSPORT_SESSION_ONLY_NO_ACTION_AUTHORITY',
  authorizesExecution: false,
  provesExecutionSuccess: false,
  externalStateVerified: false,
});

const trust = () => ({
  kind: 'DeviceSessionTrustSnapshot',
  schemaVersion: '1.0.0',
  deviceSessionId: 'device-session-1',
  gatewaySessionId: 'gateway-session-1',
  connectionId: 'connection-1',
  gatewayGeneration: 1,
  tenantId: 'tnn_01ARZ3NDEKTSV4RRFFQ69G5FAV',
  actorIdentityId: 'idn_01ARZ3NDEKTSV4RRFFQ69G5FAV',
  correlationId: 'cor_01ARZ3NDEKTSV4RRFFQ69G5FAV',
  deviceRef: {
    kind: 'AURORA_DEVICE',
    deviceId: 'device-1',
    tenantId: 'tnn_01ARZ3NDEKTSV4RRFFQ69G5FAV',
    registrationVersion: 1,
  },
  attestation: {
    kind: 'DEVICE_ATTESTATION_REFERENCE',
    reference: 'attestation-1',
    provider: 'test',
    version: '1',
    state: 'VERIFIED',
    observedAtMs: 900,
    expiresAtMs: 20_000,
  },
  state: 'ACTIVE',
  openedAtMs: 900,
  lastEvaluatedAtMs: 1_000,
  gatewayAuthExpiresAtMs: 20_000,
  executionPreconditionSatisfied: true,
  requiresCurrentAuthorityValidation: true,
  authoritySemantics: 'DEVICE_SESSION_TRUST_IS_PRECONDITION_METADATA_ONLY',
  authorizesExecution: false,
  canGrantPermission: false,
});

class DurablePort {
  reserve(request: { idempotencyKey: string }) {
    return {
      ok: true as const,
      disposition: 'RESERVED' as const,
      durableReference: `w03:${request.idempotencyKey}`,
      authorizesExecution: false as const,
    };
  }
}

test('W14-F rejects revoked-session ACK and keeps ordered successor blocked', () => {
  const manager = new DeviceCommandDeliveryManager(new DurablePort());
  const first = command('cmd_01ARZ3NDEKTSV4RRFFQ69G5FAV', 'exe_01ARZ3NDEKTSV4RRFFQ69G5FAV');
  const second = command('cmd_01ARZ3NDEKTSV4RRFFQ69G5FAW', 'exe_01ARZ3NDEKTSV4RRFFQ69G5FAW');
  const activeTrust = trust();

  const preparedFirst = manager.prepare({
    command: first,
    deviceSession: activeTrust,
    idempotencyKey: 'idem-ack-trust-1',
    orderingKey: 'ordered',
    orderingSequence: 1,
    nowMs: 1_100,
  });
  assert.equal(preparedFirst.ok, true);
  const claimedFirst = manager.claim({ command: first, deviceSession: activeTrust, nowMs: 1_200 });
  assert.equal(claimedFirst.ok, true);
  if (!claimedFirst.ok) return;

  const preparedSecond = manager.prepare({
    command: second,
    deviceSession: activeTrust,
    idempotencyKey: 'idem-ack-trust-2',
    orderingKey: 'ordered',
    orderingSequence: 2,
    nowMs: 1_210,
  });
  assert.equal(preparedSecond.ok, true);

  const revokedTrust = {
    ...activeTrust,
    state: 'REVOKED',
    executionPreconditionSatisfied: false,
    revokedAtMs: 1_250,
    revocationReasonReference: 'security-revoke',
  };
  const forgedAck = manager.acknowledge({
    command: first,
    deviceSession: revokedTrust,
    deliveryReference: claimedFirst.value.delivery.deliveryReference,
    ackReference: 'ack-forged-after-revoke',
    observedAtMs: 1_300,
  });
  assert.equal(forgedAck.ok, false);
  if (!forgedAck.ok) assert.equal(forgedAck.error.code, 'SESSION_NOT_TRUSTED');

  const blockedSecond = manager.claim({
    command: second,
    deviceSession: activeTrust,
    nowMs: 1_400,
  });
  assert.equal(blockedSecond.ok, false);
  if (!blockedSecond.ok) assert.equal(blockedSecond.error.code, 'ORDERING_BLOCKED');
});
