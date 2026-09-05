import type { ActorRef, CorrelationContext } from '@aurora/contracts/context';
import type { CorrelationId, IdentityId, TenantId } from '@aurora/contracts/ids';

export const GATEWAY_PROTOCOL_VERSION = '1.0' as const;
export type GatewayProtocolVersion = typeof GATEWAY_PROTOCOL_VERSION;

export const GATEWAY_PROTOCOL_ERROR_CODES = [
  'AUTH_REQUIRED',
  'AUTH_INVALID',
  'AUTH_EXPIRED',
  'AUTH_STALE',
  'TENANT_MISMATCH',
  'ACTOR_MISMATCH',
  'SESSION_CONFLICT',
  'SESSION_NOT_FOUND',
  'SESSION_CLOSED',
  'CONNECTION_MISMATCH',
  'CORRELATION_MISMATCH',
  'MALFORMED_REQUEST',
  'PROTOCOL_VERSION_UNSUPPORTED',
  'DEADLINE_EXCEEDED',
  'DEADLINE_OUT_OF_RANGE',
  'BACKPRESSURE',
  'REQUEST_DUPLICATE',
  'REQUEST_NOT_FOUND',
] as const;

export type GatewayProtocolErrorCode = (typeof GATEWAY_PROTOCOL_ERROR_CODES)[number];

export type GatewayActorBinding = Pick<ActorRef, 'kind' | 'identityId'>;
export type GatewayCorrelationBinding = Pick<CorrelationContext, 'correlationId'>;

export interface GatewayAuthClaims {
  readonly tenantId: TenantId;
  readonly actorIdentityId: IdentityId;
  readonly issuedAtMs: number;
  readonly expiresAtMs: number;
  readonly authVersion: string;
  /** Optional W14 transport binding. When present, the session manager must enforce it exactly. */
  readonly gatewaySessionId?: string;
  /** Optional W14 actor-kind binding. This is transport identity metadata, never business authority. */
  readonly actorKind?: GatewayActorBinding['kind'];
  /** Optional W14 correlation binding. This carries trace/session context only. */
  readonly correlationId?: CorrelationId;
}

export interface GatewayAuthenticator {
  verify(credential: string, nowMs: number): GatewayAuthClaims | null;
}

export interface GatewayTransportConfig {
  readonly maxOpenSessions: number;
  readonly maxRememberedSessions: number;
  readonly maxOutstandingRequestsPerSession: number;
  readonly maxTrackedRequestsPerSession: number;
  readonly maxCredentialLength: number;
  readonly maxAuthAgeMs: number;
  readonly maxDeadlineHorizonMs: number;
}

export interface OpenGatewaySessionInput {
  readonly protocolVersion: GatewayProtocolVersion;
  readonly sessionId: string;
  readonly credential: string;
  readonly tenantId: TenantId;
  readonly actor: GatewayActorBinding;
  readonly correlation: GatewayCorrelationBinding;
  readonly nowMs: number;
}

export interface ReconnectGatewaySessionInput extends OpenGatewaySessionInput {
  readonly previousConnectionId: string;
}

export interface GatewaySessionSnapshot {
  readonly protocolVersion: GatewayProtocolVersion;
  readonly sessionId: string;
  readonly connectionId: string;
  readonly generation: number;
  readonly state: 'OPEN' | 'CLOSED';
  readonly tenantId: TenantId;
  readonly actorKind: GatewayActorBinding['kind'];
  readonly actorIdentityId: IdentityId;
  readonly correlationId: CorrelationId;
  readonly authIssuedAtMs: number;
  readonly authExpiresAtMs: number;
  readonly openedAtMs: number;
  readonly closedAtMs?: number;
  readonly outstandingRequests: number;
  readonly authorizesExecution: false;
}

export interface BeginGatewayRequestInput {
  readonly protocolVersion: GatewayProtocolVersion;
  readonly sessionId: string;
  readonly connectionId: string;
  readonly requestId: string;
  readonly tenantId: TenantId;
  readonly actorIdentityId: IdentityId;
  readonly correlationId: CorrelationId;
  readonly deadlineMs: number;
  readonly nowMs: number;
}

export interface GatewayBoundSessionInput {
  readonly protocolVersion: GatewayProtocolVersion;
  readonly sessionId: string;
  readonly connectionId: string;
  readonly tenantId: TenantId;
  readonly actorIdentityId: IdentityId;
  readonly correlationId: CorrelationId;
  readonly nowMs: number;
}

export interface GatewayBoundRequestOperationInput extends GatewayBoundSessionInput {
  readonly requestId: string;
}

export interface GatewayRequestSnapshot {
  readonly requestId: string;
  readonly sessionId: string;
  readonly connectionId: string;
  readonly state: 'ACTIVE' | 'CANCEL_REQUESTED' | 'COMPLETED';
  readonly deadlineMs: number;
  readonly startedAtMs: number;
  readonly cancelRequestedAtMs?: number;
  readonly completedAtMs?: number;
  readonly authorizesExecution: false;
}

export interface GatewayProtocolError {
  readonly ok: false;
  readonly error: {
    readonly code: GatewayProtocolErrorCode;
    readonly message: string;
    readonly retryable: boolean;
  };
}

export interface GatewayProtocolSuccess<T> {
  readonly ok: true;
  readonly value: T;
}

export type GatewayProtocolResult<T> = GatewayProtocolSuccess<T> | GatewayProtocolError;
