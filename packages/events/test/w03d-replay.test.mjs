import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import test from 'node:test';

const require = createRequire(import.meta.url);
const { ReplayCoordinator } = require('../dist/replay/index.js');

const tenantId = 'ten_01K0M0M0M0M0M0M0M0M0M0M0M0';
const identityId = 'idn_01K0M0M0M0M0M0M0M0M0M0M0M3';
const correlationId = 'cor_01K0M0M0M0M0M0M0M0M0M0M0M2';

function envelope(eventId) {
  return {
    kind: 'EVENT',
    schemaVersion: '1.0.0',
    eventId,
    eventType: 'aurora.test.replay',
    occurredAt: '2026-09-01T05:00:00.000Z',
    producer: { kind: 'SYSTEM', identityId },
    source: { service: 'w03d-test' },
    correlation: { correlationId },
    tenant: { tenantId },
    payload: { value: 1 },
  };
}

function input(eventId, sequence, safety = 'IDEMPOTENT_INTERNAL') {
  return {
    envelope: envelope(eventId),
    safety,
    ordering: { streamKey: `${tenantId}:orders`, sequence },
  };
}

test('ordered replay advances checkpoint exactly once and duplicate is deterministic', () => {
  const coordinator = new ReplayCoordinator();
  const current = input('evt_01K0M0M0M0M0M0M0M0M0M0M0D1', 1);

  assert.deepEqual(coordinator.process(current, '2026-09-01T05:00:01.000Z'), {
    status: 'ACCEPTED',
    eventId: current.envelope.eventId,
    checkpoint: 1,
  });
  assert.deepEqual(coordinator.process(current, '2026-09-01T05:00:02.000Z'), {
    status: 'DUPLICATE',
    eventId: current.envelope.eventId,
    checkpoint: 1,
  });
  assert.equal(coordinator.checkpoint(`${tenantId}:orders`), 1);
});

test('sequence gap and stale/out-of-order events quarantine without advancing checkpoint', () => {
  const coordinator = new ReplayCoordinator();
  coordinator.process(input('evt_01K0M0M0M0M0M0M0M0M0M0M0D2', 1), '2026-09-01T05:00:01.000Z');

  const gap = coordinator.process(
    input('evt_01K0M0M0M0M0M0M0M0M0M0M0D4', 3),
    '2026-09-01T05:00:03.000Z',
  );
  assert.equal(gap.status, 'QUARANTINED');
  assert.equal(gap.deadLetter.reason, 'SEQUENCE_GAP');
  assert.equal(gap.deadLetter.executionAuthorized, false);
  assert.equal(coordinator.checkpoint(`${tenantId}:orders`), 1);

  const stale = coordinator.process(
    input('evt_01K0M0M0M0M0M0M0M0M0M0M0D0', 1),
    '2026-09-01T05:00:04.000Z',
  );
  assert.equal(stale.status, 'QUARANTINED');
  assert.equal(stale.deadLetter.reason, 'STALE_OR_OUT_OF_ORDER');
  assert.equal(coordinator.checkpoint(`${tenantId}:orders`), 1);
});

test('repeated quarantine is idempotently keyed and records bounded recovery evidence', () => {
  const coordinator = new ReplayCoordinator();
  const current = input('evt_01K0M0M0M0M0M0M0M0M0M0M0D5', 2);

  coordinator.process(current, '2026-09-01T05:00:01.000Z');
  coordinator.process(current, '2026-09-01T05:00:02.000Z');

  const records = coordinator.deadLetters();
  assert.equal(records.length, 1);
  assert.equal(records[0].attempts, 2);
  assert.equal(records[0].firstQuarantinedAt, '2026-09-01T05:00:01.000Z');
  assert.equal(records[0].lastQuarantinedAt, '2026-09-01T05:00:02.000Z');
});

test('external side-effect replay never creates authority and requires fresh validation', () => {
  const coordinator = new ReplayCoordinator();
  const current = input('evt_01K0M0M0M0M0M0M0M0M0M0M0D6', 1, 'EXTERNAL_SIDE_EFFECT');

  const decision = coordinator.process(current, '2026-09-01T05:00:01.000Z');
  assert.equal(decision.status, 'QUARANTINED');
  assert.equal(decision.deadLetter.reason, 'FRESH_AUTHORITY_REQUIRED');
  assert.equal(decision.deadLetter.executionAuthorized, false);
  assert.equal(coordinator.checkpoint(`${tenantId}:orders`), 0);

  const release = coordinator.releaseForReconciliation(decision.deadLetter.deadLetterId);
  assert.equal(release.executionAuthorized, false);
  assert.equal(release.requiresFreshAuthorityValidation, true);
  assert.equal(release.envelope.eventId, current.envelope.eventId);
});

test('unordered internal events deduplicate but do not invent ordering constraints', () => {
  const coordinator = new ReplayCoordinator();
  const current = {
    envelope: envelope('evt_01K0M0M0M0M0M0M0M0M0M0M0D7'),
    safety: 'READ_ONLY',
  };

  assert.equal(coordinator.process(current, '2026-09-01T05:00:01.000Z').status, 'ACCEPTED');
  assert.equal(coordinator.process(current, '2026-09-01T05:00:02.000Z').status, 'DUPLICATE');
});
