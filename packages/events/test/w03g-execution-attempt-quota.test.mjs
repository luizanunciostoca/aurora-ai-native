import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import test from 'node:test';

const require = createRequire(import.meta.url);
const delivery = require('../dist/delivery/index.js');

const tenantA = 'ten_01K0M0M0M0M0M0M0M0M0M0M0M0';
const actionIntentId = 'act_01K0M0M0M0M0M0M0M0M0M0M0M1';
const executionRef = 'exec-ref-1';
const now = '2026-09-06T00:00:00.000Z';

test('select execution-attempt/quota statement binds tenant + ActionIntent + executionRef', () => {
  const statement = delivery.buildSelectExecutionAttemptQuotaStatement({
    tenantId: tenantA,
    actionIntentId,
    executionRef,
  });
  assert.match(statement.text, /FROM w03_execution_attempt_quota/);
  assert.deepEqual(statement.values, [tenantA, actionIntentId, executionRef]);
});

test('select execution-attempt/quota statement rejects empty key fields', () => {
  assert.throws(
    () =>
      delivery.buildSelectExecutionAttemptQuotaStatement({
        tenantId: '',
        actionIntentId,
        executionRef,
      }),
    /tenantId must be non-empty/,
  );
  assert.throws(
    () =>
      delivery.buildSelectExecutionAttemptQuotaStatement({
        tenantId: tenantA,
        actionIntentId,
        executionRef: '',
      }),
    /executionRef must contain 1-256 safe characters/,
  );
});

test('insert execution-attempt/quota statement never fabricates default counters and starts at version 1', () => {
  const statement = delivery.buildInsertExecutionAttemptQuotaStatement({
    tenantId: tenantA,
    actionIntentId,
    executionRef,
    attemptNumber: 1,
    maxAttempts: 5,
    now,
  });
  assert.match(statement.text, /INSERT INTO w03_execution_attempt_quota/);
  assert.match(
    statement.text,
    /ON CONFLICT \(tenant_id, action_intent_id, execution_ref\) DO NOTHING/,
  );
  assert.deepEqual(statement.values, [
    tenantA,
    actionIntentId,
    executionRef,
    1,
    5,
    null,
    null,
    now,
  ]);
});

test('insert execution-attempt/quota statement rejects invalid attempt/quota shapes', () => {
  assert.throws(
    () =>
      delivery.buildInsertExecutionAttemptQuotaStatement({
        tenantId: tenantA,
        actionIntentId,
        executionRef,
        attemptNumber: 0,
        maxAttempts: 5,
        now,
      }),
    /attemptNumber must be a positive integer/,
  );
  assert.throws(
    () =>
      delivery.buildInsertExecutionAttemptQuotaStatement({
        tenantId: tenantA,
        actionIntentId,
        executionRef,
        attemptNumber: 1,
        maxAttempts: 5,
        quotaLimit: 10,
        now,
      }),
    /quotaLimit and quotaUsed must both be present or both be absent/,
  );
});

test('optimistic-concurrency compare-and-swap statement is fenced on the caller-supplied version', () => {
  const statement = delivery.buildCompareAndSwapExecutionAttemptQuotaStatement({
    tenantId: tenantA,
    actionIntentId,
    executionRef,
    attemptNumber: 2,
    maxAttempts: 5,
    quotaLimit: 10,
    quotaUsed: 3,
    now,
    expectedVersion: 1,
  });
  assert.match(statement.text, /SET attempt_number = \$4/);
  assert.match(statement.text, /version = version \+ 1/);
  assert.match(statement.text, /AND version = \$9/);
  assert.deepEqual(statement.values, [tenantA, actionIntentId, executionRef, 2, 5, 10, 3, now, 1]);
});

test('compare-and-swap statement rejects a non-positive-integer expected version', () => {
  assert.throws(
    () =>
      delivery.buildCompareAndSwapExecutionAttemptQuotaStatement({
        tenantId: tenantA,
        actionIntentId,
        executionRef,
        attemptNumber: 2,
        maxAttempts: 5,
        now,
        expectedVersion: 0,
      }),
    /expectedVersion must be a positive integer/,
  );
});

test('compare-and-swap statement rejects a mismatched quota pair', () => {
  assert.throws(
    () =>
      delivery.buildCompareAndSwapExecutionAttemptQuotaStatement({
        tenantId: tenantA,
        actionIntentId,
        executionRef,
        attemptNumber: 2,
        maxAttempts: 5,
        quotaUsed: 3,
        now,
        expectedVersion: 1,
      }),
    /quotaLimit and quotaUsed must both be present or both be absent/,
  );
});
