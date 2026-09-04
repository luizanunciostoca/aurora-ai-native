// @ts-expect-error -- revenue harness has no @types/node; Node 22 provides this built-in.
import assert from 'node:assert/strict';
// @ts-expect-error -- revenue harness has no @types/node; Node 22 provides this built-in.
import test from 'node:test';
import type { CorrelationId, TenantId } from '@aurora/contracts';
import {
  prepareGoogleAdsAccountRead,
  type GoogleAdsBindingProjection,
  type GoogleAdsHealthProjection,
} from '../src/google-ads/account-read.js';
import {
  planGoogleAdsDomainIntent,
  type GoogleAdsCapabilityPlan,
  type GoogleAdsOperation,
} from '../src/google-ads/contracts.js';
import {
  prepareGoogleAdsFinancialMutation,
  type GoogleAdsFinancialGovernanceInput,
} from '../src/google-ads/financial-governance.js';
import {
  executeGoogleAdsGovernedOperation,
  type GoogleAdsGovernedOperationInput,
  type GoogleAdsW08GovernedWriteRequest,
  type GoogleAdsW08WritePort,
  type GoogleAdsW08WriteResult,
} from '../src/google-ads/governed-operations.js';
import {
  buildGoogleAdsMeasurementDecisionSupport,
  type GoogleAdsMeasurementObservation,
} from '../src/google-ads/measurement-calculations.js';

const TENANT = 'ten_01JW13HTENANT000000000000' as TenantId;
const CORRELATION = 'cor_01JW13HCORRELATION0000000' as CorrelationId;
const CUSTOMER = '1234567890';
const MANAGER = '9988776655';
const BINDING = 'w08:google-ads:binding-1';
const NOW = 1_800_000_000_000;

type W08ReadbackProjection = Readonly<{
  ok: true;
  provider: 'GOOGLE_ADS';
  accountReference: string;
  bindingReference: string;
  bindingVersion: number;
  actionIntentId: string;
  observation:
    | Readonly<{ state: 'EFFECT_OBSERVED'; observedAt: string; reference?: string }>
    | Readonly<{ state: 'NO_EFFECT_CONFIRMED'; observedAt: string; reference?: string }>
    | Readonly<{
        state: 'INDETERMINATE';
        observedAt: string;
        reason: string;
        reference?: string;
      }>;
  observedState?: Readonly<Record<string, unknown>>;
  requiresFurtherReadback: boolean;
  retryAuthorized: false;
  authorizesExecution: false;
}>;

function binding(overrides: Partial<GoogleAdsBindingProjection> = {}): GoogleAdsBindingProjection {
  return {
    source: 'W08_PROVIDER_BINDING',
    tenantId: TENANT,
    provider: 'GOOGLE_ADS',
    bindingReference: BINDING,
    customerId: CUSTOMER,
    managerCustomerId: MANAGER,
    state: 'ACTIVE',
    verificationState: 'VERIFIED',
    bindingVersion: 7,
    verifiedAtMs: NOW - 1_000,
    authorizesExecution: false,
    ...overrides,
  };
}

function health(overrides: Partial<GoogleAdsHealthProjection> = {}): GoogleAdsHealthProjection {
  return {
    source: 'W08_PROVIDER_HEALTH',
    status: 'HEALTHY',
    observedAtMs: NOW - 500,
    authorizesExecution: false,
    ...overrides,
  };
}

function domainPlan(operation: GoogleAdsOperation = 'CREATE_PAUSED'): GoogleAdsCapabilityPlan {
  const result = planGoogleAdsDomainIntent({
    tenantId: TENANT,
    correlationId: CORRELATION,
    intentId: `intent-w13h-${operation.toLowerCase()}`,
    surface: 'SEARCH',
    resourceKind: 'CAMPAIGN',
    operation,
    providerBindingReference: BINDING,
    customerId: CUSTOMER,
    managerCustomerId: MANAGER,
    target:
      operation === 'CREATE_PAUSED'
        ? {}
        : {
            googleAds: {
              provider: 'GOOGLE_ADS',
              resourceKind: 'CAMPAIGN',
              customerId: CUSTOMER,
              managerCustomerId: MANAGER,
              resourceName: `customers/${CUSTOMER}/campaigns/42`,
            },
          },
    capability: {
      source: 'W04_CAPABILITY_REGISTRY',
      capabilityId: `google-ads:${operation.toLowerCase()}`,
      registryVersion: 'w04-v7',
      targetKind: 'PROVIDER',
      compatibilityKey: 'google-ads',
      authorizesExecution: false,
    },
    ...(operation === 'SET_BUDGET' || operation === 'SET_BID' || operation === 'ACTIVATE'
      ? {
          financialScope: {
            currency: 'BRL',
            ceilingMicros: 50_000_000,
            horizon: 'DAILY' as const,
          },
        }
      : {}),
    expectedProviderState: operation === 'CREATE_PAUSED' ? 'ABSENT' : 'PAUSED',
  });
  assert.equal(result.status, 'READY');
  if (result.status !== 'READY') throw new Error('fixture must produce a W13 plan');
  return result.plan;
}

