// @ts-expect-error -- executor harness has no @types/node; Node 22 provides this built-in.
import assert from 'node:assert/strict';
// @ts-expect-error -- executor harness has no @types/node; Node 22 provides this built-in.
import test from 'node:test';

import type { ActionIntent } from '@aurora/contracts/actions';
import type { Rfc3339Timestamp } from '@aurora/contracts/context';
import type { Evidence } from '@aurora/contracts/evidence';
import type { ExecutionTargetReference } from '@aurora/contracts/execution-target';
import type { TargetedReceipt } from '@aurora/contracts/receipts';
import type { ContractVersion } from '@aurora/contracts/versioning';

import { captureReadbackEvidence, createTargetedExecutionReceipt } from '../src/readback/index.js';

const version = '1.0.0' as ContractVersion;
const timestamp = (value: string) => value as Rfc3339Timestamp;

function intent(
  executionTarget: ExecutionTargetReference = {
    schemaVersion: version,
    kind: 'WORKFLOW',
    bindingReference: 'workflow:publish',
  },
  expectedState: ActionIntent['expectedState'] = {
    stateType: 'publication',
    value: { status: 'published', count: 1 },
  },
): ActionIntent {
  return {
    kind: 'ACTION_INTENT',
    schemaVersion: version,
    actionIntentId: 'action-intent:readback' as ActionIntent['actionIntentId'],
    capability: { capability: 'social.publish', actionType: 'PUBLISH' },
    executionTarget,
    tenant: { tenantId: 'tenant:alpha' as ActionIntent['tenant']['tenantId'] },
    actor: { kind: 'HUMAN', identityId: 'identity:operator' as ActionIntent['actor']['identityId'] },
    requestOrigin: {
      kind: 'HUMAN',
      identityId: 'identity:operator' as ActionIntent['requestOrigin']['identityId'],
    },
    correlation: {
      correlationId: 'correlation:readback' as ActionIntent['correlation']['correlationId'],
    },
    resolvedParameters: {},
    idempotency: { mode: 'REQUIRED', key: 'idem:readback' },
    preconditions: [],
    ...(expectedState === undefined ? {} : { expectedState }),
    deadlineAt: timestamp('2026-09-01T19:00:00Z'),
    authority: {
      kind: 'POLICY_TOKEN',
      policyTokenId: 'policy-token:readback' as Extract<
        ActionIntent['authority'],
        { kind: 'POLICY_TOKEN' }
      >['policyTokenId'],
    },
    dataClassification: 'INTERNAL',
  };
}

function createReceipt(actionIntent = intent(), overrides: Record<string, unknown> = {}) {
  return createTargetedExecutionReceipt({
    schemaVersion: version,
    actionIntent,
    receiptId: 'receipt:readback' as TargetedReceipt['receiptId'],
    executor: { executor: 'executor:test' },
    attempt: 1,
    attemptedAt: timestamp('2026-09-01T17:00:00Z'),
    acknowledgedAt: timestamp('2026-09-01T17:00:01Z'),
    returnedAt: timestamp('2026-09-01T17:00:02Z'),
    executionOutcome: 'EXECUTED_ACKNOWLEDGED',
    ...overrides,
  });
}

function targetedReceipt(actionIntent = intent()): TargetedReceipt {
  const result = createReceipt(actionIntent);
  assert.equal(result.status, 'CREATED');
  if (result.status !== 'CREATED') throw new Error('receipt fixture rejected');
  return result.receipt;
}

function evidenceId(): Evidence['evidenceId'] {
  return 'evidence:readback' as Evidence['evidenceId'];
}

test('creates a target-neutral receipt while acknowledgement remains unverified state', () => {
  const result = createReceipt();
  assert.equal(result.status, 'CREATED');
  assert.equal(result.authorizesExecution, false);
  if (result.status !== 'CREATED') return;
  assert.equal(result.acknowledgementIsVerifiedExternalState, false);
  assert.equal(result.receipt.executionOutcome, 'EXECUTED_ACKNOWLEDGED');
  assert.equal(result.receipt.executionTarget.kind, 'WORKFLOW');
  assert.equal(result.receipt.correlation.correlationId, 'correlation:readback');
  assert.equal('provider' in result.receipt, false);
  assert.equal('metadata' in result.receipt, false);
});

test('attempt creation cannot mint VERIFIED without evidence', () => {
  const result = createReceipt(intent(), { executionOutcome: 'VERIFIED' });
  assert.equal(result.status, 'REJECTED');
  if (result.status === 'REJECTED') {
    assert.deepEqual(result.reasons, ['RECEIPT_VERIFIED_REQUIRES_EVIDENCE']);
  }
});

