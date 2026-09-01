// @ts-expect-error -- executor harness has no @types/node; Node 22 provides this built-in.
import assert from 'node:assert/strict';
// @ts-expect-error -- executor harness has no @types/node; Node 22 provides this built-in.
import test from 'node:test';

import type { ActionIntent } from '@aurora/contracts/actions';
import type {
  AuthorityEvaluationRequest,
  AuthorityEvaluationResult,
} from '@aurora/contracts/policy-validation';

import { validateExecutorAuthority } from '../src/sdk/index.js';

const intent = {
  kind: 'ACTION_INTENT',
  schemaVersion: '1.0.0',
  actionIntentId: 'action-intent:1',
  capability: { capability: 'social.publish', actionType: 'PUBLISH' },
  tenant: { tenantId: 'tenant:alpha' },
  actor: { kind: 'HUMAN', identityId: 'identity:operator' },
  requestOrigin: { kind: 'HUMAN', identityId: 'identity:operator' },
  correlation: { correlationId: 'correlation:1' },
  resolvedParameters: {},
  idempotency: { mode: 'REQUIRED', key: 'idem:1' },
  preconditions: [],
  deadlineAt: '2026-09-01T18:00:00Z',
  authority: { kind: 'POLICY_TOKEN', policyTokenId: 'policy-token:1' },
  dataClassification: 'INTERNAL',
} as unknown as ActionIntent;

function evaluation(overrides: Record<string, unknown> = {}): AuthorityEvaluationRequest {
  return {
    kind: 'AuthorityEvaluationRequest',
    policyEvaluation: {
      schemaVersion: '1.0.0',
      evaluatedAt: '2026-09-01T17:00:00Z',
      tenant: { tenantId: 'tenant:alpha' },
      actor: { kind: 'HUMAN', identityId: 'identity:operator' },
      correlation: { correlationId: 'correlation:1' },
      action: 'PUBLISH',
      policy: { reference: 'policy:execution', version: '7' },
      policyToken: { policyTokenId: 'policy-token:1' },
      ...overrides,
    },
  } as unknown as AuthorityEvaluationRequest;
}

function result(
  request: AuthorityEvaluationRequest,
  authorized = true,
  overrides: Record<string, unknown> = {},
): AuthorityEvaluationResult {
  const policy = request.policyEvaluation;
  return {
    kind: 'AuthorityEvaluationResult',
    schemaVersion: policy.schemaVersion,
    correlation: policy.correlation,
    evaluatedAt: policy.evaluatedAt,
    currentPolicy: policy.policy,
    authorized,
    effectiveScope: authorized ? ['social.publish'] : [],
    reasons: authorized ? ['POLICY_ALLOWED'] : ['EXPLICIT_DENY'],
    evidence: {
      tenantId: policy.tenant.tenantId,
      actorIdentityId: policy.actor.identityId,
      subjectReference: 'identity:subject',
      action: policy.action,
      requestedScope: ['social.publish'],
      effectiveScope: authorized ? ['social.publish'] : [],
      currentPolicy: policy.policy,
      inputFingerprint: 'fnv1a64:test',
    },
    policyDecision: authorized ? 'ALLOW' : 'DENY',
    policyResult: { decision: authorized ? 'ALLOW' : 'DENY' },
    ...(authorized
      ? {}
      : {
          error: {
            kind: 'CanonicalError',
            schemaVersion: policy.schemaVersion,
            code: 'FORBIDDEN',
            category: 'AUTHORIZATION',
            message: 'denied',
            retryability: 'DO_NOT_RETRY',
            correlationId: policy.correlation.correlationId,
            timestamp: policy.evaluatedAt,
          },
        }),
    ...overrides,
  } as unknown as AuthorityEvaluationResult;
}

test(
  'permits progression only after current authority validation and never performs execution',
  () => {
    const authorityEvaluation = evaluation();
    let calls = 0;
    const gate = validateExecutorAuthority({
      schemaVersion: intent.schemaVersion,
      actionIntent: intent,
      authorityEvaluation,
      validateCurrentAuthority: (request) => {
        calls += 1;
        return result(request, true);
      },
    });

    assert.equal(calls, 1);
    assert.equal(gate.currentAuthorityValidated, true);
    assert.equal(gate.executionEligible, true);
    assert.equal(gate.authorizesExecution, false);
  },
);

test('Fast Lane, confidence, precheck and ExecutionBudget cannot bypass current denial', () => {
  const authorityEvaluation = evaluation();
  const gate = validateExecutorAuthority({
    schemaVersion: intent.schemaVersion,
    actionIntent: intent,
    authorityEvaluation,
    validateCurrentAuthority: (request) => result(request, false),
    nonAuthoritativeSignals: {
      lane: 'FAST',
      confidence: 1,
      precheckReference: 'precheck:allow',
      executionBudgetReference: 'budget:unbounded-looking-but-non-authoritative',
    },
  });

  assert.equal(gate.executionEligible, false);
  assert.equal(gate.currentAuthorityValidated, false);
  assert.deepEqual(gate.reasons, ['CURRENT_AUTHORITY_DENIED']);
});

test('mismatched intent/evaluation context fails closed before invoking validator', () => {
  let calls = 0;
  const gate = validateExecutorAuthority({
    schemaVersion: intent.schemaVersion,
    actionIntent: intent,
    authorityEvaluation: evaluation({ action: 'DELETE' }),
    validateCurrentAuthority: (request) => {
      calls += 1;
      return result(request, true);
    },
  });

  assert.equal(calls, 0);
  assert.deepEqual(gate.reasons, ['AUTHORITY_CONTEXT_MISMATCH']);
});

test('authority reference mismatch fails closed before invoking validator', () => {
  let calls = 0;
  const gate = validateExecutorAuthority({
    schemaVersion: intent.schemaVersion,
    actionIntent: intent,
    authorityEvaluation: evaluation({ policyToken: { policyTokenId: 'policy-token:other' } }),
    validateCurrentAuthority: (request) => {
      calls += 1;
      return result(request, true);
    },
  });

  assert.equal(calls, 0);
  assert.deepEqual(gate.reasons, ['AUTHORITY_REFERENCE_MISMATCH']);
});

test('forged/stale validator result cannot be accepted as current authority', () => {
  const authorityEvaluation = evaluation();
  const gate = validateExecutorAuthority({
    schemaVersion: intent.schemaVersion,
    actionIntent: intent,
    authorityEvaluation,
    validateCurrentAuthority: (request) =>
      result(request, true, { currentPolicy: { reference: 'policy:execution', version: 'old' } }),
  });

  assert.equal(gate.executionEligible, false);
  assert.deepEqual(gate.reasons, ['CURRENT_AUTHORITY_RESULT_MISMATCH']);
});

test('validator failure is fail-closed and cannot be converted into execution eligibility', () => {
  const gate = validateExecutorAuthority({
    schemaVersion: intent.schemaVersion,
    actionIntent: intent,
    authorityEvaluation: evaluation(),
    validateCurrentAuthority: () => {
      throw new Error('authority backend unavailable');
    },
  });

  assert.equal(gate.executionEligible, false);
  assert.deepEqual(gate.reasons, ['CURRENT_AUTHORITY_VALIDATOR_FAILED']);
  assert.equal(gate.authorizesExecution, false);
});
