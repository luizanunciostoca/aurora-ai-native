// @ts-expect-error -- mobile-gateway tests target Node 22 without repository-wide @types/node.
import assert from 'node:assert/strict';
// @ts-expect-error -- mobile-gateway tests target Node 22 without repository-wide @types/node.
import test from 'node:test';

import type { W03SyncSqlExecutor, W03SyncSqlRequest } from '../w03-postgres-reservations.js';
import { W03PostgresExecutionAttemptQuotaSource } from '../w03-attempt-quota-source.js';

const TENANT = 'ten_01ARZ3NDEKTSV4RRFFQ69G5FAV';
const ACTION = 'act_01ARZ3NDEKTSV4RRFFQ69G5FAV';
const EXECUTION = 'exe_01ARZ3NDEKTSV4RRFFQ69G5FAV';
const UPDATED_MS = Date.parse('2026-09-06T05:40:00.000Z');

class FakeSql implements W03SyncSqlExecutor {
  readonly requests: W03SyncSqlRequest[] = [];
  output = '';
  error: Error | null = null;

  query(request: W03SyncSqlRequest): string {
    this.requests.push(request);
    if (this.error !== null) throw this.error;
    return this.output;
  }
}

function row(quotaLimit = '5', quotaUsed = '1'): string {
  return (
    [TENANT, ACTION, EXECUTION, '2', '4', quotaLimit, quotaUsed, '7', String(UPDATED_MS)].join(
      '\t',
    ) + '\n'
  );
}

const lookup = { tenantId: TENANT, actionIntentId: ACTION, executionRef: EXECUTION } as const;

test('reads tenant/action/execution-bound current attempt quota state', () => {
  const sql = new FakeSql();
  sql.output = row();
  const result = new W03PostgresExecutionAttemptQuotaSource(sql).lookup(lookup);
  assert.ok(result);
  assert.equal(result.attemptNumber, 2);
  assert.equal(result.maxAttempts, 4);
  assert.deepEqual(result.quota, { limit: 5, used: 1 });
  assert.equal(result.version, 7);
  assert.equal(result.updatedAt, '2026-09-06T05:40:00.000Z');
  assert.equal(sql.requests.length, 1);
  assert.equal(sql.requests[0]?.variables.tenant_id, TENANT);
  assert.equal(sql.requests[0]?.variables.action_intent_id, ACTION);
  assert.equal(sql.requests[0]?.variables.execution_ref, EXECUTION);
  assert.match(sql.requests[0]?.sql ?? '', /FROM w03_execution_attempt_quota/u);
});

test('preserves optional quota absence without fabricating limits', () => {
  const sql = new FakeSql();
  sql.output = row('-', '-');
  const result = new W03PostgresExecutionAttemptQuotaSource(sql).lookup(lookup);
  assert.ok(result);
  assert.equal(result.quota, undefined);
});

test('missing/malformed rows and database outage fail closed', () => {
  const sql = new FakeSql();
  const source = new W03PostgresExecutionAttemptQuotaSource(sql);
  assert.equal(source.lookup(lookup), null);

  sql.output = `${TENANT}\t${ACTION}\t${EXECUTION}\t0\t4\t-\t-\t1\t${UPDATED_MS}\n`;
  assert.equal(source.lookup(lookup), null);

  sql.output = row('5', '-');
  assert.equal(source.lookup(lookup), null);

  sql.output = row('1', '2');
  assert.equal(source.lookup(lookup), null);

  sql.output = row().replace('\t2\t4\t', '\t5\t4\t');
  assert.equal(source.lookup(lookup), null);

  sql.error = new Error('postgres unavailable');
  assert.equal(source.lookup(lookup), null);
});

test('invalid client-shaped identity is rejected before SQL', () => {
  const sql = new FakeSql();
  const source = new W03PostgresExecutionAttemptQuotaSource(sql);
  assert.equal(source.lookup({ ...lookup, executionRef: 'bad execution ref' }), null);
  assert.equal(source.lookup({ ...lookup, actionIntentId: 'not-an-action' }), null);
  assert.equal(sql.requests.length, 0);
});