test('readback MATCH records comparison but does not self-promote to VERIFIED', () => {
  const actionIntent = intent();
  const receipt = targetedReceipt(actionIntent);
  const result = captureReadbackEvidence({
    schemaVersion: version,
    evidenceId: evidenceId(),
    actionIntent,
    receipt,
    readback: () => ({
      capturedAt: timestamp('2026-09-01T17:00:03Z'),
      reference: { system: 'workflow', reference: 'run:123' },
      observedState: { count: 1, status: 'published' },
    }),
  });

  assert.equal(result.status, 'CAPTURED');
  if (result.status !== 'CAPTURED') return;
  assert.equal(result.assessment.state, 'MATCH');
  assert.equal(result.assessment.observedStateMatchesExpected, true);
  assert.equal(result.assessment.verifiedExternalState, false);
  assert.equal(result.assessment.receiptAcknowledged, true);
  assert.equal(result.authorizesExecution, false);
  assert.equal(result.evidence.evidenceType, 'READBACK');
  assert.equal(result.evidence.source.sourceType, 'TARGET_READBACK');
  assert.deepEqual(result.evidence.source.executionTarget, actionIntent.executionTarget);
  assert.equal(result.evidence.verification.state, 'UNVERIFIED');
  assert.equal('metadata' in result.evidence, false);
});

test('readback mismatch is explicit and acknowledgement cannot hide it', () => {
  const actionIntent = intent();
  const receipt = targetedReceipt(actionIntent);
  const result = captureReadbackEvidence({
    schemaVersion: version,
    evidenceId: evidenceId(),
    actionIntent,
    receipt,
    readback: () => ({
      capturedAt: timestamp('2026-09-01T17:00:03Z'),
      reference: { system: 'workflow', reference: 'run:124' },
      observedState: { status: 'draft', count: 1 },
    }),
  });

  assert.equal(result.status, 'CAPTURED');
  if (result.status !== 'CAPTURED') return;
  assert.equal(result.assessment.state, 'MISMATCH');
  assert.deepEqual(result.assessment.reasons, ['READBACK_MISMATCH']);
  assert.equal(result.assessment.observedStateMatchesExpected, false);
  assert.equal(result.assessment.receiptAcknowledged, true);
  assert.equal(result.assessment.verifiedExternalState, false);
});

test('missing expected or observed state remains UNKNOWN rather than verified success', () => {
  const withoutExpected = intent(undefined, undefined);
  const receiptWithoutExpected = targetedReceipt(withoutExpected);
  const unknownExpected = captureReadbackEvidence({
    schemaVersion: version,
    evidenceId: evidenceId(),
    actionIntent: withoutExpected,
    receipt: receiptWithoutExpected,
    readback: () => ({
      capturedAt: timestamp('2026-09-01T17:00:03Z'),
      reference: { system: 'workflow', reference: 'run:125' },
      observedState: { status: 'published' },
    }),
  });

  const actionIntent = intent();
  const unknownObserved = captureReadbackEvidence({
    schemaVersion: version,
    evidenceId: evidenceId(),
    actionIntent,
    receipt: targetedReceipt(actionIntent),
    readback: () => ({
      capturedAt: timestamp('2026-09-01T17:00:03Z'),
      reference: { system: 'workflow', reference: 'run:126' },
    }),
  });

  assert.equal(unknownExpected.status, 'CAPTURED');
  assert.equal(unknownObserved.status, 'CAPTURED');
  if (unknownExpected.status === 'CAPTURED') {
    assert.equal(unknownExpected.assessment.state, 'UNKNOWN');
    assert.equal(unknownExpected.assessment.observedStateMatchesExpected, null);
    assert.deepEqual(unknownExpected.assessment.reasons, ['EXPECTED_STATE_NOT_DECLARED']);
  }
  if (unknownObserved.status === 'CAPTURED') {
    assert.equal(unknownObserved.assessment.state, 'UNKNOWN');
    assert.equal(unknownObserved.assessment.observedStateMatchesExpected, null);
    assert.deepEqual(unknownObserved.assessment.reasons, ['OBSERVED_STATE_NOT_RETURNED']);
  }
});

test('receipt binding mismatch fails before the readback port is invoked', () => {
  const actionIntent = intent();
  const otherIntent = {
    ...actionIntent,
    actionIntentId: 'action-intent:other' as ActionIntent['actionIntentId'],
  };
  let calls = 0;
  const result = captureReadbackEvidence({
    schemaVersion: version,
    evidenceId: evidenceId(),
    actionIntent: otherIntent,
    receipt: targetedReceipt(actionIntent),
    readback: () => {
      calls += 1;
      return {
        capturedAt: timestamp('2026-09-01T17:00:03Z'),
        reference: { system: 'workflow', reference: 'run:127' },
      };
    },
  });

  assert.equal(calls, 0);
  assert.equal(result.status, 'REJECTED');
  if (result.status === 'REJECTED') {
    assert.deepEqual(result.reasons, ['READBACK_ACTION_INTENT_MISMATCH']);
  }
});

