import assert from 'node:assert/strict';
import test from 'node:test';

import type {
  W03DurableDeliveryReservationRequest,
  W03DurableDeliveryReservationResult,
} from '../../device-command-delivery/types.js';
import type {
  W03ReceiptIngressCompletionRequest,
  W03ReceiptIngressReservationRequest,
  W03ReceiptIngressReservationResult,
} from '../../device-receipt-ingress/types.js';
import {
  PsqlW03SyncExecutor,
  W03PostgresDeviceReservationAdapter,
  type W03SyncSqlExecutor,
  type W03SyncSqlRequest,
} from '../w03-postgres-reservations.js';

const TENANT = 'ten_01ARZ3NDEKTSV4RRFFQ69G5FAV';
const CORRELATION = 'cor_01ARZ3NDEKTSV4RRFFQ69G5FAV';
const COMMAND = 'cmd_01ARZ3NDEKTSV4RRFFQ69G5FAV';
const EXECUTION = 'exe_01ARZ3NDEKTSV4RRFFQ69G5FAV';
const RECEIPT = 'rcp_01ARZ3NDEKTSV4RRFFQ69G5FAV';

class ScriptedSql implements W03SyncSqlExecutor {
  readonly requests: W03SyncSqlRequest[] = [];
  readonly #handler: (request: W03SyncSqlRequest, index: number) => string;

  constructor(handler: (request: W03SyncSqlRequest, index: number) => string) {
    this.#handler = handler;
  }

  query(request: W03SyncSqlRequest): string {
    this.requests.push(request);
    return this.#handler(request, this.requests.length - 1);
  }
}

function deliveryRequest(
  overrides: Partial<W03DurableDeliveryReservationRequest> = {},
): W03DurableDeliveryReservationRequest {
  return {
    tenantId: TENANT,
    correlationId: CORRELATION,
    commandId: COMMAND,
    executionId: EXECUTION,
    idempotencyKey: 'voice:device:command:1',
    nowMs: 1_788_600_000_000,
    ...overrides,
  } as W03DurableDeliveryReservationRequest;
}

function receiptRequest(
  overrides: Partial<W03ReceiptIngressReservationRequest> = {},
): W03ReceiptIngressReservationRequest {
  return {
    tenantId: TENANT,
    receiptId: RECEIPT,
    commandId: COMMAND,
    executionId: EXECUTION,
    fingerprint: 'receipt-binding|device|generation|digest',
    nowMs: 1_788_600_000_100,
    ...overrides,
  } as W03ReceiptIngressReservationRequest;
}

function deliveryReserve(
  adapter: W03PostgresDeviceReservationAdapter,
  request: W03DurableDeliveryReservationRequest,
): W03DurableDeliveryReservationResult {
  return adapter.reserve(request);
}

function receiptReserve(
  adapter: W03PostgresDeviceReservationAdapter,
  request: W03ReceiptIngressReservationRequest,
): W03ReceiptIngressReservationResult {
  return adapter.reserve(request);
}

test('delivery reserve binds W14-F to the canonical W03 idempotency row', () => {
  const sql = new ScriptedSql((request) => {
    const hash = request.variables.payload_hash;
    assert.match(hash ?? '', /^[0-9a-f]{64}$/u);
    return `RESERVED\tW14_DEVICE_DELIVERY_V1\t${hash}\tinflight\n`;
  });
  const adapter = new W03PostgresDeviceReservationAdapter(sql);

  const result = deliveryReserve(adapter, deliveryRequest());
  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.equal(result.disposition, 'RESERVED');
  assert.match(result.durableReference, /^w03d:[0-9a-f]{64}$/u);
  assert.equal(result.authorizesExecution, false);
  assert.equal(sql.requests.length, 1);
  assert.equal(sql.requests[0]?.variables.tenant_id, TENANT);
  assert.equal(sql.requests[0]?.variables.idempotency_key, 'voice:device:command:1');
  assert.equal(sql.requests[0]?.variables.operation_name, 'W14_DEVICE_DELIVERY_V1');
  assert.match(sql.requests[0]?.sql ?? '', /INSERT INTO w03_idempotency_key/u);
});

