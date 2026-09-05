// @ts-expect-error -- mobile-gateway harness uses Node 22 built-ins without repository-wide @types/node.
import assert from 'node:assert/strict';
// @ts-expect-error -- mobile-gateway harness uses Node 22 built-ins without repository-wide @types/node.
import test from 'node:test';

import type { TenantId } from '@aurora/contracts/ids';

import {
  W03PostgresExecutionIdempotencyFence,
  type LocalW07IdempotencyFenceRequest,
} from '../w03-execution-fence.js';
import type { W03SyncSqlExecutor, W03SyncSqlRequest } from '../w03-postgres-reservations.js';

const HASH = 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';
const REQUEST: LocalW07IdempotencyFenceRequest = {
  tenantId: 'ten_01ARZ3NDEKTSV4RRFFQ69G5FAV' as TenantId,
  key: 'voice:camera:open:1',
  operationName: 'camera.open:OPEN_CAMERA',
  canonicalPayloadHash: `sha256:${HASH}`,
};

class Sql implements W03SyncSqlExecutor {
  calls: W03SyncSqlRequest[] = [];
  output = `RESERVED\t${REQUEST.operationName}\t${HASH}\tinflight`;
  failure: Error | null = null;

  query(request: W03SyncSqlRequest): string {
    this.calls.push(request);
    if (this.failure !== null) throw this.failure;
    return this.output;
  }
}

test('new W07 business idempotency key reserves in the canonical W03 table', () => {
  const sql = new Sql();
  const fence = new W03PostgresExecutionIdempotencyFence(sql);
  assert.deepEqual(fence.reserve(REQUEST), { kind: 'RESERVED' });
  assert.equal(sql.calls.length, 1);
  assert.deepEqual(sql.calls[0]?.variables, {
    tenant_id: REQUEST.tenantId,
    idempotency_key: REQUEST.key,
    operation_name: REQUEST.operationName,
    payload_hash: HASH,
  });
  assert.equal(sql.calls[0]?.sql.includes('w03_idempotency_key'), true);
});

test('existing W03 lifecycle maps to inflight replay-completed or conflict without retry authority', () => {
  const sql = new Sql();
  const fence = new W03PostgresExecutionIdempotencyFence(sql);

  for (const status of ['accepted', 'inflight'] as const) {
    sql.output = `EXISTING\t${REQUEST.operationName}\t${HASH}\t${status}`;
    assert.deepEqual(fence.reserve(REQUEST), { kind: 'INFLIGHT' });
  }

  sql.output = `EXISTING\t${REQUEST.operationName}\t${HASH}\tcompleted`;
  assert.deepEqual(fence.reserve(REQUEST), { kind: 'REPLAY_COMPLETED' });

  sql.output = `EXISTING\t${REQUEST.operationName}\t${HASH}\trejected`;
  assert.deepEqual(fence.reserve(REQUEST), {
    kind: 'CONFLICT',
    reason: 'REJECTED_PRIOR_RESERVATION',
  });
});

test('operation or payload binding drift fails closed as conflict', () => {
  const sql = new Sql();
  const fence = new W03PostgresExecutionIdempotencyFence(sql);

  sql.output = `EXISTING\tother.operation\t${HASH}\tinflight`;
  assert.deepEqual(fence.reserve(REQUEST), { kind: 'CONFLICT', reason: 'BINDING_CONFLICT' });

  sql.output = `EXISTING\t${REQUEST.operationName}\t${'b'.repeat(64)}\tinflight`;
  assert.deepEqual(fence.reserve(REQUEST), { kind: 'CONFLICT', reason: 'BINDING_CONFLICT' });
});

test('malformed request fails before SQL and raw sha256 prefix is never stored in CHAR(64)', () => {
  const sql = new Sql();
  const fence = new W03PostgresExecutionIdempotencyFence(sql);
  const result = fence.reserve({ ...REQUEST, canonicalPayloadHash: HASH });
  assert.deepEqual(result, { kind: 'CONFLICT', reason: 'MALFORMED_REQUEST' });
  assert.equal(sql.calls.length, 0);
});

test('W03 outage and malformed SQL response throw sanitized fail-closed errors for W07-C', () => {
  const sql = new Sql();
  const fence = new W03PostgresExecutionIdempotencyFence(sql);
  sql.failure = new Error('postgresql://secret@example.invalid leaked');
  assert.throws(() => fence.reserve(REQUEST), /reservation unavailable/u);

  sql.failure = null;
  sql.output = 'garbled';
  assert.throws(() => fence.reserve(REQUEST), /protocol violation/u);
});
