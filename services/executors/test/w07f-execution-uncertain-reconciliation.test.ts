// @ts-expect-error -- executor harness has no @types/node; Node 22 provides this built-in.
import assert from 'node:assert/strict';
// @ts-expect-error -- executor harness has no @types/node; Node 22 provides this built-in.
import test from 'node:test';

import type { ActionIntent } from '@aurora/contracts/actions';
import type { Rfc3339Timestamp } from '@aurora/contracts/context';
import type { ContractVersion } from '@aurora/contracts/versioning';

import type { CaptureReadbackEvidenceResult } from '../src/readback/index.js';
import {
  classifyExecutionAmbiguity,
  readbackReconciliationHint,
  reconcileExecutionUncertainty,
} from '../src/reconciliation/index.js';
import type { RetrySafeguardEvidence } from '../src/reconciliation/index.js';

const version = '1.0.0' as ContractVersion;
const at = (value: string) => value as Rfc3339Timestamp;

function intent(overrides: Record<string, unknown> = {}): ActionIntent {
  return {
    kind: 'ACTION_INTENT',
    schemaVersion: version,
    actionIntentId: 'action-intent:uncertain',
    capability: { capability: 'social.publish', actionType: 'PUBLISH' },
    executionTarget: {
      schemaVersion: version,
      kind: 'WORKFLOW',
      bindingReference: 'workflow:publish',
    },
    tenant: { tenantId: 'tenant:alpha' },
    actor: { kind: 'HUMAN', identityId: 'identity:operator' },
    requestOrigin: { kind: 'HUMAN', identityId: 'identity:operator' },
    correlation: { correlationId: 'correlation:uncertain' },
    resolvedParameters: {},
    idempotency: { mode: 'REQUIRED', key: 'idem:uncertain' },
    preconditions: [],
    expectedState: { stateType: 'publication', value: { status: 'published' } },
    deadlineAt: at('2026-09-01T20:00:00Z'),
    authority: { kind: 'POLICY_TOKEN', policyTokenId: 'policy-token:uncertain' },
    dataClassification: 'INTERNAL',
    ...overrides,
  } as unknown as ActionIntent;
}

function uncertainty(
  signal: 'TIMEOUT' | 'CONNECTION_LOST' | 'ACK_WITHOUT_VERIFICATION' = 'TIMEOUT',
  overrides: Record<string, unknown> = {},
) {
  const actionIntent = intent();
  const result = classifyExecutionAmbiguity({
    schemaVersion: version,
    actionIntent,
    occurredAt: at('2026-09-01T18:00:00Z'),
    attemptNumber: 1,
    maxAttempts: 3,
    signal,
    phase: 'AFTER_EXTERNAL_INVOCATION_STARTED',
    ...overrides,
  });
  assert.equal(result.status, 'EXECUTION_UNCERTAIN');
  if (result.status !== 'EXECUTION_UNCERTAIN') throw new Error('uncertainty fixture rejected');
  return { actionIntent, uncertainty: result.uncertainty };
}

function safeGuards(
  actionIntent = intent(),
  attemptNumber = 2,
  evaluatedAt = at('2026-09-01T18:00:03Z'),
): RetrySafeguardEvidence {
  return {
    attemptNumber,
    evaluatedAt,
    result: {
      kind: 'EXECUTION_SAFEGUARD_RESULT',
      schemaVersion: version,
      actionIntentId: actionIntent.actionIntentId,
      safeToInvokeExternal: true,
      idempotencyReserved: true,
      reasons: [],
      authorizesExecution: false,
    },
  };
}

function blockedGuards(
  actionIntent = intent(),
  attemptNumber = 2,
  evaluatedAt = at('2026-09-01T18:00:03Z'),
): RetrySafeguardEvidence {
  return {
    attemptNumber,
    evaluatedAt,
    result: {
      kind: 'EXECUTION_SAFEGUARD_RESULT',
      schemaVersion: version,
      actionIntentId: actionIntent.actionIntentId,
      safeToInvokeExternal: false,
      idempotencyReserved: false,
      reasons: ['IDEMPOTENCY_INFLIGHT'],
      authorizesExecution: false,
    },
  };
}

