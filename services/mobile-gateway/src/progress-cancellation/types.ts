import type { CommandId, CorrelationId, EventId, TenantId } from '@aurora/contracts/ids';

export const PROGRESS_SCOPES = ['JOB', 'LANE', 'DAG', 'COMMAND'] as const;
export type ProgressScope = (typeof PROGRESS_SCOPES)[number];

export const PROGRESS_STATES = [
  'QUEUED',
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
export type ProgressState = (typeof PROGRESS_STATES)[number];

export const PROGRESS_SOURCES = [
  'W03_DURABLE_STATE',
  'W04_DAG_STATE',
  'W07_EXECUTION_OBSERVATION',
  'W14_B_REALTIME_COMMAND',
] as const;
export type ProgressSource = (typeof PROGRESS_SOURCES)[number];

export interface ProgressProjectionConfig {
  readonly maxStreams: number;
  readonly maxHistoryPerStream: number;
  readonly maxRememberedObservationsPerStream: number;
  readonly maxEvidenceRefs: number;
  readonly maxReplayItems: number;
  readonly maxObservationAgeMs: number;
}

export interface ProgressObservationInput {
  readonly observationId: EventId;
  readonly source: ProgressSource;
  readonly sourceReference: string;
  readonly tenantId: TenantId;
  readonly correlationId: CorrelationId;
  readonly scope: ProgressScope;
  readonly subjectId: string;
  readonly state: ProgressState;
  readonly observedAtMs: number;
  readonly nowMs: number;
  readonly safeSummary: string;
  readonly reasonCode?: string;
  readonly evidenceRefs: readonly string[];
  readonly completedUnits?: number;
  readonly totalUnits?: number;
}

export interface ProgressObservationVerificationInput {
  readonly source: ProgressSource;
  readonly sourceReference: string;
  readonly tenantId: TenantId;
  readonly correlationId: CorrelationId;
  readonly scope: ProgressScope;
  readonly subjectId: string;
  readonly observationId: EventId;
  readonly observedAtMs: number;
  readonly nowMs: number;
}

export type ProgressObservationVerificationResult =
  | Readonly<{
      ok: true;
      verifiedAtMs: number;
      sourceRevision?: string;
      authorizesExecution: false;
    }>
  | Readonly<{
      ok: false;
      code: 'SOURCE_UNVERIFIED' | 'SOURCE_BINDING_MISMATCH' | 'SOURCE_STALE';
      retryable: boolean;
      authorizesExecution: false;
    }>;

/**
 * The verifier is the trust boundary between canonical backend state and the W14-C projection.
 * UI/client payloads never become canonical merely by reaching this module.
 */
export interface ProgressObservationVerifier {
  verify(input: ProgressObservationVerificationInput): ProgressObservationVerificationResult;
}

export interface ProgressFrame {
  readonly sequence: number;
  readonly observationId: EventId;
  readonly source: ProgressSource;
  readonly sourceReference: string;
  readonly sourceRevision?: string;
  readonly tenantId: TenantId;
  readonly correlationId: CorrelationId;
  readonly scope: ProgressScope;
  readonly subjectId: string;
  readonly state: ProgressState;
  readonly observedAtMs: number;
  readonly safeSummary: string;
  readonly reasonCode?: string;
  readonly evidenceRefs: readonly string[];
  readonly completedUnits?: number;
  readonly totalUnits?: number;
  readonly percentComplete?: number;
  readonly afterCancellationRequest: boolean;
  readonly lateCompletionAfterCancellation: boolean;
  readonly requiresW07Reconciliation: boolean;
  readonly sourceVerified: true;
  readonly privateReasoningIncluded: false;
  readonly authorizesExecution: false;
  readonly canGrantPermission: false;
  readonly provesExecutionSuccess: false;
}

export interface ProgressStreamSnapshot {
  readonly tenantId: TenantId;
  readonly correlationId: CorrelationId;
  readonly scope: ProgressScope;
  readonly subjectId: string;
  readonly state: ProgressState;
  readonly latestSequence: number;
  readonly firstRetainedSequence: number;
  readonly retainedFrames: number;
  readonly updatedAtMs: number;
  readonly safeSummary: string;
  readonly reasonCode?: string;
  readonly evidenceRefs: readonly string[];
  readonly afterCancellationRequest: boolean;
  readonly lateCompletionAfterCancellation: boolean;
  readonly requiresW07Reconciliation: boolean;
  readonly sourceOfTruth: 'CANONICAL_UPSTREAM_PROJECTION';
  readonly privateReasoningIncluded: false;
  readonly authorizesExecution: false;
  readonly canGrantPermission: false;
  readonly provesExecutionSuccess: false;
}

export interface RecordProgressSuccess {
  readonly disposition: 'RECORDED' | 'DUPLICATE_OBSERVATION';
  readonly frame: ProgressFrame;
  readonly stream: ProgressStreamSnapshot;
}

export interface ReplayProgressInput {
  readonly tenantId: TenantId;
  readonly correlationId: CorrelationId;
  readonly scope: ProgressScope;
  readonly subjectId: string;
  readonly afterSequence: number;
  readonly limit?: number;
}

export interface ReplayProgressSuccess {
  readonly frames: readonly ProgressFrame[];
  readonly firstRetainedSequence: number;
  readonly latestSequence: number;
  readonly hasMore: boolean;
  readonly sourceOfTruth: 'CANONICAL_UPSTREAM_PROJECTION';
  readonly authorizesExecution: false;
  readonly canGrantPermission: false;
}

export interface RequestProgressCancellationInput {
  readonly tenantId: TenantId;
  readonly correlationId: CorrelationId;
  readonly gatewaySessionId: string;
  readonly gatewayConnectionId: string;
  readonly commandId: CommandId;
  readonly nowMs: number;
}

export interface ProgressCancellationSessionView {
  readonly gatewaySessionId: string;
  readonly gatewayConnectionId: string;
  readonly state: 'OPEN' | 'CLOSED';
  readonly tenantId: TenantId;
  readonly correlationId: CorrelationId;
  readonly authorizesExecution: false;
  readonly canGrantPermission: false;
}

export interface ProgressCancellationCommandView {
  readonly commandId: CommandId;
  readonly correlationId: CorrelationId;
  readonly state: Exclude<ProgressState, 'QUEUED'>;
  readonly cancelRequestedAtMs?: number;
  readonly authorizesExecution: false;
  readonly provesExecutionSuccess: false;
  readonly externalStateVerified: false;
}

export interface ProgressCancellationPortSuccess {
  readonly disposition: 'CANCEL_REQUESTED' | 'ALREADY_REQUESTED' | 'NOOP_TERMINAL_OR_UNCERTAIN';
  readonly command: ProgressCancellationCommandView;
}

export type ProgressCancellationPortResult<T> =
  | Readonly<{ ok: true; value: T; authorizesExecution: false }>
  | Readonly<{
      ok: false;
      error: Readonly<{ code: string; message: string; retryable: boolean }>;
      authorizesExecution: false;
    }>;

/**
 * Structural port compatible with W14-B without making W14-C a new execution/cancellation authority.
 */
export interface ProgressCancellationPort {
  getSession(
    gatewaySessionId: unknown,
    nowMs: unknown,
  ): ProgressCancellationPortResult<ProgressCancellationSessionView>;
  requestCancellation(input: unknown): ProgressCancellationPortResult<ProgressCancellationPortSuccess>;
}

export interface ProgressCancellationProjection {
  readonly disposition: ProgressCancellationPortSuccess['disposition'];
  readonly commandId: CommandId;
  readonly correlationId: CorrelationId;
  readonly state: ProgressCancellationCommandView['state'];
  readonly cancelRequestedAtMs?: number;
  readonly effect: 'REQUEST_ONLY_NOT_EXECUTION_PROOF';
  readonly outcomeAuthority: 'W07_ONLY';
  readonly provesExecutionPrevented: false;
  readonly authorizesExecution: false;
  readonly canGrantPermission: false;
  readonly retryAuthorized: false;
}

export const PROGRESS_PROJECTION_ERROR_CODES = [
  'MALFORMED_REQUEST',
  'OBSERVATION_STALE',
  'SOURCE_REJECTED',
  'SOURCE_PROTOCOL_VIOLATION',
  'STREAM_CAPACITY',
  'OBSERVATION_CONFLICT',
  'STREAM_NOT_FOUND',
  'REPLAY_CURSOR_EXPIRED',
  'REPLAY_CURSOR_AHEAD',
  'CANCELLATION_BINDING_MISMATCH',
  'CANCELLATION_UPSTREAM_REJECTED',
  'CANCELLATION_PROTOCOL_VIOLATION',
] as const;
export type ProgressProjectionErrorCode = (typeof PROGRESS_PROJECTION_ERROR_CODES)[number];

export interface ProgressProjectionError {
  readonly ok: false;
  readonly error: Readonly<{
    code: ProgressProjectionErrorCode;
    message: string;
    retryable: boolean;
    upstreamCode?: string;
  }>;
  readonly authorizesExecution: false;
  readonly retryAuthorized: false;
}

export interface ProgressProjectionSuccess<T> {
  readonly ok: true;
  readonly value: T;
  readonly authorizesExecution: false;
  readonly retryAuthorized: false;
}

export type ProgressProjectionResult<T> = ProgressProjectionSuccess<T> | ProgressProjectionError;
