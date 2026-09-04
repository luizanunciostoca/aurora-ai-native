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

import type { DeviceId } from '../../device/types.js';
import type { DeviceSessionTrustSnapshot } from '../../device-session/types.js';
import type { RealtimeCommandSnapshot } from '../../realtime-session/types.js';
import { DeviceCommandDeliveryManager } from '../manager.js';
import type {
  W03DurableDeliveryReservationPort,
  W03DurableDeliveryReservationRequest,
  W03DurableDeliveryReservationResult,
} from '../types.js';

const TENANT = 'tnn_01ARZ3NDEKTSV4RRFFQ69G5FAV' as TenantId;
const CORRELATION = 'cor_01ARZ3NDEKTSV4RRFFQ69G5FAV' as CorrelationId;
const COMMAND_1 = 'cmd_01ARZ3NDEKTSV4RRFFQ69G5FAV' as CommandId;
const COMMAND_2 = 'cmd_01ARZ3NDEKTSV4RRFFQ69G5FAW' as CommandId;
const EXECUTION_1 = 'exe_01ARZ3NDEKTSV4RRFFQ69G5FAV' as ExecutionId;
const EXECUTION_2 = 'exe_01ARZ3NDEKTSV4RRFFQ69G5FAW' as ExecutionId;
const CAUSATION = 'cau_01ARZ3NDEKTSV4RRFFQ69G5FAV' as CausationId;
const DEVICE = 'device-1' as DeviceId;

class DurablePort implements W03DurableDeliveryReservationPort {
  readonly bindings = new Map<string, string>();

  reserve(request: W03DurableDeliveryReservationRequest): W03DurableDeliveryReservationResult {
    const fingerprint = `${request.tenantId}|${request.commandId}|${request.executionId}`;
    const prior = this.bindings.get(request.idempotencyKey);
    if (prior !== undefined && prior !== fingerprint) {
      return { ok: false, code: 'CONFLICT', retryable: false, authorizesExecution: false };
    }
    this.bindings.set(request.idempotencyKey, fingerprint);
    return {
      ok: true,
      disposition: prior === undefined ? 'RESERVED' : 'ALREADY_RESERVED',
      durableReference: `w03:${request.idempotencyKey}`,
      authorizesExecution: false,
    };
  }
}

function command(
  commandId: CommandId = COMMAND_1,
  executionId: ExecutionId = EXECUTION_1,
  state: RealtimeCommandSnapshot['state'] = 'SUBMITTED',
): RealtimeCommandSnapshot {
  return {
    commandId,
    executionId,
    executionTarget: { schemaVersion: '1.0.0', kind: 'DEVICE', bindingReference: DEVICE },
    correlationId: CORRELATION,
    causationId: CAUSATION,
    state,
    deadlineMs: 10_000,
    submittedAtMs: 1_000,
    updatedAtMs: 1_000,
    submittedGatewayGeneration: 1,
    lastRemoteSequence: 0,
    redeliveryDisposition: state === 'UNCERTAIN' ? 'BLOCK_UNCERTAIN' : 'NOT_DECIDED_BY_W14_B',
    authoritySemantics: 'TRANSPORT_SESSION_ONLY_NO_ACTION_AUTHORITY',
    authorizesExecution: false,
    provesExecutionSuccess: false,
    externalStateVerified: false,
  };
}

