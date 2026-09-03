// @ts-expect-error -- revenue harness has no @types/node; Node 22 provides this built-in.
import assert from 'node:assert/strict';
// @ts-expect-error -- revenue harness has no @types/node; Node 22 provides this built-in.
import test from 'node:test';

import type {
  ContractVersion,
  CorrelationId,
  EventId,
  IdentityId,
  TenantId,
} from '@aurora/contracts';

import {
  applyRevenueLifecycleTransition,
  buildRevenueLifecycleEvent,
  createRevenueLifecycleRecord,
} from '../src/lifecycle/index.js';

const TENANT_A = 'ten_01JW10TENANTA000000000000' as TenantId;
const TENANT_B = 'ten_01JW10TENANTB000000000000' as TenantId;
const SUBJECT = 'idn_01JW10SUBJECT000000000000' as IdentityId;
const PRODUCER = 'idn_01JW10SERVICE000000000000' as IdentityId;
const CORRELATION = 'cor_01JW10CORRELATION00000000' as CorrelationId;
const VERSION = '1.0.0' as ContractVersion;

function leadRecord() {
  const created = createRevenueLifecycleRecord({
    tenantId: TENANT_A,
    entity: { kind: 'LEAD', entityId: 'lead-local-001' },
    subjectIdentityId: SUBJECT,
    occurredAt: '2026-09-03T05:40:00Z',
    provenance: {
      sourceSystem: 'crm-ingress',
      sourceReference: 'source-lead-001',
      observedAt: '2026-09-03T05:39:59Z',
    },
  });
  assert.equal(created.ok, true);
  if (!created.ok) throw new Error('lead fixture creation failed');
  return created.record;
}

test('W10-A creates deterministic initial states without execution authority', () => {
  const lead = leadRecord();
  assert.equal(lead.state, 'NEW');
  assert.equal(lead.version, 1);
  assert.equal(lead.authorizesExecution, false);
  assert.equal(lead.tenantId, TENANT_A);
  assert.equal(lead.subjectIdentityId, SUBJECT);

  const customer = createRevenueLifecycleRecord({
    tenantId: TENANT_A,
    entity: { kind: 'CUSTOMER', entityId: 'customer-local-001' },
    occurredAt: '2026-09-03T05:40:00Z',
    provenance: { sourceSystem: 'crm', observedAt: '2026-09-03T05:40:00Z' },
  });
  assert.equal(customer.ok, true);
  if (customer.ok) assert.equal(customer.record.state, 'ACTIVE');

  const conversation = createRevenueLifecycleRecord({
    tenantId: TENANT_A,
    entity: { kind: 'CONVERSATION', entityId: 'conversation-local-001' },
    occurredAt: '2026-09-03T05:40:00Z',
    provenance: { sourceSystem: 'inbox', observedAt: '2026-09-03T05:40:00Z' },
  });
  assert.equal(conversation.ok, true);
  if (conversation.ok) assert.equal(conversation.record.state, 'OPEN');
});

test('W10-A applies legal lead transitions with optimistic versioning and provenance', () => {
  const lead = leadRecord();
  const result = applyRevenueLifecycleTransition(lead, {
    tenantId: TENANT_A,
    expectedVersion: 1,
    targetState: 'ENGAGED',
    idempotencyKey: 'w10a:lead:001:engaged',
    occurredAt: '2026-09-03T05:41:00Z',
    correlation: { correlationId: CORRELATION },
    provenance: {
      sourceSystem: 'conversation-domain',
      sourceReference: 'conversation-local-900',
      observedAt: '2026-09-03T05:41:00Z',
    },
    reason: 'customer replied',
  });

  assert.equal(result.ok, true);
  if (!result.ok || result.status !== 'APPLIED') return;
  assert.equal(result.record.state, 'ENGAGED');
  assert.equal(result.record.version, 2);
  assert.equal(result.record.authorizesExecution, false);
  assert.equal(result.change.fromState, 'NEW');
  assert.equal(result.change.toState, 'ENGAGED');
  assert.equal(result.change.correlation.correlationId, CORRELATION);
  assert.equal(result.change.authorizesExecution, false);
});

