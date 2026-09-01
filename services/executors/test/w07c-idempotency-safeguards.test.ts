// @ts-expect-error -- executor harness has no @types/node; Node 22 provides this built-in.
import assert from 'node:assert/strict';
// @ts-expect-error -- executor harness has no @types/node; Node 22 provides this built-in.
import test from 'node:test';

import type { ActionIntent } from '@aurora/contracts/actions';

import { evaluateExecutionSafeguards } from '../src/safeguards/index.js';
import type { IdempotencyFencePort } from '../src/safeguards/types.js';

function actionIntent(overrides: Record<string, unknown> = {}): ActionIntent {
  return {
    kind: 'ACTION_INTENT',
    schemaVersion: '1.0.0',
    actionIntentId: 'action-intent:1',
    capability: { capability: 'social.publish', actionType: 'PUBLISH' },
    tenant: { tenantId: 'tenant:alpha' },
    actor: { kind: 'HUMAN', identityId: 'identity:operator' },
    requestOrigin: { kind: 'HUMAN', identityId: 'identity:operator' },
    correlation: { correlationId: 'correlation:1' },
    resolvedParameters: { text: 'hello' },
    idempotency: { mode: 'REQUIRED', key: 'idem:publish:1' },
    preconditions: [{ preconditionType: 'ACCOUNT_ACTIVE', parameters: {} }],
    deadlineAt: '2026-09-01T18:00:00Z',
    authority: { kind: 'POLICY_TOKEN', policyTokenId: 'policy-token:1' },
    dataClassification: 'INTERNAL',
    ...overrides,
  } as unknown as ActionIntent;
}

function request(overrides: Record<string, unknown> = {}) {
  return {
    schemaVersion: '1.0.0' as ActionIntent['schemaVersion'],
    actionIntent: actionIntent(),
    evaluatedAt: '2026-09-01T17:00:00Z' as ActionIntent['deadlineAt'],
    attemptNumber: 1,
    maxAttempts: 3,
    quota: { limit: 10, used: 1 },
    evaluatePrecondition: () => true,
    canonicalPayloadHash: 'sha256:0123456789abcdef',
    idempotencyFence: { reserve: () => ({ kind: 'RESERVED' as const }) },
    ...overrides,
  };
}

test('reserves W03 idempotency before allowing downstream external invocation', () => {
  let reservations = 0;
  const fence: IdempotencyFencePort = {
    reserve: (input) => {
      reservations += 1;
      assert.equal(input.tenantId, 'tenant:alpha');
      assert.equal(input.key, 'idem:publish:1');
      assert.equal(input.operationName, 'social.publish:PUBLISH');
      return { kind: 'RESERVED' };
    },
  };
  const result = evaluateExecutionSafeguards(request({ idempotencyFence: fence }));

  assert.equal(reservations, 1);
  assert.equal(result.safeToInvokeExternal, true);
  assert.equal(result.idempotencyReserved, true);
  assert.equal(result.authorizesExecution, false);
});

test('fences duplicate race deterministically before any external call', () => {
  let reserved = false;
  const fence: IdempotencyFencePort = {
    reserve: () => {
      if (reserved) return { kind: 'INFLIGHT' };
      reserved = true;
      return { kind: 'RESERVED' };
    },
  };

  const first = evaluateExecutionSafeguards(request({ idempotencyFence: fence }));
  const second = evaluateExecutionSafeguards(request({ idempotencyFence: fence }));

  assert.equal(first.safeToInvokeExternal, true);
  assert.equal(second.safeToInvokeExternal, false);
  assert.deepEqual(second.reasons, ['IDEMPOTENCY_INFLIGHT']);
});

