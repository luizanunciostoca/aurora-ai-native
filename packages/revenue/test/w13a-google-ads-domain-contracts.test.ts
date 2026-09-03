// @ts-expect-error -- revenue harness has no @types/node; Node 22 provides this built-in.
import assert from 'node:assert/strict';
// @ts-expect-error -- revenue harness has no @types/node; Node 22 provides this built-in.
import test from 'node:test';

import type { CorrelationId, TenantId } from '@aurora/contracts';

import {
  planGoogleAdsDomainIntent,
  type GoogleAdsDomainIntentInput,
} from '../src/google-ads/contracts.js';

const TENANT = 'ten_01JW13ATENANT000000000000' as TenantId;
const CORRELATION = 'cor_01JW13ACORRELATION000000' as CorrelationId;

function fixture(overrides: Partial<GoogleAdsDomainIntentInput> = {}): GoogleAdsDomainIntentInput {
  return {
    tenantId: TENANT,
    correlationId: CORRELATION,
    intentId: 'google-ads-intent-001',
    surface: 'SEARCH',
    resourceKind: 'CAMPAIGN',
    operation: 'OBSERVE',
    providerBindingReference: 'w08:google-ads-binding:customer-001',
    customerId: '1234567890',
    managerCustomerId: '9988776655',
    target: {
      auroraResourceId: 'aurora-google-campaign-001',
      googleAds: {
        provider: 'GOOGLE_ADS',
        resourceKind: 'CAMPAIGN',
        customerId: '1234567890',
        managerCustomerId: '9988776655',
        resourceName: 'customers/1234567890/campaigns/111222333',
      },
    },
    capability: {
      source: 'W04_CAPABILITY_REGISTRY',
      capabilityId: 'capability-from-current-registry',
      registryVersion: 'registry-r42',
      targetKind: 'PROVIDER',
      compatibilityKey: 'google-ads',
      authorizesExecution: false,
    },
    ...overrides,
  };
}

test('W13-A read plans preserve Google resource names separately from Aurora IDs', () => {
  const result = planGoogleAdsDomainIntent(fixture());
  assert.equal(result.status, 'READY');
  if (result.status !== 'READY') return;

  assert.equal(result.plan.boundary, 'READ');
  assert.equal(result.plan.riskClass, 'READ_ONLY');
  assert.equal(result.plan.requiresCurrentApproval, false);
  assert.equal(result.plan.requiresW07Execution, false);
  assert.equal(result.plan.executionPath, 'W08_READ_ONLY');
  assert.equal(result.plan.authorizesExecution, false);
  assert.equal(result.plan.target.auroraResourceId, 'aurora-google-campaign-001');
  assert.equal(
    result.plan.target.googleAds?.resourceName,
    'customers/1234567890/campaigns/111222333',
  );
});

test('W13-A supports paused-first PMax creation without inventing an external resource id', () => {
  const result = planGoogleAdsDomainIntent(
    fixture({
      surface: 'PERFORMANCE_MAX',
      operation: 'CREATE_PAUSED',
      target: { auroraResourceId: 'aurora-pmax-new' },
    }),
  );
  assert.equal(result.status, 'READY');
  if (result.status !== 'READY') return;

  assert.equal(result.plan.surface, 'PERFORMANCE_MAX');
  assert.equal(result.plan.pausedFirst, true);
  assert.equal(result.plan.riskClass, 'REVERSIBLE_NON_SERVING_WRITE');
  assert.equal(result.plan.requiresCurrentApproval, true);
  assert.equal(result.plan.requiresW07Execution, true);
  assert.equal(result.plan.requiresW08GoogleAdsBinding, true);
  assert.equal(result.plan.authorizesExecution, false);
});

test('W13-A supports Display and YouTube planning while preserving authority neutrality', () => {
  for (const surface of ['DISPLAY', 'YOUTUBE'] as const) {
    const result = planGoogleAdsDomainIntent(fixture({ surface }));
    assert.equal(result.status, 'READY');
    if (result.status !== 'READY') continue;
    assert.equal(result.plan.surface, surface);
    assert.equal(result.plan.authorizesExecution, false);
    assert.equal(result.plan.canGrantPermission, false);
  }
});