test('W10-A duplicate transition replay is stable before stale-version rejection', () => {
  const lead = leadRecord();
  const first = applyRevenueLifecycleTransition(lead, {
    tenantId: TENANT_A,
    expectedVersion: 1,
    targetState: 'ENGAGED',
    idempotencyKey: 'w10a:lead:001:engaged',
    occurredAt: '2026-09-03T05:41:00Z',
    correlation: { correlationId: CORRELATION },
    provenance: { sourceSystem: 'crm', observedAt: '2026-09-03T05:41:00Z' },
  });
  assert.equal(first.ok, true);
  if (!first.ok || first.status !== 'APPLIED') return;

  const replay = applyRevenueLifecycleTransition(first.record, {
    tenantId: TENANT_A,
    expectedVersion: 1,
    targetState: 'ENGAGED',
    idempotencyKey: 'w10a:lead:001:engaged',
    occurredAt: '2026-09-03T05:41:00Z',
    correlation: { correlationId: CORRELATION },
    provenance: { sourceSystem: 'crm', observedAt: '2026-09-03T05:41:00Z' },
  });
  assert.deepEqual(replay, { ok: true, status: 'DUPLICATE', record: first.record });

  const conflictingReplay = applyRevenueLifecycleTransition(first.record, {
    tenantId: TENANT_A,
    expectedVersion: 1,
    targetState: 'QUALIFIED',
    idempotencyKey: 'w10a:lead:001:engaged',
    occurredAt: '2026-09-03T05:41:00Z',
    correlation: { correlationId: CORRELATION },
    provenance: { sourceSystem: 'crm', observedAt: '2026-09-03T05:41:00Z' },
  });
  assert.deepEqual(conflictingReplay, { ok: false, error: 'IDEMPOTENCY_CONFLICT' });
});

test('W10-A rejects cross-tenant, stale-version, invalid and out-of-order transitions', () => {
  const lead = leadRecord();

  const wrongTenant = applyRevenueLifecycleTransition(lead, {
    tenantId: TENANT_B,
    expectedVersion: 1,
    targetState: 'ENGAGED',
    idempotencyKey: 'w10a:wrong-tenant',
    occurredAt: '2026-09-03T05:41:00Z',
    correlation: { correlationId: CORRELATION },
    provenance: { sourceSystem: 'crm', observedAt: '2026-09-03T05:41:00Z' },
  });
  assert.deepEqual(wrongTenant, { ok: false, error: 'TENANT_MISMATCH' });

  const stale = applyRevenueLifecycleTransition(lead, {
    tenantId: TENANT_A,
    expectedVersion: 2,
    targetState: 'ENGAGED',
    idempotencyKey: 'w10a:stale',
    occurredAt: '2026-09-03T05:41:00Z',
    correlation: { correlationId: CORRELATION },
    provenance: { sourceSystem: 'crm', observedAt: '2026-09-03T05:41:00Z' },
  });
  assert.deepEqual(stale, { ok: false, error: 'VERSION_CONFLICT' });

  const invalid = applyRevenueLifecycleTransition(lead, {
    tenantId: TENANT_A,
    expectedVersion: 1,
    targetState: 'CONVERTED',
    idempotencyKey: 'w10a:invalid',
    occurredAt: '2026-09-03T05:41:00Z',
    correlation: { correlationId: CORRELATION },
    provenance: { sourceSystem: 'crm', observedAt: '2026-09-03T05:41:00Z' },
  });
  assert.deepEqual(invalid, { ok: false, error: 'INVALID_TRANSITION' });

  const outOfOrder = applyRevenueLifecycleTransition(lead, {
    tenantId: TENANT_A,
    expectedVersion: 1,
    targetState: 'ENGAGED',
    idempotencyKey: 'w10a:old-event',
    occurredAt: '2026-09-03T05:39:00Z',
    correlation: { correlationId: CORRELATION },
    provenance: { sourceSystem: 'crm', observedAt: '2026-09-03T05:39:00Z' },
  });
  assert.deepEqual(outOfOrder, { ok: false, error: 'OUT_OF_ORDER_TRANSITION' });
});