test('completed replay and conflicts fail closed rather than re-executing', () => {
  const replayFence: IdempotencyFencePort = {
    reserve: () => ({ kind: 'REPLAY_COMPLETED' }),
  };
  const conflictFence: IdempotencyFencePort = {
    reserve: () => ({ kind: 'CONFLICT', reason: 'PAYLOAD_MISMATCH' }),
  };
  const replay = evaluateExecutionSafeguards(request({ idempotencyFence: replayFence }));
  const conflict = evaluateExecutionSafeguards(request({ idempotencyFence: conflictFence }));

  assert.deepEqual(replay.reasons, ['IDEMPOTENCY_REPLAY_COMPLETED']);
  assert.deepEqual(conflict.reasons, ['IDEMPOTENCY_CONFLICT']);
  assert.equal(replay.safeToInvokeExternal, false);
  assert.equal(conflict.safeToInvokeExternal, false);
});

test('required idempotency cannot proceed without W03 fence/hash configuration', () => {
  const missingFence = evaluateExecutionSafeguards(request({ idempotencyFence: undefined }));
  const missingHash = evaluateExecutionSafeguards(request({ canonicalPayloadHash: undefined }));

  assert.deepEqual(missingFence.reasons, ['IDEMPOTENCY_CONFIGURATION_INVALID']);
  assert.deepEqual(missingHash.reasons, ['IDEMPOTENCY_CONFIGURATION_INVALID']);
});

test('deadline, bounded attempts and quota fail closed before reservation', () => {
  let reservations = 0;
  const fence: IdempotencyFencePort = {
    reserve: () => {
      reservations += 1;
      return { kind: 'RESERVED' };
    },
  };

  const expired = evaluateExecutionSafeguards(
    request({ evaluatedAt: '2026-09-01T18:00:00Z', idempotencyFence: fence }),
  );
  const attempts = evaluateExecutionSafeguards(
    request({ attemptNumber: 4, maxAttempts: 3, idempotencyFence: fence }),
  );
  const quota = evaluateExecutionSafeguards(
    request({ quota: { limit: 2, used: 2 }, idempotencyFence: fence }),
  );

  assert.deepEqual(expired.reasons, ['DEADLINE_EXPIRED']);
  assert.deepEqual(attempts.reasons, ['ATTEMPT_LIMIT_REACHED']);
  assert.deepEqual(quota.reasons, ['QUOTA_EXHAUSTED']);
  assert.equal(reservations, 0);
});

test('failed or throwing preconditions fail closed before idempotency reservation', () => {
  let reservations = 0;
  const fence: IdempotencyFencePort = {
    reserve: () => {
      reservations += 1;
      return { kind: 'RESERVED' };
    },
  };

  const failed = evaluateExecutionSafeguards(
    request({ evaluatePrecondition: () => false, idempotencyFence: fence }),
  );
  const threw = evaluateExecutionSafeguards(
    request({
      evaluatePrecondition: () => {
        throw new Error('precondition backend unavailable');
      },
      idempotencyFence: fence,
    }),
  );

  assert.deepEqual(failed.reasons, ['PRECONDITION_FAILED']);
  assert.deepEqual(threw.reasons, ['PRECONDITION_FAILED']);
  assert.equal(reservations, 0);
});

test('NOT_APPLICABLE idempotency passes generic guards without a ledger record', () => {
  const nonIdempotentIntent = actionIntent({
    idempotency: { mode: 'NOT_APPLICABLE', reason: 'read-only' },
  });
  const result = evaluateExecutionSafeguards(
    request({
      actionIntent: nonIdempotentIntent,
      canonicalPayloadHash: undefined,
      idempotencyFence: undefined,
    }),
  );

  assert.equal(result.safeToInvokeExternal, true);
  assert.equal(result.idempotencyReserved, false);
  assert.equal(result.authorizesExecution, false);
});

test('invalid time and malformed quota/attempt values fail closed', () => {
  const invalidTime = evaluateExecutionSafeguards(request({ evaluatedAt: 'not-a-time' }));
  const invalidAttempt = evaluateExecutionSafeguards(request({ attemptNumber: 0 }));
  const invalidQuota = evaluateExecutionSafeguards(request({ quota: { limit: 0, used: -1 } }));

  assert.deepEqual(invalidTime.reasons, ['INVALID_TIME']);
  assert.deepEqual(invalidAttempt.reasons, ['ATTEMPT_INVALID']);
  assert.deepEqual(invalidQuota.reasons, ['QUOTA_INVALID']);
});
