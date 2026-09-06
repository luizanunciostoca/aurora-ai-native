import type { ActionIntent } from '@aurora/contracts/actions';
import type { Rfc3339Timestamp, TenantContext } from '@aurora/contracts/context';
import type { ContractVersion } from '@aurora/contracts/versioning';
import type { SqlStatement } from '@aurora/workflow';

export type CircuitState = 'CLOSED' | 'OPEN' | 'HALF_OPEN';

export interface CircuitSnapshot {
  readonly state: CircuitState;
  readonly consecutiveFailures: number;
  readonly openedAt?: Rfc3339Timestamp;
  readonly halfOpenProbeInFlight: boolean;
  /** Bound only while a HALF_OPEN probe is reserved. */
  readonly halfOpenProbeActionIntentId?: ActionIntent['actionIntentId'];
}

export type DependencyHealth = 'HEALTHY' | 'DEGRADED' | 'UNAVAILABLE';
export type KillSwitchState = 'INACTIVE' | 'ACTIVE';

export interface KillSwitchSnapshot {
  readonly state: KillSwitchState;
  readonly changedAt: Rfc3339Timestamp;
}

export interface FailureContainmentSnapshot {
  readonly circuit: CircuitSnapshot;
  readonly killSwitch: KillSwitchSnapshot;
  readonly dependencyHealth: DependencyHealth;
  readonly cancellationRequested: boolean;
  readonly currentInFlight: number;
  readonly maxInFlight: number;
  readonly retryDepth: number;
  readonly maxRetryDepth: number;
}

export type ExecutionContainmentPhase = 'QUEUED' | 'PRE_EXTERNAL' | 'IN_FLIGHT' | 'POST_EXTERNAL';

export interface NonAuthoritativeExecutionSignals {
  readonly lane?: 'FAST' | 'GOVERNED';
  readonly confidence?: number;
  readonly urgency?: number;
  readonly routerOverrideRequested?: boolean;
}

export interface EvaluateFailureContainmentRequest {
  readonly schemaVersion: ContractVersion;
  readonly actionIntent: ActionIntent;
  readonly evaluatedAt: Rfc3339Timestamp;
  readonly phase: ExecutionContainmentPhase;
  readonly snapshot: FailureContainmentSnapshot;
  /** Explicitly ignored for authority/containment decisions except for negative testing. */
  readonly nonAuthoritativeSignals?: NonAuthoritativeExecutionSignals;
}

export type FailureContainmentReason =
  | 'INVALID_TIME'
  | 'INVALID_CONTAINMENT_CONFIG'
  | 'KILL_SWITCH_ACTIVE'
  | 'CIRCUIT_OPEN'
  | 'HALF_OPEN_PROBE_RESERVATION_REQUIRED'
  | 'HALF_OPEN_PROBE_IN_FLIGHT'
  | 'DEPENDENCY_UNAVAILABLE'
  | 'OVERLOAD_LIMIT_REACHED'
  | 'CASCADING_RETRY_LIMIT_REACHED'
  | 'CANCELLATION_REQUESTED'
  | 'IN_FLIGHT_CANCELLATION_REQUIRES_RECONCILIATION';

export type CancellationDisposition = 'NONE' | 'STOP_BEFORE_EXTERNAL' | 'RECONCILE_IN_FLIGHT';

export interface FailureContainmentResult {
  readonly kind: 'FAILURE_CONTAINMENT_RESULT';
  readonly schemaVersion: ContractVersion;
  readonly actionIntentId: ActionIntent['actionIntentId'];
  readonly mayProceedToOtherGuards: boolean;
  readonly degradedMode: boolean;
  /** True only when this caller may reserve the one HALF_OPEN probe. */
  readonly halfOpenProbeEligible: boolean;
  readonly cancellationDisposition: CancellationDisposition;
  readonly requiresReconciliationHandoff: boolean;
  readonly reasons: readonly FailureContainmentReason[];
  /** Passing containment is only a prerequisite. It never grants execution authority. */
  readonly authorizesExecution: false;
}

