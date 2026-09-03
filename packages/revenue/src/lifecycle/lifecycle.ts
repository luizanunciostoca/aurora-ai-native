import { EVENT_ENVELOPE_KIND, type EventType } from '@aurora/contracts';

import type {
  ApplyRevenueLifecycleTransitionInput,
  ApplyRevenueLifecycleTransitionResult,
  CreateRevenueLifecycleInput,
  CreateRevenueLifecycleResult,
  RevenueEntityKind,
  RevenueEntityRef,
  RevenueLifecycleChange,
  RevenueLifecycleEvent,
  RevenueLifecycleEventInput,
  RevenueLifecycleMergeTarget,
  RevenueLifecycleRecord,
  RevenueLifecycleState,
  RevenueProvenance,
} from './types.js';

const REVENUE_LIFECYCLE_CHANGED = 'revenue.lifecycle.changed' as EventType;
const MAX_IDENTIFIER_LENGTH = 512;
const MAX_REASON_LENGTH = 2_048;

function isNonEmptyString(value: unknown, maxLength = MAX_IDENTIFIER_LENGTH): value is string {
  return typeof value === 'string' && value.trim().length > 0 && value.length <= maxLength;
}

function isTimestamp(value: unknown): value is string {
  return isNonEmptyString(value, 128) && Number.isFinite(Date.parse(value));
}

function isPositiveSafeInteger(value: unknown): value is number {
  return Number.isSafeInteger(value) && (value as number) >= 1;
}

function isEntityKind(value: unknown): value is RevenueEntityKind {
  return value === 'LEAD' || value === 'CUSTOMER' || value === 'CONVERSATION';
}

function isEntityRef(value: RevenueEntityRef): boolean {
  return isEntityKind(value?.kind) && isNonEmptyString(value?.entityId);
}

function isProvenance(value: RevenueProvenance): boolean {
  return (
    isNonEmptyString(value?.sourceSystem) &&
    isTimestamp(value?.observedAt) &&
    (value.sourceReference === undefined || isNonEmptyString(value.sourceReference))
  );
}

function sameEntity(left: RevenueEntityRef, right: RevenueEntityRef): boolean {
  return left.kind === right.kind && left.entityId === right.entityId;
}

function sameMergeTarget(
  left: RevenueLifecycleMergeTarget | undefined,
  right: RevenueLifecycleMergeTarget | undefined,
): boolean {
  if (left === undefined || right === undefined) return left === right;
  return left.tenantId === right.tenantId && sameEntity(left.entity, right.entity);
}

function cloneEntity(entity: RevenueEntityRef): RevenueEntityRef {
  return { kind: entity.kind, entityId: entity.entityId };
}

function cloneProvenance(provenance: RevenueProvenance): RevenueProvenance {
  return {
    sourceSystem: provenance.sourceSystem,
    ...(provenance.sourceReference === undefined
      ? {}
      : { sourceReference: provenance.sourceReference }),
    observedAt: provenance.observedAt,
  };
}

function cloneMergeTarget(target: RevenueLifecycleMergeTarget): RevenueLifecycleMergeTarget {
  return {
    tenantId: target.tenantId,
    entity: cloneEntity(target.entity),
  };
}

function validStateForKind(kind: RevenueEntityKind, state: RevenueLifecycleState): boolean {
  if (kind === 'LEAD') {
    return (
      state === 'NEW' ||
      state === 'ENGAGED' ||
      state === 'QUALIFIED' ||
      state === 'CONVERTED' ||
      state === 'CLOSED' ||
      state === 'MERGED'
    );
  }
  if (kind === 'CUSTOMER') {
    return state === 'ACTIVE' || state === 'INACTIVE' || state === 'CLOSED' || state === 'MERGED';
  }
  return state === 'OPEN' || state === 'PENDING' || state === 'CLOSED' || state === 'MERGED';
}

function initialState(kind: RevenueEntityKind): RevenueLifecycleState {
  if (kind === 'LEAD') return 'NEW';
  if (kind === 'CUSTOMER') return 'ACTIVE';
  return 'OPEN';
}

