// @ts-expect-error -- executor harness has no @types/node; Node 22 provides this built-in.
import assert from 'node:assert/strict';
// @ts-expect-error -- executor harness has no @types/node; Node 22 provides this built-in.
import test from 'node:test';

import type { ActionIntent } from '@aurora/contracts/actions';
import type { Rfc3339Timestamp, TenantContext } from '@aurora/contracts/context';
import type { ContractVersion } from '@aurora/contracts/versioning';
import { circuitProbeLeaseKey } from '@aurora/workflow';

import {
  createInMemoryW03LeaseExecutor,
  createW03HalfOpenProbeFenceAdapter,
} from '../src/failure-containment/index.js';
import type { W03LeaseRow } from '../src/failure-containment/index.js';

const version = '1.0.0' as ContractVersion;
const tenantId = 'ten_01K0M0M0M0M0M0M0M0M0M0M0M0' as TenantContext['tenantId'];
const otherTenantId = 'ten_02K0M0M0M0M0M0M0M0M0M0M0M0' as TenantContext['tenantId'];
const probeOwner1 = 'ain_01K0M0M0M0M0M0M0M0M0M0M001' as ActionIntent['actionIntentId'];
const probeOwner2 = 'ain_01K0M0M0M0M0M0M0M0M0M0M002' as ActionIntent['actionIntentId'];
const targetScope = 'provider:meta-ads:campaign-service';
const now = '2026-09-06T10:00:00.000Z' as Rfc3339Timestamp;

test('circuitProbeLeaseKey creates deterministic tenant-scoped probe lease key', () => {
  const key = circuitProbeLeaseKey(targetScope);
  assert.equal(key, 'circuit:probe:provider:meta-ads:campaign-service');
  assert.throws(() => circuitProbeLeaseKey(''), /targetScope must not be empty/);
});

test('positive HALF_OPEN probe lease acquisition over W03 lease', async () => {
  const adapter = createW03HalfOpenProbeFenceAdapter();
  const result = await adapter.acquireProbeFence({
    schemaVersion: version,
    tenantId,
    targetScope,
    probeActionIntentId: probeOwner1,
    now,
    ttlSeconds: 30,
  });

  assert.equal(result.kind, 'ACQUIRE_PROBE_FENCE_RESULT');
  assert.equal(result.acquired, true);
  assert.equal(result.leaseKey, 'circuit:probe:provider:meta-ads:campaign-service');
  assert.equal(result.probeActionIntentId, probeOwner1);
  assert.equal(result.expiresAt, '2026-09-06T10:00:30.000Z');
  assert.deepEqual(result.reasons, []);
  assert.equal(result.authorizesExecution, false);
});

test('active unexpired HALF_OPEN probe lease cannot be stolen by another owner', async () => {
  const adapter = createW03HalfOpenProbeFenceAdapter();

  const first = await adapter.acquireProbeFence({
    schemaVersion: version,
    tenantId,
    targetScope,
    probeActionIntentId: probeOwner1,
    now,
    ttlSeconds: 30,
  });
  assert.equal(first.acquired, true);

  const stealAttempt = await adapter.acquireProbeFence({
    schemaVersion: version,
    tenantId,
    targetScope,
    probeActionIntentId: probeOwner2,
    now: '2026-09-06T10:00:10.000Z' as Rfc3339Timestamp,
    ttlSeconds: 30,
  });

  assert.equal(stealAttempt.acquired, false);
  assert.equal(stealAttempt.leaseKey, 'circuit:probe:provider:meta-ads:campaign-service');
  assert.equal(stealAttempt.probeActionIntentId, probeOwner2);
  assert.deepEqual(stealAttempt.reasons, ['PROBE_FENCE_ALREADY_ACTIVE']);
  assert.equal(stealAttempt.authorizesExecution, false);
});