test('W10-A closed conversation reopens explicitly and preserves lineage history', () => {
  const created = createRevenueLifecycleRecord({
    tenantId: TENANT_A,
    entity: { kind: 'CONVERSATION', entityId: 'conversation-local-001' },
    occurredAt: '2026-09-03T05:40:00Z',
    provenance: { sourceSystem: 'inbox', observedAt: '2026-09-03T05:40:00Z' },
  });
  assert.equal(created.ok, true);
  if (!created.ok) return;

  const closed = applyRevenueLifecycleTransition(created.record, {
    tenantId: TENANT_A,
    expectedVersion: 1,
    targetState: 'CLOSED',
    idempotencyKey: 'w10a:conversation:close',
    occurredAt: '2026-09-03T05:42:00Z',
    correlation: { correlationId: CORRELATION },
    provenance: { sourceSystem: 'inbox', observedAt: '2026-09-03T05:42:00Z' },
  });
  assert.equal(closed.ok, true);
  if (!closed.ok || closed.status !== 'APPLIED') return;

  const reopened = applyRevenueLifecycleTransition(closed.record, {
    tenantId: TENANT_A,
    expectedVersion: 2,
    targetState: 'OPEN',
    idempotencyKey: 'w10a:conversation:reopen',
    occurredAt: '2026-09-03T05:43:00Z',
    correlation: { correlationId: CORRELATION },
    provenance: { sourceSystem: 'inbox', observedAt: '2026-09-03T05:43:00Z' },
  });
  assert.equal(reopened.ok, true);
  if (!reopened.ok || reopened.status !== 'APPLIED') return;
  assert.equal(reopened.record.state, 'OPEN');
  assert.equal(reopened.record.version, 3);
  assert.equal(reopened.change.fromState, 'CLOSED');
});

test('W10-A merge is same-tenant/same-kind only and merged records are terminal', () => {
  const lead = leadRecord();
  const merged = applyRevenueLifecycleTransition(lead, {
    tenantId: TENANT_A,
    expectedVersion: 1,
    targetState: 'MERGED',
    idempotencyKey: 'w10a:lead:merge',
    occurredAt: '2026-09-03T05:44:00Z',
    correlation: { correlationId: CORRELATION },
    provenance: { sourceSystem: 'crm', observedAt: '2026-09-03T05:44:00Z' },
    mergeTarget: {
      tenantId: TENANT_A,
      entity: { kind: 'LEAD', entityId: 'lead-local-survivor' },
    },
  });
  assert.equal(merged.ok, true);
  if (!merged.ok || merged.status !== 'APPLIED') return;
  assert.equal(merged.record.state, 'MERGED');
  assert.equal(merged.record.lineage?.mergedInto?.entity.entityId, 'lead-local-survivor');

  const afterMerge = applyRevenueLifecycleTransition(merged.record, {
    tenantId: TENANT_A,
    expectedVersion: 2,
    targetState: 'ENGAGED',
    idempotencyKey: 'w10a:lead:after-merge',
    occurredAt: '2026-09-03T05:45:00Z',
    correlation: { correlationId: CORRELATION },
    provenance: { sourceSystem: 'crm', observedAt: '2026-09-03T05:45:00Z' },
  });
  assert.deepEqual(afterMerge, { ok: false, error: 'TERMINAL_RECORD' });

  const crossTenantTarget = applyRevenueLifecycleTransition(lead, {
    tenantId: TENANT_A,
    expectedVersion: 1,
    targetState: 'MERGED',
    idempotencyKey: 'w10a:lead:cross-tenant-merge',
    occurredAt: '2026-09-03T05:44:00Z',
    correlation: { correlationId: CORRELATION },
    provenance: { sourceSystem: 'crm', observedAt: '2026-09-03T05:44:00Z' },
    mergeTarget: {
      tenantId: TENANT_B,
      entity: { kind: 'LEAD', entityId: 'lead-local-other-tenant' },
    },
  });
  assert.deepEqual(crossTenantTarget, { ok: false, error: 'MERGE_TARGET_INVALID' });

  const wrongKindTarget = applyRevenueLifecycleTransition(lead, {
    tenantId: TENANT_A,
    expectedVersion: 1,
    targetState: 'MERGED',
    idempotencyKey: 'w10a:lead:wrong-kind-merge',
    occurredAt: '2026-09-03T05:44:00Z',
    correlation: { correlationId: CORRELATION },
    provenance: { sourceSystem: 'crm', observedAt: '2026-09-03T05:44:00Z' },
    mergeTarget: {
      tenantId: TENANT_A,
      entity: { kind: 'CUSTOMER', entityId: 'customer-local-001' },
    },
  });
  assert.deepEqual(wrongKindTarget, { ok: false, error: 'MERGE_TARGET_INVALID' });
});

