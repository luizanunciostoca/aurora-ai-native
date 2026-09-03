// @ts-expect-error -- revenue harness has no @types/node; Node 22 provides this built-in.
import assert from 'node:assert/strict';
// @ts-expect-error -- revenue harness has no @types/node; Node 22 provides this built-in.
import test from 'node:test';

import type { CorrelationId, TenantId } from '@aurora/contracts';

import {
  createOrganicPublication,
  transitionOrganicPublication,
  type OrganicPublicationRecord,
} from '../src/social/publication-scheduling.js';

const TENANT = 'ten_01JW11ATENANT000000000000' as TenantId;
const OTHER_TENANT = 'ten_01JW11AOTHER0000000000000' as TenantId;
const CORRELATION = 'cor_01JW11ACORRELATION0000000' as CorrelationId;

function createPrepared(): OrganicPublicationRecord {
  const result = createOrganicPublication({
    tenantId: TENANT,
    correlationId: CORRELATION,
    publicationId: 'publication:party-friday',
    kind: 'STORY',
    accountReference: 'instagram-account:toca',
    providerBindingReference: 'provider-binding:instagram:toca',
    mediaReferences: ['media:story:1'],
    caption: 'The Party',
    evaluatedAt: '2026-09-03T15:00:00Z',
    initialState: 'PREPARED',
    idempotencyKey: 'idem:create:party-friday',
    operationId: 'op:create:party-friday',
  });

  assert.equal(result.status, 'APPLIED');
  if (result.status === 'BLOCKED') throw new Error(result.code);
  return result.record;
}

test('creates draft and prepared publication records without external authority', () => {
  const draft = createOrganicPublication({
    tenantId: TENANT,
    correlationId: CORRELATION,
    publicationId: 'publication:draft',
    kind: 'POST',
    accountReference: 'instagram-account:toca',
    providerBindingReference: 'provider-binding:instagram:toca',
    mediaReferences: [],
    evaluatedAt: '2026-09-03T15:00:00Z',
    idempotencyKey: 'idem:create:draft',
    operationId: 'op:create:draft',
  });

  assert.equal(draft.status, 'APPLIED');
  if (draft.status !== 'BLOCKED') {
    assert.equal(draft.record.state, 'DRAFT');
    assert.equal(draft.record.pausedSafe, true);
    assert.equal(draft.record.authorizesExecution, false);
    assert.equal(draft.record.w07ExecutionRequest, undefined);
  }

  const prepared = createPrepared();
  assert.equal(prepared.state, 'PREPARED');
  assert.equal(prepared.authorizesExecution, false);
});

test('schedules through a W03 timer projection and never treats the timer as authority', () => {
  const prepared = createPrepared();
  const result = transitionOrganicPublication({
    tenantId: TENANT,
    correlationId: CORRELATION,
    record: prepared,
    command: 'SCHEDULE',
    expectedRevision: prepared.revision,
    evaluatedAt: '2026-09-03T15:00:00Z',
    scheduledAt: '2026-09-03T16:00:00Z',
    idempotencyKey: 'idem:schedule:party-friday',
    operationId: 'op:schedule:party-friday',
  });

  assert.equal(result.status, 'APPLIED');
  if (result.status === 'APPLIED') {
    assert.equal(result.record.state, 'SCHEDULED');
    assert.equal(result.record.timer?.source, 'W03_TIMER');
    assert.equal(result.record.timer?.scheduledFor, '2026-09-03T16:00:00Z');
    assert.equal(result.record.timer?.authorizesExecution, false);
    assert.equal(result.record.w07ExecutionRequest, undefined);
  }
});

test('dispatches only as a due W07 request projection', () => {
  const prepared = createPrepared();
  const scheduled = transitionOrganicPublication({
    tenantId: TENANT,
    correlationId: CORRELATION,
    record: prepared,
    command: 'SCHEDULE',
    expectedRevision: prepared.revision,
    evaluatedAt: '2026-09-03T15:00:00Z',
    scheduledAt: '2026-09-03T16:00:00Z',
    idempotencyKey: 'idem:schedule',
    operationId: 'op:schedule',
  });
  assert.equal(scheduled.status, 'APPLIED');
  if (scheduled.status !== 'APPLIED') return;

  const early = transitionOrganicPublication({
    tenantId: TENANT,
    correlationId: CORRELATION,
    record: scheduled.record,
    command: 'REQUEST_DISPATCH',
    expectedRevision: scheduled.record.revision,
    evaluatedAt: '2026-09-03T15:59:59Z',
    idempotencyKey: 'idem:dispatch',
    operationId: 'op:dispatch',
  });
  assert.deepEqual(early, { status: 'BLOCKED', code: 'NOT_DUE' });

  const due = transitionOrganicPublication({
    tenantId: TENANT,
    correlationId: CORRELATION,
    record: scheduled.record,
    command: 'REQUEST_DISPATCH',
    expectedRevision: scheduled.record.revision,
    evaluatedAt: '2026-09-03T16:00:00Z',
    idempotencyKey: 'idem:dispatch',
    operationId: 'op:dispatch',
  });
  assert.equal(due.status, 'APPLIED');
  if (due.status === 'APPLIED') {
    assert.equal(due.record.state, 'DISPATCH_REQUESTED');
    assert.equal(due.record.w07ExecutionRequest?.source, 'W07_EXECUTOR');
    assert.equal(due.record.w07ExecutionRequest?.action, 'social.publish');
    assert.equal(due.record.w07ExecutionRequest?.requiresCurrentAuthority, true);
    assert.equal(due.record.w07ExecutionRequest?.requiresW08ProviderBinding, true);
    assert.equal(due.record.w07ExecutionRequest?.authorizesExecution, false);
    assert.equal(due.record.authorizesExecution, false);
  }
});

