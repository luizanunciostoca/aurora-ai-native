import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

import { W03_POSTGRES_BASELINE, W03_POSTGRES_TABLES } from '../dist/index.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const migrationPath = path.resolve(here, '../../../migrations/001_w03_postgres_baseline.sql');
const migrationSql = readFileSync(migrationPath, 'utf8');

test('W03 Postgres baseline exports canonical owned tables and ID storage policy', () => {
  assert.deepEqual(W03_POSTGRES_BASELINE.tables, [
    W03_POSTGRES_TABLES.event,
    W03_POSTGRES_TABLES.outbox,
    W03_POSTGRES_TABLES.inbox,
    W03_POSTGRES_TABLES.idempotency,
    W03_POSTGRES_TABLES.timer,
    W03_POSTGRES_TABLES.lease,
  ]);
  assert.ok(W03_POSTGRES_BASELINE.tables.includes('w03_event'));
  assert.equal(W03_POSTGRES_BASELINE.canonicalIdStorage, 'PREFIXED_ULID_TEXT');
  assert.equal(W03_POSTGRES_BASELINE.localSurrogateStorage, 'UUID_LOCAL_ONLY');
  assert.match(W03_POSTGRES_BASELINE.migrationId, /^001_w03_postgres_baseline$/);
});

test('migration defines durable schema, constraints and indexes for the W03 baseline', () => {
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

test('canonical Aurora IDs stay in prefixed-ULID wire format instead of UUID coercion', () => {
  assert.match(
    migrationSql,
    /event_id TEXT PRIMARY KEY CHECK \(event_id ~ '\^evt_\[0-9A-HJKMNP-TV-Z\]\{26\}\$'\)/,
  );
  assert.match(
    migrationSql,
    /tenant_id TEXT NOT NULL CHECK \(tenant_id ~ '\^ten_\[0-9A-HJKMNP-TV-Z\]\{26\}\$'\)/,
  );
  assert.match(
    migrationSql,
    /correlation_id TEXT NOT NULL CHECK \(correlation_id ~ '\^cor_\[0-9A-HJKMNP-TV-Z\]\{26\}\$'\)/,
  );
  assert.match(
    migrationSql,
    /producer_identity_id TEXT NOT NULL CHECK \(producer_identity_id ~ '\^idn_\[0-9A-HJKMNP-TV-Z\]\{26\}\$'\)/,
  );
  assert.doesNotMatch(migrationSql, /event_id UUID/);
  assert.doesNotMatch(migrationSql, /tenant_id UUID/);
  assert.doesNotMatch(migrationSql, /correlation_id UUID/);
});

test('EventEnvelope-required persistence context and tenant-safe references are explicit', () => {
  assert.match(migrationSql, /envelope_kind TEXT NOT NULL DEFAULT 'EVENT'/);
  assert.match(migrationSql, /occurred_at TIMESTAMPTZ NOT NULL/);
  assert.match(migrationSql, /source_service TEXT NOT NULL/);
  assert.match(migrationSql, /schema_version TEXT NOT NULL CHECK \(schema_version ~/);
  assert.match(migrationSql, /FOREIGN KEY \(tenant_id, event_id\)/g);
  assert.match(migrationSql, /REFERENCES w03_event \(tenant_id, event_id\)/g);
});

test('database-local UUID surrogates are restricted to non-canonical W03 records', () => {
  assert.match(migrationSql, /inbox_id UUID PRIMARY KEY DEFAULT gen_random_uuid\(\)/);
  assert.match(migrationSql, /timer_id UUID PRIMARY KEY DEFAULT gen_random_uuid\(\)/);
  assert.match(migrationSql, /lease_id UUID PRIMARY KEY DEFAULT gen_random_uuid\(\)/);
  assert.match(migrationSql, /Database-local surrogate only; not an Aurora canonical ID/);
});