test('timeout before external invocation is known failure, not EXECUTION_UNCERTAIN', () => {
  const result = classifyExecutionAmbiguity({
    schemaVersion: version,
    actionIntent: intent(),
    occurredAt: at('2026-09-01T18:00:00Z'),
    attemptNumber: 1,
    maxAttempts: 3,
    signal: 'TIMEOUT',
    phase: 'BEFORE_EXTERNAL_INVOCATION',
  });
  assert.equal(result.status, 'KNOWN_PRE_EXECUTION_FAILURE');
  if (result.status !== 'KNOWN_PRE_EXECUTION_FAILURE') return;
  assert.equal(result.executionResult.outcome, 'FAILED');
  assert.equal(result.executionResult.error.code, 'TIMEOUT_BEFORE_EXECUTION');
  assert.equal(result.reconciliationRequired, false);
  assert.equal(result.authorizesExecution, false);
});

test('post-dispatch timeout becomes canonical EXECUTION_UNCERTAIN', () => {
  const result = classifyExecutionAmbiguity({
    schemaVersion: version,
    actionIntent: intent(),
    occurredAt: at('2026-09-01T18:00:00Z'),
    attemptNumber: 1,
    maxAttempts: 3,
    signal: 'TIMEOUT',
    phase: 'AFTER_EXTERNAL_INVOCATION_STARTED',
  });
  assert.equal(result.status, 'EXECUTION_UNCERTAIN');
  if (result.status !== 'EXECUTION_UNCERTAIN') return;
  assert.equal(result.uncertainty.executionResult.outcome, 'EXECUTION_UNCERTAIN');
  assert.equal(result.uncertainty.executionResult.error.retryability, 'RECONCILE_BEFORE_RETRY');
  assert.equal(result.retryAllowedBeforeReconciliation, false);
  assert.equal(result.authorizesExecution, false);
});

test('connection loss and acknowledgement without verification remain uncertain after dispatch', () => {
  for (const signal of ['CONNECTION_LOST', 'ACK_WITHOUT_VERIFICATION'] as const) {
    const result = classifyExecutionAmbiguity({
      schemaVersion: version,
      actionIntent: intent(),
      occurredAt: at('2026-09-01T18:00:00Z'),
      attemptNumber: 1,
      maxAttempts: 3,
      signal,
      phase: 'AFTER_EXTERNAL_INVOCATION_STARTED',
    });
    assert.equal(result.status, 'EXECUTION_UNCERTAIN');
  }
});

test('readback-only signals before external invocation are rejected as incompatible', () => {
  const result = classifyExecutionAmbiguity({
    schemaVersion: version,
    actionIntent: intent(),
    occurredAt: at('2026-09-01T18:00:00Z'),
    attemptNumber: 1,
    maxAttempts: 3,
    signal: 'READBACK_UNKNOWN',
    phase: 'BEFORE_EXTERNAL_INVOCATION',
  });
  assert.equal(result.status, 'REJECTED');
  if (result.status === 'REJECTED') {
    assert.deepEqual(result.reasons, ['SIGNAL_PHASE_INCOMPATIBLE']);
  }
});

test('blind equivalent retry remains blocked without reconciliation observation', () => {
  const fixture = uncertainty();
  const result = reconcileExecutionUncertainty({
    schemaVersion: version,
    actionIntent: fixture.actionIntent,
    uncertainty: fixture.uncertainty,
    retrySafeguards: safeGuards(fixture.actionIntent),
  });
  assert.equal(result.state, 'STILL_UNCERTAIN');
  assert.equal(result.retryEligibleAfterFreshGuards, false);
  assert.equal(result.reconciliationRequired, true);
  assert.deepEqual(result.reasons, ['RECONCILIATION_REQUIRED']);
});

