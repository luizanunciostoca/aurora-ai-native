import type { ExecutionTargetReference } from '@aurora/contracts/execution-target';

import type {
  ExecutableTargetBinding,
  TargetResolutionReason,
  TargetResolutionRequest,
  TargetResolutionResult,
} from './types.js';

function sameTarget(left: ExecutionTargetReference, right: ExecutionTargetReference): boolean {
  if (left.kind !== right.kind) return false;
  switch (left.kind) {
    case 'PROVIDER':
      return (
        right.kind === 'PROVIDER' &&
        left.provider === right.provider &&
        left.targetType === right.targetType &&
        left.targetReference === right.targetReference &&
        left.accountReference === right.accountReference
      );
    case 'DEVICE':
      return right.kind === 'DEVICE' && left.bindingReference === right.bindingReference;
    case 'WORKFLOW':
      return right.kind === 'WORKFLOW' && left.bindingReference === right.bindingReference;
    case 'LOCAL_SERVICE':
      return right.kind === 'LOCAL_SERVICE' && left.bindingReference === right.bindingReference;
  }
}

function unresolved(
  request: TargetResolutionRequest,
  ...reasons: readonly TargetResolutionReason[]
): TargetResolutionResult {
  return Object.freeze({
    kind: 'EXECUTION_TARGET_RESOLUTION',
    schemaVersion: request.schemaVersion,
    target: request.target,
    resolved: false,
    reasons: Object.freeze([...new Set(reasons)].sort()),
    authorizesExecution: false,
  });
}

function bindingStateReason(binding: ExecutableTargetBinding): TargetResolutionReason | undefined {
  switch (binding.state) {
    case 'AVAILABLE':
      return undefined;
    case 'UNAVAILABLE':
      return 'TARGET_UNAVAILABLE';
    case 'DEGRADED':
      return 'TARGET_DEGRADED';
    case 'RETIRED':
      return 'TARGET_RETIRED';
  }
}

/**
 * Resolves target metadata to one generic executable binding. This function is
 * deterministic and side-effect free. Successful resolution is availability
 * evidence only and never execution authority.
 */
export function resolveExecutionTarget(request: TargetResolutionRequest): TargetResolutionResult {
  const targetMatches = request.bindings.filter((binding) =>
    sameTarget(binding.target, request.target),
  );
  if (targetMatches.length === 0) return unresolved(request, 'TARGET_NOT_FOUND');

  const tenantMatches = targetMatches.filter(
    (binding) => binding.tenant.tenantId === request.tenant.tenantId,
  );
  if (tenantMatches.length === 0) return unresolved(request, 'TARGET_TENANT_MISMATCH');
  if (tenantMatches.length > 1) return unresolved(request, 'TARGET_AMBIGUOUS');

  const binding = tenantMatches[0];
  const stateReason = bindingStateReason(binding);
  if (stateReason !== undefined) return unresolved(request, stateReason);

  if (
    binding.freshUntil !== undefined &&
    Date.parse(binding.freshUntil) <= Date.parse(request.evaluatedAt)
  ) {
    return unresolved(request, 'TARGET_STALE');
  }

  if (!binding.compatibleActionIntentSchemaVersions.includes(request.actionIntentSchemaVersion)) {
    return unresolved(request, 'TARGET_INCOMPATIBLE');
  }

  if (!binding.preconditionsSatisfied) return unresolved(request, 'TARGET_PRECONDITION_FAILED');

  return Object.freeze({
    kind: 'EXECUTION_TARGET_RESOLUTION',
    schemaVersion: request.schemaVersion,
    target: request.target,
    resolved: true,
    binding,
    reasons: [] as const,
    authorizesExecution: false,
  });
}
