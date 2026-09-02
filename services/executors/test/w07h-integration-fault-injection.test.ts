// @ts-expect-error -- executor harness has no @types/node; Node 22 provides this built-in.
import assert from 'node:assert/strict';
// @ts-expect-error -- executor harness has no @types/node; Node 22 provides this built-in.
import test from 'node:test';

import type { ActionIntent, JsonObject } from '@aurora/contracts/actions';
import type { Rfc3339Timestamp } from '@aurora/contracts/context';
import type { Evidence } from '@aurora/contracts/evidence';
import type { ExecutionTargetReference } from '@aurora/contracts/execution-target';
import type { AuthorityEvaluationRequest, AuthorityEvaluationResult } from '@aurora/contracts/policy-validation';
import type { TargetedReceipt } from '@aurora/contracts/receipts';
import type { ContractVersion } from '@aurora/contracts/versioning';

import { evaluateFailureContainment, transitionCircuit } from '../src/failure-containment/index.js';
import type { FailureContainmentSnapshot } from '../src/failure-containment/index.js';
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
    targetType: 'instagram_account',
    targetReference: 'ig:consumer-fixture',
  },
  { schemaVersion: version, kind: 'WORKFLOW', bindingReference: 'workflow:consumer-fixture' },
  { schemaVersion: version, kind: 'DEVICE', bindingReference: 'device:consumer-fixture' },
  { schemaVersion: version, kind: 'LOCAL_SERVICE', bindingReference: 'local:consumer-fixture' },
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
    resolvedParameters: { text: 'integration fixture' },
    idempotency: { mode: 'REQUIRED', key: 'idem:w07h' },
    preconditions: [{ preconditionType: 'ACCOUNT_ACTIVE', parameters: {} }],
    expectedState: { stateType: 'publication', value: { status: 'published' } },
    deadlineAt: at('2026-09-02T12:00:00Z'),
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
      evaluatedAt: at('2026-09-02T10:00:00Z'),
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
              matchedRuleIds: ['rule:allow'],
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

function binding(actionIntent = intent(), overrides: Partial<ExecutableTargetBinding> = {}): ExecutableTargetBinding {
  return {
    schemaVersion: version,
    bindingId: 'binding:w07h',
    tenant: actionIntent.tenant,
    target: actionIntent.executionTarget!,
    state: 'AVAILABLE',
    freshUntil: at('2026-09-02T11:00:00Z'),
    compatibleActionIntentSchemaVersions: [version],
    preconditionsSatisfied: true,
    ...overrides,
  };
}

function containment(overrides: Partial<FailureContainmentSnapshot> = {}): FailureContainmentSnapshot {
  return {
    circuit: { state: 'CLOSED', consecutiveFailures: 0, halfOpenProbeInFlight: false },
    killSwitch: { state: 'INACTIVE', changedAt: at('2026-09-02T09:00:00Z') },
    dependencyHealth: 'HEALTHY',
    cancellationRequested: false,
    currentInFlight: 0,
    maxInFlight: 4,
    retryDepth: 0,
    maxRetryDepth: 3,
    ...overrides,
  };
}

function preExternal(
  actionIntent: ActionIntent,
  fence: IdempotencyFencePort,
  options: {
    authorized?: boolean;
    binding?: ExecutableTargetBinding;
    containment?: FailureContainmentSnapshot;
    attempt?: number;
  } = {},
) {
  const authorityEvaluation = authorityRequest(actionIntent);
  const authority = validateExecutorAuthority({
    schemaVersion: version,
    actionIntent,
    authorityEvaluation,
    validateCurrentAuthority: (request) => authorityResult(request, options.authorized ?? true),
    nonAuthoritativeSignals: { lane: 'FAST', confidence: 1, precheckReference: 'precheck:allow' },
  });
  const target = resolveExecutionTarget({
    schemaVersion: version,
    actionIntentSchemaVersion: version,
    tenant: actionIntent.tenant,
    evaluatedAt: at('2026-09-02T10:00:00Z'),
    target: actionIntent.executionTarget!,
    bindings: [options.binding ?? binding(actionIntent)],
  });
  const failureContainment = evaluateFailureContainment({
    schemaVersion: version,
    actionIntent,
    evaluatedAt: at('2026-09-02T10:00:00Z'),
    phase: 'PRE_EXTERNAL',
    snapshot: options.containment ?? containment(),
    nonAuthoritativeSignals: {
      lane: 'FAST',
      confidence: 1,
      urgency: 1,
      routerOverrideRequested: true,
    },
  });
  const safeguards = evaluateExecutionSafeguards({
    schemaVersion: version,
    actionIntent,
    evaluatedAt: at('2026-09-02T10:00:00Z'),
    attemptNumber: options.attempt ?? 1,
    maxAttempts: 3,
    quota: { limit: 10, used: 0 },
    evaluatePrecondition: () => true,
    canonicalPayloadHash: 'sha256:w07h',
    idempotencyFence: fence,
  });
  return { authority, target, failureContainment, safeguards };
}

