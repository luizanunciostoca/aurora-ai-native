import type {
  ActionIntentId,
  CommandId,
  CorrelationId,
  EvidenceId,
  ExecutionId,
  ReceiptId,
  TenantId,
} from '@aurora/contracts/ids';

import type {
  DeviceSessionTrustResult,
  DeviceSessionTrustSnapshot,
} from '../device-session/types.js';
import type { RealtimeCommandSnapshot } from '../realtime-session/types.js';

export interface DeviceSessionRevokeIngressConfig {
  readonly maxSeenIngress: number;
  readonly maxControlledSessions: number;
  readonly maxIngressAgeMs: number;
  readonly maxReferenceLength: number;
}

export type DeviceSessionControlMode = 'REVOKE' | 'KILL';

export interface RevokeOrKillDeviceSessionInput {
  readonly mode: DeviceSessionControlMode;
  readonly deviceSession: DeviceSessionTrustSnapshot;
  readonly reasonReference: string;
  readonly nowMs: number;
}

/** Structural port to the accepted W14-E trust owner. W14-G never owns a second trust registry. */
export interface DeviceSessionRevocationPort {
  revokeSession(input: unknown): DeviceSessionTrustResult;
}

export interface DeviceSessionControlProjection {
  readonly mode: DeviceSessionControlMode;
  readonly disposition: 'REVOKED' | 'KILLED' | 'ALREADY_REVOKED' | 'ALREADY_KILLED';
  readonly deviceSessionId: string;
  readonly tenantId: TenantId;
  readonly correlationId: CorrelationId;
  readonly deviceId: string;
  readonly gatewayGeneration: number;
  readonly revokedAtMs: number;
  readonly reasonReference: string;
  readonly trustState: 'REVOKED';
  readonly effect: 'W14_E_TRUST_REVOKED_AND_W14_G_INGRESS_FENCED';
  readonly requiresCurrentAuthorityValidation: true;
  readonly authorizesExecution: false;
  readonly canGrantPermission: false;
  readonly provesExecutionSuccess: false;
  readonly retryAuthorized: false;
}

export interface DeviceIngressProvenance {
  readonly sourceConnectionId: string;
  readonly sourceGatewayGeneration: number;
  readonly sourceReference: string;
  readonly integrityReference: string;
  readonly capturedAtMs: number;
  readonly receivedAtMs: number;
}

export const DEVICE_REPORTED_RECEIPT_STATES = [
  'ACCEPTED',
  'RUNNING',
  'WAITING',
  'CANCELLED',
  'COMPLETED',
  'FAILED',
  'UNCERTAIN',
] as const;
export type DeviceReportedReceiptState = (typeof DEVICE_REPORTED_RECEIPT_STATES)[number];

export interface DeviceReceiptIngressFrame {
  readonly receiptId: ReceiptId;
  readonly actionIntentId: ActionIntentId;
  readonly commandId: CommandId;
  readonly executionId: ExecutionId;
  readonly tenantId: TenantId;
  readonly correlationId: CorrelationId;
  readonly deviceId: string;
  readonly deviceReportedState: DeviceReportedReceiptState;
  readonly provenance: DeviceIngressProvenance;
}

export const DEVICE_EVIDENCE_TYPES = [
  'EXECUTION_RECEIPT',
  'STATE_SNAPSHOT',
  'SIGNED_ATTESTATION',
  'REFERENCE',
] as const;
export type DeviceEvidenceType = (typeof DEVICE_EVIDENCE_TYPES)[number];

export interface DeviceEvidenceIngressFrame {
  readonly evidenceId: EvidenceId;
  readonly actionIntentId: ActionIntentId;
  readonly commandId: CommandId;
  readonly executionId: ExecutionId;
  readonly tenantId: TenantId;
  readonly correlationId: CorrelationId;
  readonly deviceId: string;
  readonly evidenceType: DeviceEvidenceType;
  readonly subjectReference: string;
  readonly provenance: DeviceIngressProvenance;
}

export interface IngestDeviceReceiptInput {
  readonly command: RealtimeCommandSnapshot;
  readonly deviceSession: DeviceSessionTrustSnapshot;
  readonly frame: DeviceReceiptIngressFrame;
}

export interface IngestDeviceEvidenceInput {
  readonly command: RealtimeCommandSnapshot;
  readonly deviceSession: DeviceSessionTrustSnapshot;
  readonly frame: DeviceEvidenceIngressFrame;
}

export type DeviceIngressClassification =
  'CURRENT_SESSION' | 'LATE_AFTER_RECONNECT' | 'LATE_AFTER_REVOKE';

export interface W03DurableIngressReservationRequest {
  readonly tenantId: TenantId;
  readonly correlationId: CorrelationId;
  readonly commandId: CommandId;
  readonly executionId: ExecutionId;
  readonly ingressId: ReceiptId | EvidenceId;
  readonly idempotencyKey: string;
  readonly contentFingerprint: string;
  readonly receivedAtMs: number;
}

export type W03DurableIngressReservationResult =
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

/** Compatibility port over W03 durable idempotency/replay ownership. */
export interface W03DurableIngressReservationPort {
  reserve(request: W03DurableIngressReservationRequest): W03DurableIngressReservationResult;
}