function operationInput(
  operation: GoogleAdsOperation = 'CREATE_PAUSED',
  overrides: Partial<GoogleAdsGovernedOperationInput> = {},
): GoogleAdsGovernedOperationInput {
  const plan = domainPlan(operation);
  return {
    nowMs: NOW,
    plan,
    actionIntentId: `action-w13h-${operation.toLowerCase()}`,
    idempotencyKey: operation === 'CREATE_PAUSED' ? 'key-1' : 'key-2',
    payloadReference: `payload:w13h:${operation.toLowerCase()}:1`,
    executionProof: {
      source: 'W07_PROVIDER_EXECUTION_PROOF',
      actionIntentId: `action-w13h-${operation.toLowerCase()}`,
      currentAuthorityValidated: true,
      executionEligible: true,
      authorizesExecution: false,
    },
    precheck: {
      source: 'W08_PROVIDER_PRECHECK',
      tenantId: TENANT,
      providerBindingReference: BINDING,
      customerId: CUSTOMER,
      managerCustomerId: MANAGER,
      bindingState: 'ACTIVE',
      verificationState: 'VERIFIED',
      observedAtMs: NOW - 1_000,
      validUntilMs: NOW + 30_000,
      expectedResourceState: operation === 'CREATE_PAUSED' ? null : 'PAUSED',
      authorizesExecution: false,
    },
    ...overrides,
  };
}

function port(
  outcome: GoogleAdsW08WriteResult,
  seen: GoogleAdsW08GovernedWriteRequest[] = [],
): GoogleAdsW08WritePort {
  return {
    source: 'W08_GOVERNED_PROVIDER_WRITE',
    async writeOnce(request) {
      seen.push(request);
      return outcome;
    },
  };
}

function effectReadback(
  actionIntentId: string,
  observedState: Readonly<Record<string, unknown>>,
): W08ReadbackProjection {
  return {
    ok: true,
    provider: 'GOOGLE_ADS',
    accountReference: CUSTOMER,
    bindingReference: BINDING,
    bindingVersion: 7,
    actionIntentId,
    observation: {
      state: 'EFFECT_OBSERVED',
      observedAt: '2026-09-04T00:00:01.000Z',
      reference: `customers/${CUSTOMER}/campaigns/42`,
    },
    observedState,
    requiresFurtherReadback: false,
    retryAuthorized: false,
    authorizesExecution: false,
  };
}

function assertReadbackScope(readback: W08ReadbackProjection, actionIntentId: string): void {
  assert.equal(readback.provider, 'GOOGLE_ADS');
  assert.equal(readback.accountReference, CUSTOMER);
  assert.equal(readback.bindingReference, BINDING);
  assert.equal(readback.actionIntentId, actionIntentId);
  assert.equal(readback.retryAuthorized, false);
  assert.equal(readback.authorizesExecution, false);
}

function financialInput(
  plan: GoogleAdsCapabilityPlan,
  authorityValidUntilMs = NOW + 20_000,
): GoogleAdsFinancialGovernanceInput {
  return {
    nowMs: NOW,
    plan,
    proposedMicros: 25_000_000,
    precheck: {
      source: 'W08_PROVIDER_PRECHECK',
      tenantId: TENANT,
      providerBindingReference: BINDING,
      customerId: CUSTOMER,
      managerCustomerId: MANAGER,
      bindingState: 'ACTIVE',
      verificationState: 'VERIFIED',
      observedAtMs: NOW - 1_000,
      validUntilMs: NOW + 20_000,
      authorizesExecution: false,
    },
    authority: {
      source: 'W02_AUTHORITY_EVALUATION',
      tenantId: TENANT,
      capabilityId: plan.capability.capabilityId,
      providerBindingReference: BINDING,
      customerId: CUSTOMER,
      managerCustomerId: MANAGER,
      operation: plan.operation as 'SET_BUDGET' | 'SET_BID',
      authorized: true,
      approvalReference: 'approval:w13h:1',
      currency: 'BRL',
      financialCeilingMicros: 40_000_000,
      observedAtMs: NOW - 1_000,
      validUntilMs: authorityValidUntilMs,
      authorizesExecution: false,
    },
    budget: {
      source: 'W04_BUDGET_CONTROL',
      tenantId: TENANT,
      providerBindingReference: BINDING,
      customerId: CUSTOMER,
      managerCustomerId: MANAGER,
      currency: 'BRL',
      remainingMicros: 100_000_000,
      maxOperationMicros: 30_000_000,
      observedAtMs: NOW - 1_000,
      validUntilMs: NOW + 20_000,
      authorizesExecution: false,
    },
    mutationWindow: {
      source: 'W04_MUTATION_BOUNDS',
      tenantId: TENANT,
      providerBindingReference: BINDING,
      customerId: CUSTOMER,
      managerCustomerId: MANAGER,
      operation: plan.operation as 'SET_BUDGET' | 'SET_BID',
      windowReference: 'w04:window:w13h',
      committedMutations: 0,
      maxMutations: 2,
      observedAtMs: NOW - 1_000,
      validUntilMs: NOW + 20_000,
      authorizesExecution: false,
    },
  };
}

