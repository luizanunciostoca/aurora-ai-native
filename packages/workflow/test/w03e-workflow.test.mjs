import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import test from 'node:test';

const require = createRequire(import.meta.url);
const {
  acquireLeaseStatement,
  cancelClaimedTimerStatement,
  claimDueTimerStatement,
  completeClaimedTimerStatement,
  heartbeatLeaseStatement,
  recoverExpiredTimerClaimsStatement,
  scheduleTimerStatement,
  scheduleWorkflowFollowUpStatement,
  workflowScheduleKey,
} = require('../dist/index.js');

const tenantId = 'ten_01K0M0M0M0M0M0M0M0M0M0M0M0';
const now = '2026-09-01T05:30:00.000Z';
const expiresAt = '2026-09-01T05:31:00.000Z';
const ownerToken = 'worker-7:fence-41';
const timerId = '11111111-1111-4111-8111-111111111111';

test('timer scheduling serializes active schedule keys with a transaction advisory lock', () => {
  const statement = scheduleTimerStatement({
    tenantId,
    timerName: 'follow-up',
    scheduleKey: 'workflow:wf-1:step-2',
    scheduledFor: now,
    metadata: { reason: 'retry' },
  });

  assert.match(statement.text, /pg_advisory_xact_lock/);
  assert.match(statement.text, /status IN \('scheduled', 'claimed'\)/);
  assert.match(statement.text, /NOT EXISTS \(SELECT 1 FROM existing\)/);
  assert.deepEqual(statement.values.slice(0, 4), [
    tenantId,
    'follow-up',
    'workflow:wf-1:step-2',
    now,
  ]);
  assert.deepEqual(JSON.parse(statement.values[4]), { reason: 'retry' });
});

test('due timer claim establishes a fencing lease in the same statement', () => {
  const statement = claimDueTimerStatement({
    tenantId,
    now,
    ownerToken,
    leaseExpiresAt: expiresAt,
  });

  assert.match(statement.text, /FOR UPDATE SKIP LOCKED/);
  assert.match(statement.text, /INSERT INTO w03_lease/);
  assert.match(statement.text, /'timer:' \|\| candidate\.timer_id::text/);
  assert.match(statement.text, /w03_lease\.expires_at <= \$2::timestamptz/);
  assert.match(statement.text, /SET status = 'claimed', claimed_by = \$3/);
  assert.deepEqual(statement.values, [tenantId, now, ownerToken, expiresAt]);
});

test('lease acquisition cannot steal an active unexpired lease', () => {
  const statement = acquireLeaseStatement({
    tenantId,
    leaseKey: 'workflow:wf-1',
    ownerToken,
    subjectType: 'workflow',
    subjectId: 'wf-1',
    now,
    expiresAt,
  });

  assert.match(statement.text, /ON CONFLICT \(tenant_id, lease_key\) DO UPDATE/);
  assert.match(statement.text, /w03_lease\.status <> 'active'/);
  assert.match(statement.text, /w03_lease\.expires_at <= \$6::timestamptz/);
});

test('heartbeat is exact-owner fenced and cannot revive an expired lease', () => {
  const statement = heartbeatLeaseStatement({
    tenantId,
    leaseKey: 'workflow:wf-1',
    ownerToken,
    now,
    expiresAt,
  });

  assert.match(statement.text, /owner_token = \$3/);
  assert.match(statement.text, /status = 'active'/);
  assert.match(statement.text, /expires_at > \$4::timestamptz/);
});

test('completion and claimed cancellation require the exact current unexpired timer owner', () => {
  const input = { tenantId, timerId, ownerToken, now };
  const complete = completeClaimedTimerStatement(input);
  const cancel = cancelClaimedTimerStatement(input);

  for (const statement of [complete, cancel]) {
    assert.match(statement.text, /owner_token = \$3/);
    assert.match(statement.text, /expires_at > \$4::timestamptz/);
    assert.match(statement.text, /timer\.claimed_by = \$3/);
    assert.match(statement.text, /SET status = 'released'/);
  }
});

test('restart recovery requeues only a timer still owned by the exact expired lease owner', () => {
  const statement = recoverExpiredTimerClaimsStatement(tenantId, now);

  assert.match(statement.text, /SET status = 'expired'/);
  assert.match(statement.text, /subject_type = 'timer'/);
  assert.match(statement.text, /expires_at <= \$2::timestamptz/);
  assert.match(statement.text, /timer\.claimed_by = expired\.owner_token/);
  assert.match(statement.text, /SET status = 'scheduled', claimed_by = NULL/);
});

test('workflow follow-up key is deterministic and persisted through the timer primitive', () => {
  assert.equal(workflowScheduleKey('wf-1', 'email-2'), 'workflow:wf-1:email-2');
  const statement = scheduleWorkflowFollowUpStatement({
    tenantId,
    workflowKey: 'wf-1',
    stepKey: 'email-2',
    scheduledFor: now,
    metadata: { offlineSafe: true },
  });

  assert.equal(statement.values[1], 'workflow-follow-up');
  assert.equal(statement.values[2], 'workflow:wf-1:email-2');
  assert.deepEqual(JSON.parse(statement.values[4]), {
    offlineSafe: true,
    workflowKey: 'wf-1',
    stepKey: 'email-2',
    durableWorkflowPrimitive: true,
  });
});

test('empty semantic keys fail before SQL is emitted', () => {
  assert.throws(() => workflowScheduleKey('', 'step'), /workflowKey must not be empty/);
  assert.throws(
    () => claimDueTimerStatement({ tenantId, now, ownerToken: '   ', leaseExpiresAt: expiresAt }),
    /ownerToken must not be empty/,
  );
});