function allowedTargets(
  kind: RevenueEntityKind,
  state: RevenueLifecycleState,
): readonly RevenueLifecycleState[] {
  if (kind === 'LEAD') {
    if (state === 'NEW') return ['ENGAGED', 'QUALIFIED', 'CLOSED', 'MERGED'];
    if (state === 'ENGAGED') return ['QUALIFIED', 'CLOSED', 'MERGED'];
    if (state === 'QUALIFIED') return ['CONVERTED', 'CLOSED', 'MERGED'];
    if (state === 'CONVERTED') return ['CLOSED', 'MERGED'];
    if (state === 'CLOSED') return ['ENGAGED', 'MERGED'];
    return [];
  }
  if (kind === 'CUSTOMER') {
    if (state === 'ACTIVE') return ['INACTIVE', 'CLOSED', 'MERGED'];
    if (state === 'INACTIVE') return ['ACTIVE', 'CLOSED', 'MERGED'];
    if (state === 'CLOSED') return ['ACTIVE', 'MERGED'];
    return [];
  }
  if (state === 'OPEN') return ['PENDING', 'CLOSED', 'MERGED'];
  if (state === 'PENDING') return ['OPEN', 'CLOSED', 'MERGED'];
  if (state === 'CLOSED') return ['OPEN', 'MERGED'];
  return [];
}

function isRecordValid(record: RevenueLifecycleRecord): boolean {
  return (
    isNonEmptyString(record?.tenantId) &&
    isEntityRef(record?.entity) &&
    validStateForKind(record.entity.kind, record.state) &&
    isPositiveSafeInteger(record.version) &&
    isTimestamp(record.createdAt) &&
    isTimestamp(record.updatedAt) &&
    Date.parse(record.createdAt) <= Date.parse(record.updatedAt) &&
    isProvenance(record.provenance) &&
    record.authorizesExecution === false
  );
}

function validTransitionInput(input: ApplyRevenueLifecycleTransitionInput): boolean {
  return (
    isNonEmptyString(input?.tenantId) &&
    isPositiveSafeInteger(input?.expectedVersion) &&
    isNonEmptyString(input?.idempotencyKey, 1_024) &&
    isTimestamp(input?.occurredAt) &&
    isProvenance(input?.provenance) &&
    isNonEmptyString(input?.correlation?.correlationId) &&
    (input.reason === undefined || isNonEmptyString(input.reason, MAX_REASON_LENGTH))
  );
}

function mergeTargetIsValid(
  record: RevenueLifecycleRecord,
  target: RevenueLifecycleMergeTarget | undefined,
): boolean {
  return (
    target !== undefined &&
    target.tenantId === record.tenantId &&
    isEntityRef(target.entity) &&
    target.entity.kind === record.entity.kind &&
    !sameEntity(target.entity, record.entity)
  );
}

export function createRevenueLifecycleRecord(
  input: CreateRevenueLifecycleInput,
): CreateRevenueLifecycleResult {
  if (
    !isNonEmptyString(input?.tenantId) ||
    !isEntityRef(input?.entity) ||
    !isTimestamp(input?.occurredAt) ||
    !isProvenance(input?.provenance) ||
    (input.subjectIdentityId !== undefined && !isNonEmptyString(input.subjectIdentityId))
  ) {
    return { ok: false, error: 'REQUEST_MALFORMED' };
  }

  return {
    ok: true,
    record: {
      tenantId: input.tenantId,
      entity: cloneEntity(input.entity),
      ...(input.subjectIdentityId === undefined
        ? {}
        : { subjectIdentityId: input.subjectIdentityId }),
      state: initialState(input.entity.kind),
      version: 1,
      provenance: cloneProvenance(input.provenance),
      createdAt: input.occurredAt,
      updatedAt: input.occurredAt,
      authorizesExecution: false,
    },
  };
}

