// @ts-expect-error -- revenue harness has no @types/node; Node 22 provides this built-in.
import assert from 'node:assert/strict';
// @ts-expect-error -- revenue harness has no @types/node; Node 22 provides this built-in.
import test from 'node:test';

import type {
  ContractVersion,
  CorrelationId,
  EventEnvelope,
  EventId,
  IdentityId,
  TenantId,
} from '@aurora/contracts';

import {
  createRevenueCrmProjection,
  projectRevenueLifecycleEvent,
  projectRevenueLifecycleSnapshot,
  queryRevenueCrmProjection,
  rebuildRevenueCrmProjection,
} from '../src/crm/index.js';
import {
  applyRevenueLifecycleTransition,
  buildRevenueLifecycleEvent,
  createRevenueLifecycleRecord,
  type RevenueLifecycleRecord,
} from '../src/lifecycle/index.js';

const TENANT_A = 'ten_01JW10CTENANTA00000000000' as TenantId;
const TENANT_B = 'ten_01JW10CTENANTB00000000000' as TenantId;
const SUBJECT = 'idn_01JW10CSUBJECT00000000000' as IdentityId;
const PRODUCER = 'idn_01JW10CSERVICE00000000000' as IdentityId;
const CORRELATION = 'cor_01JW10CCORRELATION0000000' as CorrelationId;
const VERSION = '1.0.0' as ContractVersion;
const LIMITS = { maxEntities: 8, maxAppliedOperations: 32 } as const;

function leadRecord(entityId = 'lead-crm-001', tenantId = TENANT_A): RevenueLifecycleRecord {
  const result = createRevenueLifecycleRecord({
    tenantId,
    entity: { kind: 'LEAD', entityId },
    subjectIdentityId: SUBJECT,
    occurredAt: '2026-09-03T07:00:00Z',
    provenance: {
      sourceSystem: 'crm-intake',
      sourceReference: `intake:${entityId}`,
      observedAt: '2026-09-03T07:00:00Z',
    },
  });
  assert.equal(result.ok, true);
  if (!result.ok) throw new Error('fixture creation failed');
  return result.record;
}

function transition(
  record: RevenueLifecycleRecord,
  targetState: 'ENGAGED' | 'QUALIFIED' | 'CLOSED',
  minute: number,
): { record: RevenueLifecycleRecord; event: EventEnvelope } {
  const occurredAt = `2026-09-03T07:${String(minute).padStart(2, '0')}:00Z`;
  const result = applyRevenueLifecycleTransition(record, {
    tenantId: record.tenantId,
    expectedVersion: record.version,
    targetState,
    idempotencyKey: `w10c:${record.entity.entityId}:${targetState.toLowerCase()}`,
    occurredAt,
    correlation: { correlationId: CORRELATION },
    provenance: {
      sourceSystem: 'crm-lifecycle',
      sourceReference: `change:${record.entity.entityId}:${targetState.toLowerCase()}`,
      observedAt: occurredAt,
    },
  });
  assert.equal(result.ok, true);
  if (!result.ok || result.status !== 'APPLIED') throw new Error('fixture transition failed');
  const event = buildRevenueLifecycleEvent(result.change, {
    eventId: `evt_01JW10C${String(minute).padStart(2, '0')}000000000000000` as EventId,
    schemaVersion: VERSION,
    producer: { kind: 'SERVICE', identityId: PRODUCER },
    source: { service: 'revenue', component: 'lifecycle' },
  });
  return { record: result.record, event };
}

function emptyProjection(
  tenantId = TENANT_A,
): NonNullable<ReturnType<typeof createRevenueCrmProjection>> {
  const projection = createRevenueCrmProjection({ tenantId, ...LIMITS });
  if (projection === undefined) throw new Error('projection fixture creation failed');
  return projection;
}

test('W10-C snapshots authoritative lifecycle state and exposes bounded tenant-scoped queries', () => {
  const result = projectRevenueLifecycleSnapshot(emptyProjection(), leadRecord(), {
    expectedProjectionVersion: 0,
    operationId: 'snapshot:lead-crm-001:v1',
    projectedAt: '2026-09-03T07:00:01Z',
    sourceRevision: 'crm-snapshot:1',
  });
  assert.equal(result.ok, true);
  if (!result.ok) return;

  const query = queryRevenueCrmProjection(result.projection, {
    tenantId: TENANT_A,
    entityKind: 'LEAD',
    lifecycleStates: ['NEW'],
    subjectIdentityId: SUBJECT,
    requiredEntityVersion: 1,
    evaluatedAt: '2026-09-03T07:01:00Z',
    maxAgeMs: 120_000,
    limit: 10,
  });
  assert.equal(query.ok, true);
  if (!query.ok) return;
  assert.equal(query.page.items.length, 1);
  assert.equal(query.page.items[0]?.current, true);
  assert.equal(query.page.items[0]?.model.historyBasis, 'AUTHORITATIVE_SNAPSHOT');
  assert.equal(query.page.items[0]?.model.authorizesExecution, false);
  assert.equal(query.page.canGrantPermission, false);
});

