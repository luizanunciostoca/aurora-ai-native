// @ts-expect-error -- mobile-gateway tests target Node 22 without repository-wide @types/node.
import assert from 'node:assert/strict';
// @ts-expect-error -- mobile-gateway tests target Node 22 without repository-wide @types/node.
import test from 'node:test';

import {
  W03PostgresPhysicalExecutionStateStager,
  type W15JPhysicalExecutionStateSeed,
} from '../w03-physical-execution-state-stage.js';
import type { W03SyncSqlExecutor, W03SyncSqlRequest } from '../w03-postgres-reservations.js';

const TENANT = 'ten_01ARZ3NDEKTSV4RRFFQ69G5FAV';
const ACTION = 'act_01ARZ3NDEKTSV4RRFFQ69G5FAV';
const EXECUTION = 'exe_01ARZ3NDEKTSV4RRFFQ69G5FAV';
const UPDATED_AT = '2026-09-06T10:15:00.000Z';

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

function seed(): W15JPhysicalExecutionStateSeed {
  return {
    tenantId: TENANT,
    actionIntentId: ACTION,
    executionRef: EXECUTION,
    attemptNumber: 1,
    maxAttempts: 3,
    quota: { limit: 10, used: 0 },
    circuitKey: 'device.camera.open',
    containment: {
      circuit: { state: 'CLOSED', consecutiveFailures: 0 },
      killSwitch: { state: 'INACTIVE', changedAt: UPDATED_AT },
      dependencyHealth: 'HEALTHY',
      cancellationRequested: false,
      currentInFlight: 0,
      maxInFlight: 1,
      retryDepth: 0,
      maxRetryDepth: 0,
    },
    updatedAt: UPDATED_AT,
    authorizesExecution: false,
  } as W15JPhysicalExecutionStateSeed;
}

test('stages explicit attempt/quota and containment state in one server-owned SQL call', () => {
  const sql = new FakeSql();
  sql.output = 'STAGED\tCONTAINMENT_INITIALIZED\n';
  const result = new W03PostgresPhysicalExecutionStateStager(sql).stage(seed());

  assert.deepEqual(result, {
    ok: true,
    disposition: 'STAGED',
    containmentDisposition: 'INITIALIZED',
    authorizesExecution: false,
    provesExecutionSuccess: false,
    retryAuthorized: false,
  });
  assert.equal(sql.requests.length, 1);
  const request = sql.requests[0];
  assert.ok(request);
  assert.match(request.sql, /INSERT INTO w03_execution_attempt_quota/u);
  assert.match(request.sql, /INSERT INTO w03_execution_containment/u);
  assert.equal(request.variables.tenant_id, TENANT);
  assert.equal(request.variables.action_intent_id, ACTION);
  assert.equal(request.variables.execution_ref, EXECUTION);
  assert.equal(request.variables.attempt_number, '1');
  assert.equal(request.variables.max_attempts, '3');
  assert.equal(request.variables.quota_limit, '10');
  assert.equal(request.variables.quota_used, '0');
  assert.equal(request.variables.circuit_key, 'device.camera.open');
  assert.equal(request.variables.circuit_state, 'CLOSED');
  assert.equal(request.variables.kill_switch_state, 'INACTIVE');
  assert.equal(request.variables.dependency_health, 'HEALTHY');
});

test('rejects re-staging an existing execution instead of resetting current counters', () => {
  const sql = new FakeSql();
  sql.output = 'ATTEMPT_EXISTS\tCONTAINMENT_NOT_TOUCHED\n';
  const result = new W03PostgresPhysicalExecutionStateStager(sql).stage(seed());
  assert.deepEqual(result, {
    ok: false,
    code: 'ATTEMPT_ALREADY_EXISTS',
    authorizesExecution: false,
    provesExecutionSuccess: false,
    retryAuthorized: false,
  });
});

test('an existing attempt cannot commit a missing containment row', () => {
  const sql = new FakeSql();
  sql.output = 'ATTEMPT_EXISTS\tCONTAINMENT_NOT_TOUCHED\n';
  const result = new W03PostgresPhysicalExecutionStateStager(sql).stage(seed());

  assert.deepEqual(result, {
    ok: false,
    code: 'ATTEMPT_ALREADY_EXISTS',
    authorizesExecution: false,
    provesExecutionSuccess: false,
    retryAuthorized: false,
  });

  const statement = sql.requests[0]?.sql;
  assert.equal(typeof statement, 'string');
  if (statement === undefined) throw new Error('expected staging SQL');
  const containmentInsert = statement.match(/containment_insert AS \([\s\S]*?\n\),?\nSELECT/u)?.[0];
  assert.ok(containmentInsert, 'expected containment_insert CTE');
  assert.match(containmentInsert, /FROM attempt_insert/u);
  assert.doesNotMatch(containmentInsert, /FROM lock_scope/u);
  assert.match(statement, /ELSE 'CONTAINMENT_NOT_TOUCHED'/u);
});

test('rejects malformed trusted seeds before touching durable state', () => {
  const sql = new FakeSql();
  const stager = new W03PostgresPhysicalExecutionStateStager(sql);

  assert.equal(stager.stage({ ...seed(), attemptNumber: 0 }).ok, false);
  assert.equal(stager.stage({ ...seed(), quota: { limit: 10, used: -1 } }).ok, false);
  assert.equal(
    stager.stage({
      ...seed(),
      containment: {
        ...seed().containment,
        circuit: { state: 'OPEN', consecutiveFailures: 1 },
      },
    }).ok,
    false,
  );
  assert.equal(sql.requests.length, 0);
});

test('database outage and malformed SQL disposition fail closed', () => {
  const sql = new FakeSql();
  const stager = new W03PostgresPhysicalExecutionStateStager(sql);
  sql.error = new Error('postgres unavailable');
  assert.equal(stager.stage(seed()).ok, false);

  sql.error = null;
  sql.output = 'unexpected\n';
  assert.deepEqual(stager.stage(seed()), {
    ok: false,
    code: 'UNAVAILABLE',
    authorizesExecution: false,
    provesExecutionSuccess: false,
    retryAuthorized: false,
  });
});
