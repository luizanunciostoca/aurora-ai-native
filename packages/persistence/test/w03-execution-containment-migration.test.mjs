import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

const here = path.dirname(fileURLToPath(import.meta.url));
const migrationPath = path.resolve(
  here,
  '../../../migrations/003_w03_execution_containment_state.sql',
);
const sql = readFileSync(migrationPath, 'utf8');

test('containment migration is additive, tenant-scoped and versioned for CAS', () => {
  assert.match(sql, /CREATE TABLE IF NOT EXISTS w03_execution_containment/);
  assert.match(sql, /PRIMARY KEY \(tenant_id, circuit_key\)/);
  assert.match(sql, /version BIGINT NOT NULL DEFAULT 1 CHECK \(version >= 1\)/);
  assert.match(sql, /updated_at TIMESTAMPTZ NOT NULL/);
  assert.match(sql, /idx_w03_execution_containment_updated/);
  assert.doesNotMatch(sql, /DROP TABLE|DROP COLUMN|ALTER COLUMN/u);
});

test('database constraints encode non-authoritative W07 containment shape only', () => {
  assert.match(sql, /circuit_state IN \('CLOSED', 'OPEN', 'HALF_OPEN'\)/);
  assert.match(sql, /kill_switch_state IN \('INACTIVE', 'ACTIVE'\)/);
  assert.match(sql, /dependency_health IN \('HEALTHY', 'DEGRADED', 'UNAVAILABLE'\)/);
  assert.match(sql, /current_in_flight <= max_in_flight/);
  assert.match(sql, /retry_depth <= max_retry_depth/);
  assert.match(sql, /HALF_OPEN probe ownership remains fenced separately by w03_lease/);
  assert.doesNotMatch(sql, /authorizes_execution|retry_authorized|execution_outcome/u);
});

test('OPEN timestamp invariant and canonical tenant wire format are database-enforced', () => {
  assert.match(sql, /tenant_id ~ '\^ten_\[0-9A-HJKMNP-TV-Z\]\{26\}\$'/);
  assert.match(sql, /circuit_state = 'OPEN' AND opened_at IS NOT NULL/);
  assert.match(sql, /circuit_state <> 'OPEN' AND opened_at IS NULL/);
});
