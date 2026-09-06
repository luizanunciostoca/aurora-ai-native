// @ts-expect-error -- executor tests target Node 22 without repository-wide @types/node.
import assert from 'node:assert/strict';
// @ts-expect-error -- executor tests target Node 22 without repository-wide @types/node.
import test from 'node:test';

import type { Rfc3339Timestamp } from '@aurora/contracts/context';
import type { TenantId } from '@aurora/contracts/ids';

import {
  resolveDurableContainmentState,
  type DurableContainmentStateRecord,
  type DurableContainmentStateSource,
} from '../src/failure-containment/durable-containment-state.js';

const TENANT = 'ten_01ARZ3NDEKTSV4RRFFQ69G5FAV' as TenantId;
const CIRCUIT = 'device:camera:local';
const NOW = '2026-09-06T00:30:00.000Z' as Rfc3339Timestamp;
const UPDATED = '2026-09-06T00:29:59.000Z' as Rfc3339Timestamp;

function record(overrides: Partial<DurableContainmentStateRecord> = {}): DurableContainmentStateRecord {
  return {
    tenantId: TENANT,
    circuitKey: CIRCUIT,
    version: 3,
    updatedAt: UPDATED,
    snapshot: {
      circuit: { state: 'CLOSED', consecutiveFailures: 0, halfOpenProbeInFlight: false },
      killSwitch: { state: 'INACTIVE', changedAt: UPDATED },
      dependencyHealth: 'HEALTHY',
      cancellationRequested: false,
      currentInFlight: 0,
      maxInFlight: 2,
      retryDepth: 0,
      maxRetryDepth: 2,
    },
    authorizesExecution: false,
    ...overrides,
  };
}

function source(value: DurableContainmentStateRecord | null): DurableContainmentStateSource {
  return { resolveCurrent: () => value };
}

const lookup = { tenantId: TENANT, circuitKey: CIRCUIT, evaluatedAt: NOW };

test('resolves current durable containment without granting authority', () => {
  const result = resolveDurableContainmentState(lookup, source(record()));
  assert.equal(result.status, 'RESOLVED');
  assert.equal(result.authorizesExecution, false);
  if (result.status !== 'RESOLVED') throw new Error('state should resolve');
  assert.equal(result.record.version, 3);
  assert.equal(result.record.snapshot.circuit.state, 'CLOSED');
});

test('absence, outage and missing source fail closed without healthy defaults', () => {
  assert.equal(resolveDurableContainmentState(lookup, undefined).status, 'REJECTED');
  assert.equal(resolveDurableContainmentState(lookup, source(null)).status, 'REJECTED');
  const throwing: DurableContainmentStateSource = {
    resolveCurrent: () => {
      throw new Error('db unavailable');
    },
  };
  const result = resolveDurableContainmentState(lookup, throwing);
  assert.deepEqual(result, {
    status: 'REJECTED',
    code: 'SOURCE_UNAVAILABLE',
    authorizesExecution: false,
  });
});

test('rejects tenant or circuit binding mismatch', () => {
  const tenantMismatch = resolveDurableContainmentState(
    lookup,
    source(record({ tenantId: 'ten_01ARZ3NDEKTSV4RRFFQ69G5FAW' as TenantId })),
  );
  assert.equal(tenantMismatch.status, 'REJECTED');
  if (tenantMismatch.status !== 'REJECTED') throw new Error('mismatch should reject');
  assert.equal(tenantMismatch.code, 'STATE_MISMATCH');

  const circuitMismatch = resolveDurableContainmentState(
    lookup,
    source(record({ circuitKey: 'device:other' })),
  );
  assert.equal(circuitMismatch.status, 'REJECTED');
  if (circuitMismatch.status !== 'REJECTED') throw new Error('mismatch should reject');
  assert.equal(circuitMismatch.code, 'STATE_MISMATCH');
});

test('rejects malformed version, future update, counts and authority-bearing output', () => {
  const cases: DurableContainmentStateRecord[] = [
    record({ version: 0 }),
    record({ updatedAt: '2026-09-06T00:31:00.000Z' as Rfc3339Timestamp }),
    record({ authorizesExecution: true as unknown as false }),
    record({
      snapshot: {
        ...record().snapshot,
        currentInFlight: 3,
        maxInFlight: 2,
      },
    }),
    record({
      snapshot: {
        ...record().snapshot,
        retryDepth: 3,
        maxRetryDepth: 2,
      },
    }),
  ];
  for (const candidate of cases) {
    const result = resolveDurableContainmentState(lookup, source(candidate));
    assert.equal(result.status, 'REJECTED');
    if (result.status !== 'REJECTED') throw new Error('malformed state should reject');
    assert.equal(result.code, 'STATE_MALFORMED');
  }
});

test('validates OPEN and HALF_OPEN circuit invariants including canonical probe owner', () => {
  const open = resolveDurableContainmentState(
    lookup,
    source(
      record({
        snapshot: {
          ...record().snapshot,
          circuit: {
            state: 'OPEN',
            consecutiveFailures: 3,
            openedAt: UPDATED,
            halfOpenProbeInFlight: false,
          },
        },
      }),
    ),
  );
  assert.equal(open.status, 'RESOLVED');

  const halfOpen = resolveDurableContainmentState(
    lookup,
    source(
      record({
        snapshot: {
          ...record().snapshot,
          circuit: {
            state: 'HALF_OPEN',
            consecutiveFailures: 3,
            halfOpenProbeInFlight: true,
            halfOpenProbeActionIntentId: 'act_01ARZ3NDEKTSV4RRFFQ69G5FAV',
          },
        },
      }),
    ),
  );
  assert.equal(halfOpen.status, 'RESOLVED');

  const malformed = resolveDurableContainmentState(
    lookup,
    source(
      record({
        snapshot: {
          ...record().snapshot,
          circuit: {
            state: 'HALF_OPEN',
            consecutiveFailures: 3,
            halfOpenProbeInFlight: true,
          },
        },
      }),
    ),
  );
  assert.equal(malformed.status, 'REJECTED');
});

test('invalid lookup is rejected before reading the source', () => {
  let calls = 0;
  const counting: DurableContainmentStateSource = {
    resolveCurrent: () => {
      calls += 1;
      return record();
    },
  };
  const result = resolveDurableContainmentState(
    { ...lookup, circuitKey: 'bad key with spaces' },
    counting,
  );
  assert.equal(result.status, 'REJECTED');
  assert.equal(calls, 0);
});