function measurementObservation(): GoogleAdsMeasurementObservation {
  return {
    observationId: 'obs-w13h-1',
    tenantId: TENANT,
    correlationId: CORRELATION,
    customerId: CUSTOMER,
    managerCustomerId: MANAGER,
    providerBindingReference: BINDING,
    sourceRevision: 'google-ads-report:v1',
    campaignId: 'campaign-42',
    agentId: 'agent-w13h',
    occurredAtMs: NOW - 5_000,
    observedAtMs: NOW - 1_000,
    impressions: 100,
    clicks: 10,
    conversions: 2,
    costMicros: 2_000_000,
    conversionValueMicros: 6_000_000,
    conversionDataState: 'COMPLETE',
  };
}

test('W13-H integrates read, paused create, W08 readback and paused update without authority drift', async () => {
  const read = prepareGoogleAdsAccountRead({
    tenantId: TENANT,
    providerBindingReference: BINDING,
    customerId: CUSTOMER,
    managerCustomerId: MANAGER,
    operation: 'CAMPAIGNS',
    fields: ['campaign.id', 'campaign.status'],
    nowMs: NOW,
    maxVerificationAgeMs: 10_000,
    maxHealthAgeMs: 10_000,
    limits: { maxPages: 2, maxItems: 100 },
    binding: binding(),
    health: health(),
  });
  assert.equal(read.status, 'READY');
  if (read.status !== 'READY') return;
  assert.equal(read.plan.readOnly, true);
  assert.equal(read.plan.authorizesExecution, false);

  const createSeen: GoogleAdsW08GovernedWriteRequest[] = [];
  const createInput = operationInput();
  const created = await executeGoogleAdsGovernedOperation(
    createInput,
    port(
      {
        ok: true,
        providerReference: `customers/${CUSTOMER}/campaigns/42`,
        providerRevision: 'rev-1',
        requiresReadback: true,
      },
      createSeen,
    ),
  );
  assert.equal(created.status, 'ACKNOWLEDGED_PENDING_READBACK');
  assert.equal(createSeen.length, 1);
  assert.equal(createSeen[0]?.safeMode, 'PAUSED');
  assert.equal(createSeen[0]?.maxProviderMutationAttempts, 1);

  const createReadback = effectReadback(createInput.actionIntentId, { status: 'PAUSED' });
  assertReadbackScope(createReadback, createInput.actionIntentId);
  assert.equal(createReadback.observation.state, 'EFFECT_OBSERVED');
  assert.deepEqual(createReadback.observedState, { status: 'PAUSED' });

  const updateSeen: GoogleAdsW08GovernedWriteRequest[] = [];
  const updateInput = operationInput('UPDATE_METADATA');
  const updated = await executeGoogleAdsGovernedOperation(
    updateInput,
    port({ ok: true, providerRevision: 'rev-2', requiresReadback: true }, updateSeen),
  );
  assert.equal(updated.status, 'ACKNOWLEDGED_PENDING_READBACK');
  assert.equal(updateSeen.length, 1);
  assert.equal(updateSeen[0]?.safeMode, 'PAUSED');
  assert.equal(updateSeen[0]?.expectedResourceState, 'PAUSED');

  const updateReadback = effectReadback(updateInput.actionIntentId, {
    status: 'PAUSED',
    revision: 'rev-2',
  });
  assertReadbackScope(updateReadback, updateInput.actionIntentId);
  assert.equal(updateReadback.requiresFurtherReadback, false);
});

test('W13-H fails closed on wrong CID in both read and write preconditions', async () => {
  const read = prepareGoogleAdsAccountRead({
    tenantId: TENANT,
    providerBindingReference: BINDING,
    customerId: '0000000000',
    managerCustomerId: MANAGER,
    operation: 'CAMPAIGNS',
    fields: ['campaign.id'],
    nowMs: NOW,
    maxVerificationAgeMs: 10_000,
    maxHealthAgeMs: 10_000,
    limits: { maxPages: 1, maxItems: 10 },
    binding: binding(),
    health: health(),
  });
  assert.deepEqual(read, { status: 'BLOCKED', code: 'WRONG_CUSTOMER' });

  const base = operationInput('UPDATE_METADATA');
  const write = await executeGoogleAdsGovernedOperation(
    {
      ...base,
      precheck: { ...base.precheck, customerId: '0000000000' },
    },
    port({ ok: true, requiresReadback: true }),
  );
  assert.equal(write.status, 'BLOCKED');
  if (write.status === 'BLOCKED') assert.equal(write.code, 'ACCOUNT_SCOPE_MISMATCH');
});

