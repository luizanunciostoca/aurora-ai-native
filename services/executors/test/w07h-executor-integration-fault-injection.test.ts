// @ts-expect-error -- executor harness has no @types/node; Node 22 provides this built-in.
import assert from 'node:assert/strict';
// @ts-expect-error -- executor harness has no @types/node; Node 22 provides this built-in.
import test from 'node:test';

import type { ActionIntent, JsonObject } from '@aurora/contracts/actions';
import type { Rfc3339Timestamp } from '@aurora/contracts/context';
import type { Evidence } from '@aurora/contracts/evidence';
import type { ExecutionTargetReference } from '@aurora/contracts/execution-target';
import type {
  AuthorityEvaluationRequest,
  AuthorityEvaluationResult,
} from '@aurora/contracts/policy-validation';
import type { TargetedReceipt } from '@aurora/contracts/receipts';
import type { ContractVersion } from '@aurora/contracts/versioning';

import { evaluateFailureContainment } from '../src/failure-containment/index.js';
import type { FailureContainmentSnapshot } from '../src/failure-containment/index.js';
import { captureReadbackEvidence, createTargetedExecutionReceipt } from '../src/readback/index.js';
import {
  classifyExecutionAmbiguity,
  reconcileExecutionUncertainty,
} from '../src/reconciliation/index.js';
import { evaluateExecutionSafeguards } from '../src/safeguards/index.js';
import type { IdempotencyFencePort } from '../src/safeguards/index.js';
import { validateExecutorAuthority } from '../src/sdk/index.js';
import { resolveExecutionTarget } from '../src/target-resolution/index.js';
import type { ExecutableTargetBinding } from '../src/target-resolution/index.js';

const version = '1.0.0' as ContractVersion;
const at = (value: string) => value as Rfc3339Timestamp;

const targets: readonly ExecutionTargetReference[] = [
  {
    schemaVersion: version,
    kind: 'PROVIDER',
    provider: 'meta',
    targetReference: 'provider:meta:account:1',
  },
  {
    schemaVersion: version,
    kind: 'WORKFLOW',
    bindingReference: 'workflow:publish:1',
  },
  {
    schemaVersion: version,
    kind: 'DEVICE',
    bindingReference: 'device:session:1',
  },
  {
    schemaVersion: version,
    kind: 'LOCAL_SERVICE',
    bindingReference: 'local-service:1',
  },
];

function intent(
  target: ExecutionTargetReference = targets[1]!,
  overrides: Record<string, unknown> = {},
): ActionIntent {
  return {
    kind: 'ACTION_INTENT',
    schemaVersion: version,
    actionIntentId: 'action-intent:w07h',
    capability: { capability: 'social.publish', actionType: 'PUBLISH' },
    executionTarget: target,
    tenant: { tenantId: 'tenant:alpha' },
    actor: { kind: 'HUMAN', identityId: 'identity:operator' },
    requestOrigin: { kind: 'HUMAN', identityId: 'identity:operator' },
    correlation: { correlationId: 'correlation:w07h' },
    resolvedParameters: { text: 'hello' },
    idempotency: { mode: 'REQUIRED', key: 'idem:w07h' },
    preconditions: [{ preconditionType: 'ACCOUNT_ACTIVE', parameters: {} }],
    expectedState: { stateType: 'publication', value: { status: 'published' } },
    deadlineAt: at('2026-09-02T06:00:00Z'),
    authority: { kind: 'POLICY_TOKEN', policyTokenId: 'policy-token:w07h' },
    dataClassification: 'INTERNAL',
    ...overrides,
  } as unknown as ActionIntent;
}

function authorityRequest(actionIntent = intent()): AuthorityEvaluationRequest {
  return {
    kind: 'AuthorityEvaluationRequest',
    policyEvaluation: {
      kind: 'PolicyEvaluationRequest',
      schemaVersion: version,
      evaluatedAt: at('2026-09-02T04:00:00Z'),
      tenant: actionIntent.tenant,
      actor: actionIntent.actor,
      subject: { kind: 'IDENTITY', identityId: 'identity:subject' },
      correlation: actionIntent.correlation,
      action: actionIntent.capability.actionType,
      requestedScope: [actionIntent.capability.capability],
      policy: { reference: 'policy:execution', version: '7' },
      policyToken: { policyTokenId: 'policy-token:w07h' },
    },
  } as unknown as AuthorityEvaluationRequest;
}

