import type {
  CommandId,
  CorrelationId,
  EvidenceId,
  ExecutionId,
  ReceiptId,
  TenantId,
} from '@aurora/contracts/ids';

import type { DeviceRef } from '../device/types.js';
import type {
  DeviceSessionTrustResult,
  DeviceSessionTrustSnapshot,
  RevokeDeviceSessionTrustInput,
} from '../device-session/types.js';
import type {
  ProgressCancellationPort,
  ProgressCancellationPortSuccess,
} from '../progress-cancellation/types.js';

export const DEVICE_RECEIPT_REPORTED_STATES = ['COMPLETED', 'FAILED', 'UNCERTAIN'] as const;
export type DeviceReceiptReportedState = (typeof DEVICE_RECEIPT_REPORTED_STATES)[number];

export const DEVICE_RECEIPT_INGRESS_CLASSIFICATIONS = [
  'CURRENT_SESSION',
  'LATE_AFTER_RECONNECT',
  'LATE_AFTER_REVOKE',
  'DUPLICATE',
] as const;
export type DeviceReceiptIngressClassification =
  (typeof DEVICE_RECEIPT_INGRESS_CLASSIFICATIONS)[number];

export interface DeviceReceiptIngressConfig {
  readonly maxReceiptAgeMs: number;
  readonly maxLateAfterRevokeMs: number;
  readonly maxReferenceLength: number;
  readonly maxIntegrityDigestLength: number;
}

export interface DeviceSessionRevocationPort {
  revokeSession(input: RevokeDeviceSessionTrustInput): DeviceSessionTrustResult;
}

export interface DeviceIngressAuthenticationRequest {
  readonly tenantId: TenantId;
  readonly correlationId: CorrelationId;
  readonly deviceRef: DeviceRef;
  readonly deviceSessionId: string;
  readonly gatewaySessionId: string;
  readonly connectionId: string;
  readonly gatewayGeneration: number;
  readonly receiptId: ReceiptId;
  readonly commandId: CommandId;
  readonly executionId: ExecutionId;
  readonly sourceReference: string;
  readonly proofReference: string;
  readonly integrityDigest: string;
  readonly capturedAtMs: number;
  readonly receivedAtMs: number;
}

export type DeviceIngressAuthenticationResult =
  | Readonly<{
      ok: true;
      authenticatedAtMs: number;
      authenticationReference: string;
      authorizesExecution: false;
      canGrantPermission: false;
    }>
  | Readonly<{
      ok: false;
      code: 'UNAUTHENTICATED' | 'STALE_PROOF' | 'BINDING_MISMATCH' | 'MALFORMED';
      retryable: boolean;
      authorizesExecution: false;
      canGrantPermission: false;
    }>;

export interface DeviceIngressAuthenticationPort {
  verify(request: DeviceIngressAuthenticationRequest): DeviceIngressAuthenticationResult;
}

export interface W03ReceiptIngressReservationRequest {
  readonly tenantId: TenantId;
  readonly receiptId: ReceiptId;
  readonly commandId: CommandId;
  readonly executionId: ExecutionId;
  readonly fingerprint: string;
  readonly nowMs: number;
}

export type W03ReceiptIngressReservationResult =
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

/** Compatibility port over W03 durable idempotency/replay ownership. W14-G owns no ledger. */
export interface W03ReceiptIngressReservationPort {
  reserve(request: W03ReceiptIngressReservationRequest): W03ReceiptIngressReservationResult;
}

export interface W07DeviceReceiptEvidenceObservation {
  readonly kind: 'DEVICE_RECEIPT_EVIDENCE_OBSERVATION';
  readonly schemaVersion: '1.0.0';
  readonly receiptId: ReceiptId;
  readonly evidenceId?: EvidenceId;
  readonly tenantId: TenantId;
  readonly correlationId: CorrelationId;
  readonly commandId: CommandId;
  readonly executionId: ExecutionId;
  readonly deviceRef: DeviceRef;
  readonly deviceSessionId: string;
  readonly gatewaySessionId: string;
  readonly connectionId: string;
  readonly gatewayGeneration: number;
  readonly deliveryReference: string;
  readonly reportedState: DeviceReceiptReportedState;
  readonly sourceReference: string;
  readonly integrityDigest: string;
  readonly authenticationReference: string;
  readonly capturedAtMs: number;
  readonly receivedAtMs: number;
  readonly ingressClassification: Exclude<DeviceReceiptIngressClassification, 'DUPLICATE'>;
  readonly requiresW07Reconciliation: boolean;
  readonly authoritySemantics: 'EVIDENCE_INPUT_ONLY_W07_OWNS_OUTCOME_AND_RETRY';
  readonly authorizesExecution: false;
  readonly provesExecutionSuccess: false;
  readonly retryAuthorized: false;
}

