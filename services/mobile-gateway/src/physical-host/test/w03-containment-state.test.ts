// @ts-expect-error -- mobile-gateway tests target Node 22 without repository-wide @types/node.
import assert from 'node:assert/strict';
// @ts-expect-error -- mobile-gateway tests target Node 22 without repository-wide @types/node.
import test from 'node:test';

import type { Rfc3339Timestamp } from '@aurora/contracts/context';
import type { TenantId } from '@aurora/contracts/ids';

import type { W03SyncSqlExecutor, W03SyncSqlRequest } from '../w03-postgres-reservations.js';
import { W03PostgresCurrentContainmentStateSource } from '../w03-containment-state.js';

const TENANT = 'ten_01ARZ3NDEKTSV4RRFFQ69G5FAV' as TenantId;
const CIRCUIT = 'device:camera:local';
const EVALUATED_AT = '2026-09-06T00:30:00.000Z' as Rfc3339Timestamp;
const UPDATED_MS = Date.parse('2026-09-06T00:29:59.000Z');
const KILL_CHANGED_MS = Date.parse('2026-09-06T00:29:58.000Z');
const OPENED_MS = Date.parse('2026-09-06T00:29:50.000Z');
const PROBE = 'act_01ARZ3NDEKTSV4RRFFQ69G5FAV';

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

function row(input: {
  circuitState?: 'CLOSED' | 'OPEN' | 'HALF_OPEN';
  openedAt?: number | null;
  probe?: string | null;
  version?: number;
  updatedAt?: number;
} = {}): string {
  const circuitState = input.circuitState ?? 'CLOSED';
  const openedAt = input.openedAt === undefined ? null : input.openedAt;
  const probe = input.probe ?? null;
  return [
    String(input.version ?? 4),
    circuitState,
    '2',
    openedAt === null ? '-' : String(openedAt),
    'INACTIVE',
    String(KILL_CHANGED_MS),
    'HEALTHY',
    '0',
    '0',
    '2',
    '0',
    '2',
    String(input.updatedAt ?? UPDATED_MS),
    probe === null ? '0' : '1',
    probe ?? '-',
  ].join('\t') + '\n';
}

const lookup = { tenantId: TENANT, circuitKey: CIRCUIT, evaluatedAt: EVALUATED_AT };

test('reads current CLOSED state and binds query to tenant/circuit plus canonical lease key', () => {
  const sql = new FakeSql();
  sql.output = row();
  const source = new W03PostgresCurrentContainmentStateSource(sql);
  const result = source.resolveCurrent(lookup);
  assert.ok(result);
  assert.equal(result.version, 4);
  assert.equal(result.snapshot.circuit.state, 'CLOSED');
  assert.equal(result.snapshot.circuit.halfOpenProbeInFlight, false);
  assert.equal(result.authorizesExecution, false);

  assert.equal(sql.requests.length, 1);
  const request = sql.requests[0];
  assert.ok(request);
  assert.equal(request.variables.tenant_id, TENANT);
  assert.equal(request.variables.circuit_key, CIRCUIT);
  assert.equal(request.variables.lease_key, `w07g:half-open:${CIRCUIT}`);
  assert.match(request.sql, /FROM w03_execution_containment/u);
  assert.match(request.sql, /LEFT JOIN w03_lease/u);
});

test('projects active HALF_OPEN probe only from the separate lease row', () => {
  const sql = new FakeSql();
  sql.output = row({ circuitState: 'HALF_OPEN', probe: PROBE });
  const result = new W03PostgresCurrentContainmentStateSource(sql).resolveCurrent(lookup);
  assert.ok(result);
  assert.equal(result.snapshot.circuit.state, 'HALF_OPEN');
  assert.equal(result.snapshot.circuit.halfOpenProbeInFlight, true);
  assert.equal(result.snapshot.circuit.halfOpenProbeActionIntentId, PROBE);
});

test('preserves OPEN openedAt and rejects malformed OPEN row without timestamp', () => {
  const sql = new FakeSql();
  const source = new W03PostgresCurrentContainmentStateSource(sql);
  sql.output = row({ circuitState: 'OPEN', openedAt: OPENED_MS });
  const valid = source.resolveCurrent(lookup);
  assert.ok(valid);
  assert.equal(valid.snapshot.circuit.openedAt, new Date(OPENED_MS).toISOString());

  sql.output = row({ circuitState: 'OPEN', openedAt: null });
  assert.equal(source.resolveCurrent(lookup), null);
});

test('rejects foreign/malformed probe owner, future state and database outage', () => {
  const sql = new FakeSql();
  const source = new W03PostgresCurrentContainmentStateSource(sql);

  sql.output = row({ circuitState: 'HALF_OPEN', probe: 'not-an-action-intent' });
  assert.equal(source.resolveCurrent(lookup), null);

  sql.output = row({ updatedAt: Date.parse('2026-09-06T00:31:00.000Z') });
  assert.equal(source.resolveCurrent(lookup), null);

  sql.error = new Error('database unavailable');
  assert.equal(source.resolveCurrent(lookup), null);
});

test('invalid tenant/circuit/time fails before SQL', () => {
  const sql = new FakeSql();
  const source = new W03PostgresCurrentContainmentStateSource(sql);
  assert.equal(source.resolveCurrent({ ...lookup, circuitKey: 'bad circuit key' }), null);
  assert.equal(
    source.resolveCurrent({ ...lookup, evaluatedAt: 'not-a-time' as Rfc3339Timestamp }),
    null,
  );
  assert.equal(sql.requests.length, 0);
});
