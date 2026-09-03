// @ts-expect-error -- revenue harness has no @types/node; Node 22 provides this built-in.
import assert from 'node:assert/strict';
// @ts-expect-error -- revenue harness has no @types/node; Node 22 provides this built-in.
import test from 'node:test';
import type { CorrelationId, TenantId } from '@aurora/contracts';
import {
  planGoogleAdsDomainIntent,
  type GoogleAdsCapabilityPlan,
} from '../src/google-ads/contracts.js';
import {
  prepareGoogleAdsFinancialMutation,
  type GoogleAdsFinancialGovernanceInput,
} from '../src/google-ads/financial-governance.js';
const TENANT = 'ten_01JW13FTENANT000000000000' as TenantId;
const OTHER_TENANT = 'ten_01JW13FOTHER00000000000' as TenantId;
const CORRELATION = 'cor_01JW13FCORRELATION0000000' as CorrelationId;
const NOW = 1_800_000_000_000;
function domainPlan(): GoogleAdsCapabilityPlan {
  const result = planGoogleAdsDomainIntent({
    tenantId: TENANT,
    correlationId: CORRELATION,
    intentId: 'intent-w13f-1',
    surface: 'SEARCH',
    resourceKind: 'CAMPAIGN',
    operation: 'SET_BUDGET',
    providerBindingReference: 'w08:google-ads:binding-1',
    customerId: '1234567890',
    managerCustomerId: '9988776655',
    target: {
      googleAds: {
        provider: 'GOOGLE_ADS',
        resourceKind: 'CAMPAIGN',
        customerId: '1234567890',
        managerCustomerId: '9988776655',
        resourceName: 'customers/1234567890/campaigns/42',
      },
    },
    capability: {
      source: 'W04_CAPABILITY_REGISTRY',
      capabilityId: 'google-ads:set-budget',
      registryVersion: 'w04-v7',
      targetKind: 'PROVIDER',
      compatibilityKey: 'google-ads',
      authorizesExecution: false,
    },
    financialScope: {
      currency: 'BRL',
      ceilingMicros: 50_000_000,
      horizon: 'DAILY',
    },
  });
  assert.equal(result.status, 'READY');
  if (result.status !== 'READY') throw new Error('fixture must produce a W13-A plan');
  return result.plan;
}
function fixture(
  overrides: Partial<GoogleAdsFinancialGovernanceInput> = {},
): GoogleAdsFinancialGovernanceInput {
  const plan = domainPlan();
  const manager = plan.managerCustomerId ? { managerCustomerId: plan.managerCustomerId } : {};
  return {
    nowMs: NOW,
    plan,
    proposedMicros: 25_000_000,
    precheck: {
      source: 'W08_PROVIDER_PRECHECK',
      tenantId: TENANT,
      providerBindingReference: plan.providerBindingReference,
      customerId: plan.customerId,
      ...manager,
      bindingState: 'ACTIVE',
      verificationState: 'VERIFIED',
      observedAtMs: NOW - 5_000,
      validUntilMs: NOW + 30_000,
      authorizesExecution: false,
    },
    authority: {
      source: 'W02_AUTHORITY_EVALUATION',
      tenantId: TENANT,
      capabilityId: plan.capability.capabilityId,
      providerBindingReference: plan.providerBindingReference,
      customerId: plan.customerId,
      ...manager,
      operation: 'SET_BUDGET',
      authorized: true,
      approvalReference: 'approval:w13f:1',
      currency: 'BRL',
      financialCeilingMicros: 40_000_000,
      observedAtMs: NOW - 2_000,
      validUntilMs: NOW + 20_000,
      authorizesExecution: false,
    },
    budget: {
      source: 'W04_BUDGET_CONTROL',
      tenantId: TENANT,
      providerBindingReference: plan.providerBindingReference,
      customerId: plan.customerId,
      ...manager,
      currency: 'BRL',
      remainingMicros: 100_000_000,
      maxOperationMicros: 30_000_000,
      observedAtMs: NOW - 1_000,
      validUntilMs: NOW + 15_000,
      authorizesExecution: false,
    },
    mutationWindow: {
      source: 'W04_MUTATION_BOUNDS',
      tenantId: TENANT,
      providerBindingReference: plan.providerBindingReference,
      customerId: plan.customerId,
      ...manager,
      operation: 'SET_BUDGET',
      windowReference: 'w04:mutation-window:1',
      committedMutations: 1,
      maxMutations: 3,
      observedAtMs: NOW - 1_000,
      validUntilMs: NOW + 10_000,
      authorizesExecution: false,
    },
    strategy: {
      source: 'W13_STRATEGY_EVIDENCE',
      strategyReference: 'strategy:profit-max:1',
      confidence: 0.99,
      authorizesExecution: false,
    },
    ...overrides,
  };
}
function required<T>(value: T | null, label: string): T {
  if (value === null) throw new Error(`${label} fixture must be present`);
  return value;
}
test('W13-F composes bounded financial governance without granting execution', () => {
  const result = prepareGoogleAdsFinancialMutation(fixture());
  assert.equal(result.status, 'READY');
  if (result.status !== 'READY') return;
  assert.equal(result.plan.executionPath, 'W07_EXECUTOR_TO_W08_GOOGLE_ADS_ADAPTER');
  assert.equal(result.plan.approvalReference, 'approval:w13f:1');
  assert.equal(result.plan.budgetCeilingMicros, 30_000_000);
  assert.equal(result.plan.maxProviderMutationAttempts, 1);
  assert.equal(result.plan.retryBoundary, 'W07_RECONCILE_BEFORE_RETRY');
  assert.equal(result.plan.requiresProviderReadback, true);
  assert.equal(result.plan.strategyCanWidenAuthority, false);
  assert.equal(result.plan.authorizesExecution, false);
  assert.equal(result.plan.canGrantPermission, false);
});
test('W13-F blocks missing or denied approval even when strategy confidence is maximal', () => {
  assert.deepEqual(prepareGoogleAdsFinancialMutation(fixture({ authority: null })), {
    status: 'BLOCKED',
    code: 'MISSING_APPROVAL',
  });
  const authority = required(fixture().authority, 'authority');
  assert.deepEqual(
    prepareGoogleAdsFinancialMutation(
      fixture({
        authority: { ...authority, authorized: false },
        strategy: {
          source: 'W13_STRATEGY_EVIDENCE',
          strategyReference: 'strategy:claimed-perfect',
          confidence: 1,
          authorizesExecution: false,
        },
      }),
    ),
    { status: 'BLOCKED', code: 'AUTHORITY_DENIED' },
  );
});
test('W13-F fails closed on stale provider precheck and wrong-account evidence', () => {
  const precheck = required(fixture().precheck, 'precheck');
  assert.deepEqual(
    prepareGoogleAdsFinancialMutation(fixture({ precheck: { ...precheck, validUntilMs: NOW } })),
    { status: 'BLOCKED', code: 'PRECHECK_STALE' },
  );
  const authority = required(fixture().authority, 'authority');
  assert.deepEqual(
    prepareGoogleAdsFinancialMutation(
      fixture({ authority: { ...authority, customerId: '0000000000' } }),
    ),
    { status: 'BLOCKED', code: 'WRONG_ACCOUNT' },
  );
  assert.deepEqual(
    prepareGoogleAdsFinancialMutation(
      fixture({ precheck: { ...precheck, tenantId: OTHER_TENANT } }),
    ),
    { status: 'BLOCKED', code: 'WRONG_ACCOUNT' },
  );
});
test('W13-F enforces the narrowest W13, W02 and W04 financial ceiling', () => {
  const authority = required(fixture().authority, 'authority');
  const budget = required(fixture().budget, 'budget');
  assert.deepEqual(prepareGoogleAdsFinancialMutation(fixture({ proposedMicros: 50_000_001 })), {
    status: 'BLOCKED',
    code: 'BUDGET_CEILING_EXCEEDED',
  });
  assert.deepEqual(
    prepareGoogleAdsFinancialMutation(
      fixture({
        proposedMicros: 40_000_001,
        budget: { ...budget, maxOperationMicros: 60_000_000 },
      }),
    ),
    { status: 'BLOCKED', code: 'BUDGET_CEILING_EXCEEDED' },
  );
  assert.deepEqual(
    prepareGoogleAdsFinancialMutation(
      fixture({
        proposedMicros: 30_000_001,
        authority: { ...authority, financialCeilingMicros: 60_000_000 },
      }),
    ),
    { status: 'BLOCKED', code: 'BUDGET_CEILING_EXCEEDED' },
  );
  assert.deepEqual(
    prepareGoogleAdsFinancialMutation(
      fixture({ proposedMicros: 25_000_000, budget: { ...budget, remainingMicros: 24_999_999 } }),
    ),
    { status: 'BLOCKED', code: 'BUDGET_CEILING_EXCEEDED' },
  );
});
test('W13-F bounds repeated optimization mutations and requires fresh bound evidence', () => {
  const mutationWindow = required(fixture().mutationWindow, 'mutationWindow');
  assert.deepEqual(
    prepareGoogleAdsFinancialMutation(
      fixture({ mutationWindow: { ...mutationWindow, committedMutations: 3 } }),
    ),
    { status: 'BLOCKED', code: 'MUTATION_LIMIT_EXCEEDED' },
  );
  assert.deepEqual(
    prepareGoogleAdsFinancialMutation(
      fixture({ mutationWindow: { ...mutationWindow, validUntilMs: NOW } }),
    ),
    { status: 'BLOCKED', code: 'MUTATION_BOUND_STALE' },
  );
});
test('W13-F rejects MCC drift in mutation-bound evidence', () => {
  const mutationWindow = required(fixture().mutationWindow, 'mutationWindow');
  assert.deepEqual(
    prepareGoogleAdsFinancialMutation(
      fixture({ mutationWindow: { ...mutationWindow, managerCustomerId: '1111222233' } }),
    ),
    { status: 'BLOCKED', code: 'MUTATION_BOUND_INVALID' },
  );
});
test('W13-F fails closed on stale authority/budget, currency drift and bad confidence', () => {
  const authority = required(fixture().authority, 'authority');
  const budget = required(fixture().budget, 'budget');
  assert.deepEqual(
    prepareGoogleAdsFinancialMutation(fixture({ authority: { ...authority, validUntilMs: NOW } })),
    { status: 'BLOCKED', code: 'AUTHORITY_STALE' },
  );
  assert.deepEqual(
    prepareGoogleAdsFinancialMutation(fixture({ budget: { ...budget, validUntilMs: NOW } })),
    { status: 'BLOCKED', code: 'BUDGET_STALE' },
  );
  assert.deepEqual(
    prepareGoogleAdsFinancialMutation(fixture({ budget: { ...budget, currency: 'USD' } })),
    { status: 'BLOCKED', code: 'CURRENCY_MISMATCH' },
  );
  assert.deepEqual(
    prepareGoogleAdsFinancialMutation(
      fixture({
        strategy: {
          source: 'W13_STRATEGY_EVIDENCE',
          strategyReference: 'strategy:bad-confidence',
          confidence: 1.01,
          authorizesExecution: false,
        },
      }),
    ),
    { status: 'BLOCKED', code: 'INVALID_STRATEGY_EVIDENCE' },
  );
});
