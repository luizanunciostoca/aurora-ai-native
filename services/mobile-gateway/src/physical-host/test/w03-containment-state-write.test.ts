// @ts-expect-error -- mobile-gateway tests target Node 22 without repository-wide @types/node.
import assert from 'node:assert/strict';
// @ts-expect-error -- mobile-gateway tests target Node 22 without repository-wide @types/node.
import test from 'node:test';

import type { Rfc3339Timestamp } from '@aurora/contracts/context';
import type { TenantId } from '@aurora/contracts/ids';

import type { W03SyncSqlExecutor, W03SyncSqlRequest } from '../w03-postgres-reservations.js';
import { W03PostgresContainmentStateStore } from '../w03-containment-state-write.js';

const TENANT = 'ten_01ARZ3NDEKTSV4RRFFQ69G5FAV' as TenantId;
const CIRCUIT = 'device:camera:local';
const UPDATED = '2026-09-06T00:30:00.000Z' as Rfc3339Timestamp;
const KILL_CHANGED = '2026-09-06T00:29:59.000Z' as Rfc3339Timestamp;

class FakeSql implements W03SyncSqlExecutor {
  readonly requests: W03SyncSqlRequest[] = [];
  outputs: string[] = [];
  error: Error | null = null;

  query(request: W03SyncSqlRequest): string {
    this.requests.push(request);
    if (this.error !== null) throw this.error;
    return this.outputs.shift() ?? '';
  }
}

function request() {
  return {
    tenantId: TENANT,
    circuitKey: CIRCUIT,
    state: {
      circuit: { state: 'CLOSED' as const, consecutiveFailures: 0 },
      killSwitch: { state: 'INACTIVE' as const, changedAt: KILL_CHANGED },
      dependencyHealth: 'HEALTHY' as const,
      cancellationRequested: false,
      currentInFlight: 0,
      maxInFlight: 2,
      retryDepth: 0,
      maxRetryDepth: 2,
    },
    updatedAt: UPDATED,
    authorizesExecution: false as const,
  };
}

test('explicitly initializes one containment row without authority semantics', () => {
  const sql = new FakeSql();
  sql.outputs.push('INITIALIZED\t1\n');
  const store = new W03PostgresContainmentStateStore(sql);
  const result = store.initialize(request());
  assert.deepEqual(result, {
    ok: true,
    disposition: 'INITIALIZED',
    version: 1,
    authorizesExecution: false,
    provesExecutionSuccess: false,
    retryAuthorized: false,
  });
  assert.equal(sql.requests.length, 1);
  assert.match(sql.requests[0]?.sql ?? '', /ON CONFLICT \(tenant_id, circuit_key\) DO NOTHING/u);
  assert.match(sql.requests[0]?.sql ?? '', /NULLIF\(:'opened_at_ms', '-'\)::double precision/u);
  assert.equal(sql.requests[0]?.variables.tenant_id, TENANT);
  assert.equal(sql.requests[0]?.variables.circuit_key, CIRCUIT);
});

test('existing initialization fails closed rather than overwriting state', () => {
  const sql = new FakeSql();
  sql.outputs.push('EXISTS\t7\n');
  const result = new W03PostgresContainmentStateStore(sql).initialize(request());
  assert.deepEqual(result, {
    ok: false,
    code: 'ALREADY_EXISTS',
    currentVersion: 7,
    authorizesExecution: false,
    provesExecutionSuccess: false,
    retryAuthorized: false,
  });
});

test('CAS advances exactly one version and binds the expected version in SQL', () => {
  const sql = new FakeSql();
  sql.outputs.push('UPDATED\t5\n');
  const result = new W03PostgresContainmentStateStore(sql).compareAndSet({
    ...request(),
    expectedVersion: 4,
  });
  assert.equal(result.ok, true);
  if (!result.ok) throw new Error('CAS should update');
  assert.equal(result.version, 5);
  assert.equal(result.retryAuthorized, false);
  assert.equal(sql.requests[0]?.variables.expected_version, '4');
  assert.match(sql.requests[0]?.sql ?? '', /AND version = \(:'expected_version'\)::bigint/u);
  assert.match(sql.requests[0]?.sql ?? '', /SET version = version \+ 1/u);
  assert.match(sql.requests[0]?.sql ?? '', /NULLIF\(:'opened_at_ms', '-'\)::double precision/u);
});

test('stale competing CAS reports the current version and never retries itself', () => {
  const sql = new FakeSql();
  sql.outputs.push('CONFLICT\t9\n');
  const result = new W03PostgresContainmentStateStore(sql).compareAndSet({
    ...request(),
    expectedVersion: 4,
  });
  assert.deepEqual(result, {
    ok: false,
    code: 'VERSION_CONFLICT',
    currentVersion: 9,
    authorizesExecution: false,
    provesExecutionSuccess: false,
    retryAuthorized: false,
  });
  assert.equal(sql.requests.length, 1);
});

test('malformed state, invalid version and database outage fail before any implicit defaults', () => {
  const malformedSql = new FakeSql();
  const malformed = new W03PostgresContainmentStateStore(malformedSql).initialize({
    ...request(),
    state: { ...request().state, currentInFlight: 3, maxInFlight: 2 },
  });
  assert.equal(malformed.ok, false);
  if (malformed.ok) throw new Error('malformed state must fail');
  assert.equal(malformed.code, 'MALFORMED');
  assert.equal(malformedSql.requests.length, 0);

  const invalidVersion = new W03PostgresContainmentStateStore(malformedSql).compareAndSet({
    ...request(),
    expectedVersion: 0,
  });
  assert.equal(invalidVersion.ok, false);
  if (invalidVersion.ok) throw new Error('invalid version must fail');
  assert.equal(invalidVersion.code, 'MALFORMED');

  const outageSql = new FakeSql();
  outageSql.error = new Error('postgres down');
  const outage = new W03PostgresContainmentStateStore(outageSql).compareAndSet({
    ...request(),
    expectedVersion: 1,
  });
  assert.equal(outage.ok, false);
  if (outage.ok) throw new Error('outage must fail');
  assert.equal(outage.code, 'UNAVAILABLE');
});

test('OPEN state requires openedAt and kill-switch change cannot be after row update', () => {
  const sql = new FakeSql();
  const store = new W03PostgresContainmentStateStore(sql);
  const missingOpened = store.initialize({
    ...request(),
    state: {
      ...request().state,
      circuit: { state: 'OPEN', consecutiveFailures: 2 },
    },
  });
  assert.equal(missingOpened.ok, false);

  const futureKill = store.initialize({
    ...request(),
    state: {
      ...request().state,
      killSwitch: { state: 'ACTIVE', changedAt: '2026-09-06T00:31:00.000Z' as Rfc3339Timestamp },
    },
  });
  assert.equal(futureKill.ok, false);
  assert.equal(sql.requests.length, 0);
});
