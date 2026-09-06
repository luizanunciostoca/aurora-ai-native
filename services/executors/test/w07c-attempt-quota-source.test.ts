// @ts-expect-error -- executor harness has no @types/node; Node 22 provides this built-in.
import assert from 'node:assert/strict';
// @ts-expect-error -- executor harness has no @types/node; Node 22 provides this built-in.
import test from 'node:test';

import type { ActionIntent } from '@aurora/contracts/actions';

import { resolveCurrentAttemptQuota } from '../src/safeguards/index.js';
import type {
  ExecutionAttemptQuotaLookup,
  ExecutionAttemptQuotaSnapshot,
  ExecutionAttemptQuotaSource,
} from '../src/safeguards/index.js';

const TENANT = 'tenant:alpha';
const INTENT_ID = 'action-intent:1';
const EXECUTION_REF = 'cmd_01ARZ3NDEKTSV4RRFFQ69G5FAV:exec:1';
const EVALUATED_AT = '2026-09-01T17:00:00Z';

function actionIntent(overrides: Record<string, unknown> = {}): ActionIntent {
  return {
    kind: 'ACTION_INTENT',
    schemaVersion: '1.0.0',
    actionIntentId: INTENT_ID,
    capability: { capability: 'device.voice', actionType: 'DISPATCH' },
    tenant: { tenantId: TENANT },
    actor: { kind: 'HUMAN', identityId: 'identity:operator' },
    requestOrigin: { kind: 'HUMAN', identityId: 'identity:operator' },
    correlation: { correlationId: 'correlation:1' },
    resolvedParameters: {},
    idempotency: { mode: 'REQUIRED', key: 'idem:dispatch:1' },
    preconditions: [],
    deadlineAt: '2026-09-01T18:00:00Z',
    authority: { kind: 'POLICY_TOKEN', policyTokenId: 'policy-token:1' },
    dataClassification: 'INTERNAL',
    ...overrides,
  } as unknown as ActionIntent;
}

function lookup(overrides: Partial<ExecutionAttemptQuotaLookup> = {}): ExecutionAttemptQuotaLookup {
  return {
    tenantId: TENANT,
    actionIntentId: INTENT_ID,
    executionRef: EXECUTION_REF,
    evaluatedAt: EVALUATED_AT as ExecutionAttemptQuotaLookup['evaluatedAt'],
    ...overrides,
  } as ExecutionAttemptQuotaLookup;
}

function snapshot(
  overrides: Partial<ExecutionAttemptQuotaSnapshot> = {},
): ExecutionAttemptQuotaSnapshot {
  return {
    attemptNumber: 2,
    maxAttempts: 3,
    authorizesExecution: false,
    ...overrides,
  };
}

function sourceReturning(value: ExecutionAttemptQuotaSnapshot | null): ExecutionAttemptQuotaSource {
  return { resolveCurrent: () => value };
}

test('positive: resolves a current tenant-scoped snapshot without granting authority', () => {
  let calls = 0;
  let seenLookup: ExecutionAttemptQuotaLookup | undefined;
  const source: ExecutionAttemptQuotaSource = {
    resolveCurrent: (l) => {
      calls += 1;
      seenLookup = l;
      return snapshot({ quota: { limit: 5, used: 1 } });
    },
  };

  const result = resolveCurrentAttemptQuota(lookup(), actionIntent(), source);

  assert.equal(calls, 1);
  assert.deepEqual(seenLookup, lookup());
  assert.equal(result.status, 'RESOLVED');
  assert.equal(result.authorizesExecution, false);
  if (result.status === 'RESOLVED') {
    assert.equal(result.snapshot.attemptNumber, 2);
    assert.equal(result.snapshot.maxAttempts, 3);
    assert.deepEqual(result.snapshot.quota, { limit: 5, used: 1 });
    assert.equal(result.snapshot.authorizesExecution, false);
  }
});

test('positive: quota is optional and omitted snapshot quota stays absent', () => {
  const result = resolveCurrentAttemptQuota(lookup(), actionIntent(), sourceReturning(snapshot()));

  assert.equal(result.status, 'RESOLVED');
  if (result.status === 'RESOLVED') {
    assert.equal(result.snapshot.quota, undefined);
  }
});

test('outage: throwing source fails closed and never fabricates a default', () => {
  const throwing: ExecutionAttemptQuotaSource = {
    resolveCurrent: () => {
      throw new Error('attempt/quota store unavailable');
    },
  };

  const result = resolveCurrentAttemptQuota(lookup(), actionIntent(), throwing);

  assert.equal(result.status, 'REJECTED');
  assert.equal(result.authorizesExecution, false);
  assert.deepEqual(result.status === 'REJECTED' ? result.reasons : [], [
    'ATTEMPT_QUOTA_SOURCE_UNAVAILABLE',
  ]);
});

test('outage: absent source fails closed', () => {
  const result = resolveCurrentAttemptQuota(lookup(), actionIntent(), undefined);

  assert.equal(result.status, 'REJECTED');
  assert.deepEqual(result.status === 'REJECTED' ? result.reasons : [], [
    'ATTEMPT_QUOTA_SOURCE_UNAVAILABLE',
  ]);
});

test('negative: state absence (null record) fails closed without inventing attempt=1', () => {
  const result = resolveCurrentAttemptQuota(lookup(), actionIntent(), sourceReturning(null));

  assert.equal(result.status, 'REJECTED');
  assert.deepEqual(result.status === 'REJECTED' ? result.reasons : [], [
    'ATTEMPT_QUOTA_SOURCE_UNAVAILABLE',
  ]);
});