test('delivery compatible replay is ALREADY_RESERVED and binding drift conflicts', () => {
  let conflict = false;
  const sql = new ScriptedSql((request) => {
    const hash = request.variables.payload_hash;
    return conflict
      ? `EXISTING\tW14_DEVICE_DELIVERY_V1\t${'f'.repeat(64)}\tinflight\n`
      : `EXISTING\tW14_DEVICE_DELIVERY_V1\t${hash}\tcompleted\n`;
  });
  const adapter = new W03PostgresDeviceReservationAdapter(sql);

  const replay = deliveryReserve(adapter, deliveryRequest());
  assert.equal(replay.ok, true);
  if (replay.ok) assert.equal(replay.disposition, 'ALREADY_RESERVED');

  conflict = true;
  const drift = deliveryReserve(adapter, deliveryRequest());
  assert.deepEqual(drift, {
    ok: false,
    code: 'CONFLICT',
    retryable: false,
    authorizesExecution: false,
  });
});

test('receipt reservation and completion share one W03 durable identity', () => {
  const sql = new ScriptedSql((request, index) => {
    const hash = request.variables.payload_hash;
    if (index === 0) return `RESERVED\tW14_DEVICE_RECEIPT_V1\t${hash}\tinflight\n`;
    return `W14_DEVICE_RECEIPT_V1\t${hash}\tcompleted\n`;
  });
  const adapter = new W03PostgresDeviceReservationAdapter(sql);
  const request = receiptRequest();

  const reserved = receiptReserve(adapter, request);
  assert.equal(reserved.ok, true);
  if (!reserved.ok) return;
  assert.equal(reserved.status, 'inflight');
  assert.match(reserved.durableReference, /^w03r:[0-9a-f]{64}$/u);
  assert.equal(sql.requests[0]?.variables.idempotency_key, `w14g:${RECEIPT}`);

  const completion: W03ReceiptIngressCompletionRequest = {
    ...request,
    durableReference: reserved.durableReference,
    nowMs: request.nowMs + 10,
  };
  const completed = adapter.complete(completion);
  assert.deepEqual(completed, {
    ok: true,
    status: 'completed',
    durableReference: reserved.durableReference,
    authorizesExecution: false,
  });
  assert.match(sql.requests[1]?.sql ?? '', /SET status = 'completed'/u);
});

test('receipt completion fails closed for a foreign durable reference without touching W03', () => {
  const sql = new ScriptedSql(() => {
    throw new Error('must not run');
  });
  const adapter = new W03PostgresDeviceReservationAdapter(sql);
  const result = adapter.complete({
    ...receiptRequest(),
    durableReference: `w03r:${'0'.repeat(64)}`,
  });
  assert.deepEqual(result, {
    ok: false,
    code: 'CONFLICT',
    retryable: false,
    authorizesExecution: false,
  });
  assert.equal(sql.requests.length, 0);
});

test('malformed input and database failure are non-authoritative fail-closed results', () => {
  const malformedSql = new ScriptedSql(() => '');
  const adapter = new W03PostgresDeviceReservationAdapter(malformedSql);
  const malformed = deliveryReserve(adapter, deliveryRequest({ idempotencyKey: 'not allowed space' }));
  assert.deepEqual(malformed, {
    ok: false,
    code: 'MALFORMED',
    retryable: false,
    authorizesExecution: false,
  });
  assert.equal(malformedSql.requests.length, 0);

  const unavailable = new W03PostgresDeviceReservationAdapter({
    query() {
      throw new Error('postgres down');
    },
  });
  const failed = receiptReserve(unavailable, receiptRequest());
  assert.deepEqual(failed, {
    ok: false,
    code: 'UNAVAILABLE',
    retryable: true,
    authorizesExecution: false,
  });
});

test('psql executor keeps database URL out of argv and sanitizes execution failure', () => {
  let observedArgs: readonly string[] = [];
  let observedDatabase: string | undefined;
  const databaseUrl = 'postgresql://physical-user:secret@127.0.0.1/aurora';
  const executor = new PsqlW03SyncExecutor(
    { databaseUrl, psqlBinary: '/usr/bin/psql', timeoutMs: 1_000 },
    (_file, args, options) => {
      observedArgs = args;
      observedDatabase = options.env.PGDATABASE;
      return 'ok';
    },
  );
  assert.equal(
    executor.query({ sql: 'SELECT 1', variables: { tenant_id: TENANT } }),
    'ok',
  );
  assert.equal(observedDatabase, databaseUrl);
  assert.equal(observedArgs.some((value) => value.includes(databaseUrl)), false);
  assert.equal(observedArgs.includes('tenant_id=' + TENANT), true);

  const failing = new PsqlW03SyncExecutor(
    { databaseUrl },
    () => {
      throw new Error(`do not leak ${databaseUrl}`);
    },
  );
  assert.throws(
    () => failing.query({ sql: 'SELECT 1', variables: {} }),
    (error: unknown) =>
      error instanceof Error &&
      error.message === 'W03 Postgres reservation query failed.' &&
      !error.message.includes(databaseUrl),
  );
});
