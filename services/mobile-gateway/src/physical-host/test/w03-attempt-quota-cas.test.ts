// @ts-expect-error -- mobile-gateway tests target Node 22 without repository-wide @types/node.
import assert from 'node:assert/strict';
// @ts-expect-error -- mobile-gateway tests target Node 22 without repository-wide @types/node.
import test from 'node:test';

import { W03PostgresExecutionAttemptQuotaCas } from '../w03-attempt-quota-cas.js';
import type { W03SyncSqlExecutor, W03SyncSqlRequest } from '../w03-postgres-reservations.js';

const TENANT = 'ten_01ARZ3NDEKTSV4RRFFQ69G5FAV';
const ACTION = 'act_01ARZ3NDEKTSV4RRFFQ69G5FAV';
const EXECUTION = 'exe_01ARZ3NDEKTSV4RRFFQ69G5FAV';
const NOW = '2026-09-06T05:40:00.000Z';
const NOW_MS = Date.parse(NOW);

class FakeSql implements W03SyncSqlExecutor {
  readonly requests: W03SyncSqlRequest[] = [];
  output = '';
  throws = false;

  query(request: W03SyncSqlRequest): string {
    this.requests.push(request);
    if (this.throws) throw new Error('database unavailable');
    return this.output;
  }
}

function input(quota = true) {
  return {
    tenantId: TENANT,
    actionIntentId: ACTION,
    executionRef: EXECUTION,
    attemptNumber: 2,
    maxAttempts: 4,
    ...(quota ? { quotaLimit: 5, quotaUsed: 2 } : {}),
    now: NOW,
    expectedVersion: 1,
  } as const;
}

test('executes the canonical W03 CAS through bound psql variables', () => {
  const sql = new FakeSql();
  sql.output = `${TENANT}\t${ACTION}\t${EXECUTION}\t2\t4\t5\t2\t2\t${NOW_MS}\n`;
  const result = new W03PostgresExecutionAttemptQuotaCas(sql).compareAndSwap(input());

  assert.ok(result);
  assert.equal(result.attemptNumber, 2);
  assert.deepEqual(result.quota, { limit: 5, used: 2 });
  assert.equal(result.version, 2);
  assert.equal(sql.requests.length, 1);
  const request = sql.requests[0];
  assert.match(request?.sql ?? '', /UPDATE w03_execution_attempt_quota/u);
  assert.match(request?.sql ?? '', /AND version = :'cas_9'/u);
  assert.equal(request?.variables.cas_1, TENANT);
  assert.equal(request?.variables.cas_7, '2');
  assert.equal(request?.variables.cas_9, '1');
  assert.equal((request?.sql ?? '').includes(`'${TENANT}'`), false);
});

test('preserves canonical null quota parameters without fabricating quota', () => {
  const sql = new FakeSql();
  sql.output = `${TENANT}\t${ACTION}\t${EXECUTION}\t2\t4\t-\t-\t2\t${NOW_MS}\n`;
  const result = new W03PostgresExecutionAttemptQuotaCas(sql).compareAndSwap(input(false));

  assert.ok(result);
  assert.equal(result.quota, undefined);
  assert.match(sql.requests[0]?.sql ?? '', /quota_limit = NULL/u);
  assert.match(sql.requests[0]?.sql ?? '', /quota_used = NULL/u);
  assert.equal(sql.requests[0]?.variables.cas_6, undefined);
  assert.equal(sql.requests[0]?.variables.cas_7, undefined);
});

test('builder rejection outage conflict and malformed rows fail closed', () => {
  const sql = new FakeSql();
  const store = new W03PostgresExecutionAttemptQuotaCas(sql);

  assert.equal(store.compareAndSwap({ ...input(), expectedVersion: 0 }), null);
  assert.equal(store.compareAndSwap({ ...input(), tenantId: 'tenant-from-android' }), null);
  assert.equal(store.compareAndSwap({ ...input(), quotaUsed: 6 }), null);
  assert.equal(sql.requests.length, 0);

  assert.equal(store.compareAndSwap(input()), null);
  sql.output = 'not-a-row\n';
  assert.equal(store.compareAndSwap(input()), null);
  sql.throws = true;
  assert.equal(store.compareAndSwap(input()), null);
});