function mayInvokeExternal(result: ReturnType<typeof preExternal>): boolean {
  return (
    result.authority.executionEligible &&
    result.target.resolved &&
    result.failureContainment.mayProceedToOtherGuards &&
    result.safeguards.safeToInvokeExternal
  );
}

function receipt(actionIntent: ActionIntent): TargetedReceipt {
  const created = createTargetedExecutionReceipt({
    schemaVersion: version,
    actionIntent,
    receiptId: 'receipt:w07h' as TargetedReceipt['receiptId'],
    executor: { executor: 'executor:w07h-test' },
    attempt: 1,
    attemptedAt: at('2026-09-02T10:00:00Z'),
    acknowledgedAt: at('2026-09-02T10:00:01Z'),
    returnedAt: at('2026-09-02T10:00:02Z'),
    executionOutcome: 'EXECUTED_ACKNOWLEDGED',
  });
  assert.equal(created.status, 'CREATED');
  if (created.status !== 'CREATED') throw new Error('receipt fixture rejected');
  return created.receipt;
}

function readback(
  actionIntent: ActionIntent,
  targetReceipt: TargetedReceipt,
  observedState?: JsonObject,
) {
  return captureReadbackEvidence({
    schemaVersion: version,
    evidenceId: 'evidence:w07h' as Evidence['evidenceId'],
    actionIntent,
    receipt: targetReceipt,
    readback: () => ({
      capturedAt: at('2026-09-02T10:00:03Z'),
      reference: { system: 'fixture', reference: 'state:w07h' },
      ...(observedState === undefined ? {} : { observedState }),
    }),
  });
}

test('W07-H consumer fixtures preserve all target identities without granting authority', () => {
  for (const targetReference of targets) {
    const actionIntent = intent(targetReference);
    const result = resolveExecutionTarget({
      schemaVersion: version,
      actionIntentSchemaVersion: version,
      tenant: actionIntent.tenant,
      evaluatedAt: at('2026-09-02T10:00:00Z'),
      target: targetReference,
      bindings: [binding(actionIntent)],
    });
    assert.equal(result.resolved, true);
    assert.equal(result.authorizesExecution, false);
    if (result.resolved) assert.deepEqual(result.binding.target, targetReference);
  }
});

test('W07-H integrates current authority, target, containment and safeguards before an in-memory effect', () => {
  let reserved = false;
  const fence: IdempotencyFencePort = {
    reserve: () => {
      if (reserved) return { kind: 'INFLIGHT' };
      reserved = true;
      return { kind: 'RESERVED' };
    },
  };
  const actionIntent = intent();
  const gates = preExternal(actionIntent, fence);
  let effects = 0;
  if (mayInvokeExternal(gates)) effects += 1;

  assert.equal(effects, 1);
  assert.equal(gates.authority.authorizesExecution, false);
  assert.equal(gates.target.authorizesExecution, false);
  assert.equal(gates.failureContainment.authorizesExecution, false);
  assert.equal(gates.safeguards.authorizesExecution, false);

  const captured = readback(actionIntent, receipt(actionIntent), { status: 'published' });
  assert.equal(captured.status, 'CAPTURED');
  if (captured.status === 'CAPTURED') {
    assert.equal(captured.assessment.state, 'MATCH');
    assert.equal(captured.assessment.verifiedExternalState, false);
    assert.equal(captured.evidence.verification.state, 'UNVERIFIED');
    assert.deepEqual(readbackReconciliationHint(captured), {
      state: 'EFFECT_OBSERVED',
      reason: 'READBACK_MATCH_OBSERVED',
      authorizesExecution: false,
    });
  }
});

