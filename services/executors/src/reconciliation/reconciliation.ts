import type {
  KnownPreExecutionFailureFact,
  ExecutionAmbiguityClassification,
  ClassifyExecutionAmbiguityRequest,
  ExecutionUncertainFact,
  ExecutionUncertaintyRecord,
  ReadbackReconciliationHint,
  ReadbackResultForReconciliation,
  ReconcileExecutionUncertaintyRequest,
  ReconciliationReason,
  ReconciliationResult,
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

function rejectedClassification(
  ...reasons: readonly (
    'INVALID_TIME' | 'ATTEMPT_INVALID' | 'ATTEMPT_LIMIT_INVALID' | 'SIGNAL_PHASE_INCOMPATIBLE'
  )[]
): ExecutionAmbiguityClassification {
  return { status: 'REJECTED', reasons: uniqueSorted(reasons), authorizesExecution: false };
}

function signalCompatibleWithPhase(request: ClassifyExecutionAmbiguityRequest): boolean {
  if (request.phase === 'AFTER_EXTERNAL_INVOCATION_STARTED') return true;
  return request.signal === 'TIMEOUT' || request.signal === 'CONNECTION_LOST';
}

function knownPreExecutionFailure(
  request: ClassifyExecutionAmbiguityRequest,
): KnownPreExecutionFailureFact {
  const timeout = request.signal === 'TIMEOUT';
  return {
    kind: 'ExecutionResult',
    schemaVersion: request.schemaVersion,
    correlationId: request.actionIntent.correlation.correlationId,
    timestamp: request.occurredAt,
    outcome: 'FAILED',
    error: {
      kind: 'CanonicalError',
      schemaVersion: request.schemaVersion,
      code: timeout ? 'TIMEOUT_BEFORE_EXECUTION' : 'DEPENDENCY_UNAVAILABLE',
      category: timeout ? 'TIMEOUT' : 'DEPENDENCY_FAILURE',
      message: timeout
        ? 'Execution did not start before the timeout boundary.'
        : 'Execution did not start because the dependency connection was unavailable.',
      retryability: timeout ? 'RETRY_AFTER_GUARDS' : 'RETRY_AFTER_BACKOFF_AND_GUARDS',
      correlationId: request.actionIntent.correlation.correlationId,
      timestamp: request.occurredAt,
      classification: request.actionIntent.dataClassification,
    },
  };
}

function uncertainExecutionFact(
  request: ClassifyExecutionAmbiguityRequest,
): ExecutionUncertainFact {
  return {
    kind: 'ExecutionResult',
    schemaVersion: request.schemaVersion,
    correlationId: request.actionIntent.correlation.correlationId,
    timestamp: request.occurredAt,
    outcome: 'EXECUTION_UNCERTAIN',
    error: {
      kind: 'CanonicalError',
      schemaVersion: request.schemaVersion,
      code: 'EXECUTION_UNCERTAIN',
      category: 'EXECUTION_UNCERTAIN',
      message: 'An external side effect may have occurred; reconcile before any equivalent retry.',
      retryability: 'RECONCILE_BEFORE_RETRY',
      correlationId: request.actionIntent.correlation.correlationId,
      details: { ambiguitySignal: request.signal },
      timestamp: request.occurredAt,
      classification: request.actionIntent.dataClassification,
    },
  };
}

/**
 * Distinguishes known pre-execution failures from ambiguous post-dispatch outcomes.
 * This function performs no retry and grants no execution authority.
 */
export function classifyExecutionAmbiguity(
  request: ClassifyExecutionAmbiguityRequest,
): ExecutionAmbiguityClassification {
  const reasons: Array<
    'INVALID_TIME' | 'ATTEMPT_INVALID' | 'ATTEMPT_LIMIT_INVALID' | 'SIGNAL_PHASE_INCOMPATIBLE'
  > = [];
  if (timestampMs(request.occurredAt) === undefined) reasons.push('INVALID_TIME');
  if (!Number.isInteger(request.attemptNumber) || request.attemptNumber < 1) {
    reasons.push('ATTEMPT_INVALID');
  }
  if (!Number.isInteger(request.maxAttempts) || request.maxAttempts < 1) {
    reasons.push('ATTEMPT_LIMIT_INVALID');
  }
  if (request.attemptNumber > request.maxAttempts) reasons.push('ATTEMPT_INVALID');
  if (!signalCompatibleWithPhase(request)) reasons.push('SIGNAL_PHASE_INCOMPATIBLE');
  if (reasons.length > 0) return rejectedClassification(...reasons);

  if (request.phase === 'BEFORE_EXTERNAL_INVOCATION') {
    return {
      status: 'KNOWN_PRE_EXECUTION_FAILURE',
      executionResult: knownPreExecutionFailure(request),
      reconciliationRequired: false,
      retryRequiresFreshGuards: true,
      authorizesExecution: false,
    };
  }

  const executionResult = uncertainExecutionFact(request);
  const uncertainty: ExecutionUncertaintyRecord = Object.freeze({
    kind: 'EXECUTION_UNCERTAINTY_RECORD',
    schemaVersion: request.schemaVersion,
    actionIntentId: request.actionIntent.actionIntentId,
    correlationId: request.actionIntent.correlation.correlationId,
    occurredAt: request.occurredAt,
    attemptNumber: request.attemptNumber,
    maxAttempts: request.maxAttempts,
    signal: request.signal,
    executionResult,
    authorizesExecution: false,
  });

  return {
    status: 'EXECUTION_UNCERTAIN',
    uncertainty,
    reconciliationRequired: true,
    retryAllowedBeforeReconciliation: false,
    authorizesExecution: false,
  };
}

function reconciliationResult(
  request: ReconcileExecutionUncertaintyRequest,
  state: ReconciliationResult['state'],
  reasons: readonly ReconciliationReason[],
  reconciliationRequired: boolean,
  retryEligibleAfterFreshGuards: boolean,
  nextAttemptNumber?: number,
): ReconciliationResult {
  return {
    kind: 'EXECUTION_RECONCILIATION_RESULT',
    schemaVersion: request.schemaVersion,
    actionIntentId: request.actionIntent.actionIntentId,
    state,
    reasons: uniqueSorted(reasons),
    reconciliationRequired,
    retryEligibleAfterFreshGuards,
    ...(nextAttemptNumber === undefined ? {} : { nextAttemptNumber }),
    authorizesExecution: false,
  };
}

/**
 * Reconciles an ambiguous attempt. Equivalent retry is never eligible until
 * the side effect is explicitly confirmed absent and fresh W07-C safeguards pass.
 */
export function reconcileExecutionUncertainty(
  request: ReconcileExecutionUncertaintyRequest,
): ReconciliationResult {
  if (
    request.schemaVersion !== request.actionIntent.schemaVersion ||
    request.schemaVersion !== request.uncertainty.schemaVersion
  ) {
    return reconciliationResult(
      request,
      'STILL_UNCERTAIN',
      ['RECONCILIATION_SCHEMA_MISMATCH'],
      true,
      false,
    );
  }
  if (request.actionIntent.actionIntentId !== request.uncertainty.actionIntentId) {
    return reconciliationResult(
      request,
      'STILL_UNCERTAIN',
      ['RECONCILIATION_ACTION_INTENT_MISMATCH'],
      true,
      false,
    );
  }
  if (request.actionIntent.correlation.correlationId !== request.uncertainty.correlationId) {
    return reconciliationResult(
      request,
      'STILL_UNCERTAIN',
      ['RECONCILIATION_CORRELATION_MISMATCH'],
      true,
      false,
    );
  }
  if (request.observation === undefined) {
    return reconciliationResult(
      request,
      'STILL_UNCERTAIN',
      ['RECONCILIATION_REQUIRED'],
      true,
      false,
    );
  }

  const observedAt = timestampMs(request.observation.observedAt);
  const occurredAt = timestampMs(request.uncertainty.occurredAt);
  if (observedAt === undefined || occurredAt === undefined) {
    return reconciliationResult(
      request,
      'STILL_UNCERTAIN',
      ['RECONCILIATION_TIME_INVALID'],
      true,
      false,
    );
  }
  if (observedAt < occurredAt) {
    return reconciliationResult(
      request,
      'STILL_UNCERTAIN',
      ['RECONCILIATION_TIME_ORDER_INVALID'],
      true,
      false,
    );
  }

  if (request.observation.state === 'EFFECT_OBSERVED') {
    return reconciliationResult(
      request,
      'EFFECT_OBSERVED',
      ['EFFECT_ALREADY_OBSERVED'],
      false,
      false,
    );
  }
  if (request.observation.state === 'INDETERMINATE') {
    return reconciliationResult(
      request,
      'STILL_UNCERTAIN',
      ['RECONCILIATION_INDETERMINATE'],
      true,
      false,
    );
  }

  if (request.uncertainty.attemptNumber >= request.uncertainty.maxAttempts) {
    return reconciliationResult(
      request,
      'NO_EFFECT_CONFIRMED_RETRY_BLOCKED',
      ['RETRY_ATTEMPT_LIMIT_REACHED'],
      false,
      false,
    );
  }
  if (request.retrySafeguards === undefined) {
    return reconciliationResult(
      request,
      'NO_EFFECT_CONFIRMED_RETRY_BLOCKED',
      ['RETRY_GUARDS_REQUIRED'],
      false,
      false,
    );
  }

  const nextAttemptNumber = request.uncertainty.attemptNumber + 1;
  const safeguardsEvaluatedAt = timestampMs(request.retrySafeguards.evaluatedAt);
  if (safeguardsEvaluatedAt === undefined) {
    return reconciliationResult(
      request,
      'NO_EFFECT_CONFIRMED_RETRY_BLOCKED',
      ['RETRY_GUARDS_TIME_INVALID'],
      false,
      false,
    );
  }
  if (safeguardsEvaluatedAt < observedAt) {
    return reconciliationResult(
      request,
      'NO_EFFECT_CONFIRMED_RETRY_BLOCKED',
      ['RETRY_GUARDS_STALE'],
      false,
      false,
    );
  }
  if (request.retrySafeguards.attemptNumber !== nextAttemptNumber) {
    return reconciliationResult(
      request,
      'NO_EFFECT_CONFIRMED_RETRY_BLOCKED',
      ['RETRY_GUARDS_ATTEMPT_MISMATCH'],
      false,
      false,
    );
  }

  const safeguardResult = request.retrySafeguards.result;
  if (
    safeguardResult.schemaVersion !== request.schemaVersion ||
    safeguardResult.actionIntentId !== request.actionIntent.actionIntentId ||
    !safeguardResult.safeToInvokeExternal
  ) {
    return reconciliationResult(
      request,
      'NO_EFFECT_CONFIRMED_RETRY_BLOCKED',
      ['RETRY_GUARDS_BLOCKED'],
      false,
      false,
    );
  }

  return reconciliationResult(
    request,
    'NO_EFFECT_CONFIRMED_RETRY_ELIGIBLE',
    [],
    false,
    true,
    nextAttemptNumber,
  );
}

/**
 * Converts W07-E readback comparison into a conservative reconciliation hint.
 * MATCH means the expected effect was observed, not that Evidence became VERIFIED.
 */
export function readbackReconciliationHint(
  result: ReadbackResultForReconciliation,
): ReadbackReconciliationHint {
  if (result.status === 'CAPTURED' && result.assessment.state === 'MATCH') {
    return {
      state: 'EFFECT_OBSERVED',
      reason: 'READBACK_MATCH_OBSERVED',
      authorizesExecution: false,
    };
  }
  return {
    state: 'INDETERMINATE',
    reason: 'READBACK_NOT_SUFFICIENT_TO_RESOLVE',
    authorizesExecution: false,
  };
}
