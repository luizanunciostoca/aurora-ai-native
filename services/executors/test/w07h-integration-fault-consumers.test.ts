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
  transitionCircuit,
  transitionKillSwitch,
  type CircuitSnapshot,
  type FailureContainmentSnapshot,
} from '../src/failure-containment/index.js';
import { captureReadbackEvidence, createTargetedExecutionReceipt } from '../src/readback/index.js';
import {
  classifyExecutionAmbiguity,
  readbackReconciliationHint,
  reconcileExecutionUncertainty,
} from '../src/reconciliation/index.js';
import { evaluateExecutionSafeguards, type IdempotencyFencePort } from '../src/safeguards/index.js';
import { validateExecutorAuthority } from '../src/sdk/index.js';
import {
  resolveExecutionTarget,
  type ExecutableTargetBinding,
} from '../src/target-resolution/index.js';

const version = '1.0.0' as ContractVersion;
const at = (value: string) => value as Rfc3339Timestamp;

const TARGETS: readonly ExecutionTargetReference[] = [
  {
    schemaVersion: version,
    kind: 'PROVIDER',
    provider: 'meta',
    targetReference: 'provider:ig:w07h',
  },
  { schemaVersion: version, kind: 'WORKFLOW', bindingReference: 'workflow:w07h' },
  { schemaVersion: version, kind: 'DEVICE', bindingReference: 'device:w07h' },
  { schemaVersion: version, kind: 'LOCAL_SERVICE', bindingReference: 'local:w07h' },
];

