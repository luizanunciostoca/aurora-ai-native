import type { CommandId, CorrelationId, ExecutionId, TenantId } from '@aurora/contracts/ids';

import type { DeviceSessionTrustSnapshot } from '../device-session/types.js';
import type { RealtimeCommandSnapshot } from '../realtime-session/types.js';

export const DEVICE_COMMAND_DELIVERY_STATES = ['QUEUED', 'IN_FLIGHT', 'ACKNOWLEDGED'] as const;
export type DeviceCommandDeliveryState = (typeof DEVICE_COMMAND_DELIVERY_STATES)[number];

export interface W03DurableDeliveryReservationRequest {
  readonly tenantId: TenantId;
  readonly correlationId: CorrelationId;
  readonly commandId: CommandId;
  readonly executionId: ExecutionId;
  readonly idempotencyKey: string;
  readonly nowMs: number;
}

export type W03DurableDeliveryReservationResult =
  | Readonly<{
      ok: true;
      disposition: 'RESERVED' | 'ALREADY_RESERVED';
      durableReference: string;
      authorizesExecution: false;
    }>
  | Readonly<{
      ok: false;
      code: 'CONFLICT' | 'UNAVAILABLE' | 'MALFORMED';
      retryable: boolean;
      authorizesExecution: false;
    }>;

/** Compatibility port over W03 durable idempotency ownership. W14-F does not own the ledger. */
export interface W03DurableDeliveryReservationPort {
  reserve(request: W03DurableDeliveryReservationRequest): W03DurableDeliveryReservationResult;
}

export interface DeviceCommandDeliveryConfig {
  readonly maxTrackedDeliveries: number;
  readonly maxDeliveryAttempts: number;
  readonly maxOrderingKeyLength: number;
  readonly maxIdempotencyKeyLength: number;
}

export interface PrepareDeviceCommandDeliveryInput {
  readonly command: RealtimeCommandSnapshot;
  readonly deviceSession: DeviceSessionTrustSnapshot;
  readonly idempotencyKey: string;
  readonly orderingKey: string;
  readonly orderingSequence: number;
  readonly nowMs: number;
}

export interface ClaimDeviceCommandDeliveryInput {
  readonly command: RealtimeCommandSnapshot;
  readonly deviceSession: DeviceSessionTrustSnapshot;
  readonly nowMs: number;
}

export interface AcknowledgeDeviceCommandDeliveryInput {
  readonly command: RealtimeCommandSnapshot;
  readonly deviceSession: DeviceSessionTrustSnapshot;
  readonly deliveryReference: string;
  readonly ackReference: string;
  readonly observedAtMs: number;
}

export interface DeviceCommandEnvelope {
  readonly schemaVersion: '1.0.0';
  readonly deliveryReference: string;
  readonly durableIdempotencyReference: string;
  readonly commandId: CommandId;
  readonly executionId: ExecutionId;
  readonly correlationId: CorrelationId;
  readonly tenantId: TenantId;
  readonly deviceSessionId: string;
  readonly deviceId: string;
  readonly executionTarget: RealtimeCommandSnapshot['executionTarget'];
  readonly deadlineMs: number;
  readonly orderingKey: string;
  readonly orderingSequence: number;
  readonly deliveryAttempt: number;
  readonly replay: boolean;
  readonly authorizesExecution: false;
  readonly provesExecutionSuccess: false;
}

export interface DeviceCommandDeliverySnapshot {
  readonly deliveryReference: string;
  readonly durableIdempotencyReference: string;
  readonly idempotencyKey: string;
  readonly commandId: CommandId;
  readonly executionId: ExecutionId;
  readonly correlationId: CorrelationId;
  readonly tenantId: TenantId;
  readonly deviceSessionId: string;
  readonly deviceId: string;
  readonly orderingKey: string;
  readonly orderingSequence: number;
  readonly state: DeviceCommandDeliveryState;
  readonly preparedAtMs: number;
  readonly lastUpdatedAtMs: number;
  readonly lastDeliveryConnectionId?: string;
  readonly lastDeliveryGatewayGeneration?: number;
  readonly deliveryAttempts: number;
  readonly ackReference?: string;
  readonly acknowledgedAtMs?: number;
  readonly authoritySemantics: 'TRANSPORT_ONLY_W07_RETAINS_EXECUTION_AUTHORITY';
  readonly retryAuthority: 'W07_RECONCILIATION_REQUIRED_FOR_UNCERTAIN';
  readonly authorizesExecution: false;
  readonly provesExecutionSuccess: false;
}

export type PrepareDeviceCommandDeliveryDisposition = 'PREPARED' | 'ALREADY_PREPARED';
export type ClaimDeviceCommandDeliveryDisposition =
  | 'DELIVER'
  | 'REPLAY_SAME_ENVELOPE'
  | 'HOLD_ALREADY_ACCEPTED_OR_RUNNING';
export type AcknowledgeDeviceCommandDeliveryDisposition =
  | 'ACKNOWLEDGED'
  | 'DUPLICATE_ACK'
  | 'LATE_ACK_AFTER_RECONNECT';

export interface PrepareDeviceCommandDeliverySuccess {
  readonly disposition: PrepareDeviceCommandDeliveryDisposition;
  readonly delivery: DeviceCommandDeliverySnapshot;
}

export interface ClaimDeviceCommandDeliverySuccess {
  readonly disposition: ClaimDeviceCommandDeliveryDisposition;
  readonly delivery: DeviceCommandDeliverySnapshot;
  readonly envelope?: DeviceCommandEnvelope;
}

export interface AcknowledgeDeviceCommandDeliverySuccess {
  readonly disposition: AcknowledgeDeviceCommandDeliveryDisposition;
  readonly delivery: DeviceCommandDeliverySnapshot;
}

export const DEVICE_COMMAND_DELIVERY_ERROR_CODES = [
  'MALFORMED_REQUEST',
  'COMMAND_NOT_DELIVERABLE',
  'COMMAND_CANCELLED',
  'EXECUTION_UNCERTAIN',
  'DEADLINE_EXCEEDED',
  'SESSION_NOT_TRUSTED',
  'SESSION_EXPIRED',
  'TENANT_MISMATCH',
  'CORRELATION_MISMATCH',
  'DEVICE_MISMATCH',
  'DELIVERY_CONFLICT',
  'DELIVERY_NOT_FOUND',
  'ORDERING_CONFLICT',
  'ORDERING_GAP',
  'ORDERING_BLOCKED',
  'BACKPRESSURE',
  'ATTEMPT_LIMIT_REACHED',
  'DURABLE_IDEMPOTENCY_CONFLICT',
  'DURABLE_IDEMPOTENCY_UNAVAILABLE',
  'ACK_CONFLICT',
] as const;

export type DeviceCommandDeliveryErrorCode = (typeof DEVICE_COMMAND_DELIVERY_ERROR_CODES)[number];

export type DeviceCommandDeliveryResult<T> =
  | Readonly<{
      ok: true;
      value: T;
      authorizesExecution: false;
      retryAuthorized: false;
    }>
  | Readonly<{
      ok: false;
      error: {
        readonly code: DeviceCommandDeliveryErrorCode;
        readonly message: string;
        readonly retryable: boolean;
      };
      authorizesExecution: false;
      retryAuthorized: false;
    }>;