test('W10-C snapshot writes are idempotent and operation-id conflicts fail closed', () => {
  const record = leadRecord();
  const first = projectRevenueLifecycleSnapshot(emptyProjection(), record, {
    expectedProjectionVersion: 0,
    operationId: 'snapshot:stable-key',
    projectedAt: '2026-09-03T07:00:01Z',
    sourceRevision: 'crm-snapshot:1',
  });
  assert.equal(first.ok, true);
  if (!first.ok) return;

  const duplicate = projectRevenueLifecycleSnapshot(first.projection, record, {
    expectedProjectionVersion: 0,
    operationId: 'snapshot:stable-key',
    projectedAt: '2026-09-03T07:00:02Z',
    sourceRevision: 'crm-snapshot:1',
  });
  assert.equal(duplicate.ok, true);
  if (duplicate.ok) {
    assert.equal(duplicate.status, 'DUPLICATE');
    assert.equal(duplicate.projection.projectionVersion, 1);
  }

  const changed = transition(record, 'ENGAGED', 2).record;
  const conflict = projectRevenueLifecycleSnapshot(first.projection, changed, {
    expectedProjectionVersion: 1,
    operationId: 'snapshot:stable-key',
    projectedAt: '2026-09-03T07:02:01Z',
    sourceRevision: 'crm-snapshot:2',
  });
  assert.deepEqual(conflict, { ok: false, error: 'OPERATION_ID_CONFLICT' });
});

test('W10-C enforces optimistic projection versions and rejects stale entity snapshots', () => {
  const record = leadRecord();
  const first = projectRevenueLifecycleSnapshot(emptyProjection(), record, {
    expectedProjectionVersion: 0,
    operationId: 'snapshot:v1',
    projectedAt: '2026-09-03T07:00:01Z',
    sourceRevision: 'snapshot:1',
  });
  assert.equal(first.ok, true);
  if (!first.ok) return;
  const engaged = transition(record, 'ENGAGED', 2).record;

  const staleProjectionVersion = projectRevenueLifecycleSnapshot(first.projection, engaged, {
    expectedProjectionVersion: 0,
    operationId: 'snapshot:v2',
    projectedAt: '2026-09-03T07:02:01Z',
    sourceRevision: 'snapshot:2',
  });
  assert.deepEqual(staleProjectionVersion, {
    ok: false,
    error: 'PROJECTION_VERSION_CONFLICT',
  });

  const applied = projectRevenueLifecycleSnapshot(first.projection, engaged, {
    expectedProjectionVersion: 1,
    operationId: 'snapshot:v2',
    projectedAt: '2026-09-03T07:02:01Z',
    sourceRevision: 'snapshot:2',
  });
  assert.equal(applied.ok, true);
  if (!applied.ok) return;
  const staleEntity = projectRevenueLifecycleSnapshot(applied.projection, record, {
    expectedProjectionVersion: 2,
    operationId: 'snapshot:stale-v1',
    projectedAt: '2026-09-03T07:03:00Z',
    sourceRevision: 'snapshot:stale',
  });
  assert.deepEqual(staleEntity, { ok: false, error: 'ENTITY_VERSION_CONFLICT' });
});

test('W10-C projects exact W10-A events while retaining W03 envelope provenance', () => {
  const record = leadRecord();
  const seeded = projectRevenueLifecycleSnapshot(emptyProjection(), record, {
    expectedProjectionVersion: 0,
    operationId: 'snapshot:event-seed',
    projectedAt: '2026-09-03T07:00:01Z',
    sourceRevision: 'snapshot:1',
  });
  assert.equal(seeded.ok, true);
  if (!seeded.ok) return;
  const engaged = transition(record, 'ENGAGED', 2);
  const projected = projectRevenueLifecycleEvent(seeded.projection, engaged.event, {
    expectedProjectionVersion: 1,
    projectedAt: '2026-09-03T07:02:01Z',
  });
  assert.equal(projected.ok, true);
  if (!projected.ok) return;
  const model = projected.projection.models[0];
  assert.equal(model?.lifecycleState, 'ENGAGED');
  assert.equal(model?.entityVersion, 2);
  assert.equal(model?.lastEventId, engaged.event.eventId);
  assert.equal(model?.correlation?.correlationId, CORRELATION);
  assert.equal(model?.historyBasis, 'AUTHORITATIVE_SNAPSHOT');
  assert.equal(projected.projection.authorizesExecution, false);
});

