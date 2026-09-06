// @ts-expect-error -- executor tests target Node 22 without repository-wide @types/node.
import assert from 'node:assert/strict';
// @ts-expect-error -- executor tests target Node 22 without repository-wide @types/node.
import test from 'node:test';

import type { ActionIntent } from '@aurora/contracts/actions';
import type { Rfc3339Timestamp } from '@aurora/contracts/context';
import type { TenantId } from '@aurora/contracts/ids';

import type {
  DurableContainmentStateRecord,
  DurableContainmentStateSource,
} from '../src/failure-containment/durable-containment-state.js';
import {
  transitionDurableCircuit,
  transitionDurableKillSwitch,
  type DurableContainmentCompareAndSetRequest,
  type DurableContainmentCompareAndSetResult,
  type DurableContainmentWritePort,
} from '../src/failure-containment/durable-containment-transitions.js';
import type {
  DurableHalfOpenProbePort,
  DurableHalfOpenProbePortResult,
} from '../src/failure-containment/durable-half-open-probe.js';

const TENANT = 'ten_01ARZ3NDEKTSV4RRFFQ69G5FAV' as TenantId;
const CIRCUIT = 'device:camera:local';
const NOW = '2026-09-06T00:30:00.000Z' as Rfc3339Timestamp;
const OPENED = '2026-09-06T00:29:00.000Z' as Rfc3339Timestamp;
const PROBE = 'act_01ARZ3NDEKTSV4RRFFQ69G5FAV' as ActionIntent['actionIntentId'];
const LEASE_EXPIRY = '2026-09-06T00:30:30.000Z' as Rfc3339Timestamp;

function record(
  circuit: DurableContainmentStateRecord['snapshot']['circuit'] = {
    state: 'CLOSED',
    consecutiveFailures: 1,
    halfOpenProbeInFlight: false,
  },
): DurableContainmentStateRecord {
  return {
    tenantId: TENANT,
    circuitKey: CIRCUIT,
    version: 4,
    updatedAt: OPENED,
    snapshot: {
      circuit,
      killSwitch: { state: 'INACTIVE', changedAt: OPENED },
      dependencyHealth: 'HEALTHY',
      cancellationRequested: false,
      currentInFlight: 0,
      maxInFlight: 2,
      retryDepth: 0,
      maxRetryDepth: 2,
    },
    authorizesExecution: false,
  };
}

function source(current: DurableContainmentStateRecord): DurableContainmentStateSource {
  return { resolveCurrent: () => current };
}

class FakeStore implements DurableContainmentWritePort {
  readonly writes: DurableContainmentCompareAndSetRequest[] = [];
  result: DurableContainmentCompareAndSetResult = {
    ok: true,
    disposition: 'UPDATED',
    version: 5,
    authorizesExecution: false,
    provesExecutionSuccess: false,
    retryAuthorized: false,
  };

  compareAndSet(
    input: DurableContainmentCompareAndSetRequest,
  ): DurableContainmentCompareAndSetResult {
    this.writes.push(input);
    return this.result;
  }
}

class FakeProbeFence implements DurableHalfOpenProbePort {
  reserves = 0;
  releases = 0;
  reserveResult: DurableHalfOpenProbePortResult = {
    ok: true,
    disposition: 'ACQUIRED',
    circuitKey: CIRCUIT,
    probeActionIntentId: PROBE,
    leaseReference: 'w03-lease:w07g:half-open:device:camera:local',
    expiresAt: LEASE_EXPIRY,
    authorizesExecution: false,
    provesExecutionSuccess: false,
    retryAuthorized: false,
  };
  releaseResult: DurableHalfOpenProbePortResult = {
    ok: true,
    disposition: 'RELEASED',
    circuitKey: CIRCUIT,
    probeActionIntentId: PROBE,
    leaseReference: 'w03-lease:w07g:half-open:device:camera:local',
    authorizesExecution: false,
    provesExecutionSuccess: false,
    retryAuthorized: false,
  };

  reserve(): DurableHalfOpenProbePortResult {
    this.reserves += 1;
    return this.reserveResult;
  }

  heartbeat(): DurableHalfOpenProbePortResult {
    return this.reserveResult;
  }

  release(): DurableHalfOpenProbePortResult {
    this.releases += 1;
    return this.releaseResult;
  }
}

test('CLOSED failure crosses threshold only through W07 transition then CAS', () => {
  const store = new FakeStore();
  const result = transitionDurableCircuit({
    tenantId: TENANT,
    circuitKey: CIRCUIT,
    observedAt: NOW,
    event: 'FAILURE',
    failureThreshold: 2,
    recoveryAfterMs: 1_000,
    source: source(record()),
    store,
  });
  assert.equal(result.ok, true);
  if (!result.ok) throw new Error('transition should persist');
  assert.equal(result.circuit.state, 'OPEN');
  assert.equal(result.version, 5);
  assert.equal(result.authorizesExecution, false);
  assert.equal(store.writes.length, 1);
  assert.equal(store.writes[0]?.expectedVersion, 4);
  assert.equal(store.writes[0]?.state.circuit.state, 'OPEN');
  assert.equal(store.writes[0]?.state.circuit.openedAt, NOW);
});

