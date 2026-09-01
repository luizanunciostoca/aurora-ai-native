import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

import { W03_POSTGRES_BASELINE, W03_POSTGRES_TABLES } from '../dist/index.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const migrationPath = path.resolve(here, '../../../migrations/001_w03_postgres_baseline.sql');
const migrationSql = readFileSync(migrationPath, 'utf8');

test('W03 Postgres baseline exports canonical owned tables', () => {
  assert.deepEqual(W03_POSTGRES_BASELINE.tables, [
    W03_POSTGRES_TABLES.event,
    W03_POSTGRES_TABLES.outbox,
    W03_POSTGRES_TABLES.inbox,
    W03_POSTGRES_TABLES.idempotency,
    W03_POSTGRES_TABLES.timer,
    W03_POSTGRES_TABLES.lease,
  ]);
  assert.ok(W03_POSTGRES_BASELINE.tables.includes('w03_event'));
  assert.match(W03_POSTGRES_BASELINE.migrationId, /^001_w03_postgres_baseline$/);
});

test('migration file defines durable schema, constraints and indexes for the W03 baseline', () => {
  for (const tableName of Object.values(W03_POSTGRES_TABLES)) {
    assert.match(migrationSql, new RegExp(`CREATE TABLE IF NOT EXISTS ${tableName}`));
  }

  assert.match(migrationSql, /CREATE TYPE w03_event_status AS ENUM/);
  assert.match(migrationSql, /CREATE INDEX IF NOT EXISTS idx_w03_event_tenant_status_next_attempt/);
  assert.match(migrationSql, /CREATE INDEX IF NOT EXISTS idx_w03_event_outbox_claim/);
  assert.match(migrationSql, /CREATE INDEX IF NOT EXISTS idx_w03_lease_tenant_key_expiry/);
  assert.match(migrationSql, /COMMENT ON TABLE w03_event/);
  assert.match(migrationSql, /PRIMARY KEY \(tenant_id, idempotency_key\)/);
});
