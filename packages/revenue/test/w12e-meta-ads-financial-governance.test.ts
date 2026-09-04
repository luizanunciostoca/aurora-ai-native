// @ts-expect-error -- revenue harness has no @types/node; Node 22 provides this built-in.
import assert from 'node:assert/strict';
// @ts-expect-error -- revenue harness has no @types/node; Node 22 provides this built-in.
import test from 'node:test';
import type { CorrelationId, TenantId } from '@aurora/contracts';
import {
  planMetaAdsDomainIntent,
  type MetaAdsCapabilityPlan,
  type MetaAdsFinancialScope,
  type MetaAdsOperation,
} from '../src/meta-ads/contracts.js';
import {
  prepareMetaAdsFinancialMutation,
  type MetaAdsFinancialGovernanceInput,
  type MetaAdsFinancialOperation,
} from '../src/meta-ads/financial-governance.js';

const TENANT = 'ten_01JW12ETENANT000000000000' as TenantId;
const CORRELATION = 'cor_01JW12ECORRELATION0000000' as CorrelationId;
const ACCOUNT = 'act_123456789';
const BINDING = 'w08:meta:binding-1';
const NOW = 1_800_000_000_000;

function financialScope(): MetaAdsFinancialScope {
  return { currency: 'BRL', ceilingMinor: 50_000, horizon: 'DAILY' };
}

function domainPlan(operation: MetaAdsOperation = 'SET_BUDGET'): MetaAdsCapabilityPlan {
  const result = planMetaAdsDomainIntent({
    tenantId: TENANT,
    correlationId: CORRELATION,
    intentId: `intent-w12e-${operation.toLowerCase()}`,
    resourceKind: 'CAMPAIGN',
    operation,
    providerBindingReference: BINDING,
    adAccountExternalId: ACCOUNT,
    target:
      operation === 'CREATE_PAUSED'
        ? {}
        : {
            meta: {
              provider: 'META_ADS',
              resourceKind: 'CAMPAIGN',
              externalId: 'campaign-42',
            },
          },
    capability: {
      source: 'W04_CAPABILITY_REGISTRY',
      capabilityId: `meta-ads:${operation.toLowerCase()}`,
      registryVersion: 'w04-v7',
      targetKind: 'PROVIDER',
      compatibilityKey: 'meta-ads',
      authorizesExecution: false,
    },
    ...(operation === 'ACTIVATE' ||
    operation === 'SET_BUDGET' ||
    operation === 'SET_BID' ||
    operation === 'WIDEN_TARGETING'
      ? { financialScope: financialScope() }
      : {}),
    expectedProviderState: 'PAUSED',
  });
  assert.equal(result.status, 'READY');
  if (result.status !== 'READY') throw new Error('fixture must produce a W12 plan');
  return result.plan;
}

function input(
  operation: MetaAdsFinancialOperation = 'SET_BUDGET',
  overrides: Partial<MetaAdsFinancialGovernanceInput> = {},
): MetaAdsFinancialGovernanceInput {
  const plan = domainPlan(operation);
  return {
    nowMs: NOW,
    plan,
    proposedFinancialExposureMinor: 25_000,
    precheck: {
      source: 'W08_PROVIDER_PRECHECK',
      tenantId: TENANT,
      providerBindingReference: BINDING,
      adAccountExternalId: ACCOUNT,
      bindingState: 'ACTIVE',
      verificationState: 'VERIFIED',
      observedAtMs: NOW - 1_000,
      validUntilMs: NOW + 20_000,
      authorizesExecution: false,
    },
    authority: {
      source: 'W02_AUTHORITY_EVALUATION',
      tenantId: TENANT,
      providerBindingReference: BINDING,
      adAccountExternalId: ACCOUNT,
      capabilityId: plan.capability.capabilityId,
      operation,
      authorized: true,
      approvalReference: 'approval:w12e:1',
      currency: 'BRL',
      financialCeilingMinor: 40_000,
      observedAtMs: NOW - 1_000,
      validUntilMs: NOW + 20_000,
      authorizesExecution: false,
    },
    budget: {
      source: 'W04_BUDGET_CONTROL',
      tenantId: TENANT,
      providerBindingReference: BINDING,
      adAccountExternalId: ACCOUNT,
      currency: 'BRL',
      remainingMinor: 100_000,
      maxOperationMinor: 30_000,
      observedAtMs: NOW - 1_000,
      validUntilMs: NOW + 20_000,
      authorizesExecution: false,
    },
    mutationWindow: {
      source: 'W04_MUTATION_BOUNDS',
      tenantId: TENANT,
      providerBindingReference: BINDING,
      adAccountExternalId: ACCOUNT,
      operation,
      windowReference: 'w04:meta:window-1',
      committedMutations: 0,
      maxMutations: 2,
      observedAtMs: NOW - 1_000,
      validUntilMs: NOW + 20_000,
      authorizesExecution: false,
    },
    ...overrides,
  };
}

