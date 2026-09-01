import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import test from 'node:test';

const require = createRequire(import.meta.url);
const delivery = require('../dist/delivery/index.js');

const tenantId = 'ten_01K0M0M0M0M0M0M0M0M0M0M0M0';
const eventId = 'evt_01K0M0M0M0M0M0M0M0M0M0M0M1';
const correlationId = 'cor_01K0M0M0M0M0M0M0M0M0M0M0M2';
const identityId = 'idn_01K0M0M0M0M0M0M0M0M0M0M0M3';
const hashA = 'a'.repeat(64);
const hashB = 'b'.repeat(64);

test('canonical JSON is stable across object key order', () => {
  const left = delivery.canonicalJsonString({ z: 1, a: { y: 2, x: 1 } });
  const right = delivery.canonicalJsonString({ a: { x: 1, y: 2 }, z: 1 });
  assert.equal(left, right);
  assert.equal(left, '{"a":{"x":1,"y":2},"z":1}');
});

test('idempotency replay accepts only the same operation, payload and event', () => {
  const request = {
    tenantId,
    key: 'order:123',
    operationName: 'reserve',
    canonicalPayloadHash: hashA,
    eventId,
  };
  const existing = { ...request, status: 'completed' };

  assert.deepEqual(delivery.decideIdempotency(null, request), { kind: 'NEW' });
  assert.deepEqual(delivery.decideIdempotency(existing, request), {
    kind: 'REPLAY',
    status: 'completed',
  });
  assert.deepEqual(
    delivery.decideIdempotency(existing, { ...request, canonicalPayloadHash: hashB }),
    { kind: 'CONFLICT', reason: 'PAYLOAD_MISMATCH' },
  );
  assert.deepEqual(delivery.decideIdempotency(existing, { ...request, operationName: 'charge' }), {
    kind: 'CONFLICT',
    reason: 'OPERATION_MISMATCH',
  });
});

test('idempotency payload hashes must be canonical lowercase SHA-256 hex', () => {
  assert.equal(delivery.assertCanonicalPayloadHash(hashA), hashA);
  assert.throws(() => delivery.assertCanonicalPayloadHash('A'.repeat(64)), /lowercase SHA-256/);
  assert.throws(() => delivery.assertCanonicalPayloadHash('abc'), /lowercase SHA-256/);
});

test('event persistence and outbox enqueue are one atomic SQL statement', () => {
  const statement = delivery.buildPersistEventAndOutboxStatement({
    envelope: {
      kind: 'EVENT',
      schemaVersion: '1.0.0',
      eventId,
      eventType: 'aurora.test.created',
      occurredAt: '2026-09-01T03:00:00.000Z',
      producer: { kind: 'SYSTEM', identityId },
      source: { service: 'test-suite' },
      correlation: { correlationId },
      tenant: { tenantId },
      payload: { value: 1 },
    },
  });

  assert.match(statement.text, /^WITH persisted_event AS/);
  assert.match(statement.text, /INSERT INTO w03_event /);
  assert.match(statement.text, /INSERT INTO w03_event_outbox/);
  assert.doesNotMatch(statement.text, /ON CONFLICT/);
  assert.equal(statement.values[0], eventId);
  assert.equal(statement.values[1], tenantId);
  assert.equal(statement.values[10], correlationId);
});

test('outbox claim is tenant-scoped, bounded and reclaimable only after unlock', () => {
  const statement = delivery.buildClaimOutboxStatement({
    tenantId,
    eventId,
    claimToken: 'worker-a:claim-1',
    now: '2026-09-01T03:00:00.000Z',
    unlockedAt: '2026-09-01T03:00:30.000Z',
    maxAttempts: 5,
  });

  assert.match(statement.text, /tenant_id = \$1/);
  assert.match(statement.text, /event_id = \$2/);
  assert.match(statement.text, /attempt_count < \$6/);
  assert.match(statement.text, /unlocked_at <= \$4::timestamptz/);
  assert.equal(statement.values[5], 5);
  assert.throws(
    () =>
      delivery.buildClaimOutboxStatement({
        ...statement,
        tenantId,
        eventId,
        claimToken: 'x',
        now: 'n',
        unlockedAt: 'u',
        maxAttempts: 0,
      }),
    /positive integer/,
  );
});

test('outbox commit statements fence stale owners with claim token and lease time', () => {
  const ack = delivery.buildAckOutboxStatement({
    tenantId,
    eventId,
    claimToken: 'worker-a:claim-1',
    now: '2026-09-01T03:00:10.000Z',
  });
  const fail = delivery.buildFailOutboxStatement({
    tenantId,
    eventId,
    claimToken: 'worker-a:claim-1',
    now: '2026-09-01T03:00:10.000Z',
    nextAttemptAt: '2026-09-01T03:00:20.000Z',
    errorCode: 'TEMPORARY_FAILURE',
  });

  for (const statement of [ack, fail]) {
    assert.match(statement.text, /claim_token = \$3/);
    assert.match(statement.text, /unlocked_at > \$4::timestamptz/);
    assert.match(statement.text, /delivery_status = 'claimed'/);
  }
});

test('inbox duplicate registration cannot reopen an acknowledged delivery', () => {
  const register = delivery.buildRegisterInboxStatement({
    tenantId,
    eventId,
    correlationId,
    now: '2026-09-01T03:00:00.000Z',
  });
  const claim = delivery.buildClaimInboxStatement({
    tenantId,
    eventId,
    now: '2026-09-01T03:00:01.000Z',
  });

  assert.match(register.text, /ON CONFLICT \(tenant_id, event_id\) DO UPDATE/);
  assert.doesNotMatch(register.text, /delivery_status = EXCLUDED/);
  assert.match(claim.text, /delivery_status = 'pending'/);
});

test('bounded retry backoff never exceeds the configured cap', () => {
  assert.equal(delivery.boundedBackoffSeconds(1), 1);
  assert.equal(delivery.boundedBackoffSeconds(2), 2);
  assert.equal(delivery.boundedBackoffSeconds(20, 60), 60);
  assert.throws(() => delivery.boundedBackoffSeconds(0), /positive integer/);
});