function authorityResult(
  request: AuthorityEvaluationRequest,
  authorized = true,
): AuthorityEvaluationResult {
  const policy = request.policyEvaluation;
  const scope = authorized ? [...policy.requestedScope] : [];
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
    effectiveScope: scope,
    reasons: authorized ? ['POLICY_ALLOWED'] : ['EXPLICIT_DENY'],
    evidence: {
      tenantId: policy.tenant.tenantId,
      actorIdentityId: policy.actor.identityId,
      subjectReference,
      action: policy.action,
      requestedScope: policy.requestedScope,
      effectiveScope: scope,
      currentPolicy: policy.policy,
      inputFingerprint: 'fnv1a64:w07h',
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
            effectiveScope: scope,
            reasons: [],
            evidence: {
              policyTokenId: policy.policyToken?.policyTokenId,
              tenantId: policy.tenant.tenantId,
              actorIdentityId: policy.actor.identityId,
              subjectReference,
              action: policy.action,
              requestedScope: policy.requestedScope,
              effectiveScope: scope,
              currentPolicy: policy.policy,
              inputFingerprint: 'fnv1a64:w07h-token',
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
              matchedRuleIds: ['rule:w07h'],
              reasonReferences: [],
              inputFingerprint: 'fnv1a64:w07h-policy',
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

function binding(target: ExecutionTargetReference, overrides: Record<string, unknown> = {}) {
  return {
    schemaVersion: version,
    bindingId: `binding:${target.kind.toLowerCase()}`,
    tenant: { tenantId: 'tenant:alpha' },
    target,
    state: 'AVAILABLE',
    freshUntil: at('2026-09-02T05:00:00Z'),
    compatibleActionIntentSchemaVersions: [version],
    preconditionsSatisfied: true,
    ...overrides,
  } as unknown as ExecutableTargetBinding;
}

function containment(overrides: Partial<FailureContainmentSnapshot> = {}): FailureContainmentSnapshot {
  return {
    circuit: { state: 'CLOSED', consecutiveFailures: 0, halfOpenProbeInFlight: false },
    killSwitch: { state: 'INACTIVE', changedAt: at('2026-09-02T03:00:00Z') },
    dependencyHealth: 'HEALTHY',
    cancellationRequested: false,
    currentInFlight: 0,
    maxInFlight: 4,
    retryDepth: 0,
    maxRetryDepth: 3,
    ...overrides,
  };
}

function safeFence(): IdempotencyFencePort {
  return { reserve: () => ({ kind: 'RESERVED' }) };
}

function safeguards(actionIntent: ActionIntent, fence: IdempotencyFencePort = safeFence()) {
  return evaluateExecutionSafeguards({
    schemaVersion: version,
    actionIntent,
    evaluatedAt: at('2026-09-02T04:00:00Z'),
    attemptNumber: 1,
    maxAttempts: 3,
    quota: { limit: 10, used: 0 },
    evaluatePrecondition: () => true,
    canonicalPayloadHash: 'sha256:w07h',
    idempotencyFence: fence,
  });
}

function receipt(actionIntent: ActionIntent): TargetedReceipt {
  const created = createTargetedExecutionReceipt({
    schemaVersion: version,
    actionIntent,
    receiptId: 'receipt:w07h' as TargetedReceipt['receiptId'],
    executor: { executor: 'executor:w07h-test' },
    attempt: 1,
    attemptedAt: at('2026-09-02T04:00:01Z'),
    acknowledgedAt: at('2026-09-02T04:00:02Z'),
    returnedAt: at('2026-09-02T04:00:03Z'),
    executionOutcome: 'EXECUTED_ACKNOWLEDGED',
  });
  assert.equal(created.status, 'CREATED');
  if (created.status !== 'CREATED') throw new Error('receipt fixture rejected');
  return created.receipt;
}

test('W07-H consumer fixtures preserve PROVIDER/WORKFLOW/DEVICE/LOCAL_SERVICE identity without authority', () => {
  for (const target of targets) {
    const actionIntent = intent(target);
    const result = resolveExecutionTarget({
      schemaVersion: version,
      actionIntentSchemaVersion: version,
      tenant: actionIntent.tenant,
      evaluatedAt: at('2026-09-02T04:00:00Z'),
      target,
      bindings: [binding(target)],
    });
    assert.equal(result.resolved, true);
    assert.equal(result.authorizesExecution, false);
    if (result.resolved) assert.deepEqual(result.binding.target, target);
  }
});

test('W07-H integrated happy path requires containment, current authority, target and safeguards before readback', () => {
  const actionIntent = intent();
  const containmentGate = evaluateFailureContainment({
    schemaVersion: version,
    actionIntent,
    evaluatedAt: at('2026-09-02T04:00:00Z'),
    phase: 'PRE_EXTERNAL',
    snapshot: containment(),
  });
  assert.equal(containmentGate.mayProceedToOtherGuards, true);
  assert.equal(containmentGate.authorizesExecution, false);

  const evaluation = authorityRequest(actionIntent);
  const authorityGate = validateExecutorAuthority({
    schemaVersion: version,
    actionIntent,
    authorityEvaluation: evaluation,
    validateCurrentAuthority: (request) => authorityResult(request, true),
  });
  assert.equal(authorityGate.executionEligible, true);
  assert.equal(authorityGate.authorizesExecution, false);

  const targetGate = resolveExecutionTarget({
    schemaVersion: version,
    actionIntentSchemaVersion: version,
    tenant: actionIntent.tenant,
    evaluatedAt: at('2026-09-02T04:00:00Z'),
    target: actionIntent.executionTarget!,
    bindings: [binding(actionIntent.executionTarget!)],
  });
  assert.equal(targetGate.resolved, true);
  assert.equal(targetGate.authorizesExecution, false);

  const safeguardGate = safeguards(actionIntent);
  assert.equal(safeguardGate.safeToInvokeExternal, true);
  assert.equal(safeguardGate.authorizesExecution, false);

  const targetReceipt = receipt(actionIntent);
  const readback = captureReadbackEvidence({
    schemaVersion: version,
    evidenceId: 'evidence:w07h' as Evidence['evidenceId'],
    actionIntent,
    receipt: targetReceipt,
    readback: () => ({
      capturedAt: at('2026-09-02T04:00:04Z'),
      reference: { system: 'workflow', reference: 'run:w07h' },
      observedState: { status: 'published' } as JsonObject,
    }),
  });
  assert.equal(readback.status, 'CAPTURED');
  if (readback.status !== 'CAPTURED') return;
  assert.equal(readback.assessment.state, 'MATCH');
  assert.equal(readback.assessment.verifiedExternalState, false);
  assert.equal(readback.evidence.verification.state, 'UNVERIFIED');
});

test('W07-H fault injection blocks stale authority, stale target, duplicate, circuit open and kill switch', () => {
  const actionIntent = intent();
  const evaluation = authorityRequest(actionIntent);
  const staleAuthority = validateExecutorAuthority({
    schemaVersion: version,
    actionIntent,
    authorityEvaluation: evaluation,
    validateCurrentAuthority: (request) => ({
      ...authorityResult(request, true),
      currentPolicy: { reference: 'policy:execution', version: 'old' },
    }),
  });
  assert.equal(staleAuthority.executionEligible, false);

  const staleTarget = resolveExecutionTarget({
    schemaVersion: version,
    actionIntentSchemaVersion: version,
    tenant: actionIntent.tenant,
    evaluatedAt: at('2026-09-02T05:00:00Z'),
    target: actionIntent.executionTarget!,
    bindings: [binding(actionIntent.executionTarget!)],
  });
  assert.deepEqual(staleTarget.reasons, ['TARGET_STALE']);

  let reserved = false;
  const duplicateFence: IdempotencyFencePort = {
    reserve: () => {
      if (reserved) return { kind: 'INFLIGHT' };
      reserved = true;
      return { kind: 'RESERVED' };
    },
  };
  assert.equal(safeguards(actionIntent, duplicateFence).safeToInvokeExternal, true);
  const duplicate = safeguards(actionIntent, duplicateFence);
  assert.equal(duplicate.safeToInvokeExternal, false);
  assert.deepEqual(duplicate.reasons, ['IDEMPOTENCY_INFLIGHT']);

  const circuitOpen = evaluateFailureContainment({
    schemaVersion: version,
    actionIntent,
    evaluatedAt: at('2026-09-02T04:00:00Z'),
    phase: 'PRE_EXTERNAL',
    snapshot: containment({
      circuit: {
        state: 'OPEN',
        consecutiveFailures: 3,
        halfOpenProbeInFlight: false,
        openedAt: at('2026-09-02T03:59:59Z'),
      },
    }),
  });
  assert.equal(circuitOpen.mayProceedToOtherGuards, false);
  assert.equal(circuitOpen.reasons.includes('CIRCUIT_OPEN'), true);

  const killed = evaluateFailureContainment({
    schemaVersion: version,
    actionIntent,
    evaluatedAt: at('2026-09-02T04:00:00Z'),
    phase: 'PRE_EXTERNAL',
    snapshot: containment({
      killSwitch: { state: 'ACTIVE', changedAt: at('2026-09-02T03:59:00Z') },
    }),
    nonAuthoritativeSignals: { lane: 'FAST', confidence: 1, urgency: 1 },
  });
  assert.equal(killed.mayProceedToOtherGuards, false);
  assert.deepEqual(killed.reasons, ['KILL_SWITCH_ACTIVE']);
  assert.equal(killed.authorizesExecution, false);
});

test('W07-H post-dispatch timeout and in-flight cancellation require reconciliation before any retry', () => {
  const actionIntent = intent();
  const uncertain = classifyExecutionAmbiguity({
    schemaVersion: version,
    actionIntent,
    occurredAt: at('2026-09-02T04:00:05Z'),
    attemptNumber: 1,
    maxAttempts: 3,
    signal: 'TIMEOUT',
    phase: 'AFTER_EXTERNAL_INVOCATION_STARTED',
  });
  assert.equal(uncertain.status, 'EXECUTION_UNCERTAIN');
  if (uncertain.status !== 'EXECUTION_UNCERTAIN') return;
  assert.equal(uncertain.retryAllowedBeforeReconciliation, false);

  const blind = reconcileExecutionUncertainty({
    schemaVersion: version,
    actionIntent,
    uncertainty: uncertain.uncertainty,
  });
  assert.equal(blind.state, 'STILL_UNCERTAIN');
  assert.equal(blind.retryEligibleAfterFreshGuards, false);

  const retrySafeguard = {
    attemptNumber: 2,
    evaluatedAt: at('2026-09-02T04:00:07Z'),
    result: {
      ...safeguards(actionIntent),
      actionIntentId: actionIntent.actionIntentId,
    },
  };
  const reconciled = reconcileExecutionUncertainty({
    schemaVersion: version,
    actionIntent,
    uncertainty: uncertain.uncertainty,
    observation: {
      state: 'NO_EFFECT_CONFIRMED',
      observedAt: at('2026-09-02T04:00:06Z'),
      reference: 'readback:no-effect:w07h',
    },
    retrySafeguards: retrySafeguard,
  });
  assert.equal(reconciled.state, 'NO_EFFECT_CONFIRMED_RETRY_ELIGIBLE');
  assert.equal(reconciled.retryEligibleAfterFreshGuards, true);
  assert.equal(reconciled.authorizesExecution, false);

  const cancelled = evaluateFailureContainment({
    schemaVersion: version,
    actionIntent,
    evaluatedAt: at('2026-09-02T04:00:06Z'),
    phase: 'IN_FLIGHT',
    snapshot: containment({ cancellationRequested: true }),
  });
  assert.equal(cancelled.cancellationDisposition, 'RECONCILE_IN_FLIGHT');
  assert.equal(cancelled.requiresReconciliationHandoff, true);
  assert.equal(cancelled.authorizesExecution, false);
});
