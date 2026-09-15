import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

import {
  W03_DURABLE_STATE_CAS_SQL,
  W03_DURABLE_STATE_LOAD_SQL,
  W03_DURABLE_STATE_MIGRATION_ID,
  W03_DURABLE_STATE_TABLE,
  createW03PostgresDurableStateStore,
  isW03JsonValue,
} from '../dist/index.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const migrationPath = path.resolve(here, '../../../migrations/002_w03_durable_state.sql');
const migrationSql = readFileSync(migrationPath, 'utf8');

const address = {
  tenantId: 'ten_01ARZ3NDEKTSV4RRFFQ69G5FAV',
  namespace: 'aurora.w06.memory-fabric.v1',
  stateKey: 'snapshot',
};

function row(revision, payload) {
  return {
    tenant_id: address.tenantId,
    state_namespace: address.namespace,
    state_key: address.stateKey,
    revision,
    payload,
    created_at: '2026-09-15T02:30:00.000Z',
    updated_at: '2026-09-15T02:30:00.000Z',
  };
}

test('W03 durable state migration is additive, tenant-scoped and revision fenced', () => {
  assert.equal(W03_DURABLE_STATE_TABLE, 'w03_durable_state');
  assert.equal(W03_DURABLE_STATE_MIGRATION_ID, '002_w03_durable_state');
  assert.match(migrationSql, /CREATE TABLE IF NOT EXISTS w03_durable_state/);
  assert.match(migrationSql, /PRIMARY KEY \(tenant_id, state_namespace, state_key\)/);
  assert.match(migrationSql, /revision BIGINT NOT NULL CHECK \(revision > 0\)/);
  assert.match(migrationSql, /payload JSONB NOT NULL/);
  assert.match(migrationSql, /authorit/i);
  assert.doesNotMatch(migrationSql, /DROP TABLE|DROP COLUMN|TRUNCATE/i);
});

test('W03 durable state SQL keeps load tenant-scoped and CAS atomic without blind overwrite', () => {
  assert.match(W03_DURABLE_STATE_LOAD_SQL, /tenant_id = \$1/);
  assert.match(W03_DURABLE_STATE_LOAD_SQL, /state_namespace = \$2/);
  assert.match(W03_DURABLE_STATE_LOAD_SQL, /state_key = \$3/);
  assert.match(W03_DURABLE_STATE_CAS_SQL, /revision = \$5::bigint/);
  assert.match(W03_DURABLE_STATE_CAS_SQL, /ON CONFLICT \(tenant_id, state_namespace, state_key\) DO NOTHING/);
  assert.match(W03_DURABLE_STATE_CAS_SQL, /WHEN payload = \$4::jsonb THEN revision/);
});

test('W03 JSON gate rejects non-durable values and cycles', () => {
  assert.equal(isW03JsonValue({ ok: true, nested: [1, 'two', null] }), true);
  assert.equal(isW03JsonValue(Number.POSITIVE_INFINITY), false);
  assert.equal(isW03JsonValue(new Uint8Array([1, 2])), false);
  assert.equal(isW03JsonValue({ value: undefined }), false);
  const cyclic = {};
  cyclic.self = cyclic;
  assert.equal(isW03JsonValue(cyclic), false);
});

test('W03 Postgres store loads a single matching record and remains non-authoritative', async () => {
  const calls = [];
  const executor = {
    async query(sql, parameters) {
      calls.push({ sql, parameters });
      return { rows: [row('3', { kind: 'snapshot', revision: 7 })] };
    },
  };
  const store = createW03PostgresDurableStateStore(executor);
  const loaded = await store.load(address);

  assert.equal(loaded?.revision, 3);
  assert.deepEqual(loaded?.payload, { kind: 'snapshot', revision: 7 });
  assert.equal(loaded?.authorizesExecution, false);
  assert.deepEqual(calls[0]?.parameters, [address.tenantId, address.namespace, address.stateKey]);
});

test('W03 compare-and-swap distinguishes applied and unchanged writes', async () => {
  const responses = [
    { rows: [row(1, { value: 'first' })] },
    { rows: [row(1, { value: 'first' })] },
  ];
  const executor = {
    async query() {
      return responses.shift() ?? { rows: [] };
    },
  };
  const store = createW03PostgresDurableStateStore(executor);

  const created = await store.compareAndSwap({
    ...address,
    expectedRevision: 0,
    payload: { value: 'first' },
  });
  assert.equal(created.status, 'APPLIED');
  assert.equal(created.authorizesExecution, false);
  assert.equal(created.retryAuthorized, false);

  const unchanged = await store.compareAndSwap({
    ...address,
    expectedRevision: 1,
    payload: { value: 'first' },
  });
  assert.equal(unchanged.status, 'UNCHANGED');
});

test('W03 compare-and-swap returns conflict and current revision without auto-retry', async () => {
  const executor = {
    async query(sql) {
      if (sql === W03_DURABLE_STATE_CAS_SQL) return { rows: [] };
      return { rows: [row(4, { value: 'current' })] };
    },
  };
  const store = createW03PostgresDurableStateStore(executor);
  const result = await store.compareAndSwap({
    ...address,
    expectedRevision: 2,
    payload: { value: 'stale-write' },
  });

  assert.deepEqual(result, {
    status: 'CONFLICT',
    currentRevision: 4,
    authorizesExecution: false,
    retryAuthorized: false,
  });
});

test('W03 durable state fails closed for invalid tenant, key and payload', async () => {
  const executor = { async query() { return { rows: [] }; } };
  const store = createW03PostgresDurableStateStore(executor);

  await assert.rejects(
    () => store.load({ ...address, tenantId: 'tenant:alpha' }),
    /W03_DURABLE_STATE_TENANT_INVALID/,
  );
  await assert.rejects(
    () => store.load({ ...address, stateKey: '' }),
    /W03_DURABLE_STATE_KEY_INVALID/,
  );
  await assert.rejects(
    () => store.compareAndSwap({ ...address, expectedRevision: 0, payload: { bad: undefined } }),
    /W03_DURABLE_STATE_PAYLOAD_INVALID/,
  );
});