test('W07-H duplicate concurrent intent cannot cross the W03 idempotency fence twice', () => {
  let reserved = false;
  const fence: IdempotencyFencePort = {
    reserve: () => {
      if (reserved) return { kind: 'INFLIGHT' };
      reserved = true;
      return { kind: 'RESERVED' };
    },
  };
  const actionIntent = intent();
  const first = preExternal(actionIntent, fence);
  const duplicate = preExternal(actionIntent, fence);
  let effects = 0;
  if (mayInvokeExternal(first)) effects += 1;
  if (mayInvokeExternal(duplicate)) effects += 1;

  assert.equal(effects, 1);
  assert.equal(first.safeguards.safeToInvokeExternal, true);
  assert.equal(duplicate.safeguards.safeToInvokeExternal, false);
  assert.deepEqual(duplicate.safeguards.reasons, ['IDEMPOTENCY_INFLIGHT']);
});

test('W07-H stale authority and stale target fail before the in-memory effect', () => {
  const fence: IdempotencyFencePort = { reserve: () => ({ kind: 'RESERVED' }) };
  const actionIntent = intent();
  const denied = preExternal(actionIntent, fence, { authorized: false });
  const stale = preExternal(actionIntent, fence, {
    binding: binding(actionIntent, { freshUntil: at('2026-09-02T09:59:59Z') }),
  });
  assert.equal(mayInvokeExternal(denied), false);
  assert.equal(mayInvokeExternal(stale), false);
  assert.deepEqual(denied.authority.reasons, ['CURRENT_AUTHORITY_DENIED']);
  assert.deepEqual(stale.target.reasons, ['TARGET_STALE']);
});

test('W07-H timeout after dispatch becomes EXECUTION_UNCERTAIN and blind retry remains blocked', () => {
  const actionIntent = intent();
  const classified = classifyExecutionAmbiguity({
    schemaVersion: version,
    actionIntent,
    occurredAt: at('2026-09-02T10:00:02Z'),
    attemptNumber: 1,
    maxAttempts: 3,
    signal: 'TIMEOUT',
    phase: 'AFTER_EXTERNAL_INVOCATION_STARTED',
  });
  assert.equal(classified.status, 'EXECUTION_UNCERTAIN');
  if (classified.status !== 'EXECUTION_UNCERTAIN') return;
  const blindRetry = reconcileExecutionUncertainty({
    schemaVersion: version,
    actionIntent,
    uncertainty: classified.uncertainty,
  });
  assert.equal(blindRetry.state, 'STILL_UNCERTAIN');
  assert.equal(blindRetry.retryEligibleAfterFreshGuards, false);
  assert.equal(blindRetry.authorizesExecution, false);
});

test('W07-H readback mismatch and missing state stay conservative and never become VERIFIED', () => {
  const actionIntent = intent();
  const targetReceipt = receipt(actionIntent);
  const mismatch = readback(actionIntent, targetReceipt, { status: 'draft' });
  const unknown = readback(actionIntent, targetReceipt);

  assert.equal(mismatch.status, 'CAPTURED');
  assert.equal(unknown.status, 'CAPTURED');
  if (mismatch.status === 'CAPTURED') {
    assert.equal(mismatch.assessment.state, 'MISMATCH');
    assert.equal(mismatch.evidence.verification.state, 'UNVERIFIED');
    assert.equal(readbackReconciliationHint(mismatch).state, 'INDETERMINATE');
  }
  if (unknown.status === 'CAPTURED') {
    assert.equal(unknown.assessment.state, 'UNKNOWN');
    assert.equal(unknown.evidence.verification.state, 'UNVERIFIED');
    assert.equal(readbackReconciliationHint(unknown).state, 'INDETERMINATE');
  }
});

test('W07-H circuit OPEN and kill switch ACTIVE cannot be bypassed by FAST/confidence/router signals', () => {
  const fence: IdempotencyFencePort = { reserve: () => ({ kind: 'RESERVED' }) };
  const actionIntent = intent();
  const circuitOpen = preExternal(actionIntent, fence, {
    containment: containment({
      circuit: {
        state: 'OPEN',
        consecutiveFailures: 3,
        openedAt: at('2026-09-02T09:59:00Z'),
        halfOpenProbeInFlight: false,
      },
    }),
  });
  const killActive = preExternal(actionIntent, fence, {
    containment: containment({
      killSwitch: { state: 'ACTIVE', changedAt: at('2026-09-02T09:59:00Z') },
    }),
  });
  assert.equal(mayInvokeExternal(circuitOpen), false);
  assert.equal(mayInvokeExternal(killActive), false);
  assert.equal(circuitOpen.failureContainment.reasons.includes('CIRCUIT_OPEN'), true);
  assert.equal(killActive.failureContainment.reasons.includes('KILL_SWITCH_ACTIVE'), true);
});