test('sensitive observed fields, values or references are rejected before Evidence', () => {
  const actionIntent = intent();
  const sensitiveField = captureReadbackEvidence({
    schemaVersion: version,
    evidenceId: evidenceId(),
    actionIntent,
    receipt: targetedReceipt(actionIntent),
    readback: () => ({
      capturedAt: timestamp('2026-09-01T17:00:03Z'),
      reference: { system: 'provider', reference: 'object:128' },
      observedState: { status: 'published', api_token: 'must-not-enter-evidence' },
    }),
  });
  const sensitiveValue = captureReadbackEvidence({
    schemaVersion: version,
    evidenceId: evidenceId(),
    actionIntent,
    receipt: targetedReceipt(actionIntent),
    readback: () => ({
      capturedAt: timestamp('2026-09-01T17:00:03Z'),
      reference: { system: 'provider', reference: 'object:129' },
      observedState: { diagnostic: 'authorization=must-not-enter-evidence' },
    }),
  });
  const sensitiveReference = captureReadbackEvidence({
    schemaVersion: version,
    evidenceId: evidenceId(),
    actionIntent,
    receipt: targetedReceipt(actionIntent),
    readback: () => ({
      capturedAt: timestamp('2026-09-01T17:00:03Z'),
      reference: { system: 'provider', reference: 'https://example.invalid/object?token=secret' },
    }),
  });

  for (const result of [sensitiveField, sensitiveValue, sensitiveReference]) {
    assert.equal(result.status, 'REJECTED');
    if (result.status === 'REJECTED') {
      assert.deepEqual(result.reasons, ['READBACK_SENSITIVE_DATA_REJECTED']);
    }
  }
});

test('readback failure and invalid timing stay explicit and non-authoritative', () => {
  const actionIntent = intent();
  const receipt = targetedReceipt(actionIntent);
  const failed = captureReadbackEvidence({
    schemaVersion: version,
    evidenceId: evidenceId(),
    actionIntent,
    receipt,
    readback: () => {
      throw new Error('readback unavailable');
    },
  });
  const tooEarly = captureReadbackEvidence({
    schemaVersion: version,
    evidenceId: evidenceId(),
    actionIntent,
    receipt,
    readback: () => ({
      capturedAt: timestamp('2026-09-01T16:59:59Z'),
      reference: { system: 'workflow', reference: 'run:130' },
    }),
  });

  assert.deepEqual(failed, {
    status: 'REJECTED',
    reasons: ['READBACK_PORT_FAILED'],
    authorizesExecution: false,
  });
  assert.equal(tooEarly.status, 'REJECTED');
  if (tooEarly.status === 'REJECTED') {
    assert.deepEqual(tooEarly.reasons, ['READBACK_TIME_ORDER_INVALID']);
  }
});

test('receipt creation fails closed for malformed timing and missing target', () => {
  const invalidTime = createReceipt(intent(), { attemptedAt: timestamp('not-a-time') });
  const missingTargetIntent = { ...intent(), executionTarget: undefined } as unknown as ActionIntent;
  const missingTarget = createReceipt(missingTargetIntent);

  assert.equal(invalidTime.status, 'REJECTED');
  if (invalidTime.status === 'REJECTED') {
    assert.deepEqual(invalidTime.reasons, ['RECEIPT_TIME_INVALID']);
  }
  assert.equal(missingTarget.status, 'REJECTED');
  if (missingTarget.status === 'REJECTED') {
    assert.deepEqual(missingTarget.reasons, ['EXECUTION_TARGET_REQUIRED']);
  }
});

test('PROVIDER, DEVICE, WORKFLOW and LOCAL_SERVICE receipts preserve exact target identity', () => {
  const targets = [
    {
      schemaVersion: version,
      kind: 'PROVIDER',
      provider: 'meta',
      targetType: 'instagram_account',
      targetReference: 'ig:1',
      accountReference: 'business:1',
    },
    { schemaVersion: version, kind: 'DEVICE', bindingReference: 'device-binding:1' },
    { schemaVersion: version, kind: 'WORKFLOW', bindingReference: 'workflow-binding:1' },
    { schemaVersion: version, kind: 'LOCAL_SERVICE', bindingReference: 'local-binding:1' },
  ] satisfies readonly ExecutionTargetReference[];

  for (const target of targets) {
    const result = createReceipt(intent(target));
    assert.equal(result.status, 'CREATED');
    if (result.status === 'CREATED') {
      assert.deepEqual(result.receipt.executionTarget, target);
      assert.equal(result.authorizesExecution, false);
    }
  }
});