function trust(connectionId = 'connection-1', generation = 1): DeviceSessionTrustSnapshot {
  return {
    kind: 'DeviceSessionTrustSnapshot',
    schemaVersion: '1.0.0',
    deviceSessionId: 'device-session-1',
    gatewaySessionId: 'gateway-session-1',
    connectionId,
    gatewayGeneration: generation,
    tenantId: TENANT,
    actorIdentityId: 'idn_01ARZ3NDEKTSV4RRFFQ69G5FAV' as IdentityId,
    correlationId: CORRELATION,
    deviceRef: {
      kind: 'AURORA_DEVICE',
      deviceId: DEVICE,
      tenantId: TENANT,
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
  };
}

test('prepares, delivers and deduplicates acknowledgement without minting authority', () => {
  const manager = new DeviceCommandDeliveryManager(new DurablePort());
  const prepared = manager.prepare({
    command: command(),
    deviceSession: trust(),
    idempotencyKey: 'idem-1',
    orderingKey: 'device-1',
    orderingSequence: 1,
    nowMs: 1_100,
  });
  assert.equal(prepared.ok, true);

  const claimed = manager.claim({ command: command(), deviceSession: trust(), nowMs: 1_200 });
  assert.equal(claimed.ok, true);
  if (!claimed.ok) return;
  assert.equal(claimed.value.disposition, 'DELIVER');
  assert.equal(claimed.value.envelope?.authorizesExecution, false);
  assert.equal(claimed.value.envelope?.provesExecutionSuccess, false);

  const ack = manager.acknowledge({
    command: command(),
    deviceSession: trust(),
    deliveryReference: claimed.value.delivery.deliveryReference,
    ackReference: 'ack-1',
    observedAtMs: 1_300,
  });
  assert.equal(ack.ok, true);
  if (!ack.ok) return;
  assert.equal(ack.value.delivery.provesExecutionSuccess, false);

  const duplicate = manager.acknowledge({
    command: command(),
    deviceSession: trust(),
    deliveryReference: claimed.value.delivery.deliveryReference,
    ackReference: 'ack-1',
    observedAtMs: 1_400,
  });
  assert.equal(duplicate.ok, true);
  if (duplicate.ok) assert.equal(duplicate.value.disposition, 'DUPLICATE_ACK');
});

test('reconnect replays the same envelope only while W14-B still reports SUBMITTED', () => {
  const manager = new DeviceCommandDeliveryManager(new DurablePort());
  assert.equal(
    manager.prepare({
      command: command(),
      deviceSession: trust(),
      idempotencyKey: 'idem-reconnect',
      orderingKey: 'device-1',
      orderingSequence: 1,
      nowMs: 1_100,
    }).ok,
    true,
  );
  const first = manager.claim({ command: command(), deviceSession: trust(), nowMs: 1_200 });
  assert.equal(first.ok, true);
  if (!first.ok) return;
  const replay = manager.claim({
    command: command(),
    deviceSession: trust('connection-2', 2),
    nowMs: 1_300,
  });
  assert.equal(replay.ok, true);
  if (!replay.ok) return;
  assert.equal(replay.value.disposition, 'REPLAY_SAME_ENVELOPE');
  assert.equal(replay.value.envelope?.deliveryReference, first.value.envelope?.deliveryReference);

  const hold = manager.claim({
    command: command(COMMAND_1, EXECUTION_1, 'ACCEPTED'),
    deviceSession: trust('connection-3', 3),
    nowMs: 1_400,
  });
  assert.equal(hold.ok, true);
  if (hold.ok) assert.equal(hold.value.disposition, 'HOLD_ALREADY_ACCEPTED_OR_RUNNING');
});

test('EXECUTION_UNCERTAIN and cancellation fail closed before replay', () => {
  const manager = new DeviceCommandDeliveryManager(new DurablePort());
  const uncertain = manager.prepare({
    command: command(COMMAND_1, EXECUTION_1, 'UNCERTAIN'),
    deviceSession: trust(),
    idempotencyKey: 'idem-u',
    orderingKey: 'device-1',
    orderingSequence: 1,
    nowMs: 1_100,
  });
  assert.equal(uncertain.ok, false);
  if (!uncertain.ok) {
    assert.equal(uncertain.error.code, 'EXECUTION_UNCERTAIN');
    assert.equal(uncertain.retryAuthorized, false);
  }

  const cancelled = manager.prepare({
    command: command(COMMAND_1, EXECUTION_1, 'CANCEL_REQUESTED'),
    deviceSession: trust(),
    idempotencyKey: 'idem-c',
    orderingKey: 'device-1',
    orderingSequence: 1,
    nowMs: 1_100,
  });
  assert.equal(cancelled.ok, false);
  if (!cancelled.ok) assert.equal(cancelled.error.code, 'COMMAND_CANCELLED');
});

test('strict ordering blocks sequence two until sequence one acknowledgement', () => {
  const manager = new DeviceCommandDeliveryManager(new DurablePort());
  const firstCommand = command(COMMAND_1, EXECUTION_1);
  const secondCommand = command(COMMAND_2, EXECUTION_2);
  assert.equal(
    manager.prepare({
      command: firstCommand,
      deviceSession: trust(),
      idempotencyKey: 'idem-o1',
      orderingKey: 'ordered',
      orderingSequence: 1,
      nowMs: 1_100,
    }).ok,
    true,
  );
  assert.equal(
    manager.prepare({
      command: secondCommand,
      deviceSession: trust(),
      idempotencyKey: 'idem-o2',
      orderingKey: 'ordered',
      orderingSequence: 2,
      nowMs: 1_100,
    }).ok,
    true,
  );
  const blocked = manager.claim({ command: secondCommand, deviceSession: trust(), nowMs: 1_200 });
  assert.equal(blocked.ok, false);
  if (!blocked.ok) assert.equal(blocked.error.code, 'ORDERING_BLOCKED');

  const first = manager.claim({ command: firstCommand, deviceSession: trust(), nowMs: 1_200 });
  assert.equal(first.ok, true);
  if (!first.ok) return;
  assert.equal(
    manager.acknowledge({
      command: firstCommand,
      deviceSession: trust(),
      deliveryReference: first.value.delivery.deliveryReference,
      ackReference: 'ack-order-1',
      observedAtMs: 1_300,
    }).ok,
    true,
  );
  const second = manager.claim({ command: secondCommand, deviceSession: trust(), nowMs: 1_400 });
  assert.equal(second.ok, true);
});

test('late ack after reconnect is classified but never proves execution success', () => {
  const manager = new DeviceCommandDeliveryManager(new DurablePort());
  const cmd = command();
  assert.equal(
    manager.prepare({
      command: cmd,
      deviceSession: trust(),
      idempotencyKey: 'idem-late',
      orderingKey: 'device-1',
      orderingSequence: 1,
      nowMs: 1_100,
    }).ok,
    true,
  );
  const first = manager.claim({ command: cmd, deviceSession: trust(), nowMs: 1_200 });
  assert.equal(first.ok, true);
  if (!first.ok) return;
  const late = manager.acknowledge({
    command: cmd,
    deviceSession: trust('connection-2', 2),
    deliveryReference: first.value.delivery.deliveryReference,
    ackReference: 'ack-late',
    observedAtMs: 1_300,
  });
  assert.equal(late.ok, true);
  if (!late.ok) return;
  assert.equal(late.value.disposition, 'LATE_ACK_AFTER_RECONNECT');
  assert.equal(late.value.delivery.provesExecutionSuccess, false);
});

test('wrong device, stale trust and W03 conflict fail closed', () => {
  const durable = new DurablePort();
  const manager = new DeviceCommandDeliveryManager(durable);
  const baseWrong = command();
  const wrong: RealtimeCommandSnapshot = {
    ...baseWrong,
    executionTarget: { ...baseWrong.executionTarget, bindingReference: 'device-2' },
  };
  const wrongResult = manager.prepare({
    command: wrong,
    deviceSession: trust(),
    idempotencyKey: 'idem-wrong',
    orderingKey: 'device-1',
    orderingSequence: 1,
    nowMs: 1_100,
  });
  assert.equal(wrongResult.ok, false);
  if (!wrongResult.ok) assert.equal(wrongResult.error.code, 'DEVICE_MISMATCH');

  const stale = manager.prepare({
    command: command(),
    deviceSession: { ...trust(), gatewayAuthExpiresAtMs: 1_000 },
    idempotencyKey: 'idem-stale',
    orderingKey: 'device-1',
    orderingSequence: 1,
    nowMs: 1_100,
  });
  assert.equal(stale.ok, false);
  if (!stale.ok) assert.equal(stale.error.code, 'SESSION_EXPIRED');

  durable.bindings.set('idem-conflict', `${TENANT}|${COMMAND_2}|${EXECUTION_2}`);
  const conflict = manager.prepare({
    command: command(),
    deviceSession: trust(),
    idempotencyKey: 'idem-conflict',
    orderingKey: 'device-1',
    orderingSequence: 1,
    nowMs: 1_100,
  });
  assert.equal(conflict.ok, false);
  if (!conflict.ok) assert.equal(conflict.error.code, 'DURABLE_IDEMPOTENCY_CONFLICT');
});
