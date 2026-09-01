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
      kind: 'PolicyEvaluationRequest',
      schemaVersion: '1.0.0',
      evaluatedAt: '2026-09-01T17:00:00Z',
      tenant: { tenantId: 'tenant:alpha' },
      actor: { kind: 'HUMAN', identityId: 'identity:operator' },
      subject: { kind: 'IDENTITY', identityId: 'identity:subject' },
      correlation: { correlationId: 'correlation:1' },
      action: 'PUBLISH',
      requestedScope: ['social.publish'],
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
  const effectiveScope = authorized ? [...policy.requestedScope] : [];
  const subjectReference =
    policy.subject.kind === 'IDENTITY'
      ? `identity:${policy.subject.identityId}`
      : `external:${policy.subject.externalIdentity.provider}:${policy.subject.externalIdentity.externalId}`;

  return {
    kind: 'AuthorityEvaluationResult',
    schemaVersion: policy.schemaVersion,
    correlation: policy.correlation,
    evaluatedAt: policy.evaluatedAt,
    currentPolicy: policy.policy,
    authorized,
    effectiveScope,
    reasons: authorized ? ['POLICY_ALLOWED'] : ['EXPLICIT_DENY'],
    evidence: {
      tenantId: policy.tenant.tenantId,
      actorIdentityId: policy.actor.identityId,
      subjectReference,
      action: policy.action,
      requestedScope: policy.requestedScope,
      effectiveScope,
      currentPolicy: policy.policy,
      inputFingerprint: 'fnv1a64:test',
    },
    ...(authorized
      ? {
          tokenValidation: {
            kind: 'PolicyTokenValidationResult',
            schemaVersion: policy.schemaVersion,
            correlation: policy.correlation,
            evaluatedAt: policy.evaluatedAt,
            currentPolicy: policy.policy,
            valid: true,
            effectiveScope,
            reasons: [],
            evidence: {
              policyTokenId: policy.policyToken?.policyTokenId,
              tenantId: policy.tenant.tenantId,
              actorIdentityId: policy.actor.identityId,
              subjectReference,
              action: policy.action,
              requestedScope: policy.requestedScope,
              effectiveScope,
              currentPolicy: policy.policy,
              inputFingerprint: 'fnv1a64:token',
            },
          },
          policyDecision: 'ALLOW',
          policyResult: {
            kind: 'PolicyEvaluationResult',
            schemaVersion: policy.schemaVersion,
            policy: policy.policy,
            correlation: policy.correlation,
            evaluatedAt: policy.evaluatedAt,
            decision: 'ALLOW',
            reasons: ['POLICY_ALLOWED'],
            evidence: {
              policy: policy.policy,
              tenantId: policy.tenant.tenantId,
              actorIdentityId: policy.actor.identityId,
              subjectReference,
              action: policy.action,
              requestedScope: policy.requestedScope,
              matchedRuleIds: ['rule:allow'],
              reasonReferences: [],
              inputFingerprint: 'fnv1a64:policy',
            },
          },
        }
      : {
          policyDecision: 'DENY',
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

test('requires current authority before progression', () => {
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
});

test('non-authoritative signals cannot bypass current denial', () => {
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
      executionBudgetReference: 'budget:non-authoritative',
    },
  });

  assert.equal(gate.executionEligible, false);
  assert.equal(gate.currentAuthorityValidated, false);
  assert.deepEqual(gate.reasons, ['CURRENT_AUTHORITY_DENIED']);
});

test('context mismatch fails closed before validator invocation', () => {
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

test('request schema mismatch fails closed before validator invocation', () => {
  let calls = 0;
  const gate = validateExecutorAuthority({
    schemaVersion: '2.0.0',
    actionIntent: intent,
    authorityEvaluation: evaluation(),
    validateCurrentAuthority: (request) => {
      calls += 1;
      return result(request, true);
    },
  });

  assert.equal(calls, 0);
  assert.deepEqual(gate.reasons, ['AUTHORITY_CONTEXT_MISMATCH']);
});

test('authority reference mismatch fails before validator invocation', () => {
  let calls = 0;
  const authorityEvaluation = evaluation({
    policyToken: { policyTokenId: 'policy-token:other' },
  });
  const gate = validateExecutorAuthority({
    schemaVersion: intent.schemaVersion,
    actionIntent: intent,
    authorityEvaluation,
    validateCurrentAuthority: (request) => {
      calls += 1;
      return result(request, true);
    },
  });

  assert.equal(calls, 0);
  assert.deepEqual(gate.reasons, ['AUTHORITY_REFERENCE_MISMATCH']);
});

test('stale current-policy result cannot become current authority', () => {
  const authorityEvaluation = evaluation();
  const gate = validateExecutorAuthority({
    schemaVersion: intent.schemaVersion,
    actionIntent: intent,
    authorityEvaluation,
    validateCurrentAuthority: (request) =>
      result(request, true, {
        currentPolicy: { reference: 'policy:execution', version: 'old' },
      }),
  });

  assert.equal(gate.executionEligible, false);
  assert.deepEqual(gate.reasons, ['CURRENT_AUTHORITY_RESULT_MISMATCH']);
});

test('forged widened effective scope is rejected', () => {
  const authorityEvaluation = evaluation();
  const gate = validateExecutorAuthority({
    schemaVersion: intent.schemaVersion,
    actionIntent: intent,
    authorityEvaluation,
    validateCurrentAuthority: (request) =>
      result(request, true, {
        effectiveScope: ['social.publish', 'admin.delete'],
      }),
  });

  assert.equal(gate.executionEligible, false);
  assert.deepEqual(gate.reasons, ['CURRENT_AUTHORITY_RESULT_MISMATCH']);
});

test('forged subject evidence is rejected even when validator claims allow', () => {
  const authorityEvaluation = evaluation();
  const canonical = result(authorityEvaluation, true) as AuthorityEvaluationResult & {
    readonly evidence: Record<string, unknown>;
  };
  const gate = validateExecutorAuthority({
    schemaVersion: intent.schemaVersion,
    actionIntent: intent,
    authorityEvaluation,
    validateCurrentAuthority: () =>
      ({
        ...canonical,
        evidence: { ...canonical.evidence, subjectReference: 'identity:other' },
      }) as unknown as AuthorityEvaluationResult,
  });

  assert.equal(gate.executionEligible, false);
  assert.deepEqual(gate.reasons, ['CURRENT_AUTHORITY_RESULT_MISMATCH']);
});

test('invalid token-validation evidence is rejected', () => {
  const authorityEvaluation = evaluation();
  const canonical = result(authorityEvaluation, true) as AuthorityEvaluationResult & {
    readonly tokenValidation: Record<string, unknown>;
  };
  const gate = validateExecutorAuthority({
    schemaVersion: intent.schemaVersion,
    actionIntent: intent,
    authorityEvaluation,
    validateCurrentAuthority: () =>
      ({
        ...canonical,
        tokenValidation: { ...canonical.tokenValidation, valid: false },
      }) as unknown as AuthorityEvaluationResult,
  });

  assert.equal(gate.executionEligible, false);
  assert.deepEqual(gate.reasons, ['CURRENT_AUTHORITY_RESULT_MISMATCH']);
});

test('validator failure is fail closed', () => {
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
