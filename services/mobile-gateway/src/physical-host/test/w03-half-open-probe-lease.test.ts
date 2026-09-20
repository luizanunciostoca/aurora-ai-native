// @ts-expect-error -- mobile-gateway tests use Node 22 built-ins without repository-wide @types/node.
import assert from 'node:assert/strict';
// @ts-expect-error -- mobile-gateway tests use Node 22 built-ins without repository-wide @types/node.
import test from 'node:test';

import type { Rfc3339Timestamp } from '@aurora/contracts/context';
import type { TenantId } from '@aurora/contracts/ids';

import type { W03SyncSqlRequest, W03SyncSqlExecutor } from '../w03-postgres-reservations.js';
import { W03PostgresHalfOpenProbeLease } from '../w03-half-open-probe-lease.js';

const TENANT = 'ten_01ARZ3NDEKTSV4RRFFQ69G5FAV' as TenantId;
const ACTION = 'act_01ARZ3NDEKTSV4RRFFQ69G5FAV';
const OTHER_ACTION = 'act_01ARZ3NDEKTSV4RRFFQ69G5FAW';
const CIRCUIT_KEY = 'provider:device-plane:local';
const NOW = '2026-09-06T00:00:00.000Z' as Rfc3339Timestamp;
const EXPIRY = '2026-09-06T00:00:30.000Z' as Rfc3339Timestamp;
const EXPIRY_MS = String(Date.parse(EXPIRY));

class FakeSql implements W03SyncSqlExecutor {
  readonly requests: W03SyncSqlRequest[] = [];
  outputs: string[] = [];
  error: Error | null = null;

  query(request: W03SyncSqlRequest): string {
    this.requests.push(request);
    if (this.error !== null) throw this.error;
    const next = this.outputs.shift();
    if (next === undefined) throw new Error('missing fake SQL output');
    return next;
  }
}

function acquireInput() {
  return {
    tenantId: TENANT,
    circuitKey: CIRCUIT_KEY,
    probeActionIntentId: ACTION,
    observedAt: NOW,
    leaseExpiresAt: EXPIRY,
    authorizesExecution: false as const,
  };
}

function releaseInput() {
  return {
    tenantId: TENANT,
    circuitKey: CIRCUIT_KEY,
    probeActionIntentId: ACTION,
    observedAt: NOW,
    authorizesExecution: false as const,
  };
}

function row(
  disposition: 'ACQUIRED' | 'ALREADY_OWNED' | 'OWNED_BY_OTHER' | 'RENEWED',
  owner = ACTION,
): string {
  return `${disposition}\t${owner}\tw07-half-open-probe\t${owner}\tactive\t${EXPIRY_MS}\n`;
}

test('acquires one tenant-scoped W03 HALF_OPEN lease with canonical ActionIntent ownership', () => {
  const sql = new FakeSql();
  sql.outputs.push(row('ACQUIRED'));
  const adapter = new W03PostgresHalfOpenProbeLease(sql);

  const result = adapter.reserve(acquireInput());
  assert.equal(result.ok, true);
  if (!result.ok) throw new Error('lease should be acquired');
  assert.equal(result.disposition, 'ACQUIRED');
  assert.equal(result.probeActionIntentId, ACTION);
  assert.equal(result.expiresAt, EXPIRY);
  assert.equal(result.authorizesExecution, false);
  assert.equal(result.provesExecutionSuccess, false);
  assert.equal(result.retryAuthorized, false);

  assert.equal(sql.requests.length, 1);
  const request = sql.requests[0];
  assert.ok(request);
  assert.equal(request.variables.tenant_id, TENANT);
  assert.equal(request.variables.lease_key, `w07g:half-open:${CIRCUIT_KEY}`);
  assert.equal(request.variables.owner_token, ACTION);
  assert.equal(request.variables.subject_type, 'w07-half-open-probe');
  assert.equal(request.variables.subject_id, ACTION);
  assert.match(request.sql, /ON CONFLICT \(tenant_id, lease_key\) DO UPDATE/u);
  assert.match(request.sql, /w03_lease\.expires_at <=/u);
  assert.match(request.sql, /WHEN owner_token = :'owner_token'/u);
});

test('same owner is idempotent while competing active owner is rejected', () => {
  const sql = new FakeSql();
  sql.outputs.push(row('ALREADY_OWNED'), row('OWNED_BY_OTHER', OTHER_ACTION));
  const adapter = new W03PostgresHalfOpenProbeLease(sql);

  const same = adapter.reserve(acquireInput());
  assert.equal(same.ok, true);
  if (!same.ok) throw new Error('same owner should be idempotent');
  assert.equal(same.disposition, 'ALREADY_OWNED');

  const competing = adapter.reserve(acquireInput());
  assert.equal(competing.ok, false);
  if (competing.ok) throw new Error('competing owner must be rejected');
  assert.equal(competing.code, 'OWNED_BY_OTHER');
  assert.equal(competing.retryAuthorized, false);
});

