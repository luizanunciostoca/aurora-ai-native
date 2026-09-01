// @ts-expect-error -- executor harness has no @types/node; Node 22 provides this built-in.
import assert from 'node:assert/strict';
// @ts-expect-error -- executor harness has no @types/node; Node 22 provides this built-in.
import test from 'node:test';

import type { ActionIntent, JsonObject } from '@aurora/contracts/actions';
import type { Rfc3339Timestamp } from '@aurora/contracts/context';
import type { Evidence } from '@aurora/contracts/evidence';
import type { ExecutionTargetReference } from '@aurora/contracts/execution-target';
import type { TargetedReceipt } from '@aurora/contracts/receipts';
import type { ContractVersion } from '@aurora/contracts/versioning';

import {
  captureReadbackEvidence,
  createTargetedExecutionReceipt,
} from '../src/readback/index.js';

const version = '1.0.0' as ContractVersion;
const at = (value: string) => value as Rfc3339Timestamp;

const workflowTarget: ExecutionTargetReference = {
  schemaVersion: version,
  kind: 'WORKFLOW',
  bindingReference: 'workflow:publish',
};

function makeIntent(overrides: Record<string, unknown> = {}): ActionIntent {
  return {
    kind: 'ACTION_INTENT',
    schemaVersion: version,
    actionIntentId: 'action-intent:readback',
    capability: { capability: 'social.publish', actionType: 'PUBLISH' },
    executionTarget: workflowTarget,
    tenant: { tenantId: 'tenant:alpha' },
    actor: { kind: 'HUMAN', identityId: 'identity:operator' },
    requestOrigin: { kind: 'HUMAN', identityId: 'identity:operator' },
    correlation: { correlationId: 'correlation:readback' },
    resolvedParameters: {},
    idempotency: { mode: 'REQUIRED', key: 'idem:readback' },
    preconditions: [],
    expectedState: {
      stateType: 'publication',
      value: { status: 'published', count: 1 },
    },
    deadlineAt: at('2026-09-01T19:00:00Z'),
    authority: {
      kind: 'POLICY_TOKEN',
      policyTokenId: 'policy-token:readback',
    },
    dataClassification: 'INTERNAL',
    ...overrides,
  } as unknown as ActionIntent;
}

function makeReceipt(
  actionIntent = makeIntent(),
  overrides: Record<string, unknown> = {},
) {
  return createTargetedExecutionReceipt({
    schemaVersion: version,
    actionIntent,
    receiptId: 'receipt:readback' as TargetedReceipt['receiptId'],
    executor: { executor: 'executor:test' },
    attempt: 1,
    attemptedAt: at('2026-09-01T17:00:00Z'),
    acknowledgedAt: at('2026-09-01T17:00:01Z'),
    returnedAt: at('2026-09-01T17:00:02Z'),
    executionOutcome: 'EXECUTED_ACKNOWLEDGED',
    ...overrides,
  });
}

function receipt(actionIntent = makeIntent()): TargetedReceipt {
  const result = makeReceipt(actionIntent);
  assert.equal(result.status, 'CREATED');
  if (result.status !== 'CREATED') throw new Error('receipt fixture rejected');
  return result.receipt;
}

function evidenceId(): Evidence['evidenceId'] {
  return 'evidence:readback' as Evidence['evidenceId'];
}

function capture(
  actionIntent: ActionIntent,
  targetReceipt: TargetedReceipt,
  observedState?: JsonObject,
) {
  return captureReadbackEvidence({
    schemaVersion: version,
    evidenceId: evidenceId(),
    actionIntent,
    receipt: targetReceipt,
    readback: () => ({
      capturedAt: at('2026-09-01T17:00:03Z'),
      reference: { system: 'workflow', reference: 'run:readback' },
      ...(observedState === undefined ? {} : { observedState }),
    }),
  });
}

test('acknowledgement is not verified state', () => {
  const result = makeReceipt();
  assert.equal(result.status, 'CREATED');
  if (result.status !== 'CREATED') return;
  assert.equal(result.acknowledgementIsVerifiedExternalState, false);
  assert.equal(result.receipt.executionOutcome, 'EXECUTED_ACKNOWLEDGED');
  assert.equal(result.authorizesExecution, false);
});

