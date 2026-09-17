// @ts-expect-error -- repository test harness intentionally has no @types/node.
import assert from 'node:assert/strict';
// @ts-expect-error -- repository test harness intentionally has no @types/node.
import test from 'node:test';

import { resolveProjectionState } from '../src/index.js';

test('W16 projection freshness demotes expired CURRENT data to STALE without upgrading owner state', () => {
  const current = {
    state: 'CURRENT' as const,
    observedAt: '2026-09-17T19:00:00.000Z',
    freshnessDeadline: '2026-09-17T19:05:00.000Z',
    sourceRefs: ['runtime:accepted-read-model'],
  };
  assert.equal(resolveProjectionState(current, '2026-09-17T19:04:59.000Z'), 'CURRENT');
  assert.equal(resolveProjectionState(current, '2026-09-17T19:05:01.000Z'), 'STALE');

  const conflict = { ...current, state: 'CONFLICT' as const };
  assert.equal(resolveProjectionState(conflict, '2026-09-17T20:00:00.000Z'), 'CONFLICT');

  const revoked = { ...current, state: 'REVOKED' as const };
  assert.equal(resolveProjectionState(revoked, '2026-09-17T20:00:00.000Z'), 'REVOKED');
});

test('W16 projection freshness rejects invalid clocks instead of guessing current state', () => {
  const projection = {
    state: 'CURRENT' as const,
    freshnessDeadline: 'not-a-timestamp',
    sourceRefs: ['runtime:accepted-read-model'],
  };
  assert.throws(() => resolveProjectionState(projection, '2026-09-17T19:00:00.000Z'));
  assert.throws(() => resolveProjectionState(projection, 'not-a-timestamp'));
});