test('negative: malformed attempt/maxAttempts values fail closed', () => {
  const cases: Array<Partial<ExecutionAttemptQuotaSnapshot>> = [
    { attemptNumber: 0 },
    { attemptNumber: -1 },
    { attemptNumber: 1.5 },
    { maxAttempts: 0 },
    { maxAttempts: Number.NaN },
    { authorizesExecution: true as unknown as false },
  ];
  for (const overrides of cases) {
    const result = resolveCurrentAttemptQuota(
      lookup(),
      actionIntent(),
      sourceReturning(snapshot(overrides)),
    );
    assert.equal(result.status, 'REJECTED', JSON.stringify(overrides));
    assert.deepEqual(result.status === 'REJECTED' ? result.reasons : [], [
      'ATTEMPT_QUOTA_STATE_MALFORMED',
    ]);
  }
});

test('negative: malformed quota (non-integer/negative) fails closed', () => {
  const malformedQuotas = [
    { limit: 0, used: 0 },
    { limit: 2, used: -1 },
    { limit: 1.5, used: 0 },
    { limit: Number.NaN, used: 0 },
  ];
  for (const quota of malformedQuotas) {
    const result = resolveCurrentAttemptQuota(
      lookup(),
      actionIntent(),
      sourceReturning(snapshot({ quota })),
    );
    assert.equal(result.status, 'REJECTED', JSON.stringify(quota));
    assert.deepEqual(result.status === 'REJECTED' ? result.reasons : [], [
      'ATTEMPT_QUOTA_STATE_MALFORMED',
    ]);
  }
});

test('boundary: attempt beyond maxAttempts still resolves structurally; the gate enforces the limit', () => {
  // The resolver validates shape, not attempt ordering; W07-C owns the
  // ATTEMPT_LIMIT_REACHED decision for the same snapshot.
  const result = resolveCurrentAttemptQuota(
    lookup(),
    actionIntent(),
    sourceReturning(snapshot({ attemptNumber: 4, maxAttempts: 3 })),
  );
  assert.equal(result.status, 'RESOLVED');

  const atLimit = resolveCurrentAttemptQuota(
    lookup(),
    actionIntent(),
    sourceReturning(snapshot({ attemptNumber: 1, maxAttempts: 1 })),
  );
  assert.equal(atLimit.status, 'RESOLVED');
});

test('boundary: quota used == limit resolves structurally; the gate enforces QUOTA_EXHAUSTED', () => {
  const result = resolveCurrentAttemptQuota(
    lookup(),
    actionIntent(),
    sourceReturning(snapshot({ quota: { limit: 3, used: 3 } })),
  );
  assert.equal(result.status, 'RESOLVED');
});

test('negative: tenant lookup that does not match the ActionIntent context fails closed', () => {
  const result = resolveCurrentAttemptQuota(
    lookup({ tenantId: 'tenant:other' as ExecutionAttemptQuotaLookup['tenantId'] }),
    actionIntent(),
    sourceReturning(snapshot()),
  );

  assert.equal(result.status, 'REJECTED');
  assert.deepEqual(result.status === 'REJECTED' ? result.reasons : [], [
    'ATTEMPT_QUOTA_TENANT_MISMATCH',
  ]);
});

test('negative/stale: invalid evaluation time fails closed before any source read', () => {
  let calls = 0;
  const counting: ExecutionAttemptQuotaSource = {
    resolveCurrent: () => {
      calls += 1;
      return snapshot();
    },
  };

  const result = resolveCurrentAttemptQuota(
    lookup({ evaluatedAt: 'not-a-time' as ExecutionAttemptQuotaLookup['evaluatedAt'] }),
    actionIntent(),
    counting,
  );

  assert.equal(calls, 0);
  assert.equal(result.status, 'REJECTED');
  assert.deepEqual(result.status === 'REJECTED' ? result.reasons : [], [
    'ATTEMPT_QUOTA_TIME_INVALID',
  ]);
});

test('negative: malformed lookup references fail closed before any source read', () => {
  let calls = 0;
  const counting: ExecutionAttemptQuotaSource = {
    resolveCurrent: () => {
      calls += 1;
      return snapshot();
    },
  };

  const badRefs = [
    lookup({ executionRef: '' }),
    lookup({ executionRef: '  padded  ' }),
    lookup({ executionRef: 'has space in middle ok?' }),
  ];
  for (const bad of badRefs) {
    const result = resolveCurrentAttemptQuota(bad, actionIntent(), counting);
    assert.equal(result.status, 'REJECTED', JSON.stringify(bad.executionRef));
  }
  assert.equal(calls, 0);
});

test('snapshot can feed the W07-C safeguard gate as its attempt/quota input', () => {
  // Demonstrates the resolver output shape matches the W07-C gate input so the
  // canonical source can re-read at the gate; the gate still owns the verdict.
  const resolved = resolveCurrentAttemptQuota(
    lookup(),
    actionIntent(),
    sourceReturning(snapshot({ attemptNumber: 1, maxAttempts: 3, quota: { limit: 2, used: 0 } })),
  );
  assert.equal(resolved.status, 'RESOLVED');
  if (resolved.status === 'RESOLVED') {
    const gateInput = {
      attemptNumber: resolved.snapshot.attemptNumber,
      maxAttempts: resolved.snapshot.maxAttempts,
      quota: resolved.snapshot.quota,
    };
    assert.deepEqual(gateInput, {
      attemptNumber: 1,
      maxAttempts: 3,
      quota: { limit: 2, used: 0 },
    });
  }
});
