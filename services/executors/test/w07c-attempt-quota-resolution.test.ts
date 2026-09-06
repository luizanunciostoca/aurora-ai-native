// @ts-expect-error -- executor harness has no @types/node; Node 22 provides this built-in.
import assert from 'node:assert/strict';
// @ts-expect-error -- executor harness has no @types/node; Node 22 provides this built-in.
import test from 'node:test';

import { resolveCurrentAttemptQuota } from '../src/safeguards/attempt-quota-resolution.js';
import type {
  ExecutionAttemptQuotaLookup,
  ExecutionAttemptQuotaSnapshot,
} from '../src/safeguards/attempt-quota-source.js';

const tenantId = 'tenant:alpha';
const actionIntentId = 'action-intent:1';
const executionRef = 'execution-ref:1';
const now = '2026-09-06T00:10:00.000Z';

function toLookup(overrides: Record<string, unknown> = {}): ExecutionAttemptQuotaLookup {
  return {
    tenantId,
    actionIntentId,
    executionRef,
    ...overrides,
  } as unknown as ExecutionAttemptQuotaLookup;
}

const lookup = toLookup();

function snapshot(overrides: Record<string, unknown> = {}): ExecutionAttemptQuotaSnapshot {
  return {
    tenantId,
    actionIntentId,
    executionRef,
    attemptNumber: 2,
    maxAttempts: 5,
    quota: { limit: 10, used: 3 },
    version: 4,
    updatedAt: '2026-09-06T00:09:00.000Z',
    ...overrides,
  } as unknown as ExecutionAttemptQuotaSnapshot;
}

test('resolves the current durable attempt/quota state on a fresh, matching row', () => {
  const result = resolveCurrentAttemptQuota({
    source: { lookup: () => snapshot() },
    lookup,
    now,
    maxAgeMs: 5 * 60 * 1000,
  });
  assert.deepEqual(result, {
    status: 'RESOLVED',
    attemptNumber: 2,
    maxAttempts: 5,
    quota: { limit: 10, used: 3 },
  });
});

test('resolves without a quota field when quota is absent (quota is optional)', () => {
  const result = resolveCurrentAttemptQuota({
    source: { lookup: () => snapshot({ quota: undefined }) },
    lookup,
    now,
    maxAgeMs: 5 * 60 * 1000,
  });
  assert.equal(result.status, 'RESOLVED');
  assert.equal('quota' in result, false);
});

test('fails closed when the source throws (outage)', () => {
  const result = resolveCurrentAttemptQuota({
    source: {
      lookup: () => {
        throw new Error('durable store unavailable');
      },
    },
    lookup,
    now,
    maxAgeMs: 5 * 60 * 1000,
  });
  assert.deepEqual(result, { status: 'REJECTED', reason: 'SOURCE_UNAVAILABLE' });
});

test('fails closed when no row exists for the tenant/ActionIntent/executionRef (absence)', () => {
  const result = resolveCurrentAttemptQuota({
    source: { lookup: () => null },
    lookup,
    now,
    maxAgeMs: 5 * 60 * 1000,
  });
  assert.deepEqual(result, { status: 'REJECTED', reason: 'STATE_ABSENT' });
});

test('fails closed on malformed attempt/quota shapes and never invents defaults', () => {
  const badAttempt = resolveCurrentAttemptQuota({
    source: { lookup: () => snapshot({ attemptNumber: 0 }) },
    lookup,
    now,
    maxAgeMs: 5 * 60 * 1000,
  });
  const badMaxAttempts = resolveCurrentAttemptQuota({
    source: { lookup: () => snapshot({ maxAttempts: 0 }) },
    lookup,
    now,
    maxAgeMs: 5 * 60 * 1000,
  });
  const badQuota = resolveCurrentAttemptQuota({
    source: { lookup: () => snapshot({ quota: { limit: 0, used: -1 } }) },
    lookup,
    now,
    maxAgeMs: 5 * 60 * 1000,
  });
  const corruptedSnapshot = resolveCurrentAttemptQuota({
    source: { lookup: () => null as unknown as ExecutionAttemptQuotaSnapshot },
    lookup,
    now,
    maxAgeMs: 5 * 60 * 1000,
  });
  const nonObjectSnapshot = resolveCurrentAttemptQuota({
    source: { lookup: () => 'not-a-snapshot' as unknown as ExecutionAttemptQuotaSnapshot },
    lookup,
    now,
    maxAgeMs: 5 * 60 * 1000,
  });

  assert.deepEqual(badAttempt, { status: 'REJECTED', reason: 'STATE_MALFORMED' });
  assert.deepEqual(badMaxAttempts, { status: 'REJECTED', reason: 'STATE_MALFORMED' });
  assert.deepEqual(badQuota, { status: 'REJECTED', reason: 'STATE_MALFORMED' });
  assert.deepEqual(corruptedSnapshot, { status: 'REJECTED', reason: 'STATE_ABSENT' });
  assert.deepEqual(nonObjectSnapshot, { status: 'REJECTED', reason: 'STATE_MALFORMED' });
});