test('exact current owner can heartbeat extension on active lease', async () => {
  const adapter = createW03HalfOpenProbeFenceAdapter();

  await adapter.acquireProbeFence({
    schemaVersion: version,
    tenantId,
    targetScope,
    probeActionIntentId: probeOwner1,
    now,
    ttlSeconds: 30,
  });

  const heartbeat = await adapter.heartbeatProbeFence({
    schemaVersion: version,
    tenantId,
    targetScope,
    probeActionIntentId: probeOwner1,
    now: '2026-09-06T10:00:15.000Z' as Rfc3339Timestamp,
    ttlSeconds: 30,
  });

  assert.equal(heartbeat.renewed, true);
  assert.equal(heartbeat.expiresAt, '2026-09-06T10:00:45.000Z');
  assert.deepEqual(heartbeat.reasons, []);
  assert.equal(heartbeat.authorizesExecution, false);
});

test('non-owner heartbeat is rejected with PROBE_FENCE_OWNER_MISMATCH', async () => {
  const adapter = createW03HalfOpenProbeFenceAdapter();

  await adapter.acquireProbeFence({
    schemaVersion: version,
    tenantId,
    targetScope,
    probeActionIntentId: probeOwner1,
    now,
    ttlSeconds: 30,
  });

  const wrongHeartbeat = await adapter.heartbeatProbeFence({
    schemaVersion: version,
    tenantId,
    targetScope,
    probeActionIntentId: probeOwner2,
    now: '2026-09-06T10:00:15.000Z' as Rfc3339Timestamp,
    ttlSeconds: 30,
  });

  assert.equal(wrongHeartbeat.renewed, false);
  assert.deepEqual(wrongHeartbeat.reasons, ['PROBE_FENCE_OWNER_MISMATCH']);
  assert.equal(wrongHeartbeat.authorizesExecution, false);
});

test('exact current owner can release lease; non-owner release is rejected', async () => {
  const adapter = createW03HalfOpenProbeFenceAdapter();

  await adapter.acquireProbeFence({
    schemaVersion: version,
    tenantId,
    targetScope,
    probeActionIntentId: probeOwner1,
    now,
    ttlSeconds: 30,
  });

  const wrongRelease = await adapter.releaseProbeFence({
    schemaVersion: version,
    tenantId,
    targetScope,
    probeActionIntentId: probeOwner2,
    now: '2026-09-06T10:00:10.000Z' as Rfc3339Timestamp,
  });

  assert.equal(wrongRelease.released, false);
  assert.deepEqual(wrongRelease.reasons, ['PROBE_FENCE_OWNER_MISMATCH']);

  const rightRelease = await adapter.releaseProbeFence({
    schemaVersion: version,
    tenantId,
    targetScope,
    probeActionIntentId: probeOwner1,
    now: '2026-09-06T10:00:10.000Z' as Rfc3339Timestamp,
  });

  assert.equal(rightRelease.released, true);
  assert.deepEqual(rightRelease.reasons, []);
  assert.equal(rightRelease.authorizesExecution, false);
});

test('released or expired lease can be reclaimed by a new probe owner', async () => {
  const adapter = createW03HalfOpenProbeFenceAdapter();

  // 1. Acquire then release
  await adapter.acquireProbeFence({
    schemaVersion: version,
    tenantId,
    targetScope,
    probeActionIntentId: probeOwner1,
    now,
    ttlSeconds: 30,
  });

  await adapter.releaseProbeFence({
    schemaVersion: version,
    tenantId,
    targetScope,
    probeActionIntentId: probeOwner1,
    now: '2026-09-06T10:00:05.000Z' as Rfc3339Timestamp,
  });

  const reclaimAfterRelease = await adapter.acquireProbeFence({
    schemaVersion: version,
    tenantId,
    targetScope,
    probeActionIntentId: probeOwner2,
    now: '2026-09-06T10:00:10.000Z' as Rfc3339Timestamp,
    ttlSeconds: 30,
  });
  assert.equal(reclaimAfterRelease.acquired, true);
  assert.equal(reclaimAfterRelease.probeActionIntentId, probeOwner2);

  // 2. Reclaim after expiry
  const reclaimAfterExpiry = await adapter.acquireProbeFence({
    schemaVersion: version,
    tenantId,
    targetScope,
    probeActionIntentId: probeOwner1,
    now: '2026-09-06T10:00:45.000Z' as Rfc3339Timestamp, // after expiresAt of 10:00:40
    ttlSeconds: 30,
  });
  assert.equal(reclaimAfterExpiry.acquired, true);
  assert.equal(reclaimAfterExpiry.probeActionIntentId, probeOwner1);
});

