import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import test from 'node:test';

const require = createRequire(import.meta.url);
const {
  LocalEventTransport,
  SubscriptionRegistry,
  matchesSubscription,
} = require('../dist/transport/index.js');

const tenantId = 'ten_01K0M0M0M0M0M0M0M0M0M0M0M0';
const identityId = 'idn_01K0M0M0M0M0M0M0M0M0M0M0M3';
const correlationId = 'cor_01K0M0M0M0M0M0M0M0M0M0M0M2';

function envelope(eventId, eventType = 'aurora.test.created', labels = {}) {
  return {
    kind: 'EVENT',
    schemaVersion: '1.0.0',
    eventId,
    eventType,
    occurredAt: '2026-09-01T03:00:00.000Z',
    producer: { kind: 'SYSTEM', identityId },
    source: { service: 'transport-test' },
    correlation: { correlationId },
    tenant: { tenantId },
    payload: { value: 1 },
    metadata: { labels },
  };
}

test('subscription registration is deterministic and conflicting reuse fails closed', () => {
  const registry = new SubscriptionRegistry(2);
  const input = {
    subscriptionKey: 'billing-created',
    subscriber: 'billing-worker',
    interest: {
      eventTypes: ['aurora.test.created'],
      requiredLabels: { region: 'br', capability: 'billing' },
    },
  };

  const first = registry.register(input);
  const replay = registry.register({
    ...input,
    interest: {
      requiredLabels: { capability: 'billing', region: 'br' },
      eventTypes: ['aurora.test.created', 'aurora.test.created'],
    },
  });
  assert.deepEqual(replay, first);
  assert.throws(
    () => registry.register({ ...input, subscriber: 'different-worker' }),
    /subscription key conflict/,
  );
});

test('matcher uses only governed event type and opaque metadata labels', () => {
  const current = envelope('evt_01K0M0M0M0M0M0M0M0M0M0M0M1', 'aurora.test.created', {
    capability: 'billing',
    region: 'br',
  });
  assert.equal(
    matchesSubscription(current, {
      eventTypes: ['aurora.test.created'],
      requiredLabels: { capability: 'billing' },
    }),
    true,
  );
  assert.equal(matchesSubscription(current, { eventTypes: ['aurora.test.deleted'] }), false);
  assert.equal(matchesSubscription(current, { requiredLabels: { region: 'us' } }), false);
});

test('fan-out is bounded and acknowledgements are independent per subscription', () => {
  const registry = new SubscriptionRegistry();
  registry.register({ subscriptionKey: 'sub-a', subscriber: 'a', interest: {} });
  registry.register({ subscriptionKey: 'sub-b', subscriber: 'b', interest: {} });
  const transport = new LocalEventTransport(registry, {
    maxFanout: 2,
    maxPendingPerSubscription: 4,
    maxPullBatch: 2,
  });
  const current = envelope('evt_01K0M0M0M0M0M0M0M0M0M0M0M4');

  assert.deepEqual(transport.publish(current, '2026-09-01T03:00:01.000Z'), {
    matchedSubscriptions: 2,
    enqueuedDeliveries: 2,
    duplicateDeliveries: 0,
  });
  const aDelivery = transport.pull('sub-a')[0];
  assert.ok(aDelivery);
  transport.ack('sub-a', aDelivery.deliveryKey, '2026-09-01T03:00:02.000Z');
  assert.equal(transport.pendingCount('sub-a'), 0);
  assert.equal(transport.pendingCount('sub-b'), 1);

  assert.deepEqual(transport.publish(current, '2026-09-01T03:00:03.000Z'), {
    matchedSubscriptions: 2,
    enqueuedDeliveries: 0,
    duplicateDeliveries: 2,
  });
});

test('fan-out capacity is checked before any queue is mutated', () => {
  const registry = new SubscriptionRegistry();
  registry.register({ subscriptionKey: 'sub-a', subscriber: 'a', interest: {} });
  registry.register({ subscriptionKey: 'sub-b', subscriber: 'b', interest: {} });
  const transport = new LocalEventTransport(registry, {
    maxFanout: 2,
    maxPendingPerSubscription: 1,
    maxPullBatch: 1,
  });

  transport.publish(envelope('evt_01K0M0M0M0M0M0M0M0M0M0M0M5'), '2026-09-01T03:00:00.000Z');
  assert.throws(
    () => transport.publish(envelope('evt_01K0M0M0M0M0M0M0M0M0M0M0M6'), '2026-09-01T03:00:01.000Z'),
    /pending delivery capacity exceeded/,
  );
  assert.equal(transport.pendingCount('sub-a'), 1);
  assert.equal(transport.pendingCount('sub-b'), 1);
});

test('fan-out limit fails before delivery creation and inactive subscriptions are excluded', () => {
  const registry = new SubscriptionRegistry();
  registry.register({ subscriptionKey: 'sub-a', subscriber: 'a', interest: {} });
  registry.register({ subscriptionKey: 'sub-b', subscriber: 'b', interest: {} });
  const limited = new LocalEventTransport(registry, {
    maxFanout: 1,
    maxPendingPerSubscription: 2,
    maxPullBatch: 1,
  });
  const current = envelope('evt_01K0M0M0M0M0M0M0M0M0M0M0M7');
  assert.throws(
    () => limited.publish(current, '2026-09-01T03:00:00.000Z'),
    /fan-out limit exceeded/,
  );
  assert.equal(limited.pendingCount('sub-a'), 0);
  assert.equal(limited.pendingCount('sub-b'), 0);

  registry.setActive('sub-b', false);
  assert.deepEqual(limited.publish(current, '2026-09-01T03:00:01.000Z'), {
    matchedSubscriptions: 1,
    enqueuedDeliveries: 1,
    duplicateDeliveries: 0,
  });
});

test('pull batches are capped by configured maxPullBatch', () => {
  const registry = new SubscriptionRegistry();
  registry.register({ subscriptionKey: 'sub-a', subscriber: 'a', interest: {} });
  const transport = new LocalEventTransport(registry, {
    maxFanout: 1,
    maxPendingPerSubscription: 5,
    maxPullBatch: 2,
  });
  for (const suffix of ['8', '9', 'A']) {
    transport.publish(
      envelope(`evt_01K0M0M0M0M0M0M0M0M0M0M0M${suffix}`),
      '2026-09-01T03:00:00.000Z',
    );
  }
  assert.equal(transport.pull('sub-a', 99).length, 2);
});
