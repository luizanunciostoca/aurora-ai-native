import type { EventEnvelope, EventId, IdentityId, TenantId } from '@aurora/contracts';

import type {
  RevenueEntityKind,
  RevenueEntityRef,
  RevenueLifecycleRecord,
  RevenueLifecycleState,
} from '../lifecycle/types.js';
import type {
  RevenueCrmAppliedOperation,
  RevenueCrmCurrentnessReason,
  RevenueCrmEventProjectionInput,
  RevenueCrmProjection,
  RevenueCrmProjectionConfig,
  RevenueCrmProjectionResult,
  RevenueCrmQuery,
  RevenueCrmQueryItem,
  RevenueCrmQueryResult,
  RevenueCrmReadModel,
  RevenueCrmRebuildInput,
  RevenueCrmRebuildResult,
  RevenueCrmSnapshotInput,
} from './types.js';

const MAX_IDENTIFIER_LENGTH = 1_024;
const MAX_ENTITIES = 10_000;
const MAX_APPLIED_OPERATIONS = 50_000;
const MAX_QUERY_LIMIT = 100;
const REVENUE_LIFECYCLE_CHANGED = 'revenue.lifecycle.changed';

interface ParsedLifecycleEvent {
  readonly tenantId: TenantId;
  readonly eventId: EventId;
  readonly entity: RevenueEntityRef;
  readonly version: number;
  readonly fromState: RevenueLifecycleState;
  readonly toState: RevenueLifecycleState;
  readonly sourceSystem: string;
  readonly sourceRevision: string;
  readonly sourceReference?: string;
  readonly observedAt: string;
  readonly subjectIdentityId?: IdentityId;
  readonly fingerprint: string;
}

function isNonEmptyString(value: unknown, maxLength = MAX_IDENTIFIER_LENGTH): value is string {
  return typeof value === 'string' && value.trim().length > 0 && value.length <= maxLength;
}

function isTimestamp(value: unknown): value is string {
  return isNonEmptyString(value, 128) && Number.isFinite(Date.parse(value));
}

function isPositiveSafeInteger(value: unknown): value is number {
  return Number.isSafeInteger(value) && (value as number) >= 1;
}

function isNonNegativeSafeInteger(value: unknown): value is number {
  return Number.isSafeInteger(value) && (value as number) >= 0;
}

function isEntityKind(value: unknown): value is RevenueEntityKind {
  return value === 'LEAD' || value === 'CUSTOMER' || value === 'CONVERSATION';
}