test('observed expected effect prevents duplicate retry without claiming VERIFIED', () => {
  const fixture = uncertainty('ACK_WITHOUT_VERIFICATION');
  const result = reconcileExecutionUncertainty({
    schemaVersion: version,
    actionIntent: fixture.actionIntent,
    uncertainty: fixture.uncertainty,
    observation: {
      state: 'EFFECT_OBSERVED',
      observedAt: at('2026-09-01T18:00:02Z'),
      reference: 'readback:effect',
    },
    retrySafeguards: safeGuards(fixture.actionIntent),
  });
  assert.equal(result.state, 'EFFECT_OBSERVED');
  assert.equal(result.retryEligibleAfterFreshGuards, false);
  assert.equal(result.reconciliationRequired, false);
  assert.equal('executionOutcome' in result, false);
  assert.equal(result.authorizesExecution, false);
});

test('confirmed no-effect needs fresh W07-C safeguards before retry eligibility', () => {
  const fixture = uncertainty();
  const withoutGuards = reconcileExecutionUncertainty({
    schemaVersion: version,
    actionIntent: fixture.actionIntent,
    uncertainty: fixture.uncertainty,
    observation: {
      state: 'NO_EFFECT_CONFIRMED',
      observedAt: at('2026-09-01T18:00:02Z'),
    },
  });
  const withGuards = reconcileExecutionUncertainty({
    schemaVersion: version,
    actionIntent: fixture.actionIntent,
    uncertainty: fixture.uncertainty,
    observation: {
      state: 'NO_EFFECT_CONFIRMED',
      observedAt: at('2026-09-01T18:00:02Z'),
    },
    retrySafeguards: safeGuards(fixture.actionIntent),
  });
  assert.equal(withoutGuards.state, 'NO_EFFECT_CONFIRMED_RETRY_BLOCKED');
  assert.deepEqual(withoutGuards.reasons, ['RETRY_GUARDS_REQUIRED']);
  assert.equal(withGuards.state, 'NO_EFFECT_CONFIRMED_RETRY_ELIGIBLE');
  assert.equal(withGuards.retryEligibleAfterFreshGuards, true);
  assert.equal(withGuards.nextAttemptNumber, 2);
  assert.equal(withGuards.authorizesExecution, false);
});

test('failed fresh guards preserve duplicate fence after no-effect observation', () => {
  const fixture = uncertainty();
  const result = reconcileExecutionUncertainty({
    schemaVersion: version,
    actionIntent: fixture.actionIntent,
    uncertainty: fixture.uncertainty,
    observation: {
      state: 'NO_EFFECT_CONFIRMED',
      observedAt: at('2026-09-01T18:00:02Z'),
    },
    retrySafeguards: blockedGuards(fixture.actionIntent),
  });
  assert.equal(result.state, 'NO_EFFECT_CONFIRMED_RETRY_BLOCKED');
  assert.equal(result.retryEligibleAfterFreshGuards, false);
  assert.deepEqual(result.reasons, ['RETRY_GUARDS_BLOCKED']);
});

test('retry safeguards must be for the next attempt and newer than reconciliation', () => {
  const fixture = uncertainty();
  const observation = {
    state: 'NO_EFFECT_CONFIRMED' as const,
    observedAt: at('2026-09-01T18:00:02Z'),
  };
  const stale = reconcileExecutionUncertainty({
    schemaVersion: version,
    actionIntent: fixture.actionIntent,
    uncertainty: fixture.uncertainty,
    observation,
    retrySafeguards: safeGuards(fixture.actionIntent, 2, at('2026-09-01T18:00:01Z')),
  });
  const wrongAttempt = reconcileExecutionUncertainty({
    schemaVersion: version,
    actionIntent: fixture.actionIntent,
    uncertainty: fixture.uncertainty,
    observation,
    retrySafeguards: safeGuards(fixture.actionIntent, 3),
  });
  const invalidTime = reconcileExecutionUncertainty({
    schemaVersion: version,
    actionIntent: fixture.actionIntent,
    uncertainty: fixture.uncertainty,
    observation,
    retrySafeguards: safeGuards(fixture.actionIntent, 2, at('not-a-time')),
  });
  assert.deepEqual(stale.reasons, ['RETRY_GUARDS_STALE']);
  assert.deepEqual(wrongAttempt.reasons, ['RETRY_GUARDS_ATTEMPT_MISMATCH']);
  assert.deepEqual(invalidTime.reasons, ['RETRY_GUARDS_TIME_INVALID']);
  assert.equal(stale.retryEligibleAfterFreshGuards, false);
  assert.equal(wrongAttempt.retryEligibleAfterFreshGuards, false);
  assert.equal(invalidTime.retryEligibleAfterFreshGuards, false);
});

