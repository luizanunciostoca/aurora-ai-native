import type { CorrelationId, IdentityId, TenantId } from '@aurora/contracts/ids';
import type { DeviceRegistrationRecord, DeviceRef } from '../device/types.js';
import type { GatewaySessionSnapshot } from '../gateway-auth/types.js';

export const DEVICE_ATTESTATION_STATES = ['VERIFIED', 'REVOKED', 'AMBIGUOUS'] as const;
export type DeviceAttestationState = (typeof DEVICE_ATTESTATION_STATES)[number];

export interface DeviceAttestationReference {
  readonly kind: 'DEVICE_ATTESTATION_REFERENCE';
  readonly reference: string;
  readonly provider: string;
  readonly version: string;
  readonly state: DeviceAttestationState;
  readonly observedAtMs: number;
  readonly expiresAtMs: number;
}

export interface DeviceSessionTrustConfig {
  readonly maxActiveSessions: number;
  readonly maxRememberedSessions: number;
  readonly maxAttestationAgeMs: number;
  readonly maxSessionAgeMs: number;
}

export interface OpenDeviceSessionTrustInput {
  readonly deviceSessionId: string;
  readonly gatewaySession: GatewaySessionSnapshot;
  readonly deviceRecord: DeviceRegistrationRecord;
  readonly attestation: DeviceAttestationReference;
  readonly nowMs: number;
}

export interface ResumeDeviceSessionTrustInput {
  readonly deviceSessionId: string;
  readonly previousConnectionId: string;
  readonly gatewaySession: GatewaySessionSnapshot;
  readonly deviceRecord: DeviceRegistrationRecord;
  readonly attestation: DeviceAttestationReference;
  readonly nowMs: number;
}

export interface EvaluateDeviceSessionTrustInput {
  readonly deviceSessionId: string;
  readonly connectionId: string;
  readonly currentDeviceRecord: DeviceRegistrationRecord;
  readonly currentAttestation: DeviceAttestationReference;
  readonly nowMs: number;
}

export interface RevokeDeviceSessionTrustInput {
  readonly deviceSessionId: string;
  readonly connectionId: string;
  readonly revokedAtMs: number;
  readonly reasonReference: string;
}

export type DeviceSessionTrustState = 'ACTIVE' | 'REVOKED';

export interface DeviceSessionTrustSnapshot {
  readonly kind: 'DeviceSessionTrustSnapshot';
  readonly schemaVersion: '1.0.0';
  readonly deviceSessionId: string;
  readonly gatewaySessionId: string;
  readonly connectionId: string;
  readonly gatewayGeneration: number;
  readonly tenantId: TenantId;
  readonly actorIdentityId: IdentityId;
  readonly correlationId: CorrelationId;
  readonly deviceRef: DeviceRef;
  readonly attestation: DeviceAttestationReference;
  readonly state: DeviceSessionTrustState;
  readonly openedAtMs: number;
  readonly lastEvaluatedAtMs: number;
  readonly gatewayAuthExpiresAtMs: number;
  readonly revokedAtMs?: number;
  readonly revocationReasonReference?: string;
  readonly executionPreconditionSatisfied: boolean;
  readonly requiresCurrentAuthorityValidation: true;
  readonly authoritySemantics: 'DEVICE_SESSION_TRUST_IS_PRECONDITION_METADATA_ONLY';
  readonly authorizesExecution: false;
  readonly canGrantPermission: false;
}

export const DEVICE_SESSION_TRUST_ERROR_CODES = [
  'MALFORMED_REQUEST',
  'SESSION_CONFLICT',
  'SESSION_NOT_FOUND',
  'SESSION_REVOKED',
  'CONNECTION_MISMATCH',
  'GATEWAY_SESSION_NOT_OPEN',
  'GATEWAY_AUTH_EXPIRED',
  'TENANT_MISMATCH',
  'ACTOR_MISMATCH',
  'CORRELATION_MISMATCH',
  'DEVICE_NOT_ACTIVE',
  'DEVICE_VERSION_MISMATCH',
  'DEVICE_IDENTITY_MISMATCH',
  'DEVICE_BINDING_MISMATCH',
  'ATTESTATION_INVALID',
  'ATTESTATION_STALE',
  'ATTESTATION_EXPIRED',
  'ATTESTATION_REVOKED',
  'ATTESTATION_AMBIGUOUS',
  'ATTESTATION_MISMATCH',
  'RESUME_HIJACK_DETECTED',
  'SESSION_EXPIRED',
  'BACKPRESSURE',
] as const;

export type DeviceSessionTrustErrorCode = (typeof DEVICE_SESSION_TRUST_ERROR_CODES)[number];

export type DeviceSessionTrustResult =
  | {
      readonly ok: true;
      readonly snapshot: DeviceSessionTrustSnapshot;
      readonly authorizesExecution: false;
      readonly canGrantPermission: false;
    }
  | {
      readonly ok: false;
      readonly error: {
        readonly code: DeviceSessionTrustErrorCode;
        readonly message: string;
        readonly retryable: boolean;
      };
      readonly authorizesExecution: false;
      readonly canGrantPermission: false;
    };