test('W07-H in-flight cancellation hands off to reconciliation instead of claiming safe cancellation', () => {
  const actionIntent = intent();
  const result = evaluateFailureContainment({
    schemaVersion: version,
    actionIntent,
    evaluatedAt: at('2026-09-02T10:00:02Z'),
    phase: 'IN_FLIGHT',
    snapshot: containment({ cancellationRequested: true, currentInFlight: 1 }),
  });
  assert.equal(result.mayProceedToOtherGuards, false);
  assert.equal(result.cancellationDisposition, 'RECONCILE_IN_FLIGHT');
  assert.equal(result.requiresReconciliationHandoff, true);
  assert.equal(result.authorizesExecution, false);
});

test('W07-H HALF_OPEN allows only the reserved probe owner', () => {
  const firstIntent = intent(undefined, { actionIntentId: 'action-intent:probe-owner' });
  const secondIntent = intent(undefined, { actionIntentId: 'action-intent:probe-other' });
  const halfOpen = {
    state: 'HALF_OPEN' as const,
    consecutiveFailures: 3,
    halfOpenProbeInFlight: false,
  };
  const reserved = transitionCircuit({
    snapshot: halfOpen,
    event: 'HALF_OPEN_PROBE_STARTED',
    observedAt: at('2026-09-02T10:00:00Z'),
    failureThreshold: 2,
    recoveryAfterMs: 1000,
    probeActionIntentId: firstIntent.actionIntentId,
  });
  assert.equal(reserved.accepted, true);

  const owner = evaluateFailureContainment({
    schemaVersion: version,
    actionIntent: firstIntent,
    evaluatedAt: at('2026-09-02T10:00:00.100Z'),
    phase: 'PRE_EXTERNAL',
    snapshot: containment({ circuit: reserved.snapshot }),
  });
  const other = evaluateFailureContainment({
    schemaVersion: version,
    actionIntent: secondIntent,
    evaluatedAt: at('2026-09-02T10:00:00.100Z'),
    phase: 'PRE_EXTERNAL',
    snapshot: containment({ circuit: reserved.snapshot }),
  });
  assert.equal(owner.mayProceedToOtherGuards, true);
  assert.equal(other.mayProceedToOtherGuards, false);
  assert.deepEqual(other.reasons, ['HALF_OPEN_PROBE_IN_FLIGHT']);
});

test('W07-H retry eligibility after confirmed no-effect still requires fresh safeguards and remains non-authoritative', () => {
  const actionIntent = intent();
  const classified = classifyExecutionAmbiguity({
    schemaVersion: version,
    actionIntent,
    occurredAt: at('2026-09-02T10:00:00Z'),
    attemptNumber: 1,
    maxAttempts: 3,
    signal: 'CONNECTION_LOST',
    phase: 'AFTER_EXTERNAL_INVOCATION_STARTED',
  });
  assert.equal(classified.status, 'EXECUTION_UNCERTAIN');
  if (classified.status !== 'EXECUTION_UNCERTAIN') return;

  const blocked = reconcileExecutionUncertainty({
    schemaVersion: version,
    actionIntent,
    uncertainty: classified.uncertainty,
    observation: { state: 'NO_EFFECT_CONFIRMED', observedAt: at('2026-09-02T10:00:01Z') },
  });
  assert.equal(blocked.retryEligibleAfterFreshGuards, false);

  const freshSafeguards = evaluateExecutionSafeguards({
    schemaVersion: version,
    actionIntent,
    evaluatedAt: at('2026-09-02T10:00:02Z'),
    attemptNumber: 2,
    maxAttempts: 3,
    quota: { limit: 10, used: 1 },
    evaluatePrecondition: () => true,
    canonicalPayloadHash: 'sha256:w07h',
    idempotencyFence: { reserve: () => ({ kind: 'RESERVED' }) },
  });
  const reconciled = reconcileExecutionUncertainty({
    schemaVersion: version,
    actionIntent,
    uncertainty: classified.uncertainty,
    observation: { state: 'NO_EFFECT_CONFIRMED', observedAt: at('2026-09-02T10:00:01Z') },
    retrySafeguards: {
      attemptNumber: 2,
      evaluatedAt: at('2026-09-02T10:00:02Z'),
      result: freshSafeguards,
    },
  });
  assert.equal(reconciled.state, 'NO_EFFECT_CONFIRMED_RETRY_ELIGIBLE');
  assert.equal(reconciled.retryEligibleAfterFreshGuards, true);
  assert.equal(reconciled.authorizesExecution, false);
});
