// @ts-expect-error -- executor tests target Node 22 without repository-wide @types/node.
import assert from 'node:assert/strict';
// @ts-expect-error -- executor tests target Node 22 without repository-wide @types/node.
import test from 'node:test';

import type { ActionIntent } from '@aurora/contracts/actions';
import type { ExecutionAttemptQuotaSource } from '../src/safeguards/attempt-quota-source.js';
import { DurableCurrentVoiceSafeguardStateSource } from '../src/voice-intake/durable-current-safeguard-source.js';

const TENANT = 'ten_01ARZ3NDEKTSV4RRFFQ69G5FAV';
const ACTION = 'act_01ARZ3NDEKTSV4RRFFQ69G5FAV';
const EXECUTION = 'exe_01ARZ3NDEKTSV4RRFFQ69G5FAV';
const NOW = '2026-09-06T05:40:00.000Z';

function intent(): ActionIntent {
  return {
    kind: 'ACTION_INTENT',
    schemaVersion: '1.0.0',
    actionIntentId: ACTION,
    capability: { capability: 'camera.open', actionType: 'OPEN_CAMERA' },
    executionTarget: { schemaVersion: '1.0.0', kind: 'DEVICE', bindingReference: 'dvc_01ARZ3NDEKTSV4RRFFQ69G5FAV' },
    tenant: { tenantId: TENANT },
    actor: { kind: 'HUMAN', identityId: 'idn_01ARZ3NDEKTSV4RRFFQ69G5FAV' },
    requestOrigin: { kind: 'HUMAN', identityId: 'idn_01ARZ3NDEKTSV4RRFFQ69G5FAV' },
    correlation: { correlationId: 'cor_01ARZ3NDEKTSV4RRFFQ69G5FAV' },
    resolvedParameters: {},
    idempotency: { mode: 'REQUIRED', key: 'camera:open' },
    preconditions: [],
    deadlineAt: '2026-09-06T05:45:00.000Z',
    authority: { kind: 'POLICY_TOKEN', policyTokenId: 'ptk_test_fixture' },
    dataClassification: 'INTERNAL',
  } as unknown as ActionIntent;
}

function durable(updatedAt = '2026-09-06T05:39:59.500Z'): ExecutionAttemptQuotaSource {
  return {
    lookup: (lookup) => ({
      ...lookup,
      attemptNumber: 1,
      maxAttempts: 3,
      quota: { limit: 10, used: 0 },
      version: 2,
      updatedAt,
    }),
  };
}

test('re-reads current durable attempt/quota for the server-preissued execution id', () => {
  let seenExecutionRef = '';
  const source: ExecutionAttemptQuotaSource = {
    lookup: (lookup) => {
      seenExecutionRef = lookup.executionRef;
      return {
        ...lookup,
        attemptNumber: 2,
        maxAttempts: 4,
        version: 3,
        updatedAt: '2026-09-06T05:39:59.000Z',
      };
    },
  };
  const adapter = new DurableCurrentVoiceSafeguardStateSource({ durableState: source, maxAgeMs: 5_000 });
  const result = adapter.resolve({ actionIntent: intent(), tenantId: TENANT, executionRef: EXECUTION, evaluatedAt: NOW });
  assert.deepEqual(result, { attemptNumber: 2, maxAttempts: 4, authorizesExecution: false });
  assert.equal(seenExecutionRef, EXECUTION);
});

test('stale, absent and malformed durable state fail closed without defaults', () => {
  const stale = new DurableCurrentVoiceSafeguardStateSource({
    durableState: durable('2026-09-06T05:30:00.000Z'),
    maxAgeMs: 5_000,
  });
  assert.equal(stale.resolve({ actionIntent: intent(), tenantId: TENANT, executionRef: EXECUTION, evaluatedAt: NOW }), null);

  const absent = new DurableCurrentVoiceSafeguardStateSource({
    durableState: { lookup: () => null },
    maxAgeMs: 5_000,
  });
  assert.equal(absent.resolve({ actionIntent: intent(), tenantId: TENANT, executionRef: EXECUTION, evaluatedAt: NOW }), null);

  const malformed = new DurableCurrentVoiceSafeguardStateSource({
    durableState: {
      lookup: (lookup) => ({ ...lookup, attemptNumber: 0, maxAttempts: 3, version: 1, updatedAt: NOW }),
    },
    maxAgeMs: 5_000,
  });
  assert.equal(malformed.resolve({ actionIntent: intent(), tenantId: TENANT, executionRef: EXECUTION, evaluatedAt: NOW }), null);
});

test('tenant drift and Android-like malformed execution ref fail before durable read', () => {
  let calls = 0;
  const adapter = new DurableCurrentVoiceSafeguardStateSource({
    durableState: {
      lookup: () => {
        calls += 1;
        return null;
      },
    },
    maxAgeMs: 5_000,
  });
  assert.equal(
    adapter.resolve({
      actionIntent: intent(),
      tenantId: 'ten_01ARZ3NDEKTSV4RRFFQ69G5FAW',
      executionRef: EXECUTION,
      evaluatedAt: NOW,
    }),
    null,
  );
  assert.equal(adapter.resolve({ actionIntent: intent(), tenantId: TENANT, executionRef: 'bad ref', evaluatedAt: NOW }), null);
  assert.equal(calls, 0);
});
