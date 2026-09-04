import type { CommandId } from '@aurora/contracts/ids';

import type { DeviceSessionTrustSnapshot } from '../device-session/types.js';
import type { RealtimeCommandSnapshot } from '../realtime-session/types.js';
import type {
  AcknowledgeDeviceCommandDeliveryInput,
  AcknowledgeDeviceCommandDeliverySuccess,
  ClaimDeviceCommandDeliveryInput,
  ClaimDeviceCommandDeliverySuccess,
  DeviceCommandDeliveryConfig,
  DeviceCommandDeliveryErrorCode,
  DeviceCommandDeliveryResult,
  DeviceCommandDeliverySnapshot,
  DeviceCommandEnvelope,
  PrepareDeviceCommandDeliveryInput,
  PrepareDeviceCommandDeliverySuccess,
  W03DurableDeliveryReservationPort,
} from './types.js';

interface DeliveryRecord {
  readonly deliveryReference: string;
  readonly durableIdempotencyReference: string;
  readonly idempotencyKey: string;
  readonly commandId: RealtimeCommandSnapshot['commandId'];
  readonly executionId: RealtimeCommandSnapshot['executionId'];
  readonly correlationId: RealtimeCommandSnapshot['correlationId'];
  readonly tenantId: DeviceSessionTrustSnapshot['tenantId'];
  readonly deviceSessionId: string;
  readonly deviceId: string;
  readonly executionTarget: RealtimeCommandSnapshot['executionTarget'];
  readonly deadlineMs: number;
  readonly orderingKey: string;
  readonly orderingSequence: number;
  readonly preparedAtMs: number;
  state: 'QUEUED' | 'IN_FLIGHT' | 'ACKNOWLEDGED';
  lastUpdatedAtMs: number;
  lastDeliveryConnectionId?: string;
  lastDeliveryGatewayGeneration?: number;
  deliveryAttempts: number;
  ackReference?: string;
  acknowledgedAtMs?: number;
}

const DEFAULT_CONFIG: DeviceCommandDeliveryConfig = {
  maxTrackedDeliveries: 512,
  maxDeliveryAttempts: 3,
  maxOrderingKeyLength: 128,
  maxIdempotencyKeyLength: 256,
};

const SAFE_TOKEN = /^[A-Za-z0-9._:/-]+$/u;
const COMMAND_ID = /^cmd_[0-9A-HJKMNP-TV-Z]{26}$/u;

function failure<T>(
  code: DeviceCommandDeliveryErrorCode,
  message: string,
  retryable = false,
): DeviceCommandDeliveryResult<T> {
  return {
    ok: false,
    error: { code, message, retryable },
    authorizesExecution: false,
    retryAuthorized: false,
  };
}

function success<T>(value: T): DeviceCommandDeliveryResult<T> {
  return { ok: true, value, authorizesExecution: false, retryAuthorized: false };
}

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return false;
  try {
    const prototype = Object.getPrototypeOf(value);
    return prototype === Object.prototype || prototype === null;
  } catch {
    return false;
  }
}

function isSafeToken(value: unknown, maxLength: number): value is string {
  return (
    typeof value === 'string' &&
    value.length > 0 &&
    value.length <= maxLength &&
    SAFE_TOKEN.test(value)
  );
}

function isNonNegativeInteger(value: unknown): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0;
}

function isPositiveInteger(value: unknown): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value > 0;
}

function commandDeliverability<T>(
  command: RealtimeCommandSnapshot,
  nowMs: number,
): DeviceCommandDeliveryResult<T> | null {
  if (command.state === 'UNCERTAIN' || command.redeliveryDisposition === 'BLOCK_UNCERTAIN') {
    return failure('EXECUTION_UNCERTAIN', 'W07 reconciliation is required before redelivery.');
  }
  if (command.state === 'CANCEL_REQUESTED' || command.state === 'CANCELLED') {
    return failure('COMMAND_CANCELLED', 'Cancelled commands are not deliverable.');
  }
  if (command.state === 'COMPLETED' || command.state === 'FAILED') {
    return failure('COMMAND_NOT_DELIVERABLE', 'Terminal commands are not deliverable.');
  }
  if (command.deadlineMs <= nowMs) {
    return failure('DEADLINE_EXCEEDED', 'Command deadline has elapsed.');
  }
  return null;
}

