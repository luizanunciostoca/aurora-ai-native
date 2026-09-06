// @ts-expect-error -- executor harness has no @types/node; Node 22 provides this built-in.
import assert from 'node:assert/strict';
// @ts-expect-error -- executor harness has no @types/node; Node 22 provides this built-in.
import test from 'node:test';

import type { TenantId } from '@aurora/contracts';
import type { Rfc3339Timestamp } from '@aurora/contracts/context';

import {
  PostgresContainmentStateStore,
  updateContainmentStateStatement,
  type ContainmentQueryClient,
  type DurableContainmentState,
} from '../src/failure-containment/index.js';

const key = {
  tenantId: 'ten_01ARZ3NDEKTSV4RRFFQ69G5FAV' as TenantId,
  dependencyId: 'provider:meta',
};

function state(version = 1): DurableContainmentState {
  return {
    key,
    snapshot: {
      circuit: { state: 'CLOSED', consecutiveFailures: 0 },
      killSwitch: { state: 'INACTIVE', changedAt: '2026-09-06T00:00:00Z' as Rfc3339Timestamp },
      dependencyHealth: 'HEALTHY',
      cancellationRequested: false,
      currentInFlight: 0,
      maxInFlight: 4,
      retryDepth: 0,
      maxRetryDepth: 3,
    },
    version,
    updatedAt: '2026-09-06T00:00:00Z' as Rfc3339Timestamp,
  };
}

function row(current: DurableContainmentState, version = current.version + 1) {
  return {
    tenant_id: key.tenantId,
    dependency_id: key.dependencyId,
    circuit_state: current.snapshot.circuit.state,
    consecutive_failures: current.snapshot.circuit.consecutiveFailures,
    opened_at: null,
    kill_switch_state: current.snapshot.killSwitch.state,
    kill_switch_changed_at: current.snapshot.killSwitch.changedAt,
    dependency_health: current.snapshot.dependencyHealth,
    cancellation_requested: current.snapshot.cancellationRequested,
    current_in_flight: current.snapshot.currentInFlight,
    max_in_flight: current.snapshot.maxInFlight,
    retry_depth: current.snapshot.retryDepth,
    max_retry_depth: current.snapshot.maxRetryDepth,
    version,
    updated_at: current.updatedAt,
  };
}

test('durable containment updates are tenant-scoped compare-and-set operations', async () => {
  const current = state();
  const statement = updateContainmentStateStatement(current);
  assert.match(statement.text, /AND version = \$15/);
  assert.equal(statement.values[14], 1);

  let attempts = 0;
  const client: ContainmentQueryClient = {
    async query<Row>() {
      attempts += 1;
      return attempts === 1
        ? { rows: [row(current)] as Row[] }
        : { rows: [] as Row[] };
    },
  };
  const store = new PostgresContainmentStateStore(client);

  assert.deepEqual((await store.compareAndSet(current)).status, 'UPDATED');
  assert.deepEqual((await store.compareAndSet(current)).status, 'STALE');
});

test('missing, malformed and unavailable state never becomes a permissive snapshot', async () => {
  const missing = new PostgresContainmentStateStore({
    async query<Row>() {
      return { rows: [] as Row[] };
    },
  });
  assert.deepEqual(await missing.read(key), { status: 'MISSING' });

  const malformed = new PostgresContainmentStateStore({
    async query<Row>() {
      return { rows: [row(state(), 0)] as Row[] };
    },
  });
  assert.deepEqual(await malformed.read(key), { status: 'UNAVAILABLE' });

  const unavailable = new PostgresContainmentStateStore({
    async query<Row>(): Promise<{ rows: Row[] }> {
      throw new Error('database unavailable');
    },
  });
  assert.deepEqual(await unavailable.read(key), { status: 'UNAVAILABLE' });
});