function intent(
  target: ExecutionTargetReference = TARGETS[1]!,
  overrides: Record<string, unknown> = {},
): ActionIntent {
  return {
    kind: 'ACTION_INTENT',
    schemaVersion: version,
    actionIntentId: `action-intent:w07h:${target.kind}`,
    capability: { capability: 'integration.execute', actionType: 'EXECUTE' },
    executionTarget: target,
    tenant: { tenantId: 'tenant:alpha' },
    actor: { kind: 'HUMAN', identityId: 'identity:operator' },
    requestOrigin: { kind: 'HUMAN', identityId: 'identity:operator' },
    correlation: { correlationId: `correlation:w07h:${target.kind}` },
    resolvedParameters: { fixture: true },
    idempotency: { mode: 'REQUIRED', key: `idem:w07h:${target.kind}` },
    preconditions: [{ preconditionType: 'FIXTURE_READY', parameters: {} }],
    expectedState: { stateType: 'fixture', value: { status: 'applied' } },
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
  overrides: Record<string, unknown> = {},
): AuthorityEvaluationResult {
  const policy = request.policyEvaluation;
  const subjectReference =
    policy.subject.kind === 'IDENTITY'
      ? `identity:${policy.subject.identityId}`
      : `external:${policy.subject.externalIdentity.provider}:${policy.subject.externalIdentity.externalId}`;
  const effectiveScope = [...policy.requestedScope];

  return {
    kind: 'AuthorityEvaluationResult',
    schemaVersion: policy.schemaVersion,
    correlation: policy.correlation,
    evaluatedAt: policy.evaluatedAt,
    currentPolicy: policy.policy,
    authorized: true,
    effectiveScope,
    reasons: ['POLICY_ALLOWED'],
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
    ...overrides,
  } as unknown as AuthorityEvaluationResult;
}

function binding(actionIntent: ActionIntent, overrides: Partial<ExecutableTargetBinding> = {}) {
  return {
    schemaVersion: version,
    bindingId: `binding:w07h:${actionIntent.executionTarget?.kind}`,
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

function safeguards(actionIntent: ActionIntent, fence?: IdempotencyFencePort, attempt = 1) {
  return evaluateExecutionSafeguards({
    schemaVersion: version,
    actionIntent,
    evaluatedAt: at(attempt === 1 ? '2026-09-02T04:00:02Z' : '2026-09-02T04:00:08Z'),
    attemptNumber: attempt,
    maxAttempts: 3,
    quota: { limit: 10, used: 0 },
    evaluatePrecondition: () => true,
    canonicalPayloadHash: 'sha256:w07h',
    idempotencyFence: fence ?? { reserve: () => ({ kind: 'RESERVED' as const }) },
  });
}

function receipt(actionIntent: ActionIntent): TargetedReceipt {
  const created = createTargetedExecutionReceipt({
    schemaVersion: version,
    actionIntent,
    receiptId: `receipt:w07h:${actionIntent.actionIntentId}` as TargetedReceipt['receiptId'],
    executor: { executor: 'executor:w07h-fixture' },
    attempt: 1,
    attemptedAt: at('2026-09-02T04:00:03Z'),
    acknowledgedAt: at('2026-09-02T04:00:04Z'),
    returnedAt: at('2026-09-02T04:00:05Z'),
    executionOutcome: 'EXECUTED_ACKNOWLEDGED',
  });
  assert.equal(created.status, 'CREATED');
  if (created.status !== 'CREATED') throw new Error('W07-H receipt fixture rejected');
  return created.receipt;
}

test('W07-H composes accepted boundaries for provider/workflow/device/local targets without minting authority', () => {
  for (const target of TARGETS) {
    const actionIntent = intent(target);
    const request = authorityRequest(actionIntent);
    const authority = validateExecutorAuthority({
      schemaVersion: version,
      actionIntent,
      authorityEvaluation: request,
      validateCurrentAuthority: (current) => authorityResult(current),
    });
    const resolved = resolveExecutionTarget({
      schemaVersion: version,
      actionIntentSchemaVersion: version,
      tenant: actionIntent.tenant,
      evaluatedAt: at('2026-09-02T04:00:01Z'),
      target,
      bindings: [binding(actionIntent)],
    });
    const guard = safeguards(actionIntent);
    const contained = evaluateFailureContainment({
      schemaVersion: version,
      actionIntent,
      evaluatedAt: at('2026-09-02T04:00:02Z'),
      phase: 'PRE_EXTERNAL',
      snapshot: containment(),
    });

    assert.equal(authority.executionEligible, true);
    assert.equal(resolved.resolved, true);
    assert.equal(guard.safeToInvokeExternal, true);
    assert.equal(contained.mayProceedToOtherGuards, true);
    assert.equal(authority.authorizesExecution, false);
    assert.equal(resolved.authorizesExecution, false);
    assert.equal(guard.authorizesExecution, false);
    assert.equal(contained.authorizesExecution, false);
    assert.deepEqual(receipt(actionIntent).executionTarget, target);
  }
});

test('W07-H stale authority and stale target both fail closed', () => {
  const actionIntent = intent();
  const request = authorityRequest(actionIntent);
  const staleAuthority = validateExecutorAuthority({
    schemaVersion: version,
    actionIntent,
    authorityEvaluation: request,
    validateCurrentAuthority: (current) =>
      authorityResult(current, {
        currentPolicy: { reference: 'policy:execution', version: 'stale' },
      }),
    nonAuthoritativeSignals: { lane: 'FAST', confidence: 1 },
  });
  const staleTarget = resolveExecutionTarget({
    schemaVersion: version,
    actionIntentSchemaVersion: version,
    tenant: actionIntent.tenant,
    evaluatedAt: at('2026-09-02T04:30:00Z'),
    target: actionIntent.executionTarget!,
    bindings: [binding(actionIntent)],
  });

  assert.equal(staleAuthority.executionEligible, false);
  assert.deepEqual(staleAuthority.reasons, ['CURRENT_AUTHORITY_RESULT_MISMATCH']);
  assert.equal(staleTarget.resolved, false);
  assert.deepEqual(staleTarget.reasons, ['TARGET_STALE']);
});

test('W07-H duplicate equivalent attempts are fenced before the simulated effect boundary', () => {
  let reserved = false;
  const fence: IdempotencyFencePort = {
    reserve: () => {
      if (reserved) return { kind: 'INFLIGHT' };
      reserved = true;
      return { kind: 'RESERVED' };
    },
  };
  const actionIntent = intent();
  const first = safeguards(actionIntent, fence);
  const second = safeguards(actionIntent, fence);

  assert.equal(first.safeToInvokeExternal, true);
  assert.equal(second.safeToInvokeExternal, false);
  assert.deepEqual(second.reasons, ['IDEMPOTENCY_INFLIGHT']);
});

test('W07-H post-dispatch timeout remains uncertain until no-effect observation plus fresh safeguards', () => {
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
  const fresh = safeguards(actionIntent, undefined, 2);
  const reconciled = reconcileExecutionUncertainty({
    schemaVersion: version,
    actionIntent,
    uncertainty: classified.uncertainty,
    observation: {
      state: 'NO_EFFECT_CONFIRMED',
      observedAt: at('2026-09-02T04:00:07Z'),
      reference: 'readback:no-effect',
    },
    retrySafeguards: {
      attemptNumber: 2,
      evaluatedAt: at('2026-09-02T04:00:08Z'),
      result: fresh,
    },
  });

  assert.equal(blind.retryEligibleAfterFreshGuards, false);
  assert.equal(reconciled.state, 'NO_EFFECT_CONFIRMED_RETRY_ELIGIBLE');
  assert.equal(reconciled.retryEligibleAfterFreshGuards, true);
  assert.equal(reconciled.authorizesExecution, false);
});

test('W07-H readback mismatch remains UNVERIFIED and only produces an indeterminate reconciliation hint', () => {
  const actionIntent = intent();
  const captured = captureReadbackEvidence({
    schemaVersion: version,
    evidenceId: 'evidence:w07h:mismatch' as Evidence['evidenceId'],
    actionIntent,
    receipt: receipt(actionIntent),
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

test('W07-H circuit open, kill switch and in-flight cancellation contain execution regardless of routing signals', () => {
  const actionIntent = intent();
  const blockedSnapshots: FailureContainmentSnapshot[] = [
    containment({
      circuit: {
        state: 'OPEN',
        consecutiveFailures: 3,
        openedAt: at('2026-09-02T03:59:00Z'),
        halfOpenProbeInFlight: false,
      },
    }),
    containment({
      killSwitch: { state: 'ACTIVE', changedAt: at('2026-09-02T03:59:00Z') },
    }),
  ];

  for (const snapshot of blockedSnapshots) {
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

  const cancelled = evaluateFailureContainment({
    schemaVersion: version,
    actionIntent,
    evaluatedAt: at('2026-09-02T04:00:06Z'),
    phase: 'IN_FLIGHT',
    snapshot: containment({ cancellationRequested: true, currentInFlight: 1 }),
  });
  assert.equal(cancelled.cancellationDisposition, 'RECONCILE_IN_FLIGHT');
  assert.equal(cancelled.requiresReconciliationHandoff, true);
  assert.equal(cancelled.mayProceedToOtherGuards, false);
});

test('W07-H HALF_OPEN permits one durable probe owner and rejects competing ownership', () => {
  const initial: CircuitSnapshot = {
    state: 'HALF_OPEN',
    consecutiveFailures: 2,
    halfOpenProbeInFlight: false,
  };
  const owner = intent(TARGETS[1]!, { actionIntentId: 'action-intent:w07h:owner' });
  const contender = intent(TARGETS[1]!, { actionIntentId: 'action-intent:w07h:contender' });
  const reserved = transitionCircuit({
    snapshot: initial,
    event: 'HALF_OPEN_PROBE_STARTED',
    observedAt: at('2026-09-02T04:00:10Z'),
    failureThreshold: 2,
    recoveryAfterMs: 1000,
    probeActionIntentId: owner.actionIntentId,
  });
  const competing = transitionCircuit({
    snapshot: reserved.snapshot,
    event: 'HALF_OPEN_PROBE_STARTED',
    observedAt: at('2026-09-02T04:00:10.100Z'),
    failureThreshold: 2,
    recoveryAfterMs: 1000,
    probeActionIntentId: contender.actionIntentId,
  });

  assert.equal(reserved.accepted, true);
  assert.equal(reserved.snapshot.halfOpenProbeActionIntentId, owner.actionIntentId);
  assert.equal(competing.accepted, false);
  assert.deepEqual(competing.reasons, ['HALF_OPEN_PROBE_ALREADY_IN_FLIGHT']);
});

test('W07-H kill-switch deactivation requires governed recovery validation', () => {
  const active = {
    state: 'ACTIVE' as const,
    changedAt: at('2026-09-02T04:00:00Z'),
  };
  const rejected = transitionKillSwitch({
    snapshot: active,
    command: 'DEACTIVATE',
    changedAt: at('2026-09-02T04:01:00Z'),
    recoveryGate: 'NOT_VALIDATED',
  });
  const recovered = transitionKillSwitch({
    snapshot: active,
    command: 'DEACTIVATE',
    changedAt: at('2026-09-02T04:02:00Z'),
    recoveryGate: 'VALIDATED',
  });

  assert.equal(rejected.accepted, false);
  assert.equal(rejected.snapshot.state, 'ACTIVE');
  assert.equal(recovered.accepted, true);
  assert.equal(recovered.snapshot.state, 'INACTIVE');
  assert.equal(recovered.authorizesExecution, false);
});