test('W10-C deduplicates repeated events and detects a reused event ID with changed facts', () => {
  const engaged = transition(leadRecord(), 'ENGAGED', 2);
  const first = projectRevenueLifecycleEvent(emptyProjection(), engaged.event, {
    expectedProjectionVersion: 0,
    projectedAt: '2026-09-03T07:02:01Z',
  });
  assert.equal(first.ok, true);
  if (!first.ok) return;
  const duplicate = projectRevenueLifecycleEvent(first.projection, engaged.event, {
    expectedProjectionVersion: 0,
    projectedAt: '2026-09-03T07:02:02Z',
  });
  assert.equal(duplicate.ok, true);
  if (duplicate.ok) assert.equal(duplicate.status, 'DUPLICATE');

  const payload = engaged.event.payload as Readonly<Record<string, unknown>>;
  const tampered = {
    ...engaged.event,
    payload: { ...payload, toState: 'QUALIFIED' },
  } as EventEnvelope;
  const conflict = projectRevenueLifecycleEvent(first.projection, tampered, {
    expectedProjectionVersion: 1,
    projectedAt: '2026-09-03T07:02:03Z',
  });
  assert.deepEqual(conflict, { ok: false, error: 'OPERATION_ID_CONFLICT' });
});

test('W10-C rejects gaps, state discontinuity and out-of-order lifecycle events', () => {
  const initial = leadRecord();
  const engaged = transition(initial, 'ENGAGED', 2);
  const qualified = transition(engaged.record, 'QUALIFIED', 3);
  const first = projectRevenueLifecycleEvent(emptyProjection(), engaged.event, {
    expectedProjectionVersion: 0,
    projectedAt: '2026-09-03T07:02:01Z',
  });
  assert.equal(first.ok, true);
  if (!first.ok) return;

  const payload = qualified.event.payload as Readonly<Record<string, unknown>>;
  const gapEvent = {
    ...qualified.event,
    payload: { ...payload, version: 4 },
  } as EventEnvelope;
  assert.deepEqual(
    projectRevenueLifecycleEvent(first.projection, gapEvent, {
      expectedProjectionVersion: 1,
      projectedAt: '2026-09-03T07:03:01Z',
    }),
    { ok: false, error: 'ENTITY_VERSION_GAP' },
  );

  const discontinuous = {
    ...qualified.event,
    payload: { ...payload, fromState: 'NEW' },
  } as EventEnvelope;
  assert.deepEqual(
    projectRevenueLifecycleEvent(first.projection, discontinuous, {
      expectedProjectionVersion: 1,
      projectedAt: '2026-09-03T07:03:01Z',
    }),
    { ok: false, error: 'STATE_CONTINUITY_CONFLICT' },
  );

  const identityConflict = {
    ...qualified.event,
    payload: {
      ...payload,
      subjectIdentityId: 'idn_01JW10COTHERSUBJECT0000000',
    },
  } as EventEnvelope;
  assert.deepEqual(
    projectRevenueLifecycleEvent(first.projection, identityConflict, {
      expectedProjectionVersion: 1,
      projectedAt: '2026-09-03T07:03:01Z',
    }),
    { ok: false, error: 'IDENTITY_CONTINUITY_CONFLICT' },
  );

  assert.deepEqual(
    projectRevenueLifecycleEvent(first.projection, qualified.event, {
      expectedProjectionVersion: 1,
      projectedAt: '2026-09-03T07:01:59Z',
    }),
    { ok: false, error: 'OUT_OF_ORDER_PROJECTION' },
  );

  const oldDifferentEvent = {
    ...engaged.event,
    eventId: 'evt_01JW10COLD0000000000000000' as EventId,
  };
  assert.deepEqual(
    projectRevenueLifecycleEvent(first.projection, oldDifferentEvent, {
      expectedProjectionVersion: 1,
      projectedAt: '2026-09-03T07:03:01Z',
    }),
    { ok: false, error: 'OUT_OF_ORDER_EVENT' },
  );
});

test('W10-C fails closed across snapshot, event and query tenant boundaries', () => {
  const crossTenantSnapshot = projectRevenueLifecycleSnapshot(
    emptyProjection(),
    leadRecord('x', TENANT_B),
    {
      expectedProjectionVersion: 0,
      operationId: 'snapshot:cross-tenant',
      projectedAt: '2026-09-03T07:00:01Z',
      sourceRevision: 'snapshot:1',
    },
  );
  assert.deepEqual(crossTenantSnapshot, { ok: false, error: 'TENANT_MISMATCH' });

  const crossTenantEvent = transition(leadRecord('x', TENANT_B), 'ENGAGED', 2).event;
  assert.deepEqual(
    projectRevenueLifecycleEvent(emptyProjection(), crossTenantEvent, {
      expectedProjectionVersion: 0,
      projectedAt: '2026-09-03T07:02:01Z',
    }),
    { ok: false, error: 'TENANT_MISMATCH' },
  );

  assert.deepEqual(
    queryRevenueCrmProjection(emptyProjection(), {
      tenantId: TENANT_B,
      evaluatedAt: '2026-09-03T07:02:00Z',
      maxAgeMs: 60_000,
      limit: 10,
    }),
    { ok: false, error: 'TENANT_MISMATCH' },
  );
});

