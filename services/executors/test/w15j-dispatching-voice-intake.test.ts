// @ts-expect-error -- executor harness has no @types/node; Node 22 provides this built-in.
import assert from 'node:assert/strict';
// @ts-expect-error -- executor harness has no @types/node; Node 22 provides this built-in.
import test from 'node:test';

import type { ActionIntent } from '@aurora/contracts/actions';
import type {
  AuthorityEvaluationRequest,
  AuthorityEvaluationResult,
} from '@aurora/contracts/policy-validation';

import type {
  W14GovernedDeviceDispatchPort,
  W14GovernedDeviceDispatchRequest,
  W14GovernedDeviceDispatchResult,
} from '../src/device-dispatch/governed-device-dispatch.js';
import type { IdempotencyFencePort } from '../src/safeguards/types.js';
import {
  W15JDispatchingVoiceCandidateIntake,
  type TrustedVoiceExecutionState,
  type TrustedVoiceExecutionStateLookup,
  type TrustedVoiceExecutionStateSource,
} from '../src/voice-intake/dispatching-intake.js';
import type {
  AuthenticatedVoiceEvaluationContext,
  VoiceAuthorityEvaluationResolver,
  VoiceEvaluationCandidate,
} from '../src/voice-intake/types.js';

const NOW = '2026-09-05T19:30:00.000Z';
const NOW_MS = Date.parse(NOW);
const TENANT = 'ten_01J00000000000000000000000';
const ACTOR = 'idn_01J00000000000000000000000';
const CORRELATION = 'cor_01J00000000000000000000000';
const DEVICE = 'dvc_01ARZ3NDEKTSV4RRFFQ69G5FAV';
const COMMAND = 'cmd_01ARZ3NDEKTSV4RRFFQ69G5FAV';

const candidate: VoiceEvaluationCandidate = {
  commandId: COMMAND,
  capabilityId: 'camera.open',
  normalizedTranscript: 'open camera',
  requiresW07Authorization: true,
  authorizesExecution: false,
};

const context: AuthenticatedVoiceEvaluationContext = {
  tenantId: TENANT,
  actorIdentityId: ACTOR,
  correlationId: CORRELATION,
  gatewaySessionId: 'gateway:session:voice-1',
  connectionId: 'gateway:connection:voice-1',
  deviceSessionId: 'device:session:voice-1',
  deviceId: DEVICE,
  registrationVersion: 1,
};

function actionIntent(overrides: Record<string, unknown> = {}): ActionIntent {
  return {
    kind: 'ACTION_INTENT',
    schemaVersion: '1.0.0',
    actionIntentId: 'act_01J00000000000000000000000',
    capability: { capability: candidate.capabilityId, actionType: 'OPEN_CAMERA' },
    executionTarget: {
      schemaVersion: '1.0.0',
      kind: 'DEVICE',
      bindingReference: DEVICE,
    },
    tenant: { tenantId: TENANT },
    actor: { kind: 'HUMAN', identityId: ACTOR },
    requestOrigin: { kind: 'HUMAN', identityId: ACTOR },
    correlation: { correlationId: CORRELATION },
    resolvedParameters: {},
    idempotency: { mode: 'REQUIRED', key: 'voice:camera:open:1' },
    preconditions: [],
    deadlineAt: '2026-09-05T20:00:00.000Z',
    authority: { kind: 'POLICY_TOKEN', policyTokenId: 'ptk_01J00000000000000000000000' },
    dataClassification: 'INTERNAL',
    ...overrides,
  } as unknown as ActionIntent;
}

function authorityEvaluation(): AuthorityEvaluationRequest {
  return {
    kind: 'AuthorityEvaluationRequest',
    policyEvaluation: {
      kind: 'PolicyEvaluationRequest',
      schemaVersion: '1.0.0',
      evaluatedAt: NOW,
      tenant: { tenantId: TENANT },
      actor: { kind: 'HUMAN', identityId: ACTOR },
      subject: { kind: 'IDENTITY', identityId: ACTOR },
      correlation: { correlationId: CORRELATION },
      action: 'OPEN_CAMERA',
      requestedScope: [candidate.capabilityId],
      policy: { reference: 'policy:device-voice', version: '3' },
      policyToken: { policyTokenId: 'ptk_01J00000000000000000000000' },
    },
  } as unknown as AuthorityEvaluationRequest;
}