test('exact operation replay is stable and conflicting operation reuse fails closed', () => {
  const prepared = createPrepared();
  const applied = transitionOrganicPublication({
    tenantId: TENANT,
    correlationId: CORRELATION,
    record: prepared,
    command: 'SCHEDULE',
    expectedRevision: prepared.revision,
    evaluatedAt: '2026-09-03T15:00:00Z',
    scheduledAt: '2026-09-03T16:00:00Z',
    idempotencyKey: 'idem:schedule',
    operationId: 'op:schedule',
  });
  assert.equal(applied.status, 'APPLIED');
  if (applied.status !== 'APPLIED') return;

  const replay = transitionOrganicPublication({
    tenantId: TENANT,
    correlationId: CORRELATION,
    record: applied.record,
    command: 'SCHEDULE',
    expectedRevision: prepared.revision,
    evaluatedAt: '2026-09-03T15:00:01Z',
    scheduledAt: '2026-09-03T16:00:00Z',
    idempotencyKey: 'idem:schedule',
    operationId: 'op:schedule',
  });
  assert.equal(replay.status, 'REPLAY');
  if (replay.status === 'REPLAY') assert.equal(replay.record.revision, applied.record.revision);

  const conflict = transitionOrganicPublication({
    tenantId: TENANT,
    correlationId: CORRELATION,
    record: applied.record,
    command: 'CANCEL',
    expectedRevision: applied.record.revision,
    evaluatedAt: '2026-09-03T15:00:01Z',
    idempotencyKey: 'idem:cancel',
    operationId: 'op:schedule',
  });
  assert.deepEqual(conflict, { status: 'BLOCKED', code: 'OPERATION_ID_CONFLICT' });
});

test('cancellation is idempotent and terminal before dispatch', () => {
  const prepared = createPrepared();
  const cancelled = transitionOrganicPublication({
    tenantId: TENANT,
    correlationId: CORRELATION,
    record: prepared,
    command: 'CANCEL',
    expectedRevision: prepared.revision,
    evaluatedAt: '2026-09-03T15:10:00Z',
    idempotencyKey: 'idem:cancel',
    operationId: 'op:cancel',
  });
  assert.equal(cancelled.status, 'APPLIED');
  if (cancelled.status !== 'APPLIED') return;
  assert.equal(cancelled.record.state, 'CANCELLED');
  assert.equal(cancelled.record.timer, undefined);

  const secondCancel = transitionOrganicPublication({
    tenantId: TENANT,
    correlationId: CORRELATION,
    record: cancelled.record,
    command: 'CANCEL',
    expectedRevision: cancelled.record.revision,
    evaluatedAt: '2026-09-03T15:11:00Z',
    idempotencyKey: 'idem:cancel:2',
    operationId: 'op:cancel:2',
  });
  assert.equal(secondCancel.status, 'ALREADY_CANCELLED');

  const dispatch = transitionOrganicPublication({
    tenantId: TENANT,
    correlationId: CORRELATION,
    record: cancelled.record,
    command: 'REQUEST_DISPATCH',
    expectedRevision: cancelled.record.revision,
    evaluatedAt: '2026-09-03T16:00:00Z',
    idempotencyKey: 'idem:dispatch',
    operationId: 'op:dispatch',
  });
  assert.deepEqual(dispatch, { status: 'BLOCKED', code: 'TERMINAL_CANCELLED' });
});

test('fails closed on schedule, media, revision and tenant boundaries', () => {
  const missingMedia = createOrganicPublication({
    tenantId: TENANT,
    correlationId: CORRELATION,
    publicationId: 'publication:no-media',
    kind: 'REEL',
    accountReference: 'instagram-account:toca',
    providerBindingReference: 'provider-binding:instagram:toca',
    mediaReferences: [],
    evaluatedAt: '2026-09-03T15:00:00Z',
    initialState: 'PREPARED',
    idempotencyKey: 'idem:create:no-media',
    operationId: 'op:create:no-media',
  });
  assert.deepEqual(missingMedia, { status: 'BLOCKED', code: 'MISSING_MEDIA' });

  const invalidSchedule = createOrganicPublication({
    tenantId: TENANT,
    correlationId: CORRELATION,
    publicationId: 'publication:past',
    kind: 'POST',
    accountReference: 'instagram-account:toca',
    providerBindingReference: 'provider-binding:instagram:toca',
    mediaReferences: ['media:1'],
    evaluatedAt: '2026-09-03T15:00:00Z',
    initialState: 'SCHEDULED',
    scheduledAt: '2026-09-03T14:00:00Z',
    idempotencyKey: 'idem:create:past',
    operationId: 'op:create:past',
  });
  assert.deepEqual(invalidSchedule, { status: 'BLOCKED', code: 'SCHEDULE_NOT_FUTURE' });

  const prepared = createPrepared();
  const stale = transitionOrganicPublication({
    tenantId: TENANT,
    correlationId: CORRELATION,
    record: prepared,
    command: 'CANCEL',
    expectedRevision: prepared.revision + 1,
    evaluatedAt: '2026-09-03T15:10:00Z',
    idempotencyKey: 'idem:cancel',
    operationId: 'op:cancel',
  });
  assert.deepEqual(stale, { status: 'BLOCKED', code: 'STALE_REVISION' });

  const crossTenant = transitionOrganicPublication({
    tenantId: OTHER_TENANT,
    correlationId: CORRELATION,
    record: prepared,
    command: 'CANCEL',
    expectedRevision: prepared.revision,
    evaluatedAt: '2026-09-03T15:10:00Z',
    idempotencyKey: 'idem:cancel',
    operationId: 'op:cancel',
  });
  assert.deepEqual(crossTenant, { status: 'BLOCKED', code: 'CONTEXT_MISMATCH' });
});