test('W10-C rebuild is deterministic for unsorted replay and repeated delivery', () => {
  const initial = leadRecord();
  const engaged = transition(initial, 'ENGAGED', 2);
  const qualified = transition(engaged.record, 'QUALIFIED', 3);
  const input = {
    tenantId: TENANT_A,
    events: [qualified.event, engaged.event, engaged.event],
    limits: LIMITS,
    projectedAt: '2026-09-03T07:04:00Z',
  } as const;
  const first = rebuildRevenueCrmProjection(input);
  const second = rebuildRevenueCrmProjection(input);
  assert.equal(first.ok, true);
  assert.deepEqual(second, first);
  if (!first.ok) return;
  assert.equal(first.projection.models[0]?.lifecycleState, 'QUALIFIED');
  assert.equal(first.projection.models[0]?.entityVersion, 3);
  assert.equal(first.projection.projectionVersion, 2);
  assert.equal(first.projection.appliedOperations.length, 2);
});

test('W10-C query currentness exposes stale and behind state without creating authority', () => {
  const applied = projectRevenueLifecycleSnapshot(emptyProjection(), leadRecord(), {
    expectedProjectionVersion: 0,
    operationId: 'snapshot:currentness',
    projectedAt: '2026-09-03T07:00:01Z',
    sourceRevision: 'snapshot:1',
  });
  assert.equal(applied.ok, true);
  if (!applied.ok) return;
  const result = queryRevenueCrmProjection(applied.projection, {
    tenantId: TENANT_A,
    requiredEntityVersion: 2,
    evaluatedAt: '2026-09-03T08:00:00Z',
    maxAgeMs: 1_000,
    limit: 10,
  });
  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.equal(result.page.items[0]?.current, false);
  assert.deepEqual(result.page.items[0]?.currentnessReasons, [
    'ENTITY_VERSION_BEHIND',
    'MODEL_TOO_OLD',
  ]);
  assert.equal(result.page.authorizesExecution, false);
  assert.equal(result.page.canGrantPermission, false);
});

test('W10-C enforces finite projection/query limits and rejects malformed events', () => {
  assert.equal(
    createRevenueCrmProjection({ tenantId: TENANT_A, maxEntities: 0, maxAppliedOperations: 1 }),
    undefined,
  );
  const limited = createRevenueCrmProjection({
    tenantId: TENANT_A,
    maxEntities: 1,
    maxAppliedOperations: 2,
  });
  if (limited === undefined) throw new Error('limited projection fixture creation failed');
  const first = projectRevenueLifecycleSnapshot(limited, leadRecord('lead-one'), {
    expectedProjectionVersion: 0,
    operationId: 'snapshot:one',
    projectedAt: '2026-09-03T07:00:01Z',
    sourceRevision: 'snapshot:1',
  });
  assert.equal(first.ok, true);
  if (!first.ok) return;
  assert.deepEqual(
    projectRevenueLifecycleSnapshot(first.projection, leadRecord('lead-two'), {
      expectedProjectionVersion: 1,
      operationId: 'snapshot:two',
      projectedAt: '2026-09-03T07:00:02Z',
      sourceRevision: 'snapshot:1',
    }),
    { ok: false, error: 'PROJECTION_CAPACITY_EXCEEDED' },
  );

  const event = transition(leadRecord('lead-one'), 'ENGAGED', 2).event;
  const malformed = { ...event, subject: 'revenue:lead:another-entity' };
  assert.deepEqual(
    projectRevenueLifecycleEvent(first.projection, malformed, {
      expectedProjectionVersion: 1,
      projectedAt: '2026-09-03T07:02:01Z',
    }),
    { ok: false, error: 'EVENT_MALFORMED' },
  );
  const eventPayload = event.payload as Readonly<Record<string, unknown>>;
  const authorityBearing = {
    ...event,
    payload: { ...eventPayload, canGrantPermission: true },
  } as EventEnvelope;
  assert.deepEqual(
    projectRevenueLifecycleEvent(first.projection, authorityBearing, {
      expectedProjectionVersion: 1,
      projectedAt: '2026-09-03T07:02:01Z',
    }),
    { ok: false, error: 'EVENT_MALFORMED' },
  );

  assert.deepEqual(
    queryRevenueCrmProjection(first.projection, {
      tenantId: TENANT_A,
      evaluatedAt: '2026-09-03T07:02:00Z',
      maxAgeMs: 60_000,
      limit: 101,
    }),
    { ok: false, error: 'REQUEST_MALFORMED' },
  );
});
