import assert from 'node:assert/strict';
import test from 'node:test';

import {
  advanceReplayCheckpoint,
  evaluateReplay,
  planDeadLetterRecovery,
  quarantineEvent,
  replayStreamKey,
  selectReplayBatch,
} from '../dist/replay/index.js';

const TENANT_A = 'ten_01ARZ3NDEKTSV4RRFFQ69G5FAV';
const TENANT_B = 'ten_01ARZ3NDEKTSV4RRFFQ69G5FAW';
const CORRELATION = 'cor_01ARZ3NDEKTSV4RRFFQ69G5FAV';

function event(eventId, occurredAt, tenantId = TENANT_A, subject = 'subject-1') {
  return {
    kind: 'EVENT',
    schemaVersion: '1.0.0',
    eventId,
    eventType: 'aurora.test.event',
    occurredAt,
    producer: { kind: 'SYSTEM', identityId: 'idn_01ARZ3NDEKTSV4RRFFQ69G5FAV' },
    source: { service: 'w03-test' },
    correlation: { correlationId: CORRELATION },
    tenant: { tenantId },
    subject,
    payload: {},
  };
}

const policy = {
  orderingScope: 'SUBJECT',
  maxRecentEventIds: 2,
  outOfOrder: 'QUARANTINE',
};

test('first event processes and duplicate delivery is detected deterministically', () => {
  const first = event('evt_01ARZ3NDEKTSV4RRFFQ69G5FAV', '2026-09-01T05:00:00.000Z');
  const initial = evaluateReplay(first, undefined, policy);
  assert.equal(initial.action, 'PROCESS');
  assert.equal(initial.reason, 'FIRST_EVENT');

  const checkpoint = advanceReplayCheckpoint(undefined, first, policy);
  const duplicate = evaluateReplay(first, checkpoint, policy);
  assert.deepEqual(
    { action: duplicate.action, reason: duplicate.reason },
    { action: 'DUPLICATE', reason: 'DUPLICATE_EVENT_ID' },
  );
});

test('out-of-order event is quarantined when ordering is explicitly required', () => {
  const newest = event('evt_01ARZ3NDEKTSV4RRFFQ69G5FB0', '2026-09-01T05:10:00.000Z');
  const older = event('evt_01ARZ3NDEKTSV4RRFFQ69G5FAZ', '2026-09-01T05:09:00.000Z');
  const checkpoint = advanceReplayCheckpoint(undefined, newest, policy);
  const decision = evaluateReplay(older, checkpoint, policy);
  assert.equal(decision.action, 'QUARANTINE');
  assert.equal(decision.reason, 'OUT_OF_ORDER');
});

test('checkpoint recent event memory is bounded', () => {
  const events = [
    event('evt_01ARZ3NDEKTSV4RRFFQ69G5FA1', '2026-09-01T05:01:00.000Z'),
    event('evt_01ARZ3NDEKTSV4RRFFQ69G5FA2', '2026-09-01T05:02:00.000Z'),
    event('evt_01ARZ3NDEKTSV4RRFFQ69G5FA3', '2026-09-01T05:03:00.000Z'),
  ];
  let checkpoint;
  for (const envelope of events) checkpoint = advanceReplayCheckpoint(checkpoint, envelope, policy);
  assert.equal(checkpoint.revision, 3);
  assert.deepEqual(checkpoint.recentEventIds, [events[1].eventId, events[2].eventId]);
});

test('tenant or stream mismatch fails closed to quarantine', () => {
  const first = event('evt_01ARZ3NDEKTSV4RRFFQ69G5FA4', '2026-09-01T05:04:00.000Z');
  const checkpoint = advanceReplayCheckpoint(undefined, first, policy);

  const otherTenant = event(
    'evt_01ARZ3NDEKTSV4RRFFQ69G5FA5',
    '2026-09-01T05:05:00.000Z',
    TENANT_B,
  );
  assert.equal(evaluateReplay(otherTenant, checkpoint, policy).reason, 'TENANT_MISMATCH');

  const otherSubject = event(
    'evt_01ARZ3NDEKTSV4RRFFQ69G5FA6',
    '2026-09-01T05:06:00.000Z',
    TENANT_A,
    'subject-2',
  );
  assert.equal(evaluateReplay(otherSubject, checkpoint, policy).reason, 'STREAM_MISMATCH');
});

test('replay batch is tenant scoped, cursor bounded and deterministically ordered', () => {
  const one = event('evt_01ARZ3NDEKTSV4RRFFQ69G5FA7', '2026-09-01T05:07:00.000Z');
  const two = event('evt_01ARZ3NDEKTSV4RRFFQ69G5FA8', '2026-09-01T05:08:00.000Z');
  const foreign = event(
    'evt_01ARZ3NDEKTSV4RRFFQ69G5FA9',
    '2026-09-01T05:09:00.000Z',
    TENANT_B,
  );
  const batch = selectReplayBatch({
    tenantId: TENANT_A,
    envelopes: [two, foreign, one],
    limit: 2,
  });
  assert.deepEqual(batch.map(({ eventId }) => eventId), [one.eventId, two.eventId]);
});

test('DLQ requeue cannot manufacture authority and requires explicit current revalidation', () => {
  const envelope = event('evt_01ARZ3NDEKTSV4RRFFQ69G5FAA', '2026-09-01T05:10:00.000Z');
  const record = quarantineEvent({
    envelope,
    reason: 'EXECUTION_UNCERTAIN',
    quarantinedAt: '2026-09-01T05:11:00.000Z',
  });
  assert.equal(record.requiresCurrentAuthorityValidation, true);
  assert.throws(
    () =>
      planDeadLetterRecovery(record, {
        action: 'REQUEUE',
        authorityRevalidated: false,
        reason: 'retry requested',
      }),
    /DLQ_REQUEUE_REQUIRES_CURRENT_AUTHORITY_VALIDATION/,
  );

  const plan = planDeadLetterRecovery(record, {
    action: 'REQUEUE',
    authorityRevalidated: true,
    reason: 'current authority independently revalidated',
  });
  assert.equal(plan.action, 'REQUEUE');
  assert.equal(plan.requiresCurrentAuthorityValidation, true);
  assert.equal(plan.envelope, envelope);
});

test('stream keys are deterministic and tenant bound', () => {
  const envelope = event('evt_01ARZ3NDEKTSV4RRFFQ69G5FAB', '2026-09-01T05:12:00.000Z');
  assert.equal(
    replayStreamKey(envelope, 'SUBJECT'),
    `tenant:${TENANT_A}:subject:subject-1`,
  );
});