test('fails closed when the returned row does not bind to the requested tenant/ActionIntent/executionRef', () => {
  const wrongTenant = resolveCurrentAttemptQuota({
    source: { lookup: () => snapshot({ tenantId: 'tenant:other' }) },
    lookup,
    now,
    maxAgeMs: 5 * 60 * 1000,
  });
  const wrongActionIntent = resolveCurrentAttemptQuota({
    source: { lookup: () => snapshot({ actionIntentId: 'action-intent:other' }) },
    lookup,
    now,
    maxAgeMs: 5 * 60 * 1000,
  });
  const wrongExecutionRef = resolveCurrentAttemptQuota({
    source: { lookup: () => snapshot({ executionRef: 'execution-ref:other' }) },
    lookup,
    now,
    maxAgeMs: 5 * 60 * 1000,
  });

  assert.deepEqual(wrongTenant, { status: 'REJECTED', reason: 'CONTEXT_MISMATCH' });
  assert.deepEqual(wrongActionIntent, { status: 'REJECTED', reason: 'CONTEXT_MISMATCH' });
  assert.deepEqual(wrongExecutionRef, { status: 'REJECTED', reason: 'CONTEXT_MISMATCH' });
});

test('fails closed on stale durable state older than maxAgeMs, and on future-dated rows', () => {
  const stale = resolveCurrentAttemptQuota({
    source: { lookup: () => snapshot({ updatedAt: '2026-09-06T00:00:00.000Z' }) },
    lookup,
    now,
    maxAgeMs: 60 * 1000,
  });
  const future = resolveCurrentAttemptQuota({
    source: { lookup: () => snapshot({ updatedAt: '2026-09-06T00:20:00.000Z' }) },
    lookup,
    now,
    maxAgeMs: 5 * 60 * 1000,
  });
  const malformedUpdatedAt = resolveCurrentAttemptQuota({
    source: { lookup: () => snapshot({ updatedAt: 'not-a-time' }) },
    lookup,
    now,
    maxAgeMs: 5 * 60 * 1000,
  });

  assert.deepEqual(stale, { status: 'REJECTED', reason: 'STATE_STALE' });
  assert.deepEqual(future, { status: 'REJECTED', reason: 'STATE_STALE' });
  assert.deepEqual(malformedUpdatedAt, { status: 'REJECTED', reason: 'STATE_MALFORMED' });
});

test('fails closed on invalid evaluation time or malformed lookup input', () => {
  const invalidTime = resolveCurrentAttemptQuota({
    source: { lookup: () => snapshot() },
    lookup,
    now: 'not-a-time',
    maxAgeMs: 5 * 60 * 1000,
  });
  const missingExecutionRef = resolveCurrentAttemptQuota({
    source: { lookup: () => snapshot() },
    lookup: toLookup({ executionRef: '' }),
    now,
    maxAgeMs: 5 * 60 * 1000,
  });
  const invalidMaxAge = resolveCurrentAttemptQuota({
    source: { lookup: () => snapshot() },
    lookup,
    now,
    maxAgeMs: 0,
  });

  assert.deepEqual(invalidTime, { status: 'REJECTED', reason: 'TIME_INVALID' });
  assert.deepEqual(missingExecutionRef, { status: 'REJECTED', reason: 'LOOKUP_INVALID' });
  assert.deepEqual(invalidMaxAge, { status: 'REJECTED', reason: 'LOOKUP_INVALID' });
});

test('re-reads the source on every call so a concurrent writer advance is observed without caching', () => {
  let currentVersion = 4;
  const source = {
    lookup: () => snapshot({ version: currentVersion, attemptNumber: currentVersion - 2 }),
  };

  const first = resolveCurrentAttemptQuota({ source, lookup, now, maxAgeMs: 5 * 60 * 1000 });
  currentVersion = 5;
  const second = resolveCurrentAttemptQuota({ source, lookup, now, maxAgeMs: 5 * 60 * 1000 });

  assert.equal(first.status, 'RESOLVED');
  assert.equal(second.status, 'RESOLVED');
  assert.notDeepEqual(first, second);
  if (first.status === 'RESOLVED' && second.status === 'RESOLVED') {
    assert.equal(first.attemptNumber, 2);
    assert.equal(second.attemptNumber, 3);
  }
});

test('never authorizes execution or retry: resolution never carries an authority/retry field', () => {
  const result = resolveCurrentAttemptQuota({
    source: { lookup: () => snapshot() },
    lookup,
    now,
    maxAgeMs: 5 * 60 * 1000,
  });
  assert.equal((result as Record<string, unknown>).authorizesExecution, undefined);
  assert.equal((result as Record<string, unknown>).retry, undefined);
});
