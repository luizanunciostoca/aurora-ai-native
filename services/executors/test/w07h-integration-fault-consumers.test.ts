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

import {
  evaluateFailureContainment,
  transitionCircuit,
  transitionKillSwitch,
} from '../src/failure-containment/index.js';
import type {
  CircuitSnapshot,
  FailureContainmentSnapshot,
  KillSwitchSnapshot,
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
const evaluatedAt = at('2026-09-02T04:00:00Z');

function targetFixtures(): readonly ExecutionTargetReference[] {
  return [
    {
      schemaVersion: version,
      kind: 'PROVIDER',
      provider: 'meta',
      targetType: 'instagram_account',
      targetReference: 'ig:consumer-fixture',
    },
    {
      schemaVersion: version,
      kind: 'WORKFLOW',
      bindingReference: 'workflow:consumer-fixture',
    },
    {
      schemaVersion: version,
      kind: 'DEVICE',
      bindingReference: 'device-binding:consumer-fixture',
    },
    {
      schemaVersion: version,
      kind: 'LOCAL_SERVICE',
      bindingReference: 'local-service:consumer-fixture',
    },
  ];
}

function makeIntent(
  target: ExecutionTargetReference = targetFixtures()[1]!,
  overrides: Record<string, unknown> = {},
): ActionIntent {
  return {
    kind: 'ACTION_INTENT',
    schemaVersion: version,
    actionIntentId: `action-intent:w07h:${target.kind}`,
    capability: { capability: 'social.publish', actionType: 'PUBLISH' },
    executionTarget: target,
    tenant: { tenantId: 'tenant:alpha' },
    actor: { kind: 'HUMAN', identityId: 'identity:operator' },
    requestOrigin: { kind: 'HUMAN', identityId: 'identity:operator' },
    correlation: { correlationId: `correlation:w07h:${target.kind}` },
    resolvedParameters: { text: 'integration-fixture' },
    idempotency: { mode: 'NOT_APPLICABLE', reason: 'fixture-controlled-effect-boundary' },
    preconditions: [],
    expectedState: { stateType: 'fixture', value: { status: 'applied' } },
    deadlineAt: at('2026-09-02T05:00:00Z'),
    authority: { kind: 'POLICY_TOKEN', policyTokenId: 'policy-token:w07h' },
    dataClassification: 'INTERNAL',
    ...overrides,
  } as unknown as ActionIntent;
}

function authorityEvaluation(
  actionIntent: ActionIntent,
  overrides: Record<string, unknown> = {},
): AuthorityEvaluationRequest {
  return {
    kind: 'AuthorityEvaluationRequest',
    policyEvaluation: {
      kind: 'PolicyEvaluationRequest',
      schemaVersion: actionIntent.schemaVersion,
      evaluatedAt,
      tenant: actionIntent.tenant,
      actor: actionIntent.actor,
      subject: { kind: 'IDENTITY', identityId: 'identity:subject' },
      correlation: actionIntent.correlation,
      action: actionIntent.capability.actionType,
      requestedScope: [actionIntent.capability.capability],
      policy: { reference: 'policy:execution', version: '7' },
      policyToken: { policyTokenId: 'policy-token:w07h' },
      ...overrides,
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
              matchedRuleIds: ['rule:w07h:allow'],
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

function currentAuthority(actionIntent: ActionIntent, overrideResult?: AuthorityEvaluationResult) {
  const request = authorityEvaluation(actionIntent);
  return validateExecutorAuthority({
    schemaVersion: actionIntent.schemaVersion,
    actionIntent,
    authorityEvaluation: request,
    validateCurrentAuthority: (currentRequest) =>
      overrideResult ?? authorityResult(currentRequest, true),
  });
}

function binding(
  target: ExecutionTargetReference,
  overrides: Partial<ExecutableTargetBinding> = {},
): ExecutableTargetBinding {
  return {
    schemaVersion: version,
    bindingId: `binding:w07h:${target.kind}`,
    tenant: { tenantId: 'tenant:alpha' },
    target,
    state: 'AVAILABLE',
    freshUntil: at('2026-09-02T04:30:00Z'),
    compatibleActionIntentSchemaVersions: [version],
    preconditionsSatisfied: true,
    ...overrides,
  };
}

function resolveTarget(actionIntent: ActionIntent, targetBinding: ExecutableTargetBinding) {
  if (!actionIntent.executionTarget) throw new Error('W07-H fixture requires executionTarget');
  return resolveExecutionTarget({
    schemaVersion: version,
    actionIntentSchemaVersion: actionIntent.schemaVersion,
    tenant: actionIntent.tenant,
    evaluatedAt,
    target: actionIntent.executionTarget,
    bindings: [targetBinding],
  });
}

function safeguards(
  actionIntent: ActionIntent,
  overrides: Record<string, unknown> = {},
) {
  return evaluateExecutionSafeguards({
    schemaVersion: version,
    actionIntent,
    evaluatedAt,
    attemptNumber: 1,
    maxAttempts: 3,
    quota: { limit: 10, used: 0 },
    evaluatePrecondition: () => true,
    ...overrides,
  });
}

function circuit(overrides: Partial<CircuitSnapshot> = {}): CircuitSnapshot {
  return {
    state: 'CLOSED',
    consecutiveFailures: 0,
    halfOpenProbeInFlight: false,
    ...overrides,
  };
}

function killSwitch(overrides: Partial<KillSwitchSnapshot> = {}): KillSwitchSnapshot {
  return {
    state: 'INACTIVE',
    changedAt: at('2026-09-02T03:00:00Z'),
    ...overrides,
  };
}

function containmentSnapshot(
  overrides: Partial<FailureContainmentSnapshot> = {},
): FailureContainmentSnapshot {
  return {
    circuit: circuit(),
    killSwitch: killSwitch(),
    dependencyHealth: 'HEALTHY',
    cancellationRequested: false,
    currentInFlight: 0,
    maxInFlight: 4,
    retryDepth: 0,
    maxRetryDepth: 3,
    ...overrides,
  };
}

function containment(
  actionIntent: ActionIntent,
  snapshot = containmentSnapshot(),
  phase: 'QUEUED' | 'PRE_EXTERNAL' | 'IN_FLIGHT' | 'POST_EXTERNAL' = 'PRE_EXTERNAL',
) {
  return evaluateFailureContainment({
    schemaVersion: version,
    actionIntent,
    evaluatedAt,
    phase,
    snapshot,
  });
}

function receipt(actionIntent: ActionIntent): TargetedReceipt {
  const created = createTargetedExecutionReceipt({
    schemaVersion: version,
    actionIntent,
    receiptId: `receipt:w07h:${actionIntent.actionIntentId}` as TargetedReceipt['receiptId'],
    executor: { executor: 'executor:w07h-fixture' },
    attempt: 1,
    attemptedAt: at('2026-09-02T04:00:01Z'),
    acknowledgedAt: at('2026-09-02T04:00:02Z'),
    returnedAt: at('2026-09-02T04:00:03Z'),
    executionOutcome: 'EXECUTED_ACKNOWLEDGED',
  });
  assert.equal(created.status, 'CREATED');
  if (created.status !== 'CREATED') throw new Error('W07-H receipt fixture rejected');
  return created.receipt;
}

function readback(
  actionIntent: ActionIntent,
  targetReceipt: TargetedReceipt,
  observedState: JsonObject,
) {
  return captureReadbackEvidence({
    schemaVersion: version,
    evidenceId: `evidence:w07h:${actionIntent.actionIntentId}` as Evidence['evidenceId'],
    actionIntent,
    receipt: targetReceipt,
    readback: () => ({
      capturedAt: at('2026-09-02T04:00:04Z'),
      reference: { system: 'w07h-fixture', reference: `readback:${actionIntent.actionIntentId}` },
      observedState,
    }),
  });
}

function mayInvokeSimulatedEffect(
  actionIntent: ActionIntent,
  targetBinding: ExecutableTargetBinding,
): boolean {
  const authority = currentAuthority(actionIntent);
  const target = resolveTarget(actionIntent, targetBinding);
  const guard = safeguards(actionIntent);
  const contained = containment(actionIntent);

  assert.equal(authority.authorizesExecution, false);
  assert.equal(target.authorizesExecution, false);
  assert.equal(guard.authorizesExecution, false);
  assert.equal(contained.authorizesExecution, false);

  return (
    authority.executionEligible &&
    target.resolved &&
    guard.safeToInvokeExternal &&
    contained.mayProceedToOtherGuards
  );
}

test('W07-H composes accepted A-G prerequisites for provider, workflow, device and local consumers', () => {
  let simulatedEffects = 0;

  for (const target of targetFixtures()) {
    const actionIntent = makeIntent(target);
    if (mayInvokeSimulatedEffect(actionIntent, binding(target))) simulatedEffects += 1;

    const captured = readback(actionIntent, receipt(actionIntent), { status: 'applied' });
    assert.equal(captured.status, 'CAPTURED');
    if (captured.status !== 'CAPTURED') continue;
    assert.equal(captured.assessment.state, 'MATCH');
    assert.equal(captured.assessment.verifiedExternalState, false);
    assert.equal(captured.evidence.verification.state, 'UNVERIFIED');
    assert.deepEqual(readbackReconciliationHint(captured), {
      state: 'EFFECT_OBSERVED',
      reason: 'READBACK_MATCH_OBSERVED',
      authorizesExecution: false,
    });
  }

  assert.equal(simulatedEffects, 4);
});

test('W07-H stale authority and stale target both stop before the simulated effect boundary', () => {
  const target = targetFixtures()[1]!;
  const actionIntent = makeIntent(target);
  let simulatedEffects = 0;

  const evaluation = authorityEvaluation(actionIntent);
  const staleAuthority = currentAuthority(
    actionIntent,
    authorityResult(evaluation, true, {
      currentPolicy: { reference: 'policy:execution', version: 'stale' },
    }),
  );
  if (staleAuthority.executionEligible) simulatedEffects += 1;
  assert.equal(staleAuthority.executionEligible, false);
  assert.deepEqual(staleAuthority.reasons, ['CURRENT_AUTHORITY_RESULT_MISMATCH']);

  const staleTarget = resolveTarget(
    actionIntent,
    binding(target, { freshUntil: evaluatedAt }),
  );
  if (staleTarget.resolved) simulatedEffects += 1;
  assert.equal(staleTarget.resolved, false);
  assert.deepEqual(staleTarget.reasons, ['TARGET_STALE']);
  assert.equal(simulatedEffects, 0);
});

test('W07-H duplicate concurrent safeguards admit exactly one simulated effect', () => {
  const target = targetFixtures()[0]!;
  const actionIntent = makeIntent(target, {
    idempotency: { mode: 'REQUIRED', key: 'idem:w07h:duplicate' },
  });
  let reserved = false;
  const fence: IdempotencyFencePort = {
    reserve: () => {
      if (reserved) return { kind: 'INFLIGHT' };
      reserved = true;
      return { kind: 'RESERVED' };
    },
  };
  const common = {
    canonicalPayloadHash: 'sha256:0123456789abcdef',
    idempotencyFence: fence,
  };

  const first = safeguards(actionIntent, common);
  const second = safeguards(actionIntent, common);
  let simulatedEffects = 0;
  if (first.safeToInvokeExternal) simulatedEffects += 1;
  if (second.safeToInvokeExternal) simulatedEffects += 1;

  assert.equal(first.safeToInvokeExternal, true);
  assert.equal(second.safeToInvokeExternal, false);
  assert.deepEqual(second.reasons, ['IDEMPOTENCY_INFLIGHT']);
  assert.equal(simulatedEffects, 1);
});

test('W07-H post-dispatch timeout requires reconciliation, fresh safeguards and fresh authority before retry', () => {
  const target = targetFixtures()[2]!;
  const actionIntent = makeIntent(target);
  let simulatedEffects = 1;

  const ambiguous = classifyExecutionAmbiguity({
    schemaVersion: version,
    actionIntent,
    occurredAt: at('2026-09-02T04:00:05Z'),
    attemptNumber: 1,
    maxAttempts: 3,
    signal: 'TIMEOUT',
    phase: 'AFTER_EXTERNAL_INVOCATION_STARTED',
  });
  assert.equal(ambiguous.status, 'EXECUTION_UNCERTAIN');
  if (ambiguous.status !== 'EXECUTION_UNCERTAIN') return;
  assert.equal(ambiguous.retryAllowedBeforeReconciliation, false);

  const blind = reconcileExecutionUncertainty({
    schemaVersion: version,
    actionIntent,
    uncertainty: ambiguous.uncertainty,
  });
  assert.equal(blind.state, 'STILL_UNCERTAIN');
  assert.equal(blind.retryEligibleAfterFreshGuards, false);

  const nextAttemptGuards = evaluateExecutionSafeguards({
    schemaVersion: version,
    actionIntent,
    evaluatedAt: at('2026-09-02T04:00:07Z'),
    attemptNumber: 2,
    maxAttempts: 3,
    quota: { limit: 10, used: 1 },
    evaluatePrecondition: () => true,
  });
  const reconciled = reconcileExecutionUncertainty({
    schemaVersion: version,
    actionIntent,
    uncertainty: ambiguous.uncertainty,
    observation: {
      state: 'NO_EFFECT_CONFIRMED',
      observedAt: at('2026-09-02T04:00:06Z'),
      reference: 'readback:no-effect',
    },
    retrySafeguards: {
      attemptNumber: 2,
      evaluatedAt: at('2026-09-02T04:00:07Z'),
      result: nextAttemptGuards,
    },
  });
  assert.equal(reconciled.state, 'NO_EFFECT_CONFIRMED_RETRY_ELIGIBLE');
  assert.equal(reconciled.retryEligibleAfterFreshGuards, true);
  assert.equal(reconciled.authorizesExecution, false);

  const freshAuthority = currentAuthority(actionIntent);
  assert.equal(freshAuthority.executionEligible, true);
  if (reconciled.retryEligibleAfterFreshGuards && freshAuthority.executionEligible) {
    simulatedEffects += 1;
  }
  assert.equal(simulatedEffects, 2);
});

test('W07-H readback mismatch remains indeterminate and never becomes retry or verification authority', () => {
  const actionIntent = makeIntent();
  const captured = readback(actionIntent, receipt(actionIntent), { status: 'different' });
  assert.equal(captured.status, 'CAPTURED');
  if (captured.status !== 'CAPTURED') return;
  assert.equal(captured.assessment.state, 'MISMATCH');
  assert.equal(captured.assessment.verifiedExternalState, false);
  assert.deepEqual(readbackReconciliationHint(captured), {
    state: 'INDETERMINATE',
    reason: 'READBACK_NOT_SUFFICIENT_TO_RESOLVE',
    authorizesExecution: false,
  });
});

test('W07-H circuit open, active kill switch and in-flight cancellation all contain execution', () => {
  const actionIntent = makeIntent();
  const openCircuit = containment(
    actionIntent,
    containmentSnapshot({
      circuit: circuit({
        state: 'OPEN',
        consecutiveFailures: 3,
        openedAt: at('2026-09-02T03:59:00Z'),
      }),
    }),
  );
  const killed = containment(
    actionIntent,
    containmentSnapshot({ killSwitch: killSwitch({ state: 'ACTIVE' }) }),
  );
  const cancelled = containment(
    actionIntent,
    containmentSnapshot({ cancellationRequested: true }),
    'IN_FLIGHT',
  );

  assert.equal(openCircuit.mayProceedToOtherGuards, false);
  assert.deepEqual(openCircuit.reasons, ['CIRCUIT_OPEN']);
  assert.equal(killed.mayProceedToOtherGuards, false);
  assert.deepEqual(killed.reasons, ['KILL_SWITCH_ACTIVE']);
  assert.equal(cancelled.mayProceedToOtherGuards, false);
  assert.equal(cancelled.requiresReconciliationHandoff, true);
  assert.equal(cancelled.cancellationDisposition, 'RECONCILE_IN_FLIGHT');
});

test('W07-H HALF_OPEN reservation permits one owner and rejects a competing probe', () => {
  const firstIntent = makeIntent(targetFixtures()[3]!);
  const secondIntent = makeIntent(targetFixtures()[3]!, {
    actionIntentId: 'action-intent:w07h:competing-half-open',
  });
  const halfOpen = circuit({ state: 'HALF_OPEN', consecutiveFailures: 2 });

  const reserved = transitionCircuit({
    snapshot: halfOpen,
    event: 'HALF_OPEN_PROBE_STARTED',
    observedAt: at('2026-09-02T04:00:08Z'),
    failureThreshold: 2,
    recoveryAfterMs: 1000,
    probeActionIntentId: firstIntent.actionIntentId,
  });
  const competing = transitionCircuit({
    snapshot: reserved.snapshot,
    event: 'HALF_OPEN_PROBE_STARTED',
    observedAt: at('2026-09-02T04:00:08.100Z'),
    failureThreshold: 2,
    recoveryAfterMs: 1000,
    probeActionIntentId: secondIntent.actionIntentId,
  });

  assert.equal(reserved.accepted, true);
  assert.equal(reserved.snapshot.halfOpenProbeActionIntentId, firstIntent.actionIntentId);
  assert.equal(competing.accepted, false);
  assert.deepEqual(competing.reasons, ['HALF_OPEN_PROBE_ALREADY_IN_FLIGHT']);
});

test('W07-H kill-switch recovery remains governed and stale recovery cannot reactivate execution', () => {
  const activated = transitionKillSwitch({
    snapshot: killSwitch(),
    command: 'ACTIVATE',
    changedAt: at('2026-09-02T04:00:09Z'),
    recoveryGate: 'NOT_REQUIRED',
  });
  assert.equal(activated.accepted, true);

  const unvalidated = transitionKillSwitch({
    snapshot: activated.snapshot,
    command: 'DEACTIVATE',
    changedAt: at('2026-09-02T04:00:10Z'),
    recoveryGate: 'NOT_VALIDATED',
  });
  const stale = transitionKillSwitch({
    snapshot: activated.snapshot,
    command: 'DEACTIVATE',
    changedAt: at('2026-09-02T04:00:08Z'),
    recoveryGate: 'VALIDATED',
  });

  assert.equal(unvalidated.accepted, false);
  assert.deepEqual(unvalidated.reasons, ['KILL_SWITCH_RECOVERY_NOT_VALIDATED']);
  assert.equal(stale.accepted, false);
  assert.deepEqual(stale.reasons, ['STALE_KILL_SWITCH_TRANSITION']);
});