test('receipt cannot mint VERIFIED', () => {
  const result = makeReceipt(makeIntent(), { executionOutcome: 'VERIFIED' });
  assert.equal(result.status, 'REJECTED');
  if (result.status === 'REJECTED') {
    assert.deepEqual(result.reasons, ['RECEIPT_VERIFIED_REQUIRES_EVIDENCE']);
  }
});

test('acknowledged outcome requires timestamp', () => {
  const result = makeReceipt(makeIntent(), { acknowledgedAt: undefined });
  assert.equal(result.status, 'REJECTED');
  if (result.status === 'REJECTED') {
    assert.deepEqual(result.reasons, ['RECEIPT_ACKNOWLEDGEMENT_REQUIRED']);
  }
});

test('legacy provider binding resolves canonically', () => {
  const actionIntent = makeIntent({
    executionTarget: undefined,
    providerBinding: {
      provider: 'meta',
      targetType: 'instagram_account',
      targetReference: 'ig:legacy',
    },
  });
  const result = makeReceipt(actionIntent);
  assert.equal(result.status, 'CREATED');
  if (result.status !== 'CREATED') return;
  assert.equal(result.receipt.executionTarget.kind, 'PROVIDER');
  if (result.receipt.executionTarget.kind !== 'PROVIDER') return;
  assert.equal(result.receipt.executionTarget.provider, 'meta');
  assert.equal(result.receipt.executionTarget.targetReference, 'ig:legacy');
});

test('conflicting provider targets fail closed', () => {
  const actionIntent = makeIntent({
    executionTarget: {
      schemaVersion: version,
      kind: 'PROVIDER',
      provider: 'google',
      targetType: 'ads_account',
      targetReference: 'gads:1',
    },
    providerBinding: {
      provider: 'meta',
      targetType: 'instagram_account',
      targetReference: 'ig:1',
    },
  });
  const result = makeReceipt(actionIntent);
  assert.equal(result.status, 'REJECTED');
  if (result.status === 'REJECTED') {
    assert.deepEqual(result.reasons, ['EXECUTION_TARGET_CONFLICT']);
  }
});

test('matching readback stays unverified', () => {
  const actionIntent = makeIntent();
  const result = capture(
    actionIntent,
    receipt(actionIntent),
    { count: 1, status: 'published' },
  );
  assert.equal(result.status, 'CAPTURED');
  if (result.status !== 'CAPTURED') return;
  assert.equal(result.assessment.state, 'MATCH');
  assert.equal(result.assessment.observedStateMatchesExpected, true);
  assert.equal(result.assessment.verifiedExternalState, false);
  assert.equal(result.evidence.verification.state, 'UNVERIFIED');
  assert.equal('derivedExecutionOutcome' in result.assessment, false);
});

test('mismatched readback is explicit', () => {
  const actionIntent = makeIntent();
  const result = capture(
    actionIntent,
    receipt(actionIntent),
    { count: 1, status: 'draft' },
  );
  assert.equal(result.status, 'CAPTURED');
  if (result.status !== 'CAPTURED') return;
  assert.equal(result.assessment.state, 'MISMATCH');
  assert.deepEqual(result.assessment.reasons, ['READBACK_MISMATCH']);
  assert.equal(result.assessment.verifiedExternalState, false);
});

test('missing expected state is UNKNOWN', () => {
  const actionIntent = makeIntent({ expectedState: undefined });
  const result = capture(
    actionIntent,
    receipt(actionIntent),
    { status: 'published' },
  );
  assert.equal(result.status, 'CAPTURED');
  if (result.status !== 'CAPTURED') return;
  assert.equal(result.assessment.state, 'UNKNOWN');
  assert.deepEqual(result.assessment.reasons, ['EXPECTED_STATE_NOT_DECLARED']);
});

test('missing observed state is UNKNOWN', () => {
  const actionIntent = makeIntent();
  const result = capture(actionIntent, receipt(actionIntent));
  assert.equal(result.status, 'CAPTURED');
  if (result.status !== 'CAPTURED') return;
  assert.equal(result.assessment.state, 'UNKNOWN');
  assert.deepEqual(result.assessment.reasons, ['OBSERVED_STATE_NOT_RETURNED']);
});