export type CircuitEvent =
  'SUCCESS' | 'FAILURE' | 'RECOVERY_WINDOW_ELAPSED' | 'HALF_OPEN_PROBE_STARTED';

export interface CircuitTransitionRequest {
  readonly snapshot: CircuitSnapshot;
  readonly event: CircuitEvent;
  readonly observedAt: Rfc3339Timestamp;
  readonly failureThreshold: number;
  readonly recoveryAfterMs: number;
  /** Required to reserve or complete a HALF_OPEN probe. */
  readonly probeActionIntentId?: ActionIntent['actionIntentId'];
}

export type CircuitTransitionReason =
  | 'INVALID_TIME'
  | 'INVALID_CIRCUIT_CONFIG'
  | 'INVALID_CIRCUIT_TRANSITION'
  | 'RECOVERY_WINDOW_NOT_ELAPSED'
  | 'HALF_OPEN_PROBE_ALREADY_IN_FLIGHT'
  | 'HALF_OPEN_PROBE_OWNER_REQUIRED'
  | 'HALF_OPEN_PROBE_OWNER_MISMATCH';

export interface CircuitTransitionResult {
  readonly kind: 'CIRCUIT_TRANSITION_RESULT';
  readonly accepted: boolean;
  readonly snapshot: CircuitSnapshot;
  readonly reasons: readonly CircuitTransitionReason[];
  readonly authorizesExecution: false;
}

export type KillSwitchCommand = 'ACTIVATE' | 'DEACTIVATE';
export type RecoveryGate = 'NOT_REQUIRED' | 'VALIDATED' | 'NOT_VALIDATED';

export interface KillSwitchTransitionRequest {
  readonly snapshot: KillSwitchSnapshot;
  readonly command: KillSwitchCommand;
  readonly changedAt: Rfc3339Timestamp;
  /** Deactivation requires an externally validated governed recovery gate. */
  readonly recoveryGate: RecoveryGate;
}

export type KillSwitchTransitionReason =
  | 'INVALID_TIME'
  | 'STALE_KILL_SWITCH_TRANSITION'
  | 'KILL_SWITCH_TIME_CONFLICT'
  | 'KILL_SWITCH_RECOVERY_NOT_VALIDATED';

export interface KillSwitchTransitionResult {
  readonly kind: 'KILL_SWITCH_TRANSITION_RESULT';
  readonly accepted: boolean;
  readonly snapshot: KillSwitchSnapshot;
  readonly reasons: readonly KillSwitchTransitionReason[];
  readonly authorizesExecution: false;
}

export interface AcquireProbeFenceRequest {
  readonly schemaVersion: ContractVersion;
  readonly tenantId: TenantContext['tenantId'];
  readonly targetScope: string;
  readonly probeActionIntentId: ActionIntent['actionIntentId'];
  readonly now: Rfc3339Timestamp;
  readonly ttlSeconds?: number;
}

export type ProbeFenceAcquireReason =
  | 'INVALID_TIME'
  | 'INVALID_TTL'
  | 'INVALID_TENANT_ID'
  | 'INVALID_TARGET_SCOPE'
  | 'INVALID_PROBE_ACTION_INTENT_ID'
  | 'PROBE_FENCE_ALREADY_ACTIVE'
  | 'PROBE_FENCE_STORE_FAILED';

export interface AcquireProbeFenceResult {
  readonly kind: 'ACQUIRE_PROBE_FENCE_RESULT';
  readonly acquired: boolean;
  readonly leaseKey: string;
  readonly probeActionIntentId: ActionIntent['actionIntentId'];
  readonly expiresAt?: Rfc3339Timestamp;
  readonly reasons: readonly ProbeFenceAcquireReason[];
  /** Containment fencing only. Never grants execution authority. */
  readonly authorizesExecution: false;
}