test('W13-A models keyword and conversion resources without conflating surfaces', () => {
  const keyword = planGoogleAdsDomainIntent(
    fixture({
      surface: 'KEYWORD',
      resourceKind: 'KEYWORD',
      operation: 'UPDATE_KEYWORD',
      target: {
        auroraResourceId: 'aurora-keyword-1',
        googleAds: {
          provider: 'GOOGLE_ADS',
          resourceKind: 'KEYWORD',
          customerId: '1234567890',
          resourceName: 'customers/1234567890/adGroupCriteria/1~2',
        },
      },
    }),
  );
  assert.equal(keyword.status, 'READY');

  const conversion = planGoogleAdsDomainIntent(
    fixture({
      surface: 'CONVERSION',
      resourceKind: 'CONVERSION_ACTION',
      operation: 'UPDATE_CONVERSION',
      target: {
        auroraResourceId: 'aurora-conversion-1',
        googleAds: {
          provider: 'GOOGLE_ADS',
          resourceKind: 'CONVERSION_ACTION',
          customerId: '1234567890',
          resourceName: 'customers/1234567890/conversionActions/33',
        },
      },
    }),
  );
  assert.equal(conversion.status, 'READY');

  assert.deepEqual(
    planGoogleAdsDomainIntent(fixture({ surface: 'CONVERSION', resourceKind: 'CAMPAIGN' })),
    { status: 'BLOCKED', code: 'RESOURCE_SURFACE_MISMATCH' },
  );
});

test('W13-A serving and budget writes fail closed without valid financial scope', () => {
  assert.deepEqual(planGoogleAdsDomainIntent(fixture({ operation: 'ACTIVATE' })), {
    status: 'BLOCKED',
    code: 'FINANCIAL_SCOPE_REQUIRED',
  });

  assert.deepEqual(
    planGoogleAdsDomainIntent(
      fixture({
        operation: 'SET_BUDGET',
        financialScope: { currency: 'usd', ceilingMicros: -1, horizon: 'DAILY' },
      }),
    ),
    { status: 'BLOCKED', code: 'INVALID_FINANCIAL_SCOPE' },
  );

  const budget = planGoogleAdsDomainIntent(
    fixture({
      operation: 'SET_BUDGET',
      financialScope: { currency: 'BRL', ceilingMicros: 25_000_000, horizon: 'DAILY' },
    }),
  );
  assert.equal(budget.status, 'READY');
  if (budget.status !== 'READY') return;
  assert.equal(budget.plan.riskClass, 'FINANCIAL_IMPACT_WRITE');
  assert.equal(budget.plan.executionPath, 'W07_EXECUTOR_TO_W08_GOOGLE_ADS_ADAPTER');
  assert.equal(budget.plan.authorizesExecution, false);
});

test('W13-A rejects cross-customer external references and makes destructive writes explicit', () => {
  const crossCustomer = planGoogleAdsDomainIntent(
    fixture({
      target: {
        googleAds: {
          provider: 'GOOGLE_ADS',
          resourceKind: 'CAMPAIGN',
          customerId: '0000000000',
          resourceName: 'customers/0000000000/campaigns/111222333',
        },
      },
    }),
  );
  assert.deepEqual(crossCustomer, { status: 'BLOCKED', code: 'MISSING_GOOGLE_EXTERNAL_ID' });

  const deletion = planGoogleAdsDomainIntent(fixture({ operation: 'DELETE' }));
  assert.equal(deletion.status, 'READY');
  if (deletion.status !== 'READY') return;
  assert.equal(deletion.plan.riskClass, 'DESTRUCTIVE_WRITE');
  assert.equal(deletion.plan.reversibility, 'DESTRUCTIVE');
  assert.equal(deletion.plan.requiresCurrentApproval, true);
});
