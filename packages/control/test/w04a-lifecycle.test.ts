import assert from 'node:assert/strict';
import test from 'node:test';
import type { CorrelationId, TenantId } from '../../contracts/src/ids/types.ts';
import {
  createLifecycleRecord,
  transitionLifecycle,
  type LifecycleRecord,
  type LifecycleTransitionRequest,
} from '../src/lifecycle/index.ts';

const tenant = 'ten_01J00000000000000000000000' as TenantId;
const otherTenant = 'ten_01J00000000000000000000001' as TenantId;
const rootCorrelation = 'cor_01J00000000000000000000000' as CorrelationId;
const transitionCorrelation = 'cor_01J00000000000000000000001' as CorrelationId;

function objective(): LifecycleRecord {
  return createLifecycleRecord({
    entity: { kind: 'OBJECTIVE', id: 'objective:launch' },
    tenantId: tenant,
    rootCorrelationId: rootCorrelation,
    createdAt: '2026-09-01T08:00:00.000Z',
  });
}

function request(
  current: LifecycleRecord,
  to: LifecycleTransitionRequest['to'],
  overrides: Partial<LifecycleTransitionRequest> = {},
): LifecycleTransitionRequest {
  return {
    tenantId: tenant,
    correlationId: transitionCorrelation,
    expectedRevision: current.revision,
    to,
    at: '2026-09-01T08:01:00.000Z',
    reason: `move to ${to}`,
    ...overrides,
  };
}

test('W04-A applies deterministic lifecycle transitions and evidence', () => {
  const draft = objective();
  const ready = transitionLifecycle(draft, request(draft, 'READY'));
  assert.equal(ready.status, 'APPLIED');
  if (ready.status !== 'APPLIED') return;

  const active = transitionLifecycle(ready.record, request(ready.record, 'ACTIVE'));
  assert.equal(active.status, 'APPLIED');
  if (active.status !== 'APPLIED') return;

  const succeeded = transitionLifecycle(
    active.record,
    request(active.record, 'SUCCEEDED', {
      evidence: {
        evidenceId: 'evd:objective-launch',
        source: 'w04a-test',
        recordedAt: '2026-09-01T08:01:00.000Z',
      },
    }),
  );
  assert.equal(succeeded.status, 'APPLIED');
  if (succeeded.status !== 'APPLIED') return;
  assert.equal(succeeded.record.state, 'SUCCEEDED');
  assert.equal(succeeded.record.revision, 3);
  assert.equal(succeeded.record.evidence.length, 1);
  assert.equal(succeeded.event.rootCorrelationId, rootCorrelation);
});

test('W04-A rejects invalid direct terminal transition and terminal resurrection', () => {
  const draft = objective();
  const invalid = transitionLifecycle(draft, request(draft, 'SUCCEEDED'));
  assert.deepEqual(invalid.status === 'REJECTED' ? invalid.code : null, 'INVALID_TRANSITION');

  const ready = transitionLifecycle(draft, request(draft, 'READY'));
  assert.equal(ready.status, 'APPLIED');
  if (ready.status !== 'APPLIED') return;
  const active = transitionLifecycle(ready.record, request(ready.record, 'ACTIVE'));
  assert.equal(active.status, 'APPLIED');
  if (active.status !== 'APPLIED') return;
  const done = transitionLifecycle(active.record, request(active.record, 'SUCCEEDED'));
  assert.equal(done.status, 'APPLIED');
  if (done.status !== 'APPLIED') return;
  const resurrection = transitionLifecycle(done.record, request(done.record, 'ACTIVE'));
  assert.deepEqual(resurrection.status === 'REJECTED' ? resurrection.code : null, 'TERMINAL_STATE');
});

test('W04-A cancellation wins a stale supersession race by revision fencing', () => {
  const draft = objective();
  const ready = transitionLifecycle(draft, request(draft, 'READY'));
  assert.equal(ready.status, 'APPLIED');
  if (ready.status !== 'APPLIED') return;

  const beforeRace = ready.record;
  const cancelled = transitionLifecycle(
    beforeRace,
    request(beforeRace, 'CANCELLED', { reason: 'owner cancelled' }),
  );
  assert.equal(cancelled.status, 'APPLIED');
  if (cancelled.status !== 'APPLIED') return;

  const staleSupersession = transitionLifecycle(
    cancelled.record,
    request(beforeRace, 'SUPERSEDED', {
      supersededBy: { kind: 'OBJECTIVE', id: 'objective:replacement' },
    }),
  );
  assert.deepEqual(
    staleSupersession.status === 'REJECTED' ? staleSupersession.code : null,
    'REVISION_CONFLICT',
  );
});

test('W04-A requires an external supersession target and rejects self-supersession', () => {
  const draft = objective();
  const noTarget = transitionLifecycle(draft, request(draft, 'SUPERSEDED'));
  assert.deepEqual(
    noTarget.status === 'REJECTED' ? noTarget.code : null,
    'SUPERSESSION_TARGET_REQUIRED',
  );

  const self = transitionLifecycle(
    draft,
    request(draft, 'SUPERSEDED', { supersededBy: draft.entity }),
  );
  assert.deepEqual(self.status === 'REJECTED' ? self.code : null, 'SELF_SUPERSESSION');
});

test('W04-A fails closed on tenant mismatch before mutation', () => {
  const draft = objective();
  const mismatch = transitionLifecycle(
    draft,
    request(draft, 'READY', {
      tenantId: otherTenant,
    }),
  );
  assert.deepEqual(mismatch.status === 'REJECTED' ? mismatch.code : null, 'TENANT_MISMATCH');
  assert.equal(mismatch.current, draft);
});