test('W12-E composes current approval, budget and mutation bounds without granting authority', () => {
  const result = prepareMetaAdsFinancialMutation(input());
  assert.equal(result.status, 'READY');
  if (result.status !== 'READY') return;
  assert.equal(result.plan.operation, 'SET_BUDGET');
  assert.equal(result.plan.approvalReference, 'approval:w12e:1');
  assert.equal(result.plan.effectiveCeilingMinor, 30_000);
  assert.equal(result.plan.maxProviderMutationAttempts, 1);
  assert.equal(result.plan.retryBoundary, 'W07_RECONCILE_BEFORE_RETRY');
  assert.equal(result.plan.authorizesExecution, false);
  assert.equal(result.plan.canGrantPermission, false);
});

test('W12-E fails closed on stale precheck and stale current authority', () => {
  const base = input();
  assert.deepEqual(
    prepareMetaAdsFinancialMutation({
      ...base,
      precheck: { ...base.precheck, validUntilMs: NOW },
    }),
    { status: 'BLOCKED', code: 'PRECHECK_STALE' },
  );
  assert.deepEqual(
    prepareMetaAdsFinancialMutation({
      ...base,
      authority: { ...base.authority, validUntilMs: NOW },
    }),
    { status: 'BLOCKED', code: 'AUTHORITY_STALE' },
  );
});

test('W12-E requires explicit current approval and cannot infer it from strategy/confidence', () => {
  const base = input();
  assert.deepEqual(
    prepareMetaAdsFinancialMutation({
      ...base,
      authority: { ...base.authority, approvalReference: '' },
      optimizationAdvisory: {
        source: 'W12_OPTIMIZATION_DECISION_SUPPORT',
        confidenceBps: 10_000,
        expectedBenefitMinor: 999_999,
        latencyBudgetMs: 1,
        authorizesExecution: false,
      },
    }),
    { status: 'BLOCKED', code: 'APPROVAL_REQUIRED' },
  );
});

test('W12-E low latency or high model confidence cannot widen a financial ceiling', () => {
  const base = input();
  const result = prepareMetaAdsFinancialMutation({
    ...base,
    proposedFinancialExposureMinor: 45_000,
    optimizationAdvisory: {
      source: 'W12_OPTIMIZATION_DECISION_SUPPORT',
      confidenceBps: 10_000,
      expectedBenefitMinor: 1_000_000,
      latencyBudgetMs: 0,
      authorizesExecution: false,
    },
  });
  assert.deepEqual(result, { status: 'BLOCKED', code: 'BUDGET_CEILING_EXCEEDED' });
});

test('W12-E blocks overspend beyond plan or current authority ceilings', () => {
  const base = input();
  assert.deepEqual(
    prepareMetaAdsFinancialMutation({
      ...base,
      proposedFinancialExposureMinor: 45_000,
      budget: { ...base.budget, maxOperationMinor: 100_000 },
    }),
    { status: 'BLOCKED', code: 'PLAN_CEILING_EXCEEDED' },
  );
  assert.deepEqual(
    prepareMetaAdsFinancialMutation({
      ...base,
      proposedFinancialExposureMinor: 60_000,
      budget: { ...base.budget, maxOperationMinor: 100_000 },
      authority: { ...base.authority, financialCeilingMinor: 100_000 },
    }),
    { status: 'BLOCKED', code: 'PLAN_CEILING_EXCEEDED' },
  );
});

test('W12-E blocks tenant/account/capability scope attacks', () => {
  const base = input();
  assert.deepEqual(
    prepareMetaAdsFinancialMutation({
      ...base,
      precheck: { ...base.precheck, adAccountExternalId: 'act_wrong' },
    }),
    { status: 'BLOCKED', code: 'ACCOUNT_SCOPE_MISMATCH' },
  );
  assert.deepEqual(
    prepareMetaAdsFinancialMutation({
      ...base,
      authority: { ...base.authority, capabilityId: 'meta-ads:other' },
    }),
    { status: 'BLOCKED', code: 'AUTHORITY_SCOPE_MISMATCH' },
  );
});

test('W12-E blocks denied authority and exhausted mutation windows', () => {
  const base = input();
  assert.deepEqual(
    prepareMetaAdsFinancialMutation({
      ...base,
      authority: { ...base.authority, authorized: false },
    }),
    { status: 'BLOCKED', code: 'AUTHORITY_DENIED' },
  );
  assert.deepEqual(
    prepareMetaAdsFinancialMutation({
      ...base,
      mutationWindow: { ...base.mutationWindow, committedMutations: 2 },
    }),
    { status: 'BLOCKED', code: 'MUTATION_WINDOW_EXHAUSTED' },
  );
});

test('W12-E applies the same safety boundary to activation, bid and targeting widening', () => {
  for (const operation of ['ACTIVATE', 'SET_BID', 'WIDEN_TARGETING'] as const) {
    const result = prepareMetaAdsFinancialMutation(input(operation));
    assert.equal(result.status, 'READY');
    if (result.status !== 'READY') continue;
    assert.equal(result.plan.operation, operation);
    assert.equal(result.plan.authorizesExecution, false);
    assert.equal(result.plan.requiresProviderReadback, true);
  }
});