test('W13-H keeps rate-limit and quota retry decisions with W07 and performs no implicit retry', async () => {
  for (const error of ['RATE_LIMITED', 'QUOTA_EXHAUSTED'] as const) {
    const seen: GoogleAdsW08GovernedWriteRequest[] = [];
    const result = await executeGoogleAdsGovernedOperation(
      operationInput(),
      port({ ok: false, error, mutationPossible: false, retryAfterMs: 5_000 }, seen),
    );
    assert.equal(seen.length, 1);
    assert.equal(result.status, 'FAILED_NOT_EXECUTED');
    if (result.status !== 'FAILED_NOT_EXECUTED') continue;
    assert.equal(result.retryDecisionOwner, 'W07');
    assert.equal(result.canGrantRetry, false);
    assert.equal(result.authorizesExecution, false);
  }
});

test('W13-H preserves partial and ambiguous provider outcomes until W08/W07 reconciliation', async () => {
  const input = operationInput();
  const uncertain = await executeGoogleAdsGovernedOperation(
    input,
    port({
      ok: false,
      error: 'AMBIGUOUS_WRITE',
      mutationPossible: true,
      providerReference: `customers/${CUSTOMER}/campaigns/42`,
    }),
  );
  assert.equal(uncertain.status, 'EXECUTION_UNCERTAIN');
  if (uncertain.status !== 'EXECUTION_UNCERTAIN') return;
  assert.equal(uncertain.requiresReconciliation, true);
  assert.equal(uncertain.retryBoundary, 'W07_RECONCILE_BEFORE_RETRY');
  assert.equal(uncertain.canGrantRetry, false);

  const readback: W08ReadbackProjection = {
    ok: true,
    provider: 'GOOGLE_ADS',
    accountReference: CUSTOMER,
    bindingReference: BINDING,
    bindingVersion: 7,
    actionIntentId: input.actionIntentId,
    observation: {
      state: 'INDETERMINATE',
      observedAt: '2026-09-04T00:00:02.000Z',
      reason: 'provider state is not yet converged',
      reference: `customers/${CUSTOMER}/campaigns/42`,
    },
    requiresFurtherReadback: true,
    retryAuthorized: false,
    authorizesExecution: false,
  };
  assertReadbackScope(readback, input.actionIntentId);
  assert.equal(readback.observation.state, 'INDETERMINATE');
  assert.equal(readback.requiresFurtherReadback, true);
  assert.equal(readback.retryAuthorized, false);
});

test('W13-H rejects stale current authority before a governed financial operation can reach W08', () => {
  const plan = domainPlan('SET_BUDGET');
  const result = prepareGoogleAdsFinancialMutation(financialInput(plan, NOW));
  assert.deepEqual(result, { status: 'BLOCKED', code: 'AUTHORITY_STALE' });
});

test('W13-H keeps W13-G measurement/readback consumers decision-support only', () => {
  const observation = measurementObservation();
  const result = buildGoogleAdsMeasurementDecisionSupport({
    tenantId: TENANT,
    correlationId: CORRELATION,
    customerId: CUSTOMER,
    managerCustomerId: MANAGER,
    providerBindingReference: BINDING,
    evaluatedAtMs: NOW,
    maxObservationAgeMs: 10_000,
    observations: [observation],
    optimizationPolicy: {
      lowCtrBps: 500,
      lowConversionRateBps: 500,
      maxCostPerConversionMicros: 5_000_000,
      minImpressionsForCtr: 50,
      minClicksForConversionRate: 5,
    },
  });
  assert.equal(result.status, 'READY');
  if (result.status !== 'READY') return;
  assert.equal(result.decisionSupport.authorizesExecution, false);
  assert.equal(result.decisionSupport.canGrantPermission, false);
  assert.equal(result.decisionSupport.telemetry.authorizesExecution, false);
  assert.equal(
    result.decisionSupport.recommendations.every((item) => item.nextStep === 'REVIEW_ONLY'),
    true,
  );
});

test('W13-H never promotes activation through paused-first acceptance', async () => {
  const result = await executeGoogleAdsGovernedOperation(
    operationInput('ACTIVATE'),
    port({ ok: true, requiresReadback: true }),
  );
  assert.equal(result.status, 'BLOCKED');
  if (result.status !== 'BLOCKED') return;
  assert.equal(result.code, 'UNSUPPORTED_ACTIVATION');
  assert.equal(result.authorizesExecution, false);
});