test('binding mismatch blocks port invocation', () => {
  const original = makeIntent();
  const changed = makeIntent({ actionIntentId: 'action-intent:other' });
  let calls = 0;
  const result = captureReadbackEvidence({
    schemaVersion: version,
    evidenceId: evidenceId(),
    actionIntent: changed,
    receipt: receipt(original),
    readback: () => {
      calls += 1;
      return {
        capturedAt: at('2026-09-01T17:00:03Z'),
        reference: { system: 'workflow', reference: 'run:blocked' },
      };
    },
  });
  assert.equal(calls, 0);
  assert.equal(result.status, 'REJECTED');
});

test('sensitive readback data is rejected', () => {
  const actionIntent = makeIntent();
  const states: JsonObject[] = [
    { api_token: 'x' },
    { accessToken: 'x' },
    { privateKey: 'x' },
    { diagnostic: 'authorization=secret' },
  ];
  for (const observedState of states) {
    const result = captureReadbackEvidence({
      schemaVersion: version,
      evidenceId: evidenceId(),
      actionIntent,
      receipt: receipt(actionIntent),
      readback: () => ({
        capturedAt: at('2026-09-01T17:00:03Z'),
        reference: { system: 'provider', reference: 'object:safe' },
        observedState,
      }),
    });
    assert.equal(result.status, 'REJECTED');
    if (result.status === 'REJECTED') {
      assert.deepEqual(result.reasons, ['READBACK_SENSITIVE_DATA_REJECTED']);
    }
  }
});

test('sensitive readback reference is rejected', () => {
  const actionIntent = makeIntent();
  const result = captureReadbackEvidence({
    schemaVersion: version,
    evidenceId: evidenceId(),
    actionIntent,
    receipt: receipt(actionIntent),
    readback: () => ({
      capturedAt: at('2026-09-01T17:00:03Z'),
      reference: {
        system: 'clientSecret',
        reference: 'https://example.invalid/object?token=secret',
      },
    }),
  });
  assert.equal(result.status, 'REJECTED');
  if (result.status === 'REJECTED') {
    assert.deepEqual(result.reasons, ['READBACK_SENSITIVE_DATA_REJECTED']);
  }
});

test('readback follows latest receipt timestamp', () => {
  const actionIntent = makeIntent();
  const result = captureReadbackEvidence({
    schemaVersion: version,
    evidenceId: evidenceId(),
    actionIntent,
    receipt: receipt(actionIntent),
    readback: () => ({
      capturedAt: at('2026-09-01T17:00:01.500Z'),
      reference: { system: 'workflow', reference: 'run:early' },
    }),
  });
  assert.equal(result.status, 'REJECTED');
  if (result.status === 'REJECTED') {
    assert.deepEqual(result.reasons, ['READBACK_TIME_ORDER_INVALID']);
  }
});

test('readback port failure stays non-authoritative', () => {
  const actionIntent = makeIntent();
  const result = captureReadbackEvidence({
    schemaVersion: version,
    evidenceId: evidenceId(),
    actionIntent,
    receipt: receipt(actionIntent),
    readback: () => {
      throw new Error('readback unavailable');
    },
  });
  assert.deepEqual(result, {
    status: 'REJECTED',
    reasons: ['READBACK_PORT_FAILED'],
    authorizesExecution: false,
  });
});

test('all target kinds preserve identity', () => {
  const targets: ExecutionTargetReference[] = [
    {
      schemaVersion: version,
      kind: 'PROVIDER',
      provider: 'meta',
      targetReference: 'ig:1',
    },
    {
      schemaVersion: version,
      kind: 'DEVICE',
      bindingReference: 'device:1',
    },
    {
      schemaVersion: version,
      kind: 'WORKFLOW',
      bindingReference: 'workflow:1',
    },
    {
      schemaVersion: version,
      kind: 'LOCAL_SERVICE',
      bindingReference: 'local:1',
    },
  ];
  for (const target of targets) {
    const result = makeReceipt(makeIntent({ executionTarget: target }));
    assert.equal(result.status, 'CREATED');
    if (result.status === 'CREATED') {
      assert.deepEqual(result.receipt.executionTarget, target);
    }
  }
});
