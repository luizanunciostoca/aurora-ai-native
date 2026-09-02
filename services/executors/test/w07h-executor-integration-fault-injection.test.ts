// @ts-expect-error -- executor harness has no @types/node; Node 22 provides this built-in.
import assert from 'node:assert/strict';
// @ts-expect-error -- executor harness has no @types/node; Node 22 provides this built-in.
import test from 'node:test';

import type { ActionIntent } from '@aurora/contracts/actions';
import type { Rfc3339Timestamp } from '@aurora/contracts/context';
import type { Evidence } from '@aurora/contracts/evidence';
import type { ExecutionTargetReference } from '@aurora/contracts/execution-target';
import type {
  AuthorityEvaluationRequest,
  AuthorityEvaluationResult,
} from '@aurora/contracts/policy-validation';
import type { TargetedReceipt } from '@aurora/contracts/receipts';
import type { ContractVersion } from '@aurora/contracts/versioning';

import {
  evaluateFailureContainment,
  type FailureContainmentSnapshot,
} from '../src/failure-containment/index.js';
import { captureReadbackEvidence, createTargetedExecutionReceipt } from '../src/readback/index.js';
import {
  classifyExecutionAmbiguity,
  readbackReconciliationHint,
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
    targetReference: 'provider:ig:1',
  },
  { schemaVersion: version, kind: 'WORKFLOW', bindingReference: 'workflow:1' },
  { schemaVersion: version, kind: 'DEVICE', bindingReference: 'device:1' },
  { schemaVersion: version, kind: 'LOCAL_SERVICE', bindingReference: 'local:1' },
];

function intent(
  target: ExecutionTargetReference = targets[1]!,
  overrides: Record<string, unknown> = {},
): ActionIntent {
  return {
    kind: 'ACTION_INTENT',
    schemaVersion: version,
    actionIntentId: `action-intent:${target.kind.toLowerCase()}`,
    capability: { capability: 'integration.execute', actionType: 'EXECUTE' },
    executionTarget: target,
    tenant: { tenantId: 'tenant:alpha' },
    actor: { kind: 'HUMAN', identityId: 'identity:operator' },
    requestOrigin: { kind: 'HUMAN', identityId: 'identity:operator' },
    correlation: { correlationId: 'correlation:w07h' },
    resolvedParameters: { fixture: true },
    idempotency: { mode: 'REQUIRED', key: `idem:${target.kind.toLowerCase()}` },
    preconditions: [{ preconditionType: 'INTEGRATION_FIXTURE_READY', parameters: {} }],
    expectedState: { stateType: 'fixture', value: { status: 'done' } },
    deadlineAt: at('2026-09-02T05:00:00Z'),
    authority: { kind: 'POLICY_TOKEN', policyTokenId: 'policy-token:w07h' },
    dataClassification: 'INTERNAL',
    ...overrides,
  } as unknown as ActionIntent;
}

function authorityRequest(actionIntent: ActionIntent): AuthorityEvaluationRequest {
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
      policy: { reference: 'policy:execution', version: '9' },
      policyToken: { policyTokenId: 'policy-token:w07h' },
    },
  } as unknown as AuthorityEvaluationRequest;
}

function authorityResult(
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
    ...overrides,
  } as unknown as AuthorityEvaluationResult;
}

function binding(actionIntent: ActionIntent, overrides: Partial<ExecutableTargetBinding> = {}) {
  return {
    schemaVersion: version,
    bindingId: `binding:${actionIntent.executionTarget?.kind.toLowerCase()}`,
    tenant: actionIntent.tenant,
    target: actionIntent.executionTarget!,
    state: 'AVAILABLE',
    freshUntil: at('2026-09-02T04:30:00Z'),
    compatibleActionIntentSchemaVersions: [version],
    preconditionsSatisfied: true,
    ...overrides,
  } as ExecutableTargetBinding;
}