test('OPEN recovery window transitions to HALF_OPEN by CAS without inventing a probe owner', () => {
  const store = new FakeStore();
  const result = transitionDurableCircuit({
    tenantId: TENANT,
    circuitKey: CIRCUIT,
    observedAt: NOW,
    event: 'RECOVERY_WINDOW_ELAPSED',
    failureThreshold: 2,
    recoveryAfterMs: 30_000,
    source: source(
      record({
        state: 'OPEN',
        consecutiveFailures: 2,
        openedAt: OPENED,
        halfOpenProbeInFlight: false,
      }),
    ),
    store,
  });
  assert.equal(result.ok, true);
  if (!result.ok) throw new Error('recovery should persist');
  assert.equal(result.circuit.state, 'HALF_OPEN');
  assert.equal(store.writes[0]?.state.circuit.openedAt, undefined);
});

test('HALF_OPEN probe start reserves durable lease and does not rewrite containment row', () => {
  const store = new FakeStore();
  const probeFence = new FakeProbeFence();
  const result = transitionDurableCircuit({
    tenantId: TENANT,
    circuitKey: CIRCUIT,
    observedAt: NOW,
    event: 'HALF_OPEN_PROBE_STARTED',
    failureThreshold: 2,
    recoveryAfterMs: 30_000,
    probeActionIntentId: PROBE,
    probeLeaseExpiresAt: LEASE_EXPIRY,
    source: source(
      record({ state: 'HALF_OPEN', consecutiveFailures: 2, halfOpenProbeInFlight: false }),
    ),
    store,
    probeFence,
  });
  assert.equal(result.ok, true);
  if (!result.ok) throw new Error('probe should reserve');
  assert.equal(result.disposition, 'HALF_OPEN_PROBE_RESERVED');
  assert.equal(result.version, 4);
  assert.equal(probeFence.reserves, 1);
  assert.equal(store.writes.length, 0);
});

test('HALF_OPEN success persists CLOSED first and releases exact probe lease', () => {
  const store = new FakeStore();
  const probeFence = new FakeProbeFence();
  const result = transitionDurableCircuit({
    tenantId: TENANT,
    circuitKey: CIRCUIT,
    observedAt: NOW,
    event: 'SUCCESS',
    failureThreshold: 2,
    recoveryAfterMs: 30_000,
    probeActionIntentId: PROBE,
    source: source(
      record({
        state: 'HALF_OPEN',
        consecutiveFailures: 2,
        halfOpenProbeInFlight: true,
        halfOpenProbeActionIntentId: PROBE,
      }),
    ),
    store,
    probeFence,
  });
  assert.equal(result.ok, true);
  if (!result.ok) throw new Error('success should persist');
  assert.equal(result.circuit.state, 'CLOSED');
  assert.equal(store.writes.length, 1);
  assert.equal(probeFence.releases, 1);
  assert.equal(result.probeLeaseCleanupRequired, false);
});

test('CAS conflict fails closed and never authorizes retry', () => {
  const store = new FakeStore();
  store.result = {
    ok: false,
    code: 'VERSION_CONFLICT',
    currentVersion: 8,
    authorizesExecution: false,
    provesExecutionSuccess: false,
    retryAuthorized: false,
  };
  const result = transitionDurableCircuit({
    tenantId: TENANT,
    circuitKey: CIRCUIT,
    observedAt: NOW,
    event: 'FAILURE',
    failureThreshold: 2,
    recoveryAfterMs: 1_000,
    source: source(record()),
    store,
  });
  assert.deepEqual(result, {
    ok: false,
    code: 'STATE_CONFLICT',
    authorizesExecution: false,
    provesExecutionSuccess: false,
    retryAuthorized: false,
  });
});

test('kill switch activation uses W07 transition then CAS; unvalidated deactivation never writes', () => {
  const store = new FakeStore();
  const activated = transitionDurableKillSwitch({
    tenantId: TENANT,
    circuitKey: CIRCUIT,
    changedAt: NOW,
    command: 'ACTIVATE',
    recoveryGate: 'NOT_REQUIRED',
    source: source(record()),
    store,
  });
  assert.equal(activated.ok, true);
  if (!activated.ok) throw new Error('activation should persist');
  assert.equal(activated.killSwitch.state, 'ACTIVE');
  assert.equal(store.writes.length, 1);

  const blockedStore = new FakeStore();
  const blocked = transitionDurableKillSwitch({
    tenantId: TENANT,
    circuitKey: CIRCUIT,
    changedAt: NOW,
    command: 'DEACTIVATE',
    recoveryGate: 'NOT_VALIDATED',
    source: source(
      record({ state: 'CLOSED', consecutiveFailures: 0, halfOpenProbeInFlight: false }),
    ),
    store: blockedStore,
  });
  assert.equal(blocked.ok, false);
  assert.equal(blockedStore.writes.length, 0);
});
