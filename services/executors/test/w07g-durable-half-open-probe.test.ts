// @ts-expect-error -- Aurora test harness targets Node 22 without repository-wide @types/node.
import assert from 'node:assert/strict';
// @ts-expect-error -- Aurora test harness targets Node 22 without repository-wide @types/node.
import test from 'node:test';

import type { ActionIntent } from '@aurora/contracts/actions';
import type { Rfc3339Timestamp } from '@aurora/contracts/context';
import type { TenantId } from '@aurora/contracts/ids';

import {
  releaseDurableHalfOpenProbe,
  reserveDurableHalfOpenProbe,
  type DurableHalfOpenProbePort,
  type DurableHalfOpenProbePortResult,
} from '../src/failure-containment/durable-half-open-probe.js';

const TENANT = 'ten_01ARZ3NDEKTSV4RRFFQ69G5FAV' as TenantId;
const ACTION = 'act_01ARZ3NDEKTSV4RRFFQ69G5FAV' as ActionIntent['actionIntentId'];
const OBSERVED_AT = '2026-09-06T00:00:00.000Z' as Rfc3339Timestamp;
const EXPIRES_AT = '2026-09-06T00:00:30.000Z' as Rfc3339Timestamp;
const CIRCUIT_KEY = 'provider:device-plane:local';
const LEASE = 'w03-lease:w07g:half-open:provider:device-plane:local';

function success(
  disposition: 'ACQUIRED' | 'ALREADY_OWNED' | 'RELEASED',
): DurableHalfOpenProbePortResult {
  return {
    ok: true,
    disposition,
    circuitKey: CIRCUIT_KEY,
    probeActionIntentId: ACTION,
    leaseReference: LEASE,
    ...(disposition === 'RELEASED' ? {} : { expiresAt: EXPIRES_AT }),
    authorizesExecution: false,
    provesExecutionSuccess: false,
    retryAuthorized: false,
  };
}

function port(overrides: Partial<DurableHalfOpenProbePort> = {}): DurableHalfOpenProbePort {
  return {
    reserve: () => success('ACQUIRED'),
    release: () => success('RELEASED'),
    ...overrides,
  };
}

function reserveInput() {
  return {
    tenantId: TENANT,
    circuitKey: CIRCUIT_KEY,
    probeActionIntentId: ACTION,
    observedAt: OBSERVED_AT,
    leaseExpiresAt: EXPIRES_AT,
    authorizesExecution: false as const,
  };
}

function releaseInput() {
  return {
    tenantId: TENANT,
    circuitKey: CIRCUIT_KEY,
    probeActionIntentId: ACTION,
    observedAt: OBSERVED_AT,
    authorizesExecution: false as const,
  };
}

test('accepts a canonical durable HALF_OPEN lease without elevating authority', () => {
  const result = reserveDurableHalfOpenProbe(reserveInput(), port());
  assert.equal(result.ok, true);
  if (!result.ok) throw new Error('probe should be reserved');
  assert.equal(result.disposition, 'ACQUIRED');
  assert.equal(result.probeActionIntentId, ACTION);
  assert.equal(result.authorizesExecution, false);
  assert.equal(result.provesExecutionSuccess, false);
  assert.equal(result.retryAuthorized, false);
});

test('accepts idempotent ownership by the same canonical ActionIntent', () => {
  const result = reserveDurableHalfOpenProbe(
    reserveInput(),
    port({ reserve: () => success('ALREADY_OWNED') }),
  );
  assert.equal(result.ok, true);
  if (!result.ok) throw new Error('same owner should remain fenced');
  assert.equal(result.disposition, 'ALREADY_OWNED');
});

test('passes through competing durable ownership as a closed gate', () => {
  const result = reserveDurableHalfOpenProbe(
    reserveInput(),
    port({
      reserve: () => ({
        ok: false,
        code: 'OWNED_BY_OTHER',
        authorizesExecution: false,
        provesExecutionSuccess: false,
        retryAuthorized: false,
      }),
    }),
  );
  assert.deepEqual(result, {
    ok: false,
    code: 'OWNED_BY_OTHER',
    authorizesExecution: false,
    provesExecutionSuccess: false,
    retryAuthorized: false,
  });
});

test('rejects malformed timing before calling the durable owner', () => {
  let calls = 0;
  const result = reserveDurableHalfOpenProbe(
    { ...reserveInput(), leaseExpiresAt: OBSERVED_AT },
    port({
      reserve: () => {
        calls += 1;
        return success('ACQUIRED');
      },
    }),
  );
  assert.equal(result.ok, false);
  if (result.ok) throw new Error('invalid timing must fail');
  assert.equal(result.code, 'MALFORMED');
  assert.equal(calls, 0);
});

test('fails closed when durable owner throws or returns mismatched ownership', () => {
  const unavailable = reserveDurableHalfOpenProbe(
    reserveInput(),
    port({ reserve: () => { throw new Error('db unavailable'); } }),
  );
  assert.equal(unavailable.ok, false);
  if (unavailable.ok) throw new Error('throw must fail closed');
  assert.equal(unavailable.code, 'UNAVAILABLE');

  const mismatched = reserveDurableHalfOpenProbe(
    reserveInput(),
    port({
      reserve: () => ({
        ...success('ACQUIRED'),
        probeActionIntentId: 'act_01ARZ3NDEKTSV4RRFFQ69G5FAW' as ActionIntent['actionIntentId'],
      }),
    }),
  );
  assert.equal(mismatched.ok, false);
  if (mismatched.ok) throw new Error('mismatched owner must fail closed');
  assert.equal(mismatched.code, 'UNAVAILABLE');
});

test('releases only an exact normalized durable owner response', () => {
  const released = releaseDurableHalfOpenProbe(releaseInput(), port());
  assert.equal(released.ok, true);
  if (!released.ok) throw new Error('release should succeed');
  assert.equal(released.disposition, 'RELEASED');

  const malformed = releaseDurableHalfOpenProbe(
    releaseInput(),
    port({ release: () => ({ ...success('RELEASED'), expiresAt: EXPIRES_AT }) }),
  );
  assert.equal(malformed.ok, false);
  if (malformed.ok) throw new Error('release cannot retain expiry');
  assert.equal(malformed.code, 'UNAVAILABLE');
});