function authorityResult(
  request: AuthorityEvaluationRequest,
  authorized: boolean,
): AuthorityEvaluationResult {
  const policy = request.policyEvaluation;
  const effectiveScope = authorized ? [...policy.requestedScope] : [];
  const subjectReference = `identity:${ACTOR}`;
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
      inputFingerprint: 'fnv1a64:dispatching-voice',
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
              inputFingerprint: 'fnv1a64:dispatching-voice-token',
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
              inputFingerprint: 'fnv1a64:dispatching-voice-policy',
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

function resolver(authorized = true): VoiceAuthorityEvaluationResolver {
  return {
    resolve: () => ({
      actionIntent: actionIntent(),
      authorityEvaluation: authorityEvaluation(),
      validateCurrentAuthority: (request) => authorityResult(request, authorized),
    }),
  };
}

function healthyState(
  overrides: Partial<TrustedVoiceExecutionState> = {},
): TrustedVoiceExecutionState {
  const target = actionIntent().executionTarget;
  if (target === undefined) throw new Error('target fixture missing');
  return {
    commandId: COMMAND as TrustedVoiceExecutionState['commandId'],
    executionId: 'exe_01ARZ3NDEKTSV4RRFFQ69G5FAV' as TrustedVoiceExecutionState['executionId'],
    causationId: 'cau_01ARZ3NDEKTSV4RRFFQ69G5FAV' as TrustedVoiceExecutionState['causationId'],
    orderingKey: 'device:camera',
    orderingSequence: 1,
    canonicalPayloadHash: 'sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
    targetBindings: [
      {
        schemaVersion: '1.0.0',
        bindingId: 'binding:device:camera',
        tenant: { tenantId: TENANT },
        target,
        state: 'AVAILABLE',
        freshUntil: '2026-09-05T19:45:00.000Z',
        compatibleActionIntentSchemaVersions: ['1.0.0'],
        preconditionsSatisfied: true,
      },
    ],
    attemptNumber: 1,
    maxAttempts: 1,
    containment: {
      circuit: { state: 'CLOSED', consecutiveFailures: 0, halfOpenProbeInFlight: false },
      killSwitch: { state: 'INACTIVE', changedAt: '2026-09-05T19:00:00.000Z' },
      dependencyHealth: 'HEALTHY',
      cancellationRequested: false,
      currentInFlight: 0,
      maxInFlight: 1,
      retryDepth: 0,
      maxRetryDepth: 1,
    },
    authorizesExecution: false,
    ...overrides,
  } as TrustedVoiceExecutionState;
}

class StateSource implements TrustedVoiceExecutionStateSource {
  calls: TrustedVoiceExecutionStateLookup[] = [];
  state: TrustedVoiceExecutionState | null = healthyState();

  resolve(lookup: TrustedVoiceExecutionStateLookup): TrustedVoiceExecutionState | null {
    this.calls.push(lookup);
    return this.state;
  }
}

class Fence implements IdempotencyFencePort {
  calls = 0;
  decision: ReturnType<IdempotencyFencePort['reserve']> = { kind: 'RESERVED' };

  reserve(): ReturnType<IdempotencyFencePort['reserve']> {
    this.calls += 1;
    return this.decision;
  }
}

class W14Port implements W14GovernedDeviceDispatchPort {
  calls: W14GovernedDeviceDispatchRequest[] = [];
  result: W14GovernedDeviceDispatchResult = {
    ok: true,
    disposition: 'SUBMITTED',
    commandReference: 'w14:command:voice-1',
    deliveryReference: 'w14:delivery:voice-1',
    authorizesExecution: false,
    provesExecutionSuccess: false,
    retryAuthorized: false,
  };

  dispatch(request: W14GovernedDeviceDispatchRequest): W14GovernedDeviceDispatchResult {
    this.calls.push(request);
    return this.result;
  }
}

function runtime(authorized = true) {
  const source = new StateSource();
  const fence = new Fence();
  const w14 = new W14Port();
  const intake = new W15JDispatchingVoiceCandidateIntake({
    resolver: resolver(authorized),
    executionStateSource: source,
    evaluatePrecondition: () => true,
    idempotencyFence: fence,
    w14Dispatch: w14,
    clock: () => NOW_MS,
  });
  return { intake, source, fence, w14 };
}

test('current W07 authority target containment safeguards and W03 fence precede W14 dispatch', () => {
  const { intake, source, fence, w14 } = runtime(true);
  const result = intake.evaluate({ candidate, context });

  assert.equal(result.ok, true);
  assert.equal(result.acceptedForEvaluation, true);
  assert.equal(result.dispatch.disposition, 'HANDED_TO_W14');
  assert.equal(result.dispatch.authorizesExecution, false);
  assert.equal(result.dispatch.provesExecutionSuccess, false);
  assert.equal(result.dispatch.retryAuthorized, false);
  assert.equal(source.calls.length, 1);
  assert.equal(source.calls[0]?.evaluatedAt, NOW);
  assert.equal(fence.calls, 1);
  assert.equal(w14.calls.length, 1);
  assert.equal(w14.calls[0]?.command.commandId, COMMAND);
  assert.equal(w14.calls[0]?.command.orderingSequence, 1);
});

test('current authority denial prevents state lookup W03 reservation and W14 dispatch', () => {
  const { intake, source, fence, w14 } = runtime(false);
  const result = intake.evaluate({ candidate, context });

  assert.equal(result.ok, true);
  assert.equal(result.dispatch.disposition, 'NOT_ATTEMPTED_AUTHORITY_REJECTED');
  assert.equal(source.calls.length, 0);
  assert.equal(fence.calls, 0);
  assert.equal(w14.calls.length, 0);
});

test('unavailable target and active kill switch both block before W03 reservation', () => {
  for (const state of [
    healthyState({
      targetBindings: healthyState().targetBindings.map((binding) => ({
        ...binding,
        state: 'UNAVAILABLE' as const,
      })),
    }),
    healthyState({
      containment: {
        ...healthyState().containment,
        killSwitch: {
          state: 'ACTIVE',
          changedAt:
            '2026-09-05T19:20:00.000Z' as TrustedVoiceExecutionState['containment']['killSwitch']['changedAt'],
        },
      },
    }),
  ]) {
    const { intake, source, fence, w14 } = runtime(true);
    source.state = state;
    const result = intake.evaluate({ candidate, context });
    assert.equal(result.ok, true);
    assert.equal(fence.calls, 0);
    assert.equal(w14.calls.length, 0);
    assert.equal(
      result.dispatch.disposition === 'NOT_ATTEMPTED_TARGET_REJECTED' ||
        result.dispatch.disposition === 'NOT_ATTEMPTED_CONTAINMENT_REJECTED',
      true,
    );
  }
});

test('W03 idempotency conflict blocks W14 and never becomes retry authority', () => {
  const { intake, fence, w14 } = runtime(true);
  fence.decision = { kind: 'CONFLICT', reason: 'existing different payload' };
  const result = intake.evaluate({ candidate, context });

  assert.equal(result.ok, true);
  assert.equal(result.dispatch.disposition, 'NOT_ATTEMPTED_SAFEGUARD_REJECTED');
  assert.equal(fence.calls, 1);
  assert.equal(w14.calls.length, 0);
  assert.equal(result.dispatch.retryAuthorized, false);
  assert.equal(result.retryAuthorized, false);
});

test('malformed current execution state fails closed before guards with side effects', () => {
  const { intake, source, fence, w14 } = runtime(true);
  source.state = healthyState({ orderingSequence: 0 });
  const result = intake.evaluate({ candidate, context });

  assert.equal(result.ok, true);
  assert.equal(result.dispatch.disposition, 'NOT_ATTEMPTED_STATE_UNAVAILABLE');
  assert.equal(fence.calls, 0);
  assert.equal(w14.calls.length, 0);
});

test('W14 transport rejection remains non-authoritative and never grants retry', () => {
  const { intake, w14 } = runtime(true);
  w14.result = {
    ok: false,
    code: 'DEVICE_SESSION_NOT_CURRENT',
    retryable: true,
    authorizesExecution: false,
    provesExecutionSuccess: false,
    retryAuthorized: false,
  };
  const result = intake.evaluate({ candidate, context });

  assert.equal(result.ok, true);
  assert.equal(result.dispatch.disposition, 'W14_REJECTED');
  assert.equal(result.dispatch.retryAuthorized, false);
  assert.equal(result.provesExecutionSuccess, false);
  assert.equal(result.retryAuthorized, false);
});
