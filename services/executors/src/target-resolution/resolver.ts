import type { ExecutionTargetReference } from '@aurora/contracts/execution-target';

import type {
  ExecutableTargetBinding,
  TargetResolutionReason,
  TargetResolutionRequest,
  TargetResolutionResult,
} from './types.js';

const RFC3339_PATTERN = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,9})?(?:Z|[+-]\d{2}:\d{2})$/;

function sameTarget(left: ExecutionTargetReference, right: ExecutionTargetReference): boolean {
  if (left.schemaVersion !== right.schemaVersion || left.kind !== right.kind) return false;

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

function parseRfc3339Timestamp(value: string): number | undefined {
  if (!RFC3339_PATTERN.test(value)) return undefined;
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}

/**
 * Resolves target metadata to one generic executable binding. The resolver is
 * deterministic and side-effect free. Successful resolution proves only that
 * one tenant-scoped target binding is currently usable and compatible; it
 * never grants execution authority.
 */
export function resolveExecutionTarget(request: TargetResolutionRequest): TargetResolutionResult {
  const evaluatedAt = parseRfc3339Timestamp(request.evaluatedAt);
  if (evaluatedAt === undefined) return unresolved(request, 'TARGET_TIME_INVALID');

  const targetMatches = request.bindings.filter((binding) => sameTarget(binding.target, request.target));
  if (targetMatches.length === 0) return unresolved(request, 'TARGET_NOT_FOUND');

  const tenantMatches = targetMatches.filter(
    (binding) => binding.tenant.tenantId === request.tenant.tenantId,
  );
  if (tenantMatches.length === 0) return unresolved(request, 'TARGET_TENANT_MISMATCH');
  if (tenantMatches.length > 1) return unresolved(request, 'TARGET_AMBIGUOUS');

  const binding = tenantMatches[0];
  const stateReason = bindingStateReason(binding);
  if (stateReason !== undefined) return unresolved(request, stateReason);

  if (binding.freshUntil !== undefined) {
    const freshUntil = parseRfc3339Timestamp(binding.freshUntil);
    if (freshUntil === undefined) return unresolved(request, 'TARGET_TIME_INVALID');
    if (freshUntil <= evaluatedAt) return unresolved(request, 'TARGET_STALE');
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