test('concurrent conflict uses one read-only observation and never repeats acquire', () => {
  const sql = new FakeSql();
  sql.outputs.push('', row('OWNED_BY_OTHER', OTHER_ACTION));
  const result = new W03PostgresHalfOpenProbeLease(sql).reserve(acquireInput());

  assert.equal(result.ok, false);
  if (result.ok) throw new Error('concurrent competing owner must remain closed');
  assert.equal(result.code, 'OWNED_BY_OTHER');
  assert.equal(sql.requests.length, 2);
  assert.match(sql.requests[0]?.sql ?? '', /INSERT INTO w03_lease/u);
  assert.doesNotMatch(sql.requests[1]?.sql ?? '', /INSERT|UPDATE|DELETE/u);
  assert.match(sql.requests[1]?.sql ?? '', /SELECT/u);
  assert.deepEqual(sql.requests[1]?.variables, sql.requests[0]?.variables);
});

test('heartbeat extends only an exact current unexpired owner', () => {
  const sql = new FakeSql();
  sql.outputs.push(
    row('RENEWED'),
    `NOT_CURRENT_OWNER\t${OTHER_ACTION}\tw07-half-open-probe\t${OTHER_ACTION}\tactive\t${EXPIRY_MS}\n`,
  );
  const adapter = new W03PostgresHalfOpenProbeLease(sql);

  const renewed = adapter.heartbeat(acquireInput());
  assert.equal(renewed.ok, true);
  if (!renewed.ok) throw new Error('heartbeat should renew owner');
  assert.equal(renewed.disposition, 'RENEWED');
  assert.equal(renewed.expiresAt, EXPIRY);
  assert.match(sql.requests[0]?.sql ?? '', /owner_token = :'owner_token'/u);
  assert.match(sql.requests[0]?.sql ?? '', /expires_at > to_timestamp/u);

  const notOwner = adapter.heartbeat(acquireInput());
  assert.equal(notOwner.ok, false);
  if (notOwner.ok) throw new Error('foreign heartbeat must fail');
  assert.equal(notOwner.code, 'NOT_CURRENT_OWNER');
});

test('release requires the exact current owner and never authorizes retry', () => {
  const sql = new FakeSql();
  sql.outputs.push(
    `RELEASED\t${ACTION}\tw07-half-open-probe\t${ACTION}\treleased\n`,
    `NOT_CURRENT_OWNER\t${OTHER_ACTION}\tw07-half-open-probe\t${OTHER_ACTION}\tactive\n`,
  );
  const adapter = new W03PostgresHalfOpenProbeLease(sql);

  const released = adapter.release(releaseInput());
  assert.equal(released.ok, true);
  if (!released.ok) throw new Error('owner should release');
  assert.equal(released.disposition, 'RELEASED');
  assert.equal(released.authorizesExecution, false);
  assert.equal(released.provesExecutionSuccess, false);
  assert.equal(released.retryAuthorized, false);
  assert.match(sql.requests[0]?.sql ?? '', /status = 'released'/u);
  assert.match(sql.requests[0]?.sql ?? '', /owner_token = :'owner_token'/u);

  const notOwner = adapter.release(releaseInput());
  assert.equal(notOwner.ok, false);
  if (notOwner.ok) throw new Error('foreign release must fail');
  assert.equal(notOwner.code, 'NOT_CURRENT_OWNER');
});

test('fails closed on malformed timing, database outage and malformed database rows', () => {
  const malformedSql = new FakeSql();
  const malformedAdapter = new W03PostgresHalfOpenProbeLease(malformedSql);
  const malformed = malformedAdapter.reserve({ ...acquireInput(), leaseExpiresAt: NOW });
  assert.equal(malformed.ok, false);
  if (malformed.ok) throw new Error('invalid timing must fail');
  assert.equal(malformed.code, 'MALFORMED');
  assert.equal(malformedSql.requests.length, 0);

  const outageSql = new FakeSql();
  outageSql.error = new Error('postgres unavailable');
  const outage = new W03PostgresHalfOpenProbeLease(outageSql).reserve(acquireInput());
  assert.equal(outage.ok, false);
  if (outage.ok) throw new Error('outage must fail');
  assert.equal(outage.code, 'UNAVAILABLE');

  const protocolSql = new FakeSql();
  protocolSql.outputs.push('ACQUIRED\tgarbage\n');
  const protocol = new W03PostgresHalfOpenProbeLease(protocolSql).reserve(acquireInput());
  assert.equal(protocol.ok, false);
  if (protocol.ok) throw new Error('malformed row must fail');
  assert.equal(protocol.code, 'UNAVAILABLE');
});