test('W10-A builds a W03-compatible event fact without minting authority', () => {
  const lead = leadRecord();
  const applied = applyRevenueLifecycleTransition(lead, {
    tenantId: TENANT_A,
    expectedVersion: 1,
    targetState: 'QUALIFIED',
    idempotencyKey: 'w10a:lead:qualified',
    occurredAt: '2026-09-03T05:46:00Z',
    correlation: { correlationId: CORRELATION },
    provenance: {
      sourceSystem: 'qualification-domain',
      sourceReference: 'qualification-001',
      observedAt: '2026-09-03T05:46:00Z',
    },
  });
  assert.equal(applied.ok, true);
  if (!applied.ok || applied.status !== 'APPLIED') return;

  const event = buildRevenueLifecycleEvent(applied.change, {
    eventId: 'evt_01JW10LIFECYCLE00000000000' as EventId,
    schemaVersion: VERSION,
    producer: { kind: 'SERVICE', identityId: PRODUCER },
    source: { service: 'revenue', component: 'lifecycle' },
  });

  assert.equal(event.kind, 'EVENT');
  assert.equal(event.eventType, 'revenue.lifecycle.changed');
  assert.equal(event.tenant.tenantId, TENANT_A);
  assert.equal(event.correlation.correlationId, CORRELATION);
  assert.equal(event.subject, 'revenue:lead:lead-local-001');
  assert.equal(event.dataClassification, 'INTERNAL');
  assert.deepEqual(event.payload, {
    entityKind: 'LEAD',
    entityId: 'lead-local-001',
    version: 2,
    fromState: 'NEW',
    toState: 'QUALIFIED',
    idempotencyKey: 'w10a:lead:qualified',
    sourceSystem: 'qualification-domain',
    observedAt: '2026-09-03T05:46:00Z',
    sourceReference: 'qualification-001',
    subjectIdentityId: SUBJECT,
    authorizesExecution: false,
  });
});

test('W10-A rejects malformed creation and merge-without-target instead of guessing', () => {
  const malformed = createRevenueLifecycleRecord({
    tenantId: TENANT_A,
    entity: { kind: 'LEAD', entityId: '' },
    occurredAt: 'not-a-time',
    provenance: { sourceSystem: '', observedAt: 'not-a-time' },
  });
  assert.deepEqual(malformed, { ok: false, error: 'REQUEST_MALFORMED' });

  const lead = leadRecord();
  const missingTarget = applyRevenueLifecycleTransition(lead, {
    tenantId: TENANT_A,
    expectedVersion: 1,
    targetState: 'MERGED',
    idempotencyKey: 'w10a:merge:no-target',
    occurredAt: '2026-09-03T05:47:00Z',
    correlation: { correlationId: CORRELATION },
    provenance: { sourceSystem: 'crm', observedAt: '2026-09-03T05:47:00Z' },
  });
  assert.deepEqual(missingTarget, { ok: false, error: 'MERGE_TARGET_INVALID' });
});