export interface W07DeviceReceiptVerificationRequest {
  readonly receiptId: ReceiptId;
  readonly actionIntentId: ActionIntentId;
  readonly commandId: CommandId;
  readonly executionId: ExecutionId;
  readonly tenantId: TenantId;
  readonly correlationId: CorrelationId;
  readonly deviceId: string;
  readonly deviceReportedState: DeviceReportedReceiptState;
  readonly sourceReference: string;
  readonly integrityReference: string;
  readonly capturedAtMs: number;
  readonly receivedAtMs: number;
  readonly ingressClassification: DeviceIngressClassification;
}

export interface W07DeviceEvidenceVerificationRequest {
  readonly evidenceId: EvidenceId;
  readonly actionIntentId: ActionIntentId;
  readonly commandId: CommandId;
  readonly executionId: ExecutionId;
  readonly tenantId: TenantId;
  readonly correlationId: CorrelationId;
  readonly deviceId: string;
  readonly evidenceType: DeviceEvidenceType;
  readonly subjectReference: string;
  readonly sourceReference: string;
  readonly integrityReference: string;
  readonly capturedAtMs: number;
  readonly receivedAtMs: number;
  readonly ingressClassification: DeviceIngressClassification;
}

export type W07DeviceIngressVerificationResult =
  | Readonly<{
      ok: true;
      verificationReference: string;
      authorizesExecution: false;
      provesExecutionSuccess: false;
      retryAuthorized: false;
    }>
  | Readonly<{
      ok: false;
      code: string;
      retryable: boolean;
      authorizesExecution: false;
      provesExecutionSuccess: false;
      retryAuthorized: false;
    }>;

/**
 * W07 remains the execution/receipt/evidence truth owner. This port verifies that a device-originated
 * reference belongs to the current execution chain; it does not promote an execution outcome.
 */
export interface W07DeviceIngressVerifier {
  verifyReceipt(request: W07DeviceReceiptVerificationRequest): W07DeviceIngressVerificationResult;
  verifyEvidence(request: W07DeviceEvidenceVerificationRequest): W07DeviceIngressVerificationResult;
}

export interface DeviceIngressProjection {
  readonly kind: 'DEVICE_RECEIPT_INGRESS' | 'DEVICE_EVIDENCE_INGRESS';
  readonly ingressId: ReceiptId | EvidenceId;
  readonly actionIntentId: ActionIntentId;
  readonly commandId: CommandId;
  readonly executionId: ExecutionId;
  readonly tenantId: TenantId;
  readonly correlationId: CorrelationId;
  readonly deviceId: string;
  readonly deviceSessionId: string;
  readonly ingressClassification: DeviceIngressClassification;
  readonly capturedAtMs: number;
  readonly receivedAtMs: number;
  readonly sourceReference: string;
  readonly integrityReference: string;
  readonly durableIngressReference: string;
  readonly w07VerificationReference: string;
  readonly requiresW07Reconciliation: true;
  readonly outcomeAuthority: 'W07_ONLY';
  readonly ingressAuthoritySemantics: 'PROVENANCE_VERIFIED_INPUT_ONLY_NOT_EXECUTION_OUTCOME';
  readonly receiptPresenceProvesBusinessOutcome: false;
  readonly authorizesExecution: false;
  readonly canGrantPermission: false;
  readonly provesExecutionSuccess: false;
  readonly retryAuthorized: false;
}

export interface IngestDeviceReceiptSuccess {
  readonly disposition: 'ACCEPTED' | 'DUPLICATE';
  readonly projection: DeviceIngressProjection;
  readonly deviceReportedState: DeviceReportedReceiptState;
}

export interface IngestDeviceEvidenceSuccess {
  readonly disposition: 'ACCEPTED' | 'DUPLICATE';
  readonly projection: DeviceIngressProjection;
  readonly evidenceType: DeviceEvidenceType;
  readonly subjectReference: string;
}

export const DEVICE_REVOKE_INGRESS_ERROR_CODES = [
  'MALFORMED_REQUEST',
  'SESSION_REVOKE_FAILED',
  'SESSION_REVOKE_PROTOCOL_VIOLATION',
  'SESSION_BINDING_MISMATCH',
  'SESSION_NOT_TRUSTED',
  'SESSION_EXPIRED',
  'SESSION_REVOKED',
  'TENANT_MISMATCH',
  'CORRELATION_MISMATCH',
  'DEVICE_MISMATCH',
  'COMMAND_MISMATCH',
  'PROVENANCE_MISMATCH',
  'PROVENANCE_STALE',
  'PROVENANCE_FUTURE',
  'INGRESS_CONFLICT',
  'DURABLE_IDEMPOTENCY_CONFLICT',
  'DURABLE_IDEMPOTENCY_UNAVAILABLE',
  'DURABLE_IDEMPOTENCY_PROTOCOL_VIOLATION',
  'W07_REJECTED',
  'W07_PROTOCOL_VIOLATION',
  'BACKPRESSURE',
] as const;
export type DeviceRevokeIngressErrorCode = (typeof DEVICE_REVOKE_INGRESS_ERROR_CODES)[number];

export type DeviceRevokeIngressResult<T> =
  | Readonly<{
      ok: true;
      value: T;
      authorizesExecution: false;
      canGrantPermission: false;
      provesExecutionSuccess: false;
      retryAuthorized: false;
    }>
  | Readonly<{
      ok: false;
      error: Readonly<{
        code: DeviceRevokeIngressErrorCode;
        message: string;
        retryable: boolean;
        upstreamCode?: string;
      }>;
      authorizesExecution: false;
      canGrantPermission: false;
      provesExecutionSuccess: false;
      retryAuthorized: false;
    }>;
