import type {
  CreateLifecycleRecordInput,
  LifecycleEntityRef,
  LifecycleRecord,
  LifecycleState,
  LifecycleTerminalState,
  LifecycleTransitionRequest,
  LifecycleTransitionResult,
} from './types.ts';

const ALLOWED_TRANSITIONS = {
  DRAFT: ['READY', 'CANCELLED', 'SUPERSEDED'],
  READY: ['ACTIVE', 'BLOCKED', 'CANCELLED', 'SUPERSEDED'],
  ACTIVE: ['BLOCKED', 'SUCCEEDED', 'FAILED', 'CANCELLED', 'SUPERSEDED'],
  BLOCKED: ['READY', 'ACTIVE', 'FAILED', 'CANCELLED', 'SUPERSEDED'],
  SUCCEEDED: [],
  FAILED: [],
  CANCELLED: [],
  SUPERSEDED: [],
} as const satisfies Record<LifecycleState, readonly LifecycleState[]>;

const TERMINAL_STATES = new Set<LifecycleState>(['SUCCEEDED', 'FAILED', 'CANCELLED', 'SUPERSEDED']);

function assertNonEmpty(value: string, name: string): void {
  if (value.trim().length === 0) throw new Error(`${name} must not be empty`);
}

function sameEntity(left: LifecycleEntityRef, right: LifecycleEntityRef): boolean {
  return left.kind === right.kind && left.id === right.id;
}

export function isTerminalLifecycleState(state: LifecycleState): state is LifecycleTerminalState {
  return TERMINAL_STATES.has(state);
}

export function createLifecycleRecord(input: CreateLifecycleRecordInput): LifecycleRecord {
  assertNonEmpty(input.entity.id, 'entity.id');
  assertNonEmpty(input.createdAt, 'createdAt');

  return {
    entity: input.entity,
    tenantId: input.tenantId,
    rootCorrelationId: input.rootCorrelationId,
    ...(input.parent === undefined ? {} : { parent: input.parent }),
    state: 'DRAFT',
    revision: 0,
    createdAt: input.createdAt,
    updatedAt: input.createdAt,
    evidence: [...(input.evidence ?? [])],
  };
}

export function transitionLifecycle(
  current: LifecycleRecord,
  request: LifecycleTransitionRequest,
): LifecycleTransitionResult {
  if (request.tenantId !== current.tenantId) {
    return { status: 'REJECTED', code: 'TENANT_MISMATCH', current };
  }

  if (request.expectedRevision !== current.revision) {
    return { status: 'REJECTED', code: 'REVISION_CONFLICT', current };
  }

  if (isTerminalLifecycleState(current.state)) {
    return { status: 'REJECTED', code: 'TERMINAL_STATE', current };
  }

  if (!ALLOWED_TRANSITIONS[current.state].includes(request.to as never)) {
    return { status: 'REJECTED', code: 'INVALID_TRANSITION', current };
  }

  if (request.to === 'SUPERSEDED' && request.supersededBy === undefined) {
    return { status: 'REJECTED', code: 'SUPERSESSION_TARGET_REQUIRED', current };
  }

  if (request.to !== 'SUPERSEDED' && request.supersededBy !== undefined) {
    return { status: 'REJECTED', code: 'UNEXPECTED_SUPERSESSION_TARGET', current };
  }

  if (
    request.to === 'SUPERSEDED' &&
    request.supersededBy !== undefined &&
    sameEntity(current.entity, request.supersededBy)
  ) {
    return { status: 'REJECTED', code: 'SELF_SUPERSESSION', current };
  }

  const nextRevision = current.revision + 1;
  const evidence =
    request.evidence === undefined ? current.evidence : [...current.evidence, request.evidence];
  const next: LifecycleRecord = {
    ...current,
    state: request.to,
    revision: nextRevision,
    updatedAt: request.at,
    evidence,
    ...(request.to === 'CANCELLED'
      ? {
          cancellation: {
            reason: request.reason,
            requestedAt: request.at,
            correlationId: request.correlationId,
          },
        }
      : {}),
    ...(request.to === 'SUPERSEDED' && request.supersededBy !== undefined
      ? {
          supersession: {
            successor: request.supersededBy,
            reason: request.reason,
            supersededAt: request.at,
            correlationId: request.correlationId,
          },
        }
      : {}),
  };

  return {
    status: 'APPLIED',
    record: next,
    event: {
      type: 'LIFECYCLE_TRANSITION',
      entity: current.entity,
      tenantId: current.tenantId,
      rootCorrelationId: current.rootCorrelationId,
      transitionCorrelationId: request.correlationId,
      from: current.state,
      to: request.to,
      previousRevision: current.revision,
      newRevision: nextRevision,
      at: request.at,
      reason: request.reason,
      ...(request.evidence === undefined ? {} : { evidence: request.evidence }),
    },
  };
}