function validateTrust<T>(
  command: RealtimeCommandSnapshot,
  trust: DeviceSessionTrustSnapshot,
  nowMs: number,
): DeviceCommandDeliveryResult<T> | null {
  if (
    trust.state !== 'ACTIVE' ||
    !trust.executionPreconditionSatisfied ||
    trust.authorizesExecution !== false ||
    trust.canGrantPermission !== false ||
    trust.attestation.state !== 'VERIFIED'
  ) {
    return failure(
      'SESSION_NOT_TRUSTED',
      'Current device session trust does not satisfy delivery preconditions.',
    );
  }
  if (
    nowMs >= trust.gatewayAuthExpiresAtMs ||
    nowMs >= trust.attestation.expiresAtMs ||
    nowMs < trust.attestation.observedAtMs
  ) {
    return failure('SESSION_EXPIRED', 'Device session or attestation is stale or expired.');
  }
  if (command.correlationId !== trust.correlationId) {
    return failure('CORRELATION_MISMATCH', 'Command and device session correlation differ.');
  }
  if (
    command.executionTarget.kind !== 'DEVICE' ||
    command.executionTarget.bindingReference !== trust.deviceRef.deviceId
  ) {
    return failure(
      'DEVICE_MISMATCH',
      'Command execution target does not match the trusted device.',
    );
  }
  return null;
}

function snapshot(record: DeliveryRecord): DeviceCommandDeliverySnapshot {
  return Object.freeze({
    deliveryReference: record.deliveryReference,
    durableIdempotencyReference: record.durableIdempotencyReference,
    idempotencyKey: record.idempotencyKey,
    commandId: record.commandId,
    executionId: record.executionId,
    correlationId: record.correlationId,
    tenantId: record.tenantId,
    deviceSessionId: record.deviceSessionId,
    deviceId: record.deviceId,
    orderingKey: record.orderingKey,
    orderingSequence: record.orderingSequence,
    state: record.state,
    preparedAtMs: record.preparedAtMs,
    lastUpdatedAtMs: record.lastUpdatedAtMs,
    ...(record.lastDeliveryConnectionId === undefined
      ? {}
      : { lastDeliveryConnectionId: record.lastDeliveryConnectionId }),
    ...(record.lastDeliveryGatewayGeneration === undefined
      ? {}
      : { lastDeliveryGatewayGeneration: record.lastDeliveryGatewayGeneration }),
    deliveryAttempts: record.deliveryAttempts,
    ...(record.ackReference === undefined ? {} : { ackReference: record.ackReference }),
    ...(record.acknowledgedAtMs === undefined ? {} : { acknowledgedAtMs: record.acknowledgedAtMs }),
    authoritySemantics: 'TRANSPORT_ONLY_W07_RETAINS_EXECUTION_AUTHORITY' as const,
    retryAuthority: 'W07_RECONCILIATION_REQUIRED_FOR_UNCERTAIN' as const,
    authorizesExecution: false as const,
    provesExecutionSuccess: false as const,
  });
}

function deliveryReference(commandId: CommandId, durableReference: string): string {
  return `w14f:${commandId}:${durableReference}`;
}

export class DeviceCommandDeliveryManager {
  readonly #durable: W03DurableDeliveryReservationPort;
  readonly #config: DeviceCommandDeliveryConfig;
  readonly #deliveries = new Map<CommandId, DeliveryRecord>();
  readonly #orderBindings = new Map<string, CommandId>();

