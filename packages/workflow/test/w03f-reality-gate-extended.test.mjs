import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import test from 'node:test';

const require = createRequire(import.meta.url);
const delivery = require('../../events/dist/delivery/index.js');
const workflow = require('../dist/index.js');

const tenantId = 'ten_01K0M0M0M0M0M0M0M0M0M0M0M0';
const eventId = 'evt_01K0M0M0M0M0M0M0M0M0M0M0F9';
const correlationId = 'cor_01K0M0M0M0M0M0M0M0M0M0M0M2';
const now = '2026-09-01T05:50:00.000Z';

test('R14 workflow follow-up persists deterministic resume/version metadata and recovery preconditions', () => {
  const statement = workflow.scheduleWorkflowFollowUpStatement({
    tenantId,
    workflowKey: 'objective:1500',
    stepKey: 'await-durable-event',
    scheduledFor: now,
    metadata: {
      workflowVersion: '1.2.3',
      expectedPrecondition: 'event-acknowledged',
    },
  });

  assert.equal(statement.values[0], tenantId);
  assert.equal(statement.values[1], 'workflow-follow-up');
  assert.equal(
    statement.values[2],
    'workflow:objective:1500:await-durable-event',
  );

  const metadata = JSON.parse(statement.values[4]);
  assert.deepEqual(metadata, {
    workflowVersion: '1.2.3',
    expectedPrecondition: 'event-acknowledged',
    workflowKey: 'objective:1500',
    stepKey: 'await-durable-event',
    durableWorkflowPrimitive: true,
  });

  const recovery = workflow.recoverExpiredTimerClaimsStatement(tenantId, now);
  assert.match(recovery.text, /status = 'active'/);
  assert.match(recovery.text, /expires_at <= \$2::timestamptz/);
  assert.match(recovery.text, /timer\.status = 'claimed'/);
  assert.match(recovery.text, /timer\.claimed_by = expired\.owner_token/);
});

test('R19 evidence reconstructs a correlated W03 transition chain without changing identity', () => {
  const transitions = [
    'outbox.enqueued',
    'outbox.claimed',
    'subscriber.dispatched',
    'subscriber.acked',
    'replay.quarantined',
    'timer.recovered',
  ];

  const evidence = transitions.map((transition, index) =>
    delivery.buildDeliveryEvidence({
      tenantId,
      eventId,
      correlationId,
      transition,
      at: `2026-09-01T05:50:0${index}.000Z`,
      details: { sequence: index + 1, safe: true },
    }),
  );

  assert.deepEqual(
    evidence.map((entry) => entry.transition),
    transitions,
  );
  assert.ok(evidence.every((entry) => entry.tenantId === tenantId));
  assert.ok(evidence.every((entry) => entry.eventId === eventId));
  assert.ok(evidence.every((entry) => entry.correlationId === correlationId));
  assert.deepEqual(
    evidence.map((entry) => entry.details.sequence),
    [1, 2, 3, 4, 5, 6],
  );
});
