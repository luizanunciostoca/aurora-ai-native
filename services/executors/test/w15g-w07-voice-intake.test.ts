// @ts-expect-error -- executor harness has no @types/node; Node 22 provides this built-in.
import assert from 'node:assert/strict';
// @ts-expect-error -- executor harness has no @types/node; Node 22 provides this built-in.
import test from 'node:test';

import type { ActionIntent } from '@aurora/contracts/actions';
import type {
  AuthorityEvaluationRequest,
  AuthorityEvaluationResult,
} from '@aurora/contracts/policy-validation';

import { evaluateVoiceCandidate } from '../src/voice-intake/index.js';
import type {
  AuthenticatedVoiceEvaluationContext,
  VoiceAuthorityEvaluationResolver,
  VoiceEvaluationCandidate,
} from '../src/voice-intake/index.js';

const candidate: VoiceEvaluationCandidate = {
  commandId: 'voice:open-dashboard',
  capabilityId: 'device.app.open',
  normalizedTranscript: 'abrir painel',
  requiresW07Authorization: true,
  authorizesExecution: false,
};

const context: AuthenticatedVoiceEvaluationContext = {
  tenantId: 'tenant:alpha',
  actorIdentityId: 'identity:operator',
  correlationId: 'correlation:voice-1',
  gatewaySessionId: 'gateway:session-1',
  connectionId: 'gateway:connection-1',
  deviceSessionId: 'device:session-1',
  deviceId: 'dvc_01ARZ3NDEKTSV4RRFFQ69G5FAV',
  registrationVersion: 2,
};

function actionIntent(overrides: Record<string, unknown> = {}): ActionIntent {
  return {
    kind: 'ACTION_INTENT',
    schemaVersion: '1.0.0',
    actionIntentId: 'action-intent:voice-1',
    capability: { capability: candidate.capabilityId, actionType: 'OPEN_APP' },
    executionTarget: {
      schemaVersion: '1.0.0',
      kind: 'DEVICE',
      bindingReference: context.deviceId,
    },
    tenant: { tenantId: context.tenantId },
    actor: { kind: 'HUMAN', identityId: context.actorIdentityId },
    requestOrigin: { kind: 'HUMAN', identityId: context.actorIdentityId },
    correlation: { correlationId: context.correlationId },
    resolvedParameters: {},
    idempotency: { mode: 'REQUIRED', key: 'idem:voice-1' },
    preconditions: [],
    deadlineAt: '2026-09-05T15:00:00Z',
    authority: { kind: 'POLICY_TOKEN', policyTokenId: 'policy-token:voice-1' },
    dataClassification: 'INTERNAL',
    ...overrides,
  } as unknown as ActionIntent;
}

function evaluation(overrides: Record<string, unknown> = {}): AuthorityEvaluationRequest {
  return {
    kind: 'AuthorityEvaluationRequest',
    policyEvaluation: {
      kind: 'PolicyEvaluationRequest',
      schemaVersion: '1.0.0',
      evaluatedAt: '2026-09-05T14:00:00Z',
      tenant: { tenantId: context.tenantId },
      actor: { kind: 'HUMAN', identityId: context.actorIdentityId },
      subject: { kind: 'IDENTITY', identityId: context.actorIdentityId },
      correlation: { correlationId: context.correlationId },
      action: 'OPEN_APP',
      requestedScope: [candidate.capabilityId],
      policy: { reference: 'policy:device-voice', version: '3' },
      policyToken: { policyTokenId: 'policy-token:voice-1' },
      ...overrides,
    },
  } as unknown as AuthorityEvaluationRequest;
}

function authorityResult(
  request: AuthorityEvaluationRequest,
  authorized: boolean,
): AuthorityEvaluationResult {
  const policy = request.policyEvaluation;
  const effectiveScope = authorized ? [...policy.requestedScope] : [];
  const subjectReference = `identity:${context.actorIdentityId}`;
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
      inputFingerprint: 'fnv1a64:voice',
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
              inputFingerprint: 'fnv1a64:voice-token',
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
              matchedRuleIds: ['rule:voice-allow'],
              reasonReferences: [],
              inputFingerprint: 'fnv1a64:voice-policy',
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
  } as unknown as AuthorityEvaluationResult;
}

function resolver(
  authorized = true,
  intent = actionIntent(),
  authorityEvaluation = evaluation(),
): VoiceAuthorityEvaluationResolver {
  return {
    resolve: () => ({
      actionIntent: intent,
      authorityEvaluation,
      validateCurrentAuthority: (request) => authorityResult(request, authorized),
    }),
  };
}

test('authenticated candidate reaches current W07 authority evaluation without becoming authority', () => {
  const result = evaluateVoiceCandidate(candidate, context, resolver(true));
  assert.equal(result.ok, true);
  assert.equal(result.acceptedForEvaluation, true);
  assert.equal(result.authorizesExecution, false);
  assert.equal(result.provesExecutionSuccess, false);
  assert.equal(result.retryAuthorized, false);
  if (!result.ok) return;
  assert.equal(result.gate.currentAuthorityValidated, true);
  assert.equal(result.gate.executionEligible, true);
  assert.equal(result.gate.authorizesExecution, false);
});

test('current W02 denial remains evaluation-only and cannot be overridden by voice fast path', () => {
  const result = evaluateVoiceCandidate(candidate, context, resolver(false));
  assert.equal(result.ok, true);
  assert.equal(result.authorizesExecution, false);
  assert.equal(result.retryAuthorized, false);
  if (!result.ok) return;
  assert.equal(result.gate.executionEligible, false);
  assert.deepEqual(result.gate.reasons, ['CURRENT_AUTHORITY_DENIED']);
});

test('server-resolved tenant actor correlation and device target must match authenticated W14 context', () => {
  const forged = actionIntent({ tenant: { tenantId: 'tenant:forged' } });
  const result = evaluateVoiceCandidate(candidate, context, resolver(true, forged));
  assert.equal(result.ok, false);
  if (result.ok) return;
  assert.equal(result.error.code, 'CANONICAL_CONTEXT_MISMATCH');
  assert.equal(result.authorizesExecution, false);
});

test('server-resolved capability must match the bounded W15 candidate', () => {
  const wrongCapability = actionIntent({
    capability: { capability: 'device.camera.capture', actionType: 'OPEN_APP' },
  });
  const result = evaluateVoiceCandidate(candidate, context, resolver(true, wrongCapability));
  assert.equal(result.ok, false);
  if (result.ok) return;
  assert.equal(result.error.code, 'CANONICAL_CAPABILITY_MISMATCH');
});

test('authority-shaped or malformed candidate values fail before canonical resolver invocation', () => {
  let calls = 0;
  const malformed = {
    ...candidate,
    authorizesExecution: true,
  } as unknown as VoiceEvaluationCandidate;
  const result = evaluateVoiceCandidate(malformed, context, {
    resolve: () => {
      calls += 1;
      return null;
    },
  });
  assert.equal(calls, 0);
  assert.equal(result.ok, false);
  if (result.ok) return;
  assert.equal(result.error.code, 'CANDIDATE_MALFORMED');
});

test('missing or failing canonical resolver fails closed and never authorizes retry', () => {
  const missing = evaluateVoiceCandidate(candidate, context, { resolve: () => null });
  assert.equal(missing.ok, false);
  assert.equal(missing.retryAuthorized, false);

  const failed = evaluateVoiceCandidate(candidate, context, {
    resolve: () => {
      throw new Error('control plane unavailable');
    },
  });
  assert.equal(failed.ok, false);
  assert.equal(failed.retryAuthorized, false);
});