  constructor(
    durable: W03DurableDeliveryReservationPort,
    config: Partial<DeviceCommandDeliveryConfig> = {},
  ) {
    this.#durable = durable;
    this.#config = { ...DEFAULT_CONFIG, ...config };
    if (
      !isPositiveInteger(this.#config.maxTrackedDeliveries) ||
      !isPositiveInteger(this.#config.maxDeliveryAttempts) ||
      !isPositiveInteger(this.#config.maxOrderingKeyLength) ||
      !isPositiveInteger(this.#config.maxIdempotencyKeyLength)
    ) {
      throw new Error('Device command delivery limits must be positive integers.');
    }
  }

  prepare(input: unknown): DeviceCommandDeliveryResult<PrepareDeviceCommandDeliverySuccess> {
    if (!isPlainRecord(input))
      return failure('MALFORMED_REQUEST', 'Delivery request is malformed.');
    const candidate = input as unknown as PrepareDeviceCommandDeliveryInput;
    if (
      !isPlainRecord(candidate.command) ||
      !isPlainRecord(candidate.deviceSession) ||
      !isSafeToken(candidate.idempotencyKey, this.#config.maxIdempotencyKeyLength) ||
      !isSafeToken(candidate.orderingKey, this.#config.maxOrderingKeyLength) ||
      !isPositiveInteger(candidate.orderingSequence) ||
      !isNonNegativeInteger(candidate.nowMs) ||
      typeof candidate.command.commandId !== 'string' ||
      !COMMAND_ID.test(candidate.command.commandId)
    ) {
      return failure(
        'MALFORMED_REQUEST',
        'Delivery identifiers, ordering or timing are malformed.',
      );
    }

    const commandBlock = commandDeliverability<PrepareDeviceCommandDeliverySuccess>(
      candidate.command,
      candidate.nowMs,
    );
    if (commandBlock) return commandBlock;
    const trustBlock = validateTrust<PrepareDeviceCommandDeliverySuccess>(
      candidate.command,
      candidate.deviceSession,
      candidate.nowMs,
    );
    if (trustBlock) return trustBlock;

    const existing = this.#deliveries.get(candidate.command.commandId);
    if (existing !== undefined) {
      if (
        existing.executionId === candidate.command.executionId &&
        existing.correlationId === candidate.command.correlationId &&
        existing.deviceSessionId === candidate.deviceSession.deviceSessionId &&
        existing.deviceId === candidate.deviceSession.deviceRef.deviceId &&
        existing.idempotencyKey === candidate.idempotencyKey &&
        existing.orderingKey === candidate.orderingKey &&
        existing.orderingSequence === candidate.orderingSequence
      ) {
        return success({ disposition: 'ALREADY_PREPARED', delivery: snapshot(existing) });
      }
      return failure('DELIVERY_CONFLICT', 'Command is already bound to a different delivery.');
    }

    const orderKey = `${candidate.orderingKey}|${candidate.orderingSequence}`;
    const ordered = this.#orderBindings.get(orderKey);
    if (ordered !== undefined && ordered !== candidate.command.commandId) {
      return failure('ORDERING_CONFLICT', 'Ordering sequence is already bound to another command.');
    }
    if (this.#deliveries.size >= this.#config.maxTrackedDeliveries) {
      const evictable = [...this.#deliveries.values()]
        .filter((entry) => entry.state === 'ACKNOWLEDGED')
        .sort((left, right) => left.lastUpdatedAtMs - right.lastUpdatedAtMs)[0];
      if (evictable === undefined) {
        return failure('BACKPRESSURE', 'Delivery tracking capacity is exhausted.', true);
      }
      this.#deliveries.delete(evictable.commandId);
      this.#orderBindings.delete(`${evictable.orderingKey}|${evictable.orderingSequence}`);
    }

    const reservation = this.#durable.reserve({
      tenantId: candidate.deviceSession.tenantId,
      correlationId: candidate.command.correlationId,
      commandId: candidate.command.commandId,
      executionId: candidate.command.executionId,
      idempotencyKey: candidate.idempotencyKey,
      nowMs: candidate.nowMs,
    });
    if (!reservation.ok) {
      return failure(
        reservation.code === 'CONFLICT'
          ? 'DURABLE_IDEMPOTENCY_CONFLICT'
          : 'DURABLE_IDEMPOTENCY_UNAVAILABLE',
        'W03 durable idempotency reservation did not succeed.',
        reservation.retryable,
      );
    }
    if (
      !isSafeToken(reservation.durableReference, 256) ||
      reservation.authorizesExecution !== false
    ) {
      return failure('DURABLE_IDEMPOTENCY_UNAVAILABLE', 'W03 reservation response is invalid.');
    }

    const record: DeliveryRecord = {
      deliveryReference: deliveryReference(
        candidate.command.commandId,
        reservation.durableReference,
      ),
      durableIdempotencyReference: reservation.durableReference,
      idempotencyKey: candidate.idempotencyKey,
      commandId: candidate.command.commandId,
      executionId: candidate.command.executionId,
      correlationId: candidate.command.correlationId,
      tenantId: candidate.deviceSession.tenantId,
      deviceSessionId: candidate.deviceSession.deviceSessionId,
      deviceId: candidate.deviceSession.deviceRef.deviceId,
      executionTarget: candidate.command.executionTarget,
      deadlineMs: candidate.command.deadlineMs,
      orderingKey: candidate.orderingKey,
      orderingSequence: candidate.orderingSequence,
      preparedAtMs: candidate.nowMs,
      state: 'QUEUED',
      lastUpdatedAtMs: candidate.nowMs,
      deliveryAttempts: 0,
    };
    this.#deliveries.set(record.commandId, record);
    this.#orderBindings.set(orderKey, record.commandId);
    return success({ disposition: 'PREPARED', delivery: snapshot(record) });
  }

  claim(input: unknown): DeviceCommandDeliveryResult<ClaimDeviceCommandDeliverySuccess> {
    if (!isPlainRecord(input)) return failure('MALFORMED_REQUEST', 'Claim request is malformed.');
    const candidate = input as unknown as ClaimDeviceCommandDeliveryInput;
    if (
      !isPlainRecord(candidate.command) ||
      !isPlainRecord(candidate.deviceSession) ||
      !isNonNegativeInteger(candidate.nowMs)
    ) {
      return failure('MALFORMED_REQUEST', 'Claim request fields are malformed.');
    }
    const record = this.#deliveries.get(candidate.command.commandId);
    if (record === undefined)
      return failure('DELIVERY_NOT_FOUND', 'Delivery has not been prepared.');
    const binding = this.#validateBinding<ClaimDeviceCommandDeliverySuccess>(
      record,
      candidate.command,
      candidate.deviceSession,
    );
    if (binding) return binding;
    const commandBlock = commandDeliverability<ClaimDeviceCommandDeliverySuccess>(
      candidate.command,
      candidate.nowMs,
    );
    if (commandBlock) return commandBlock;
    const trustBlock = validateTrust<ClaimDeviceCommandDeliverySuccess>(
      candidate.command,
      candidate.deviceSession,
      candidate.nowMs,
    );
    if (trustBlock) return trustBlock;
    const ordering = this.#validateOrdering<ClaimDeviceCommandDeliverySuccess>(record);
    if (ordering) return ordering;
    if (record.state === 'ACKNOWLEDGED') {
      return failure('COMMAND_NOT_DELIVERABLE', 'Acknowledged transport delivery is terminal.');
    }

    const reconnect =
      record.lastDeliveryConnectionId !== undefined &&
      record.lastDeliveryConnectionId !== candidate.deviceSession.connectionId;
    if (record.state === 'IN_FLIGHT' && candidate.command.state !== 'SUBMITTED') {
      return success({
        disposition: 'HOLD_ALREADY_ACCEPTED_OR_RUNNING',
        delivery: snapshot(record),
      });
    }
    if (record.deliveryAttempts >= this.#config.maxDeliveryAttempts) {
      return failure('ATTEMPT_LIMIT_REACHED', 'Bounded delivery attempt limit is exhausted.');
    }
    if (
      reconnect &&
      record.lastDeliveryGatewayGeneration !== undefined &&
      candidate.deviceSession.gatewayGeneration <= record.lastDeliveryGatewayGeneration
    ) {
      return failure('SESSION_NOT_TRUSTED', 'Reconnect trust generation did not advance.');
    }

    const replay = record.state === 'IN_FLIGHT';
    record.state = 'IN_FLIGHT';
    record.deliveryAttempts += 1;
    record.lastDeliveryConnectionId = candidate.deviceSession.connectionId;
    record.lastDeliveryGatewayGeneration = candidate.deviceSession.gatewayGeneration;
    record.lastUpdatedAtMs = candidate.nowMs;
    const envelope: DeviceCommandEnvelope = Object.freeze({
      schemaVersion: '1.0.0',
      deliveryReference: record.deliveryReference,
      durableIdempotencyReference: record.durableIdempotencyReference,
      commandId: record.commandId,
      executionId: record.executionId,
      correlationId: record.correlationId,
      tenantId: record.tenantId,
      deviceSessionId: record.deviceSessionId,
      deviceId: record.deviceId,
      executionTarget: record.executionTarget,
      deadlineMs: record.deadlineMs,
      orderingKey: record.orderingKey,
      orderingSequence: record.orderingSequence,
      deliveryAttempt: record.deliveryAttempts,
      replay,
      authorizesExecution: false,
      provesExecutionSuccess: false,
    });
    return success({
      disposition: replay ? 'REPLAY_SAME_ENVELOPE' : 'DELIVER',
      delivery: snapshot(record),
      envelope,
    });
  }

  acknowledge(
    input: unknown,
  ): DeviceCommandDeliveryResult<AcknowledgeDeviceCommandDeliverySuccess> {
    if (!isPlainRecord(input)) return failure('MALFORMED_REQUEST', 'Acknowledgement is malformed.');
    const candidate = input as unknown as AcknowledgeDeviceCommandDeliveryInput;
    if (
      !isPlainRecord(candidate.command) ||
      !isPlainRecord(candidate.deviceSession) ||
      !isSafeToken(candidate.deliveryReference, 512) ||
      !isSafeToken(candidate.ackReference, 256) ||
      !isNonNegativeInteger(candidate.observedAtMs)
    ) {
      return failure('MALFORMED_REQUEST', 'Acknowledgement fields are malformed.');
    }
    const record = this.#deliveries.get(candidate.command.commandId);
    if (record === undefined)
      return failure('DELIVERY_NOT_FOUND', 'Delivery has not been prepared.');
    const binding = this.#validateBinding<AcknowledgeDeviceCommandDeliverySuccess>(
      record,
      candidate.command,
      candidate.deviceSession,
    );
    if (binding) return binding;
    const trustBlock = validateTrust<AcknowledgeDeviceCommandDeliverySuccess>(
      candidate.command,
      candidate.deviceSession,
      candidate.observedAtMs,
    );
    if (trustBlock) return trustBlock;
    if (candidate.deliveryReference !== record.deliveryReference) {
      return failure('ACK_CONFLICT', 'Acknowledgement references a different delivery.');
    }
    if (record.state === 'QUEUED') {
      return failure('ACK_CONFLICT', 'Undelivered command cannot be acknowledged.');
    }
    if (record.ackReference !== undefined) {
      if (record.ackReference !== candidate.ackReference) {
        return failure('ACK_CONFLICT', 'Delivery was already acknowledged with another reference.');
      }
      return success({ disposition: 'DUPLICATE_ACK', delivery: snapshot(record) });
    }

    const late =
      record.lastDeliveryConnectionId !== undefined &&
      candidate.deviceSession.connectionId !== record.lastDeliveryConnectionId;
    if (
      late &&
      candidate.deviceSession.gatewayGeneration <= (record.lastDeliveryGatewayGeneration ?? 0)
    ) {
      return failure(
        'SESSION_NOT_TRUSTED',
        'Late acknowledgement lacks a newer trusted reconnect generation.',
      );
    }
    record.state = 'ACKNOWLEDGED';
    record.ackReference = candidate.ackReference;
    record.acknowledgedAtMs = candidate.observedAtMs;
    record.lastUpdatedAtMs = candidate.observedAtMs;
    return success({
      disposition: late ? 'LATE_ACK_AFTER_RECONNECT' : 'ACKNOWLEDGED',
      delivery: snapshot(record),
    });
  }

  get(commandId: unknown): DeviceCommandDeliveryResult<DeviceCommandDeliverySnapshot> {
    if (typeof commandId !== 'string' || !COMMAND_ID.test(commandId)) {
      return failure('MALFORMED_REQUEST', 'Command identifier is malformed.');
    }
    const record = this.#deliveries.get(commandId as CommandId);
    if (record === undefined)
      return failure('DELIVERY_NOT_FOUND', 'Delivery has not been prepared.');
    return success(snapshot(record));
  }

  #validateBinding<T>(
    record: DeliveryRecord,
    command: RealtimeCommandSnapshot,
    trust: DeviceSessionTrustSnapshot,
  ): DeviceCommandDeliveryResult<T> | null {
    if (record.executionId !== command.executionId) {
      return failure('DELIVERY_CONFLICT', 'Execution binding changed after delivery preparation.');
    }
    if (record.tenantId !== trust.tenantId) {
      return failure('TENANT_MISMATCH', 'Tenant binding changed.');
    }
    if (
      record.correlationId !== command.correlationId ||
      record.correlationId !== trust.correlationId
    ) {
      return failure('CORRELATION_MISMATCH', 'Correlation binding changed.');
    }
    if (
      record.deviceSessionId !== trust.deviceSessionId ||
      record.deviceId !== trust.deviceRef.deviceId ||
      record.deviceId !== command.executionTarget.bindingReference
    ) {
      return failure('DEVICE_MISMATCH', 'Device binding changed after delivery preparation.');
    }
    return null;
  }

  #validateOrdering<T>(record: DeliveryRecord): DeviceCommandDeliveryResult<T> | null {
    for (let sequence = 1; sequence < record.orderingSequence; sequence += 1) {
      const commandId = this.#orderBindings.get(`${record.orderingKey}|${sequence}`);
      if (commandId === undefined) {
        return failure('ORDERING_GAP', 'A prior ordering sequence is missing.');
      }
      const prior = this.#deliveries.get(commandId);
      if (prior === undefined || prior.state !== 'ACKNOWLEDGED') {
        return failure('ORDERING_BLOCKED', 'A prior ordered delivery is not acknowledged.', true);
      }
    }
    return null;
  }
}