test('tenant isolation ensures distinct tenants have independent probe fences for same target scope', async () => {
  const adapter = createW03HalfOpenProbeFenceAdapter();

  const tenant1Acquire = await adapter.acquireProbeFence({
    schemaVersion: version,
    tenantId,
    targetScope,
    probeActionIntentId: probeOwner1,
    now,
    ttlSeconds: 30,
  });
  assert.equal(tenant1Acquire.acquired, true);

  const tenant2Acquire = await adapter.acquireProbeFence({
    schemaVersion: version,
    tenantId: otherTenantId,
    targetScope,
    probeActionIntentId: probeOwner2,
    now,
    ttlSeconds: 30,
  });
  assert.equal(tenant2Acquire.acquired, true);
});

test('malformed inputs fail closed', async () => {
  const adapter = createW03HalfOpenProbeFenceAdapter();

  const badTime = await adapter.acquireProbeFence({
    schemaVersion: version,
    tenantId,
    targetScope,
    probeActionIntentId: probeOwner1,
    now: 'invalid-date' as Rfc3339Timestamp,
  });
  assert.equal(badTime.acquired, false);
  assert.deepEqual(badTime.reasons, ['INVALID_TIME']);

  const badTenant = await adapter.acquireProbeFence({
    schemaVersion: version,
    tenantId: 'bad-tenant-id' as TenantContext['tenantId'],
    targetScope,
    probeActionIntentId: probeOwner1,
    now,
  });
  assert.equal(badTenant.acquired, false);
  assert.deepEqual(badTenant.reasons, ['INVALID_TENANT_ID']);

  const badScope = await adapter.acquireProbeFence({
    schemaVersion: version,
    tenantId,
    targetScope: '   ',
    probeActionIntentId: probeOwner1,
    now,
  });
  assert.equal(badScope.acquired, false);
  assert.deepEqual(badScope.reasons, ['INVALID_TARGET_SCOPE']);

  const badOwner = await adapter.acquireProbeFence({
    schemaVersion: version,
    tenantId,
    targetScope,
    probeActionIntentId: 'not-an-intent' as ActionIntent['actionIntentId'],
    now,
  });
  assert.equal(badOwner.acquired, false);
  assert.deepEqual(badOwner.reasons, ['INVALID_PROBE_ACTION_INTENT_ID']);

  const badTtl = await adapter.acquireProbeFence({
    schemaVersion: version,
    tenantId,
    targetScope,
    probeActionIntentId: probeOwner1,
    now,
    ttlSeconds: -10,
  });
  assert.equal(badTtl.acquired, false);
  assert.deepEqual(badTtl.reasons, ['INVALID_TTL']);
});

test('probe lease text fields contain only target scope and owner token, no complete circuit/kill-switch snapshot', async () => {
  const store = createInMemoryW03LeaseExecutor();
  const queriedRows: W03LeaseRow[] = [];

  const spyExecutor = {
    async query(stmt: Parameters<typeof store.query>[0]) {
      const rows = await store.query(stmt);
      if (Array.isArray(rows) && rows.length > 0) queriedRows.push(...rows);
      return rows;
    },
  };

  const adapter = createW03HalfOpenProbeFenceAdapter({ leaseExecutor: spyExecutor });

  await adapter.acquireProbeFence({
    schemaVersion: version,
    tenantId,
    targetScope,
    probeActionIntentId: probeOwner1,
    now,
    ttlSeconds: 30,
  });

  assert.equal(queriedRows.length, 1);
  const row = queriedRows[0]!;
  assert.equal(row.tenant_id, tenantId);
  assert.equal(row.lease_key, 'circuit:probe:provider:meta-ads:campaign-service');
  assert.equal(row.owner_token, probeOwner1);
  assert.equal(row.subject_type, 'circuit_probe');
  assert.equal(row.subject_id, targetScope);

  // Invariant check: ensure complete circuit/kill-switch snapshot JSON is NOT stored in any field
  const serializedRow = JSON.stringify(row);
  assert.ok(!serializedRow.includes('consecutiveFailures'));
  assert.ok(!serializedRow.includes('killSwitch'));
  assert.ok(!serializedRow.includes('dependencyHealth'));
});