export function applyRevenueLifecycleTransition(
  record: RevenueLifecycleRecord,
  input: ApplyRevenueLifecycleTransitionInput,
): ApplyRevenueLifecycleTransitionResult {
  if (!isRecordValid(record)) return { ok: false, error: 'RECORD_MALFORMED' };
  if (!validTransitionInput(input)) return { ok: false, error: 'REQUEST_MALFORMED' };
  if (input.tenantId !== record.tenantId) return { ok: false, error: 'TENANT_MISMATCH' };
  if (!validStateForKind(record.entity.kind, input.targetState)) {
    return { ok: false, error: 'INVALID_TRANSITION' };
  }

  const previous = record.lastTransition;
  if (previous?.idempotencyKey === input.idempotencyKey) {
    if (
      previous.toState === input.targetState &&
      sameMergeTarget(previous.mergeTarget, input.mergeTarget)
    ) {
      return { ok: true, status: 'DUPLICATE', record };
    }
    return { ok: false, error: 'IDEMPOTENCY_CONFLICT' };
  }

  if (input.expectedVersion !== record.version) return { ok: false, error: 'VERSION_CONFLICT' };
  if (Date.parse(input.occurredAt) < Date.parse(record.updatedAt)) {
    return { ok: false, error: 'OUT_OF_ORDER_TRANSITION' };
  }
  if (record.state === 'MERGED') return { ok: false, error: 'TERMINAL_RECORD' };
  if (!allowedTargets(record.entity.kind, record.state).includes(input.targetState)) {
    return { ok: false, error: 'INVALID_TRANSITION' };
  }

  if (input.targetState === 'MERGED') {
    if (!mergeTargetIsValid(record, input.mergeTarget)) {
      return { ok: false, error: 'MERGE_TARGET_INVALID' };
    }
  } else if (input.mergeTarget !== undefined) {
    return { ok: false, error: 'MERGE_TARGET_INVALID' };
  }

  const mergeTarget =
    input.mergeTarget === undefined ? undefined : cloneMergeTarget(input.mergeTarget);
  const transition = {
    idempotencyKey: input.idempotencyKey,
    fromState: record.state,
    toState: input.targetState,
    occurredAt: input.occurredAt,
    correlation: {
      correlationId: input.correlation.correlationId,
      ...(input.correlation.causation === undefined
        ? {}
        : { causation: { causationId: input.correlation.causation.causationId } }),
    },
    ...(input.reason === undefined ? {} : { reason: input.reason }),
    ...(mergeTarget === undefined ? {} : { mergeTarget }),
  } as const;

  const nextRecord: RevenueLifecycleRecord = {
    ...record,
    entity: cloneEntity(record.entity),
    provenance: cloneProvenance(input.provenance),
    state: input.targetState,
    version: record.version + 1,
    updatedAt: input.occurredAt,
    ...(mergeTarget === undefined
      ? record.lineage === undefined
        ? {}
        : { lineage: record.lineage }
      : { lineage: { mergedInto: mergeTarget } }),
    lastTransition: transition,
    authorizesExecution: false,
  };

  const change: RevenueLifecycleChange = {
    tenantId: nextRecord.tenantId,
    entity: cloneEntity(nextRecord.entity),
    ...(nextRecord.subjectIdentityId === undefined
      ? {}
      : { subjectIdentityId: nextRecord.subjectIdentityId }),
    version: nextRecord.version,
    fromState: transition.fromState,
    toState: transition.toState,
    idempotencyKey: transition.idempotencyKey,
    occurredAt: transition.occurredAt,
    correlation: transition.correlation,
    provenance: cloneProvenance(nextRecord.provenance),
    ...(transition.reason === undefined ? {} : { reason: transition.reason }),
    ...(mergeTarget === undefined ? {} : { mergeTarget }),
    authorizesExecution: false,
  };

  return { ok: true, status: 'APPLIED', record: nextRecord, change };
}

export function buildRevenueLifecycleEvent(
  change: RevenueLifecycleChange,
  input: RevenueLifecycleEventInput,
): RevenueLifecycleEvent {
  const payload = {
    entityKind: change.entity.kind,
    entityId: change.entity.entityId,
    version: change.version,
    fromState: change.fromState,
    toState: change.toState,
    idempotencyKey: change.idempotencyKey,
    sourceSystem: change.provenance.sourceSystem,
    observedAt: change.provenance.observedAt,
    ...(change.provenance.sourceReference === undefined
      ? {}
      : { sourceReference: change.provenance.sourceReference }),
    ...(change.subjectIdentityId === undefined
      ? {}
      : { subjectIdentityId: change.subjectIdentityId }),
    ...(change.reason === undefined ? {} : { reason: change.reason }),
    ...(change.mergeTarget === undefined
      ? {}
      : {
          mergeTargetKind: change.mergeTarget.entity.kind,
          mergeTargetEntityId: change.mergeTarget.entity.entityId,
        }),
    authorizesExecution: false,
  };

  return {
    kind: EVENT_ENVELOPE_KIND,
    schemaVersion: input.schemaVersion,
    eventId: input.eventId,
    eventType: REVENUE_LIFECYCLE_CHANGED,
    occurredAt: change.occurredAt,
    producer: input.producer,
    source: input.source,
    correlation: change.correlation,
    tenant: { tenantId: change.tenantId },
    subject: `revenue:${change.entity.kind.toLowerCase()}:${change.entity.entityId}`,
    dataClassification: 'INTERNAL',
    payload,
  };
}
