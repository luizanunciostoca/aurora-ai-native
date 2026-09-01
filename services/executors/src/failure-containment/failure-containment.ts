import type {
  CircuitSnapshot,
  CircuitTransitionRequest,
  CircuitTransitionResult,
  EvaluateFailureContainmentRequest,
  FailureContainmentReason,
  FailureContainmentResult,
  KillSwitchTransitionRequest,
  KillSwitchTransitionResult,
} from './types.js';

const RFC3339_PATTERN = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,9})?(?:Z|[+-]\d{2}:\d{2})$/;

function timestampMs(value: string): number | undefined {
  if (!RFC3339_PATTERN.test(value)) return undefined;
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function uniqueSorted<T extends string>(values: readonly T[]): readonly T[] {
  return [...new Set(values)].sort() as readonly T[];
}

function validContainmentConfig(request: EvaluateFailureContainmentRequest): boolean {
  const { currentInFlight, maxInFlight, retryDepth, maxRetryDepth, circuit } = request.snapshot;
  return (
    Number.isInteger(currentInFlight) &&
    currentInFlight >= 0 &&
    Number.isInteger(maxInFlight) &&
    maxInFlight >= 1 &&
    Number.isInteger(retryDepth) &&
    retryDepth >= 0 &&
    Number.isInteger(maxRetryDepth) &&
    maxRetryDepth >= 1 &&
    Number.isInteger(circuit.consecutiveFailures) &&
    circuit.consecutiveFailures >= 0
  );
}

/**
 * Pure prerequisite gate for kill/circuit/degradation/cancellation/overload state.
 * Intelligence/router signals are deliberately ignored and cannot override containment.
 */
export function evaluateFailureContainment(
  request: EvaluateFailureContainmentRequest,
): FailureContainmentResult {
  const reasons: FailureContainmentReason[] = [];
  const validTime = timestampMs(request.evaluatedAt) !== undefined;
  const validConfig = validContainmentConfig(request);
  if (!validTime) reasons.push('INVALID_TIME');
  if (!validConfig) reasons.push('INVALID_CONTAINMENT_CONFIG');

  if (request.snapshot.killSwitch.state === 'ACTIVE') reasons.push('KILL_SWITCH_ACTIVE');
  if (request.snapshot.circuit.state === 'OPEN') reasons.push('CIRCUIT_OPEN');
  if (
    request.snapshot.circuit.state === 'HALF_OPEN' &&
    request.snapshot.circuit.halfOpenProbeInFlight
  ) {
    reasons.push('HALF_OPEN_PROBE_IN_FLIGHT');
  }
  if (request.snapshot.dependencyHealth === 'UNAVAILABLE') {
    reasons.push('DEPENDENCY_UNAVAILABLE');
  }
  if (request.snapshot.currentInFlight >= request.snapshot.maxInFlight) {
    reasons.push('OVERLOAD_LIMIT_REACHED');
  }
  if (request.snapshot.retryDepth >= request.snapshot.maxRetryDepth) {
    reasons.push('CASCADING_RETRY_LIMIT_REACHED');
  }

  let cancellationDisposition: FailureContainmentResult['cancellationDisposition'] = 'NONE';
  let requiresReconciliationHandoff = false;
  if (request.snapshot.cancellationRequested) {
    reasons.push('CANCELLATION_REQUESTED');
    if (request.phase === 'QUEUED' || request.phase === 'PRE_EXTERNAL') {
      cancellationDisposition = 'STOP_BEFORE_EXTERNAL';
    } else {
      cancellationDisposition = 'RECONCILE_IN_FLIGHT';
      requiresReconciliationHandoff = true;
      reasons.push('IN_FLIGHT_CANCELLATION_REQUIRES_RECONCILIATION');
    }
  }

  const degradedMode =
    request.snapshot.dependencyHealth === 'DEGRADED' || request.snapshot.circuit.state !== 'CLOSED';
  const halfOpenProbeEligible =
    validTime &&
    validConfig &&
    request.snapshot.circuit.state === 'HALF_OPEN' &&
    !request.snapshot.circuit.halfOpenProbeInFlight &&
    request.snapshot.killSwitch.state !== 'ACTIVE' &&
    request.snapshot.dependencyHealth !== 'UNAVAILABLE' &&
    !request.snapshot.cancellationRequested &&
    request.snapshot.currentInFlight < request.snapshot.maxInFlight &&
    request.snapshot.retryDepth < request.snapshot.maxRetryDepth;
  const blockingReasons = reasons.length > 0;

  return {
    kind: 'FAILURE_CONTAINMENT_RESULT',
    schemaVersion: request.schemaVersion,
    actionIntentId: request.actionIntent.actionIntentId,
    mayProceedToOtherGuards: !blockingReasons || halfOpenProbeEligible,
    degradedMode,
    halfOpenProbeEligible,
    cancellationDisposition,
    requiresReconciliationHandoff,
    reasons: uniqueSorted(reasons),
    authorizesExecution: false,
  };
}

function invalidCircuitTransition(
  snapshot: CircuitSnapshot,
  ...reasons: readonly (
    | 'INVALID_TIME'
    | 'INVALID_CIRCUIT_CONFIG'
    | 'INVALID_CIRCUIT_TRANSITION'
    | 'RECOVERY_WINDOW_NOT_ELAPSED'
    | 'HALF_OPEN_PROBE_ALREADY_IN_FLIGHT'
  )[]
): CircuitTransitionResult {
  return {
    kind: 'CIRCUIT_TRANSITION_RESULT',
    accepted: false,
    snapshot,
    reasons: uniqueSorted(reasons),
    authorizesExecution: false,
  };
}

function validCircuitConfig(request: CircuitTransitionRequest): boolean {
  return (
    Number.isInteger(request.failureThreshold) &&
    request.failureThreshold >= 1 &&
    Number.isFinite(request.recoveryAfterMs) &&
    request.recoveryAfterMs >= 0 &&
    Number.isInteger(request.snapshot.consecutiveFailures) &&
    request.snapshot.consecutiveFailures >= 0
  );
}

/** Deterministic circuit-breaker state machine with explicit half-open probe fencing. */
export function transitionCircuit(request: CircuitTransitionRequest): CircuitTransitionResult {
  const observedAt = timestampMs(request.observedAt);
  if (observedAt === undefined) {
    return invalidCircuitTransition(request.snapshot, 'INVALID_TIME');
  }
  if (!validCircuitConfig(request)) {
    return invalidCircuitTransition(request.snapshot, 'INVALID_CIRCUIT_CONFIG');
  }

  const current = request.snapshot;
  if (current.state === 'CLOSED') {
    if (request.event === 'SUCCESS') {
      return {
        kind: 'CIRCUIT_TRANSITION_RESULT',
        accepted: true,
        snapshot: {
          state: 'CLOSED',
          consecutiveFailures: 0,
          halfOpenProbeInFlight: false,
        },
        reasons: [],
        authorizesExecution: false,
      };
    }
    if (request.event === 'FAILURE') {
      const consecutiveFailures = current.consecutiveFailures + 1;
      const open = consecutiveFailures >= request.failureThreshold;
      return {
        kind: 'CIRCUIT_TRANSITION_RESULT',
        accepted: true,
        snapshot: open
          ? {
              state: 'OPEN',
              consecutiveFailures,
              openedAt: request.observedAt,
              halfOpenProbeInFlight: false,
            }
          : {
              state: 'CLOSED',
              consecutiveFailures,
              halfOpenProbeInFlight: false,
            },
        reasons: [],
        authorizesExecution: false,
      };
    }
    return invalidCircuitTransition(current, 'INVALID_CIRCUIT_TRANSITION');
  }

  if (current.state === 'OPEN') {
    if (request.event !== 'RECOVERY_WINDOW_ELAPSED') {
      return invalidCircuitTransition(current, 'INVALID_CIRCUIT_TRANSITION');
    }
    const openedAt = current.openedAt === undefined ? undefined : timestampMs(current.openedAt);
    if (openedAt === undefined) {
      return invalidCircuitTransition(current, 'INVALID_TIME');
    }
    if (observedAt - openedAt < request.recoveryAfterMs) {
      return invalidCircuitTransition(current, 'RECOVERY_WINDOW_NOT_ELAPSED');
    }
    return {
      kind: 'CIRCUIT_TRANSITION_RESULT',
      accepted: true,
      snapshot: {
        state: 'HALF_OPEN',
        consecutiveFailures: current.consecutiveFailures,
        halfOpenProbeInFlight: false,
      },
      reasons: [],
      authorizesExecution: false,
    };
  }

  if (request.event === 'HALF_OPEN_PROBE_STARTED') {
    if (current.halfOpenProbeInFlight) {
      return invalidCircuitTransition(current, 'HALF_OPEN_PROBE_ALREADY_IN_FLIGHT');
    }
    return {
      kind: 'CIRCUIT_TRANSITION_RESULT',
      accepted: true,
      snapshot: { ...current, halfOpenProbeInFlight: true },
      reasons: [],
      authorizesExecution: false,
    };
  }
  if (request.event === 'SUCCESS') {
    return {
      kind: 'CIRCUIT_TRANSITION_RESULT',
      accepted: true,
      snapshot: {
        state: 'CLOSED',
        consecutiveFailures: 0,
        halfOpenProbeInFlight: false,
      },
      reasons: [],
      authorizesExecution: false,
    };
  }
  if (request.event === 'FAILURE') {
    return {
      kind: 'CIRCUIT_TRANSITION_RESULT',
      accepted: true,
      snapshot: {
        state: 'OPEN',
        consecutiveFailures: current.consecutiveFailures + 1,
        openedAt: request.observedAt,
        halfOpenProbeInFlight: false,
      },
      reasons: [],
      authorizesExecution: false,
    };
  }
  return invalidCircuitTransition(current, 'INVALID_CIRCUIT_TRANSITION');
}

/**
 * Kill switch activation is fail-safe. Deactivation requires a separately
 * validated governed recovery gate and still does not authorize execution.
 */
export function transitionKillSwitch(
  request: KillSwitchTransitionRequest,
): KillSwitchTransitionResult {
  if (timestampMs(request.changedAt) === undefined) {
    return {
      kind: 'KILL_SWITCH_TRANSITION_RESULT',
      accepted: false,
      snapshot: request.snapshot,
      reasons: ['INVALID_TIME'],
      authorizesExecution: false,
    };
  }
  if (request.command === 'DEACTIVATE' && request.recoveryGate !== 'VALIDATED') {
    return {
      kind: 'KILL_SWITCH_TRANSITION_RESULT',
      accepted: false,
      snapshot: request.snapshot,
      reasons: ['KILL_SWITCH_RECOVERY_NOT_VALIDATED'],
      authorizesExecution: false,
    };
  }
  return {
    kind: 'KILL_SWITCH_TRANSITION_RESULT',
    accepted: true,
    snapshot: {
      state: request.command === 'ACTIVATE' ? 'ACTIVE' : 'INACTIVE',
      changedAt: request.changedAt,
    },
    reasons: [],
    authorizesExecution: false,
  };
}