export interface HeartbeatProbeFenceRequest {
  readonly schemaVersion: ContractVersion;
  readonly tenantId: TenantContext['tenantId'];
  readonly targetScope: string;
  readonly probeActionIntentId: ActionIntent['actionIntentId'];
  readonly now: Rfc3339Timestamp;
  readonly ttlSeconds?: number;
}

export type ProbeFenceHeartbeatReason =
  | 'INVALID_TIME'
  | 'INVALID_TTL'
  | 'INVALID_TENANT_ID'
  | 'INVALID_TARGET_SCOPE'
  | 'INVALID_PROBE_ACTION_INTENT_ID'
  | 'PROBE_FENCE_NOT_ACTIVE'
  | 'PROBE_FENCE_OWNER_MISMATCH'
  | 'PROBE_FENCE_EXPIRED'
  | 'PROBE_FENCE_STORE_FAILED';

export interface HeartbeatProbeFenceResult {
  readonly kind: 'HEARTBEAT_PROBE_FENCE_RESULT';
  readonly renewed: boolean;
  readonly leaseKey: string;
  readonly probeActionIntentId: ActionIntent['actionIntentId'];
  readonly expiresAt?: Rfc3339Timestamp;
  readonly reasons: readonly ProbeFenceHeartbeatReason[];
  /** Containment fencing only. Never grants execution authority. */
  readonly authorizesExecution: false;
}

export interface ReleaseProbeFenceRequest {
  readonly schemaVersion: ContractVersion;
  readonly tenantId: TenantContext['tenantId'];
  readonly targetScope: string;
  readonly probeActionIntentId: ActionIntent['actionIntentId'];
  readonly now: Rfc3339Timestamp;
}

export type ProbeFenceReleaseReason =
  | 'INVALID_TIME'
  | 'INVALID_TENANT_ID'
  | 'INVALID_TARGET_SCOPE'
  | 'INVALID_PROBE_ACTION_INTENT_ID'
  | 'PROBE_FENCE_NOT_ACTIVE'
  | 'PROBE_FENCE_OWNER_MISMATCH'
  | 'PROBE_FENCE_STORE_FAILED';

export interface ReleaseProbeFenceResult {
  readonly kind: 'RELEASE_PROBE_FENCE_RESULT';
  readonly released: boolean;
  readonly leaseKey: string;
  readonly probeActionIntentId: ActionIntent['actionIntentId'];
  readonly reasons: readonly ProbeFenceReleaseReason[];
  /** Containment fencing only. Never grants execution authority. */
  readonly authorizesExecution: false;
}

export interface HalfOpenProbeFencePort {
  acquireProbeFence(
    request: AcquireProbeFenceRequest,
  ): Promise<AcquireProbeFenceResult> | AcquireProbeFenceResult;
  heartbeatProbeFence(
    request: HeartbeatProbeFenceRequest,
  ): Promise<HeartbeatProbeFenceResult> | HeartbeatProbeFenceResult;
  releaseProbeFence(
    request: ReleaseProbeFenceRequest,
  ): Promise<ReleaseProbeFenceResult> | ReleaseProbeFenceResult;
}

export interface W03LeaseRow {
  readonly lease_id?: string;
  readonly tenant_id: string;
  readonly lease_key: string;
  readonly owner_token: string;
  readonly subject_type: string;
  readonly subject_id: string;
  readonly status: 'active' | 'released' | 'expired';
  readonly acquired_at: string;
  readonly expires_at: string;
  readonly heartbeat_at: string;
  readonly last_error?: string | null;
}

export interface W03LeaseExecutor {
  query(statement: SqlStatement): Promise<readonly W03LeaseRow[]> | readonly W03LeaseRow[];
}

export interface W03HalfOpenProbeFenceAdapterOptions {
  readonly leaseExecutor?: W03LeaseExecutor;
  readonly defaultTtlSeconds?: number;
}
