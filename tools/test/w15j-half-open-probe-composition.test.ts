// @ts-expect-error -- cross-service test uses Node 22 built-ins without repository-wide @types/node.
import assert from 'node:assert/strict';
// @ts-expect-error -- cross-service test uses Node 22 built-ins without repository-wide @types/node.
import test from 'node:test';

import type { ActionIntent } from '../../packages/contracts/src/actions/index.js';
import type { Rfc3339Timestamp } from '../../packages/contracts/src/context/index.js';
import type { TenantId } from '../../packages/contracts/src/ids/index.js';
import {
  heartbeatDurableHalfOpenProbe,
  releaseDurableHalfOpenProbe,
  reserveDurableHalfOpenProbe,
  type DurableHalfOpenProbePort,
} from '../../services/executors/src/failure-containment/durable-half-open-probe.js';
import { W03PostgresHalfOpenProbeLease } from '../../services/mobile-gateway/src/physical-host/w03-half-open-probe-lease.js';
import type {
  W03SyncSqlExecutor,
  W03SyncSqlRequest,
} from '../../services/mobile-gateway/src/physical-host/w03-postgres-reservations.js';

const TENANT = 'ten_01ARZ3NDEKTSV4RRFFQ69G5FAV' as TenantId;
const ACTION = 'act_01ARZ3NDEKTSV4RRFFQ69G5FAV' as ActionIntent['actionIntentId'];
const CIRCUIT_KEY = 'provider:device-plane:local';
const NOW = '2026-09-06T00:00:00.000Z' as Rfc3339Timestamp;
const EXPIRY = '2026-09-06T00:00:30.000Z' as Rfc3339Timestamp;
const EXPIRY_MS = String(Date.parse(EXPIRY));

class SequenceSql implements W03SyncSqlExecutor {
  readonly outputs: string[];
  readonly requests: W03SyncSqlRequest[] = [];

  constructor(outputs: string[]) {
    this.outputs = [...outputs];
  }

  query(request: W03SyncSqlRequest): string {
    this.requests.push(request);
    const next = this.outputs.shift();
    if (next === undefined) throw new Error('missing SQL fixture');
    return next;
  }
}

function request() {
  return {
    tenantId: TENANT,
    circuitKey: CIRCUIT_KEY,
    probeActionIntentId: ACTION,
    observedAt: NOW,
    leaseExpiresAt: EXPIRY,
    authorizesExecution: false as const,
  };
}

test('W07 durable probe fence accepts the W03 lease adapter structurally without a production cross-service dependency', () => {
  const sql = new SequenceSql([
    `ACQUIRED\t${ACTION}\tw07-half-open-probe\t${ACTION}\tactive\t${EXPIRY_MS}\n`,
    `RENEWED\t${ACTION}\tw07-half-open-probe\t${ACTION}\tactive\t${EXPIRY_MS}\n`,
    `RELEASED\t${ACTION}\tw07-half-open-probe\t${ACTION}\treleased\n`,
  ]);
  const adapter: DurableHalfOpenProbePort = new W03PostgresHalfOpenProbeLease(sql);

  const reserved = reserveDurableHalfOpenProbe(request(), adapter);
  assert.equal(reserved.ok, true);
  if (!reserved.ok) throw new Error('reserve should pass');
  assert.equal(reserved.disposition, 'ACQUIRED');

  const renewed = heartbeatDurableHalfOpenProbe(request(), adapter);
  assert.equal(renewed.ok, true);
  if (!renewed.ok) throw new Error('heartbeat should pass');
  assert.equal(renewed.disposition, 'RENEWED');

  const released = releaseDurableHalfOpenProbe(
    {
      tenantId: TENANT,
      circuitKey: CIRCUIT_KEY,
      probeActionIntentId: ACTION,
      observedAt: NOW,
      authorizesExecution: false,
    },
    adapter,
  );
  assert.equal(released.ok, true);
  if (!released.ok) throw new Error('release should pass');
  assert.equal(released.disposition, 'RELEASED');

  for (const result of [reserved, renewed, released]) {
    assert.equal(result.authorizesExecution, false);
    assert.equal(result.provesExecutionSuccess, false);
    assert.equal(result.retryAuthorized, false);
  }
  assert.equal(sql.requests.length, 3);
});
