import type { ActionIntent } from '@aurora/contracts/actions';
import type { Rfc3339Timestamp } from '@aurora/contracts/context';
import type { ContractVersion } from '@aurora/contracts/versioning';

export type CircuitState = 'CLOSED' | 'OPEN' | 'HALF_OPEN';

export interface CircuitSnapshot {
  readonly state: CircuitState;
  readonly consecutiveFailures: number;
  readonly openedAt?: Rfc3339Timestamp;
  readonly halfOpenProbeInFlight: boolean;
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
  readonly halfOpenProbeEligible: boolean;
  readonly cancellationDisposition: CancellationDisposition;
  readonly requiresReconciliationHandoff: boolean;
  readonly reasons: readonly FailureContainmentReason[];
  /** Passing containment is only a prerequisite. It never grants execution authority. */
  readonly authorizesExecution: false;
}

export type CircuitEvent =
  | 'SUCCESS'
  | 'FAILURE'
  | 'RECOVERY_WINDOW_ELAPSED'
  | 'HALF_OPEN_PROBE_STARTED';

export interface CircuitTransitionRequest {
  readonly snapshot: CircuitSnapshot;
  readonly event: CircuitEvent;
  readonly observedAt: Rfc3339Timestamp;
  readonly failureThreshold: number;
  readonly recoveryAfterMs: number;
}

export type CircuitTransitionReason =
  | 'INVALID_TIME'
  | 'INVALID_CIRCUIT_CONFIG'
  | 'INVALID_CIRCUIT_TRANSITION'
  | 'RECOVERY_WINDOW_NOT_ELAPSED'
  | 'HALF_OPEN_PROBE_ALREADY_IN_FLIGHT';

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
  | 'KILL_SWITCH_RECOVERY_NOT_VALIDATED';

export interface KillSwitchTransitionResult {
  readonly kind: 'KILL_SWITCH_TRANSITION_RESULT';
  readonly accepted: boolean;
  readonly snapshot: KillSwitchSnapshot;
  readonly reasons: readonly KillSwitchTransitionReason[];
  readonly authorizesExecution: false;
}