function stateMatchesKind(kind: RevenueEntityKind, state: unknown): state is RevenueLifecycleState {
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

function isLifecycleState(state: unknown): state is RevenueLifecycleState {
  return (
    stateMatchesKind('LEAD', state) ||
    stateMatchesKind('CUSTOMER', state) ||
    stateMatchesKind('CONVERSATION', state)
  );
}

function entityKey(entity: RevenueEntityRef): string {
  return `${entity.kind}:${entity.entityId}`;
}

function sameEntity(left: RevenueEntityRef, right: RevenueEntityRef): boolean {
  return left.kind === right.kind && left.entityId === right.entityId;
}

function cloneEntity(entity: RevenueEntityRef): RevenueEntityRef {
  return { kind: entity.kind, entityId: entity.entityId };
}

function cloneReadModel(model: RevenueCrmReadModel): RevenueCrmReadModel {
  return {
    ...model,
    entity: cloneEntity(model.entity),
    ...(model.correlation === undefined
      ? {}
      : {
          correlation: {
            correlationId: model.correlation.correlationId,
            ...(model.correlation.causation === undefined
              ? {}
              : { causation: { causationId: model.correlation.causation.causationId } }),
          },
        }),
  };
}

function cloneProjection(projection: RevenueCrmProjection): RevenueCrmProjection {
  return {
    ...projection,
    models: projection.models.map(cloneReadModel),
    appliedOperations: projection.appliedOperations.map((operation) => ({
      ...operation,
      entity: cloneEntity(operation.entity),
    })),
    limits: { ...projection.limits },
  };
}

function limitsAreValid(
  value: Readonly<{ maxEntities: number; maxAppliedOperations: number }>,
): boolean {
  return (
    isPositiveSafeInteger(value?.maxEntities) &&
    value.maxEntities <= MAX_ENTITIES &&
    isPositiveSafeInteger(value?.maxAppliedOperations) &&
    value.maxAppliedOperations <= MAX_APPLIED_OPERATIONS
  );
}

function modelIsValid(model: RevenueCrmReadModel, tenantId: TenantId): boolean {
  return (
    model?.tenantId === tenantId &&
    isEntityKind(model?.entity?.kind) &&
    isNonEmptyString(model?.entity?.entityId) &&
    stateMatchesKind(model.entity.kind, model.lifecycleState) &&
    isPositiveSafeInteger(model.entityVersion) &&
    isNonEmptyString(model.sourceSystem) &&
    isNonEmptyString(model.sourceRevision) &&
    isTimestamp(model.observedAt) &&
    isTimestamp(model.projectedAt) &&
    Date.parse(model.observedAt) <= Date.parse(model.projectedAt) &&
    (model.subjectIdentityId === undefined || isNonEmptyString(model.subjectIdentityId)) &&
    (model.sourceReference === undefined || isNonEmptyString(model.sourceReference)) &&
    (model.lastEventId === undefined || isNonEmptyString(model.lastEventId)) &&
    (model.correlation === undefined || isNonEmptyString(model.correlation.correlationId)) &&
    model.authorizesExecution === false &&
    model.canGrantPermission === false
  );
}

function projectionIsValid(projection: RevenueCrmProjection): boolean {
  if (
    projection?.kind !== 'REVENUE_CRM_PROJECTION' ||
    projection.schemaVersion !== '1.0.0' ||
    !isNonEmptyString(projection.tenantId) ||
    !isNonNegativeSafeInteger(projection.projectionVersion) ||
    !Array.isArray(projection.models) ||
    !Array.isArray(projection.appliedOperations) ||
    !limitsAreValid(projection.limits) ||
    projection.models.length > projection.limits.maxEntities ||
    projection.appliedOperations.length > projection.limits.maxAppliedOperations ||
    projection.authorizesExecution !== false ||
    projection.canGrantPermission !== false
  ) {
    return false;
  }

  const modelKeys = new Set<string>();
  for (const model of projection.models) {
    if (!modelIsValid(model, projection.tenantId)) return false;
    const key = entityKey(model.entity);
    if (modelKeys.has(key)) return false;
    modelKeys.add(key);
  }

  const operationIds = new Set<string>();
  for (const operation of projection.appliedOperations) {
    if (
      !isNonEmptyString(operation?.operationId) ||
      !isNonEmptyString(operation?.fingerprint, 8_192) ||
      !isEntityKind(operation?.entity?.kind) ||
      !isNonEmptyString(operation?.entity?.entityId) ||
      !isPositiveSafeInteger(operation.entityVersion) ||
      operationIds.has(operation.operationId)
    ) {
      return false;
    }
    operationIds.add(operation.operationId);
  }
  return projection.lastProjectedAt === undefined || isTimestamp(projection.lastProjectedAt);
}

function recordIsValid(record: RevenueLifecycleRecord): boolean {
  return (
    isNonEmptyString(record?.tenantId) &&
    isEntityKind(record?.entity?.kind) &&
    isNonEmptyString(record?.entity?.entityId) &&
    stateMatchesKind(record.entity.kind, record.state) &&
    isPositiveSafeInteger(record.version) &&
    isTimestamp(record.updatedAt) &&
    isNonEmptyString(record.provenance?.sourceSystem) &&
    isTimestamp(record.provenance?.observedAt) &&
    record.authorizesExecution === false
  );
}

function snapshotFingerprint(record: RevenueLifecycleRecord, sourceRevision: string): string {
  return JSON.stringify([
    'SNAPSHOT',
    record.tenantId,
    record.entity.kind,
    record.entity.entityId,
    record.version,
    record.state,
    record.subjectIdentityId ?? null,
    record.updatedAt,
    record.provenance.sourceSystem,
    record.provenance.sourceReference ?? null,
    record.provenance.observedAt,
    sourceRevision,
  ]);
}

function findOperation(
  projection: RevenueCrmProjection,
  operationId: string,
): RevenueCrmAppliedOperation | undefined {
  return projection.appliedOperations.find((operation) => operation.operationId === operationId);
}

function withAppliedModel(
  projection: RevenueCrmProjection,
  model: RevenueCrmReadModel,
  operation: RevenueCrmAppliedOperation,
): RevenueCrmProjectionResult {
  const existingIndex = projection.models.findIndex((item) =>
    sameEntity(item.entity, model.entity),
  );
  if (existingIndex < 0 && projection.models.length >= projection.limits.maxEntities) {
    return { ok: false, error: 'PROJECTION_CAPACITY_EXCEEDED' };
  }
  if (projection.appliedOperations.length >= projection.limits.maxAppliedOperations) {
    return { ok: false, error: 'PROJECTION_CAPACITY_EXCEEDED' };
  }

  const models = projection.models.map(cloneReadModel);
  if (existingIndex < 0) models.push(model);
  else models[existingIndex] = model;
  models.sort((left, right) => entityKey(left.entity).localeCompare(entityKey(right.entity)));

  return {
    ok: true,
    status: 'APPLIED',
    projection: {
      ...projection,
      projectionVersion: projection.projectionVersion + 1,
      models,
      appliedOperations: [...projection.appliedOperations, operation],
      lastProjectedAt: model.projectedAt,
      authorizesExecution: false,
      canGrantPermission: false,
    },
  };
}

function payloadObject(event: EventEnvelope): Readonly<Record<string, unknown>> | undefined {
  const payload: unknown = event.payload;
  if (payload === null || typeof payload !== 'object' || Array.isArray(payload)) return undefined;
  return payload as Readonly<Record<string, unknown>>;
}

function parseLifecycleEvent(event: EventEnvelope): ParsedLifecycleEvent | undefined {
  const payload = payloadObject(event);
  if (
    event?.kind !== 'EVENT' ||
    event.eventType !== REVENUE_LIFECYCLE_CHANGED ||
    event.dataClassification !== 'INTERNAL' ||
    !isNonEmptyString(event.eventId) ||
    !isNonEmptyString(event.tenant?.tenantId) ||
    !isTimestamp(event.occurredAt) ||
    !isNonEmptyString(event.correlation?.correlationId) ||
    payload === undefined ||
    !isEntityKind(payload.entityKind) ||
    !isNonEmptyString(payload.entityId) ||
    !isPositiveSafeInteger(payload.version) ||
    !stateMatchesKind(payload.entityKind, payload.fromState) ||
    !stateMatchesKind(payload.entityKind, payload.toState) ||
    !isNonEmptyString(payload.idempotencyKey) ||
    !isNonEmptyString(payload.sourceSystem) ||
    !isTimestamp(payload.observedAt) ||
    payload.authorizesExecution !== false ||
    (payload.canGrantPermission !== undefined && payload.canGrantPermission !== false) ||
    (payload.sourceReference !== undefined && !isNonEmptyString(payload.sourceReference)) ||
    (payload.subjectIdentityId !== undefined && !isNonEmptyString(payload.subjectIdentityId))
  ) {
    return undefined;
  }

  const entity = { kind: payload.entityKind, entityId: payload.entityId } as RevenueEntityRef;
  if (event.subject !== `revenue:${payload.entityKind.toLowerCase()}:${payload.entityId}`) {
    return undefined;
  }
  const sourceRevision = `event:${event.eventId}`;
  const fingerprint = JSON.stringify([
    event.tenant.tenantId,
    event.eventType,
    event.eventId,
    payload.entityKind,
    payload.entityId,
    payload.version,
    payload.fromState,
    payload.toState,
    payload.idempotencyKey,
    payload.sourceSystem,
    payload.sourceReference ?? null,
    payload.observedAt,
    payload.subjectIdentityId ?? null,
  ]);

  return {
    tenantId: event.tenant.tenantId,
    eventId: event.eventId,
    entity,
    version: payload.version,
    fromState: payload.fromState,
    toState: payload.toState,
    sourceSystem: payload.sourceSystem,
    sourceRevision,
    ...(payload.sourceReference === undefined ? {} : { sourceReference: payload.sourceReference }),
    observedAt: payload.observedAt,
    ...(payload.subjectIdentityId === undefined
      ? {}
      : { subjectIdentityId: payload.subjectIdentityId as IdentityId }),
    fingerprint,
  };
}

export function createRevenueCrmProjection(
  config: RevenueCrmProjectionConfig,
): RevenueCrmProjection | undefined {
  if (!isNonEmptyString(config?.tenantId) || !limitsAreValid(config)) return undefined;
  return {
    kind: 'REVENUE_CRM_PROJECTION',
    schemaVersion: '1.0.0',
    tenantId: config.tenantId,
    projectionVersion: 0,
    models: [],
    appliedOperations: [],
    limits: { maxEntities: config.maxEntities, maxAppliedOperations: config.maxAppliedOperations },
    authorizesExecution: false,
    canGrantPermission: false,
  };
}

export function projectRevenueLifecycleSnapshot(
  projection: RevenueCrmProjection,
  record: RevenueLifecycleRecord,
  input: RevenueCrmSnapshotInput,
): RevenueCrmProjectionResult {
  if (!projectionIsValid(projection)) return { ok: false, error: 'PROJECTION_MALFORMED' };
  if (!recordIsValid(record)) return { ok: false, error: 'RECORD_MALFORMED' };
  if (
    !isNonNegativeSafeInteger(input?.expectedProjectionVersion) ||
    !isNonEmptyString(input?.operationId) ||
    !isTimestamp(input?.projectedAt) ||
    !isNonEmptyString(input?.sourceRevision)
  ) {
    return { ok: false, error: 'REQUEST_MALFORMED' };
  }
  if (projection.tenantId !== record.tenantId) return { ok: false, error: 'TENANT_MISMATCH' };

  const fingerprint = snapshotFingerprint(record, input.sourceRevision);
  const previousOperation = findOperation(projection, input.operationId);
  if (previousOperation !== undefined) {
    return previousOperation.fingerprint === fingerprint
      ? { ok: true, status: 'DUPLICATE', projection: cloneProjection(projection) }
      : { ok: false, error: 'OPERATION_ID_CONFLICT' };
  }
  if (input.expectedProjectionVersion !== projection.projectionVersion) {
    return { ok: false, error: 'PROJECTION_VERSION_CONFLICT' };
  }
  if (
    projection.lastProjectedAt !== undefined &&
    Date.parse(input.projectedAt) < Date.parse(projection.lastProjectedAt)
  ) {
    return { ok: false, error: 'OUT_OF_ORDER_PROJECTION' };
  }
  if (
    Date.parse(input.projectedAt) < Date.parse(record.updatedAt) ||
    Date.parse(input.projectedAt) < Date.parse(record.provenance.observedAt)
  ) {
    return { ok: false, error: 'OUT_OF_ORDER_PROJECTION' };
  }
  const existing = projection.models.find((model) => sameEntity(model.entity, record.entity));
  if (existing !== undefined && record.version < existing.entityVersion) {
    return { ok: false, error: 'ENTITY_VERSION_CONFLICT' };
  }
  if (
    existing !== undefined &&
    record.version === existing.entityVersion &&
    record.state !== existing.lifecycleState
  ) {
    return { ok: false, error: 'ENTITY_VERSION_CONFLICT' };
  }

  const model: RevenueCrmReadModel = {
    tenantId: record.tenantId,
    entity: cloneEntity(record.entity),
    lifecycleState: record.state,
    entityVersion: record.version,
    ...(record.subjectIdentityId === undefined
      ? {}
      : { subjectIdentityId: record.subjectIdentityId }),
    sourceSystem: record.provenance.sourceSystem,
    sourceRevision: input.sourceRevision,
    ...(record.provenance.sourceReference === undefined
      ? {}
      : { sourceReference: record.provenance.sourceReference }),
    observedAt: record.provenance.observedAt,
    projectedAt: input.projectedAt,
    ...(record.lastTransition?.correlation === undefined
      ? {}
      : { correlation: record.lastTransition.correlation }),
    historyBasis: 'AUTHORITATIVE_SNAPSHOT',
    authorizesExecution: false,
    canGrantPermission: false,
  };

  return withAppliedModel(projection, model, {
    operationId: input.operationId,
    fingerprint,
    entity: cloneEntity(record.entity),
    entityVersion: record.version,
  });
}

export function projectRevenueLifecycleEvent(
  projection: RevenueCrmProjection,
  event: EventEnvelope,
  input: RevenueCrmEventProjectionInput,
): RevenueCrmProjectionResult {
  if (!projectionIsValid(projection)) return { ok: false, error: 'PROJECTION_MALFORMED' };
  if (
    !isNonNegativeSafeInteger(input?.expectedProjectionVersion) ||
    !isTimestamp(input?.projectedAt)
  ) {
    return { ok: false, error: 'REQUEST_MALFORMED' };
  }
  const parsed = parseLifecycleEvent(event);
  if (parsed === undefined) return { ok: false, error: 'EVENT_MALFORMED' };
  if (projection.tenantId !== parsed.tenantId) return { ok: false, error: 'TENANT_MISMATCH' };

  const operationId = `event:${parsed.eventId}`;
  const previousOperation = findOperation(projection, operationId);
  if (previousOperation !== undefined) {
    return previousOperation.fingerprint === parsed.fingerprint
      ? { ok: true, status: 'DUPLICATE', projection: cloneProjection(projection) }
      : { ok: false, error: 'OPERATION_ID_CONFLICT' };
  }
  if (input.expectedProjectionVersion !== projection.projectionVersion) {
    return { ok: false, error: 'PROJECTION_VERSION_CONFLICT' };
  }
  if (
    projection.lastProjectedAt !== undefined &&
    Date.parse(input.projectedAt) < Date.parse(projection.lastProjectedAt)
  ) {
    return { ok: false, error: 'OUT_OF_ORDER_PROJECTION' };
  }
  if (
    Date.parse(input.projectedAt) < Date.parse(event.occurredAt) ||
    Date.parse(input.projectedAt) < Date.parse(parsed.observedAt)
  ) {
    return { ok: false, error: 'OUT_OF_ORDER_PROJECTION' };
  }

  const existing = projection.models.find((model) => sameEntity(model.entity, parsed.entity));
  if (existing !== undefined) {
    if (parsed.version <= existing.entityVersion) return { ok: false, error: 'OUT_OF_ORDER_EVENT' };
    if (parsed.version !== existing.entityVersion + 1) {
      return { ok: false, error: 'ENTITY_VERSION_GAP' };
    }
    if (parsed.fromState !== existing.lifecycleState) {
      return { ok: false, error: 'STATE_CONTINUITY_CONFLICT' };
    }
    if (
      existing.subjectIdentityId !== undefined &&
      parsed.subjectIdentityId !== undefined &&
      existing.subjectIdentityId !== parsed.subjectIdentityId
    ) {
      return { ok: false, error: 'IDENTITY_CONTINUITY_CONFLICT' };
    }
  }

  const model: RevenueCrmReadModel = {
    tenantId: parsed.tenantId,
    entity: cloneEntity(parsed.entity),
    lifecycleState: parsed.toState,
    entityVersion: parsed.version,
    ...(parsed.subjectIdentityId === undefined
      ? existing?.subjectIdentityId === undefined
        ? {}
        : { subjectIdentityId: existing.subjectIdentityId }
      : { subjectIdentityId: parsed.subjectIdentityId }),
    sourceSystem: parsed.sourceSystem,
    sourceRevision: parsed.sourceRevision,
    ...(parsed.sourceReference === undefined ? {} : { sourceReference: parsed.sourceReference }),
    observedAt: parsed.observedAt,
    projectedAt: input.projectedAt,
    lastEventId: parsed.eventId,
    correlation: event.correlation,
    historyBasis: existing?.historyBasis ?? 'TRANSITION_EVENTS_ONLY',
    authorizesExecution: false,
    canGrantPermission: false,
  };

  return withAppliedModel(projection, model, {
    operationId,
    fingerprint: parsed.fingerprint,
    entity: cloneEntity(parsed.entity),
    entityVersion: parsed.version,
  });
}

export function rebuildRevenueCrmProjection(
  input: RevenueCrmRebuildInput,
): RevenueCrmRebuildResult {
  if (
    !isNonEmptyString(input?.tenantId) ||
    !Array.isArray(input?.events) ||
    !limitsAreValid(input?.limits) ||
    !isTimestamp(input?.projectedAt)
  ) {
    return { ok: false, error: 'REQUEST_MALFORMED' };
  }
  const parsedEvents = input.events.map((event) => ({ event, parsed: parseLifecycleEvent(event) }));
  if (parsedEvents.some((item) => item.parsed === undefined)) {
    return { ok: false, error: 'EVENT_MALFORMED' };
  }
  if (parsedEvents.some((item) => item.parsed?.tenantId !== input.tenantId)) {
    return { ok: false, error: 'TENANT_MISMATCH' };
  }

  parsedEvents.sort((left, right) => {
    const leftParsed = left.parsed as ParsedLifecycleEvent;
    const rightParsed = right.parsed as ParsedLifecycleEvent;
    return (
      entityKey(leftParsed.entity).localeCompare(entityKey(rightParsed.entity)) ||
      leftParsed.version - rightParsed.version ||
      String(leftParsed.eventId).localeCompare(String(rightParsed.eventId))
    );
  });

  let projection = createRevenueCrmProjection({ tenantId: input.tenantId, ...input.limits });
  if (projection === undefined) return { ok: false, error: 'REQUEST_MALFORMED' };
  for (const item of parsedEvents) {
    const result = projectRevenueLifecycleEvent(projection, item.event, {
      expectedProjectionVersion: projection.projectionVersion,
      projectedAt: input.projectedAt,
    });
    if (!result.ok) return result;
    projection = result.projection;
  }
  return { ok: true, projection };
}

function currentness(model: RevenueCrmReadModel, query: RevenueCrmQuery): RevenueCrmQueryItem {
  const reasons: RevenueCrmCurrentnessReason[] = [];
  if (
    query.requiredEntityVersion !== undefined &&
    model.entityVersion < query.requiredEntityVersion
  ) {
    reasons.push('ENTITY_VERSION_BEHIND');
  }
  const evaluatedAt = Date.parse(query.evaluatedAt);
  const observedAt = Date.parse(model.observedAt);
  if (!Number.isFinite(observedAt) || observedAt > evaluatedAt) reasons.push('MODEL_TIME_UNKNOWN');
  else if (evaluatedAt - observedAt > query.maxAgeMs) reasons.push('MODEL_TOO_OLD');
  return {
    model: cloneReadModel(model),
    current: reasons.length === 0,
    currentnessReasons: reasons,
  };
}

export function queryRevenueCrmProjection(
  projection: RevenueCrmProjection,
  query: RevenueCrmQuery,
): RevenueCrmQueryResult {
  if (!projectionIsValid(projection)) return { ok: false, error: 'PROJECTION_MALFORMED' };
  if (
    !isNonEmptyString(query?.tenantId) ||
    (query.entityKind !== undefined && !isEntityKind(query.entityKind)) ||
    (query.entityId !== undefined && !isNonEmptyString(query.entityId)) ||
    (query.subjectIdentityId !== undefined && !isNonEmptyString(query.subjectIdentityId)) ||
    (query.requiredEntityVersion !== undefined &&
      !isPositiveSafeInteger(query.requiredEntityVersion)) ||
    !isTimestamp(query.evaluatedAt) ||
    !isNonNegativeSafeInteger(query.maxAgeMs) ||
    !isPositiveSafeInteger(query.limit) ||
    query.limit > MAX_QUERY_LIMIT ||
    (query.lifecycleStates !== undefined &&
      (!Array.isArray(query.lifecycleStates) ||
        query.lifecycleStates.length === 0 ||
        query.lifecycleStates.some(
          (state) =>
            !isLifecycleState(state) ||
            (query.entityKind !== undefined && !stateMatchesKind(query.entityKind, state)),
        )))
  ) {
    return { ok: false, error: 'REQUEST_MALFORMED' };
  }
  if (projection.tenantId !== query.tenantId) return { ok: false, error: 'TENANT_MISMATCH' };

  const filtered = projection.models.filter((model) => {
    if (query.entityKind !== undefined && model.entity.kind !== query.entityKind) return false;
    if (query.entityId !== undefined && model.entity.entityId !== query.entityId) return false;
    if (
      query.subjectIdentityId !== undefined &&
      model.subjectIdentityId !== query.subjectIdentityId
    ) {
      return false;
    }
    return (
      query.lifecycleStates === undefined || query.lifecycleStates.includes(model.lifecycleState)
    );
  });
  const items = filtered.slice(0, query.limit).map((model) => currentness(model, query));
  return {
    ok: true,
    page: {
      tenantId: projection.tenantId,
      projectionVersion: projection.projectionVersion,
      items,
      truncated: filtered.length > items.length,
      evaluatedAt: query.evaluatedAt,
      authorizesExecution: false,
      canGrantPermission: false,
    },
  };
}
