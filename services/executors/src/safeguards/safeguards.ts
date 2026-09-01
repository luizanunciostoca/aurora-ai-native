import type {
  ExecutionSafeguardReason,
  ExecutionSafeguardRequest,
  ExecutionSafeguardResult,
} from './types.js';

const RFC3339 = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/;

function parseTime(value: string): number | undefined {
  if (!RFC3339.test(value)) return undefined;
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function fail(
  request: ExecutionSafeguardRequest,
  reasons: readonly ExecutionSafeguardReason[],
): ExecutionSafeguardResult {
  return {
    kind: 'EXECUTION_SAFEGUARD_RESULT',
    schemaVersion: request.schemaVersion,
    actionIntentId: request.actionIntent.actionIntentId,
    authorizesExecution: false,
    safeToInvokeExternal: false,
    idempotencyReserved: false,
    reasons: [...new Set(reasons)].sort() as readonly ExecutionSafeguardReason[],
  };
}

/**
 * Deterministic W07-C gate. All generic guards run before any external call.
 * REQUIRED idempotency must successfully reserve through the W03-owned port;
 * W07-C persists no ledger state itself.
 */
export function evaluateExecutionSafeguards(
  request: ExecutionSafeguardRequest,
): ExecutionSafeguardResult {
  const evaluatedAt = parseTime(request.evaluatedAt);
  const deadlineAt = parseTime(request.actionIntent.deadlineAt);
  if (evaluatedAt === undefined || deadlineAt === undefined) {
    return fail(request, ['INVALID_TIME']);
  }
  if (evaluatedAt >= deadlineAt) return fail(request, ['DEADLINE_EXPIRED']);

  if (!Number.isInteger(request.attemptNumber) || request.attemptNumber < 1) {
    return fail(request, ['ATTEMPT_INVALID']);
  }
  if (!Number.isInteger(request.maxAttempts) || request.maxAttempts < 1) {
    return fail(request, ['ATTEMPT_INVALID']);
  }
  if (request.attemptNumber > request.maxAttempts) {
    return fail(request, ['ATTEMPT_LIMIT_REACHED']);
  }

  if (request.quota !== undefined) {
    const { limit, used } = request.quota;
    if (!Number.isInteger(limit) || !Number.isInteger(used) || limit < 1 || used < 0) {
      return fail(request, ['QUOTA_INVALID']);
    }
    if (used >= limit) return fail(request, ['QUOTA_EXHAUSTED']);
  }

  try {
    if (!request.actionIntent.preconditions.every(request.evaluatePrecondition)) {
      return fail(request, ['PRECONDITION_FAILED']);
    }
  } catch {
    return fail(request, ['PRECONDITION_FAILED']);
  }

  if (request.actionIntent.idempotency.mode === 'NOT_APPLICABLE') {
    return {
      kind: 'EXECUTION_SAFEGUARD_RESULT',
      schemaVersion: request.schemaVersion,
      actionIntentId: request.actionIntent.actionIntentId,
      authorizesExecution: false,
      safeToInvokeExternal: true,
      idempotencyReserved: false,
      reasons: [],
    };
  }

  if (
    request.canonicalPayloadHash === undefined ||
    request.canonicalPayloadHash.length === 0 ||
    request.idempotencyFence === undefined
  ) {
    return fail(request, ['IDEMPOTENCY_CONFIGURATION_INVALID']);
  }

  let decision;
  try {
    decision = request.idempotencyFence.reserve({
      tenantId: request.actionIntent.tenant.tenantId,
      key: request.actionIntent.idempotency.key,
      operationName: `${request.actionIntent.capability.capability}:${request.actionIntent.capability.actionType}`,
      canonicalPayloadHash: request.canonicalPayloadHash,
    });
  } catch {
    return fail(request, ['IDEMPOTENCY_FENCE_FAILED']);
  }

  switch (decision.kind) {
    case 'REPLAY_COMPLETED':
      return fail(request, ['IDEMPOTENCY_REPLAY_COMPLETED']);
    case 'INFLIGHT':
      return fail(request, ['IDEMPOTENCY_INFLIGHT']);
    case 'CONFLICT':
      return fail(request, ['IDEMPOTENCY_CONFLICT']);
    case 'RESERVED':
      return {
        kind: 'EXECUTION_SAFEGUARD_RESULT',
        schemaVersion: request.schemaVersion,
        actionIntentId: request.actionIntent.actionIntentId,
        authorizesExecution: false,
        safeToInvokeExternal: true,
        idempotencyReserved: true,
        reasons: [],
      };
  }
}