test('attempt limit blocks retry even after confirmed no-effect', () => {
  const fixture = uncertainty('TIMEOUT', { attemptNumber: 3, maxAttempts: 3 });
  const result = reconcileExecutionUncertainty({
    schemaVersion: version,
    actionIntent: fixture.actionIntent,
    uncertainty: fixture.uncertainty,
    observation: {
      state: 'NO_EFFECT_CONFIRMED',
      observedAt: at('2026-09-01T18:00:02Z'),
    },
    retrySafeguards: safeGuards(fixture.actionIntent),
  });
  assert.equal(result.state, 'NO_EFFECT_CONFIRMED_RETRY_BLOCKED');
  assert.deepEqual(result.reasons, ['RETRY_ATTEMPT_LIMIT_REACHED']);
});

test('indeterminate reconciliation never becomes retry authority', () => {
  const fixture = uncertainty('CONNECTION_LOST');
  const result = reconcileExecutionUncertainty({
    schemaVersion: version,
    actionIntent: fixture.actionIntent,
    uncertainty: fixture.uncertainty,
    observation: {
      state: 'INDETERMINATE',
      observedAt: at('2026-09-01T18:00:03Z'),
      reason: 'target unavailable',
    },
    retrySafeguards: safeGuards(fixture.actionIntent),
  });
  assert.equal(result.state, 'STILL_UNCERTAIN');
  assert.equal(result.reconciliationRequired, true);
  assert.equal(result.retryEligibleAfterFreshGuards, false);
  assert.equal(result.authorizesExecution, false);
});

test('mismatched action intent and stale observation fail closed', () => {
  const fixture = uncertainty();
  const otherIntent = intent({ actionIntentId: 'action-intent:other' });
  const mismatch = reconcileExecutionUncertainty({
    schemaVersion: version,
    actionIntent: otherIntent,
    uncertainty: fixture.uncertainty,
  });
  const stale = reconcileExecutionUncertainty({
    schemaVersion: version,
    actionIntent: fixture.actionIntent,
    uncertainty: fixture.uncertainty,
    observation: {
      state: 'NO_EFFECT_CONFIRMED',
      observedAt: at('2026-09-01T17:59:59Z'),
    },
    retrySafeguards: safeGuards(fixture.actionIntent),
  });
  assert.deepEqual(mismatch.reasons, ['RECONCILIATION_ACTION_INTENT_MISMATCH']);
  assert.deepEqual(stale.reasons, ['RECONCILIATION_TIME_ORDER_INVALID']);
  assert.equal(mismatch.retryEligibleAfterFreshGuards, false);
  assert.equal(stale.retryEligibleAfterFreshGuards, false);
});

test('W07-E MATCH is an effect-observed hint, never a VERIFIED promotion', () => {
  const match = {
    status: 'CAPTURED',
    assessment: { state: 'MATCH' },
  } as unknown as CaptureReadbackEvidenceResult;
  const mismatch = {
    status: 'CAPTURED',
    assessment: { state: 'MISMATCH' },
  } as unknown as CaptureReadbackEvidenceResult;
  const rejected = { status: 'REJECTED' } as unknown as CaptureReadbackEvidenceResult;

  assert.deepEqual(readbackReconciliationHint(match), {
    state: 'EFFECT_OBSERVED',
    reason: 'READBACK_MATCH_OBSERVED',
    authorizesExecution: false,
  });
  assert.equal(readbackReconciliationHint(mismatch).state, 'INDETERMINATE');
  assert.equal(readbackReconciliationHint(rejected).state, 'INDETERMINATE');
});