export type W07DeviceReceiptEvidenceIngressResult =
  | Readonly<{
      ok: true;
      disposition: 'OBSERVED' | 'ALREADY_OBSERVED';
      receiptReference: string;
      evidenceReference?: string;
      authorizesExecution: false;
      provesExecutionSuccess: false;
      retryAuthorized: false;
    }>
  | Readonly<{
      ok: false;
      code: 'REJECTED' | 'CONFLICT' | 'UNAVAILABLE' | 'MALFORMED';
      retryable: boolean;
      authorizesExecution: false;
      provesExecutionSuccess: false;
      retryAuthorized: false;
    }>;

export interface W07DeviceReceiptEvidenceIngressPort {
  observe(observation: W07DeviceReceiptEvidenceObservation): W07DeviceReceiptEvidenceIngressResult;
}

export interface RevokeAndKillDeviceSessionInput {
  readonly deviceSession: DeviceSessionTrustSnapshot;
  readonly tenantId: TenantId;
  readonly correlationId: CorrelationId;
  readonly commandId: CommandId;
  readonly revokedAtMs: number;
  readonly reasonReference: string;
}

export interface RevokeAndKillDeviceSessionSuccess {
  readonly deviceSession: DeviceSessionTrustSnapshot;
  readonly cancellationDisposition:
    ProgressCancellationPortSuccess['disposition'] | 'UPSTREAM_CANCELLATION_UNCONFIRMED';
  readonly effect: 'SESSION_REVOKED_AND_COMMAND_CANCELLATION_REQUESTED';
  readonly outcomeAuthority: 'W07_ONLY';
  readonly requiresW07Reconciliation: boolean;
  readonly authorizesExecution: false;
  readonly canGrantPermission: false;
  readonly provesExecutionPrevented: false;
  readonly provesExecutionSuccess: false;
  readonly retryAuthorized: false;
}

export interface DeviceReceiptIngressInput {
  readonly receiptId: ReceiptId;
  readonly evidenceId?: EvidenceId;
  readonly tenantId: TenantId;
  readonly correlationId: CorrelationId;
  readonly commandId: CommandId;
  readonly executionId: ExecutionId;
  readonly deviceRef: DeviceRef;
  readonly deviceSessionId: string;
  readonly gatewaySessionId: string;
  readonly connectionId: string;
  readonly gatewayGeneration: number;
  readonly deliveryReference: string;
  readonly reportedState: DeviceReceiptReportedState;
  readonly sourceReference: string;
  readonly proofReference: string;
  readonly integrityDigest: string;
  readonly capturedAtMs: number;
  readonly receivedAtMs: number;
  readonly deviceSession: DeviceSessionTrustSnapshot;
}

export interface DeviceReceiptIngressSuccess {
  readonly classification: DeviceReceiptIngressClassification;
  readonly durableReference: string;
  readonly receiptReference?: string;
  readonly evidenceReference?: string;
  readonly requiresW07Reconciliation: boolean;
  readonly authoritySemantics: 'EVIDENCE_INPUT_ONLY_W07_OWNS_OUTCOME_AND_RETRY';
  readonly authorizesExecution: false;
  readonly canGrantPermission: false;
  readonly provesExecutionSuccess: false;
  readonly retryAuthorized: false;
}

export const DEVICE_RECEIPT_INGRESS_ERROR_CODES = [
  'MALFORMED_REQUEST',
  'TENANT_MISMATCH',
  'CORRELATION_MISMATCH',
  'DEVICE_MISMATCH',
  'SESSION_MISMATCH',
  'SESSION_NOT_TRUSTED',
  'SESSION_PROOF_REJECTED',
  'RECEIPT_STALE',
  'RECEIPT_FROM_FUTURE',
  'DURABLE_IDEMPOTENCY_CONFLICT',
  'DURABLE_IDEMPOTENCY_UNAVAILABLE',
  'W07_INGRESS_REJECTED',
  'W07_INGRESS_PROTOCOL_VIOLATION',
  'REVOCATION_REJECTED',
  'CANCELLATION_BINDING_MISMATCH',
] as const;

export type DeviceReceiptIngressErrorCode = (typeof DEVICE_RECEIPT_INGRESS_ERROR_CODES)[number];

export type DeviceReceiptIngressResult<T> =
  | Readonly<{
      ok: true;
      value: T;
      authorizesExecution: false;
      retryAuthorized: false;
    }>
  | Readonly<{
      ok: false;
      error: Readonly<{
        code: DeviceReceiptIngressErrorCode;
        message: string;
        retryable: boolean;
        upstreamCode?: string;
      }>;
      authorizesExecution: false;
      retryAuthorized: false;
    }>;

export interface DeviceReceiptIngressDependencies {
  readonly sessionRevocation: DeviceSessionRevocationPort;
  readonly cancellation: ProgressCancellationPort;
  readonly authentication: DeviceIngressAuthenticationPort;
  readonly durableIngress: W03ReceiptIngressReservationPort;
  readonly w07Ingress: W07DeviceReceiptEvidenceIngressPort;
}