function containment(
  overrides: Partial<FailureContainmentSnapshot> = {},
): FailureContainmentSnapshot {
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

function targetReceipt(actionIntent: ActionIntent): TargetedReceipt {
  const result = createTargetedExecutionReceipt({
    schemaVersion: version,
    actionIntent,
    receiptId: `receipt:${actionIntent.actionIntentId}` as TargetedReceipt['receiptId'],
    executor: { executor: 'executor:w07h-fixture' },
    attempt: 1,
    attemptedAt: at('2026-09-02T04:00:03Z'),
    acknowledgedAt: at('2026-09-02T04:00:04Z'),
    returnedAt: at('2026-09-02T04:00:05Z'),
    executionOutcome: 'EXECUTED_ACKNOWLEDGED',
  });
  assert.equal(result.status, 'CREATED');
  if (result.status !== 'CREATED') throw new Error('receipt fixture rejected');
  return result.receipt;
}

function freshSafeguards(actionIntent: ActionIntent, attemptNumber = 2) {
  const result = evaluateExecutionSafeguards({
    schemaVersion: version,
    actionIntent,
    evaluatedAt: at('2026-09-02T04:00:08Z'),
    attemptNumber,
    maxAttempts: 3,
    quota: { limit: 10, used: 1 },
    evaluatePrecondition: () => true,
    canonicalPayloadHash: 'sha256:w07h',
    idempotencyFence: { reserve: () => ({ kind: 'RESERVED' as const }) },
  });
  return {
    attemptNumber,
    evaluatedAt: at('2026-09-02T04:00:08Z'),
    result,
  };
}

test('W07-H consumer fixtures traverse current authority, target, safeguards and containment without authority shortcuts', () => {
  for (const target of targets) {
    const actionIntent = intent(target);
    const request = authorityRequest(actionIntent);
    const authority = validateExecutorAuthority({
      schemaVersion: version,
      actionIntent,
      authorityEvaluation: request,
      validateCurrentAuthority: (current) => authorityResult(current, true),
    });
    assert.equal(authority.executionEligible, true);
    assert.equal(authority.authorizesExecution, false);

    const resolved = resolveExecutionTarget({
      schemaVersion: version,
      actionIntentSchemaVersion: version,
      tenant: actionIntent.tenant,
      evaluatedAt: at('2026-09-02T04:00:01Z'),
      target,
      bindings: [binding(actionIntent)],
    });
    assert.equal(resolved.resolved, true);
    assert.equal(resolved.authorizesExecution, false);

    const safeguards = evaluateExecutionSafeguards({
      schemaVersion: version,
      actionIntent,
      evaluatedAt: at('2026-09-02T04:00:02Z'),
      attemptNumber: 1,
      maxAttempts: 3,
      quota: { limit: 10, used: 0 },
      evaluatePrecondition: () => true,
      canonicalPayloadHash: `sha256:${target.kind}`,
      idempotencyFence: { reserve: () => ({ kind: 'RESERVED' as const }) },
    });
    assert.equal(safeguards.safeToInvokeExternal, true);
    assert.equal(safeguards.authorizesExecution, false);

    const contained = evaluateFailureContainment({
      schemaVersion: version,
      actionIntent,
      evaluatedAt: at('2026-09-02T04:00:02Z'),
      phase: 'PRE_EXTERNAL',
      snapshot: containment(),
    });
    assert.equal(contained.mayProceedToOtherGuards, true);
    assert.equal(contained.authorizesExecution, false);

    const receipt = targetReceipt(actionIntent);
    assert.deepEqual(receipt.executionTarget, target);
  }
});

test('W07-H stale authority cannot be rescued by FAST lane or confidence', () => {
  const actionIntent = intent();
  const request = authorityRequest(actionIntent);
  const result = validateExecutorAuthority({
    schemaVersion: version,
    actionIntent,
    authorityEvaluation: request,
    validateCurrentAuthority: (current) =>
      authorityResult(current, true, {
        currentPolicy: { reference: 'policy:execution', version: 'old' },
      }),
    nonAuthoritativeSignals: { lane: 'FAST', confidence: 1 },
  });
  assert.equal(result.executionEligible, false);
  assert.deepEqual(result.reasons, ['CURRENT_AUTHORITY_RESULT_MISMATCH']);
});

test('W07-H stale target blocks before any external fixture could run', () => {
  const actionIntent = intent();
  const result = resolveExecutionTarget({
    schemaVersion: version,
    actionIntentSchemaVersion: version,
    tenant: actionIntent.tenant,
    evaluatedAt: at('2026-09-02T04:30:00Z'),
    target: actionIntent.executionTarget!,
    bindings: [binding(actionIntent)],
  });
  assert.equal(result.resolved, false);
  assert.deepEqual(result.reasons, ['TARGET_STALE']);
});

test('W07-H duplicate reservation permits only one equivalent attempt', () => {
  let reserved = false;
  const fence: IdempotencyFencePort = {
    reserve: () => {
      if (reserved) return { kind: 'INFLIGHT' };
      reserved = true;
      return { kind: 'RESERVED' };
    },
  };
  const actionIntent = intent();
  const request = {
    schemaVersion: version,
    actionIntent,
    evaluatedAt: at('2026-09-02T04:00:02Z'),
    attemptNumber: 1,
    maxAttempts: 3,
    quota: { limit: 10, used: 0 },
    evaluatePrecondition: () => true,
    canonicalPayloadHash: 'sha256:w07h-duplicate',
    idempotencyFence: fence,
  };
  const first = evaluateExecutionSafeguards(request);
  const second = evaluateExecutionSafeguards(request);
  assert.equal(first.safeToInvokeExternal, true);
  assert.equal(second.safeToInvokeExternal, false);
  assert.deepEqual(second.reasons, ['IDEMPOTENCY_INFLIGHT']);
});

test('W07-H post-dispatch timeout requires reconciliation and fresh safeguards before any retry eligibility', () => {
  const actionIntent = intent();
  const classified = classifyExecutionAmbiguity({
    schemaVersion: version,
    actionIntent,
    occurredAt: at('2026-09-02T04:00:05Z'),
    attemptNumber: 1,
    maxAttempts: 3,
    signal: 'TIMEOUT',
    phase: 'AFTER_EXTERNAL_INVOCATION_STARTED',
  });
  assert.equal(classified.status, 'EXECUTION_UNCERTAIN');
  if (classified.status !== 'EXECUTION_UNCERTAIN') return;

  const blind = reconcileExecutionUncertainty({
    schemaVersion: version,
    actionIntent,
    uncertainty: classified.uncertainty,
  });
  assert.equal(blind.retryEligibleAfterFreshGuards, false);

  const reconciled = reconcileExecutionUncertainty({
    schemaVersion: version,
    actionIntent,
    uncertainty: classified.uncertainty,
    observation: {
      state: 'NO_EFFECT_CONFIRMED',
      observedAt: at('2026-09-02T04:00:07Z'),
      reference: 'readback:no-effect',
    },
    retrySafeguards: freshSafeguards(actionIntent),
  });
  assert.equal(reconciled.state, 'NO_EFFECT_CONFIRMED_RETRY_ELIGIBLE');
  assert.equal(reconciled.retryEligibleAfterFreshGuards, true);
  assert.equal(reconciled.authorizesExecution, false);
});

test('W07-H readback mismatch remains indeterminate and never promotes VERIFIED', () => {
  const actionIntent = intent();
  const receipt = targetReceipt(actionIntent);
  const captured = captureReadbackEvidence({
    schemaVersion: version,
    evidenceId: 'evidence:w07h:mismatch' as Evidence['evidenceId'],
    actionIntent,
    receipt,
    readback: () => ({
      capturedAt: at('2026-09-02T04:00:06Z'),
      reference: { system: 'fixture', reference: 'object:w07h' },
      observedState: { status: 'different' },
    }),
  });
  assert.equal(captured.status, 'CAPTURED');
  if (captured.status !== 'CAPTURED') return;
  assert.equal(captured.assessment.state, 'MISMATCH');
  assert.equal(captured.evidence.verification.state, 'UNVERIFIED');
  assert.deepEqual(readbackReconciliationHint(captured), {
    state: 'INDETERMINATE',
    reason: 'READBACK_NOT_SUFFICIENT_TO_RESOLVE',
    authorizesExecution: false,
  });
});

test('W07-H circuit open and kill switch block non-authoritative override signals', () => {
  const actionIntent = intent();
  for (const snapshot of [
    containment({
      circuit: {
        state: 'OPEN',
        consecutiveFailures: 3,
        halfOpenProbeInFlight: false,
        openedAt: at('2026-09-02T03:59:00Z'),
      },
    }),
    containment({
      killSwitch: { state: 'ACTIVE', changedAt: at('2026-09-02T03:59:00Z') },
    }),
  ]) {
    const result = evaluateFailureContainment({
      schemaVersion: version,
      actionIntent,
      evaluatedAt: at('2026-09-02T04:00:00Z'),
      phase: 'PRE_EXTERNAL',
      snapshot,
      nonAuthoritativeSignals: {
        lane: 'FAST',
        confidence: 1,
        urgency: 1,
        routerOverrideRequested: true,
      },
    });
    assert.equal(result.mayProceedToOtherGuards, false);
    assert.equal(result.authorizesExecution, false);
  }
});

test('W07-H in-flight cancellation hands off to reconciliation instead of claiming safe cancellation', () => {
  const result = evaluateFailureContainment({
    schemaVersion: version,
    actionIntent: intent(),
    evaluatedAt: at('2026-09-02T04:00:06Z'),
    phase: 'IN_FLIGHT',
    snapshot: containment({ cancellationRequested: true, currentInFlight: 1 }),
  });
  assert.equal(result.cancellationDisposition, 'RECONCILE_IN_FLIGHT');
  assert.equal(result.requiresReconciliationHandoff, true);
  assert.equal(result.mayProceedToOtherGuards, false);
  assert.equal(result.authorizesExecution, false);
});
