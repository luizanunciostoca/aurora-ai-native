import type { DeviceExecutionTargetReference } from '@aurora/contracts/execution-target';
import type {
  CausationId,
  CommandId,
  CorrelationId,
  EventId,
  ExecutionId,
  IdentityId,
  TenantId,
} from '@aurora/contracts/ids';

import type {
  DeviceRef,
  DeviceResolutionResult,
  ResolveDeviceRequest,
} from '../device/types.js';
import type {
  GatewayProtocolResult,
  GatewaySessionSnapshot,
} from '../gateway-auth/types.js';

export const REALTIME_COMMAND_STATES = [
  'SUBMITTED',
  'ACCEPTED',
  'RUNNING',
  'WAITING',
  'CANCEL_REQUESTED',
  'CANCELLED',
  'COMPLETED',
  'FAILED',
  'UNCERTAIN',
] as const;

export type RealtimeCommandState = (typeof REALTIME_COMMAND_STATES)[number];

export const REMOTE_COMMAND_FRAME_STATES = [
  'ACCEPTED',
  'RUNNING',
  'WAITING',
  'CANCELLED',
  'COMPLETED',
  'FAILED',
  'UNCERTAIN',
] as const;

export type RemoteCommandFrameState = (typeof REMOTE_COMMAND_FRAME_STATES)[number];

export interface GatewaySessionReader {
  getSession(sessionId: unknown, nowMs: unknown): GatewayProtocolResult<GatewaySessionSnapshot>;
}

export interface DeviceRegistrationReader {
  resolve(request: ResolveDeviceRequest): DeviceResolutionResult;
}

export interface RealtimeCommandSessionConfig {
  readonly maxSessions: number;
  readonly maxOutstandingCommandsPerSession: number;
  readonly maxTrackedCommandsPerSession: number;
  readonly maxRememberedFramesPerCommand: number;
  readonly maxDeadlineHorizonMs: number;
}

export interface OpenRealtimeCommandSessionInput {
  readonly gatewaySessionId: string;
  readonly deviceRef: DeviceRef;
  readonly nowMs: number;
}

export interface ResumeRealtimeCommandSessionInput extends OpenRealtimeCommandSessionInput {
  readonly previousGatewayConnectionId: string;
}

export interface RealtimeCommandSessionSnapshot {
  readonly gatewaySessionId: string;
  readonly gatewayConnectionId: string;
  readonly gatewayGeneration: number;
  readonly state: 'OPEN' | 'CLOSED';
  readonly tenantId: TenantId;
  readonly actorIdentityId: IdentityId;
  readonly correlationId: CorrelationId;
  readonly deviceRef: DeviceRef;
  readonly openedAtMs: number;
  readonly resumedAtMs?: number;
  readonly closedAtMs?: number;
  readonly outstandingCommands: number;
  readonly authorizesExecution: false;
  readonly canGrantPermission: false;
}

export interface BoundRealtimeSessionInput {
  readonly gatewaySessionId: string;
  readonly gatewayConnectionId: string;
  readonly nowMs: number;
}

export interface SubmitRealtimeCommandInput extends BoundRealtimeSessionInput {
  readonly commandId: CommandId;
  readonly executionId: ExecutionId;
  readonly executionTarget: DeviceExecutionTargetReference;
  readonly correlationId: CorrelationId;
  readonly causationId: CausationId;
  readonly deadlineMs: number;
}

export interface RealtimeCommandFrameInput extends BoundRealtimeSessionInput {
  readonly commandId: CommandId;
  readonly frameId: EventId;
  readonly sequence: number;
  readonly state: RemoteCommandFrameState;
}

export interface RequestRealtimeCommandCancellationInput extends BoundRealtimeSessionInput {
  readonly commandId: CommandId;
}

export interface RealtimeCommandSnapshot {
  readonly commandId: CommandId;
  readonly executionId: ExecutionId;
  readonly executionTarget: DeviceExecutionTargetReference;
  readonly correlationId: CorrelationId;
  readonly causationId: CausationId;
  readonly state: RealtimeCommandState;
  readonly deadlineMs: number;
  readonly submittedAtMs: number;
  readonly updatedAtMs: number;
  readonly submittedGatewayGeneration: number;
  readonly lastRemoteSequence: number;
  readonly cancelRequestedAtMs?: number;
  readonly terminalAtMs?: number;
  readonly uncertainAtMs?: number;
  readonly redeliveryDisposition:
    | 'NOT_DECIDED_BY_W14_B'
    | 'BLOCK_UNCERTAIN'
    | 'TERMINAL_NO_REDELIVERY';
  readonly authoritySemantics: 'TRANSPORT_SESSION_ONLY_NO_ACTION_AUTHORITY';
  readonly authorizesExecution: false;
  readonly provesExecutionSuccess: false;
  readonly externalStateVerified: false;
}

export type SubmitRealtimeCommandDisposition = 'SUBMITTED' | 'ALREADY_SUBMITTED';

export interface SubmitRealtimeCommandSuccess {
  readonly disposition: SubmitRealtimeCommandDisposition;
  readonly session: RealtimeCommandSessionSnapshot;
  readonly command: RealtimeCommandSnapshot;
}

export type ApplyRealtimeCommandFrameDisposition =
  | 'APPLIED'
  | 'DUPLICATE_FRAME'
  | 'CANCELLATION_PRESERVED';

export interface ApplyRealtimeCommandFrameSuccess {
  readonly disposition: ApplyRealtimeCommandFrameDisposition;
  readonly command: RealtimeCommandSnapshot;
}

export type RequestRealtimeCancellationDisposition =
  | 'CANCEL_REQUESTED'
  | 'ALREADY_REQUESTED'
  | 'NOOP_TERMINAL_OR_UNCERTAIN';

export interface RequestRealtimeCancellationSuccess {
  readonly disposition: RequestRealtimeCancellationDisposition;
  readonly command: RealtimeCommandSnapshot;
}

export const REALTIME_SESSION_ERROR_CODES = [
  'MALFORMED_REQUEST',
  'SESSION_NOT_FOUND',
  'SESSION_CONFLICT',
  'SESSION_CLOSED',
  'SESSION_RESUME_STALE',
  'GATEWAY_SESSION_INVALID',
  'GATEWAY_CONNECTION_MISMATCH',
  'GATEWAY_BINDING_MISMATCH',
  'DEVICE_NOT_ACTIVE',
  'DEVICE_BINDING_MISMATCH',
  'TARGET_MISMATCH',
  'CORRELATION_MISMATCH',
  'DEADLINE_EXCEEDED',
  'DEADLINE_OUT_OF_RANGE',
  'BACKPRESSURE',
  'COMMAND_CONFLICT',
  'COMMAND_NOT_FOUND',
  'FRAME_CONFLICT',
  'FRAME_OUT_OF_ORDER',
  'INVALID_TRANSITION',
] as const;

export type RealtimeSessionErrorCode = (typeof REALTIME_SESSION_ERROR_CODES)[number];

export interface RealtimeSessionError {
  readonly ok: false;
  readonly error: {
    readonly code: RealtimeSessionErrorCode;
    readonly message: string;
    readonly retryable: boolean;
  };
  readonly authorizesExecution: false;
}

export interface RealtimeSessionSuccess<T> {
  readonly ok: true;
  readonly value: T;
  readonly authorizesExecution: false;
}

export type RealtimeSessionResult<T> = RealtimeSessionSuccess<T> | RealtimeSessionError;
