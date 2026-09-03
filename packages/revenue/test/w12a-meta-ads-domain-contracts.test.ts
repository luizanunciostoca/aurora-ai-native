// @ts-expect-error -- revenue harness has no @types/node; Node 22 provides this built-in.
import assert from 'node:assert/strict';
// @ts-expect-error -- revenue harness has no @types/node; Node 22 provides this built-in.
import test from 'node:test';

import type { CorrelationId, TenantId } from '@aurora/contracts';

import {
  planMetaAdsDomainIntent,
  type MetaAdsDomainIntentInput,
} from '../src/meta-ads/contracts.js';

const TENANT = 'ten_01JW12ATENANT000000000000' as TenantId;
const CORRELATION = 'cor_01JW12ACORRELATION000000' as CorrelationId;

function fixture(overrides: Partial<MetaAdsDomainIntentInput> = {}): MetaAdsDomainIntentInput {
  return {
    tenantId: TENANT,
    correlationId: CORRELATION,
    intentId: 'meta-intent-001',
    resourceKind: 'CAMPAIGN',
    operation: 'OBSERVE',
    providerBindingReference: 'w08:meta-binding:account-001',
    adAccountExternalId: 'act_123456789',
    target: {
      auroraResourceId: 'aurora-campaign-001',
      meta: { provider: 'META_ADS', resourceKind: 'CAMPAIGN', externalId: '120000000001' },
    },
    capability: {
      source: 'W04_CAPABILITY_REGISTRY',
      capabilityId: 'capability-from-current-registry',
      registryVersion: 'registry-r42',
      targetKind: 'PROVIDER',
      compatibilityKey: 'meta-ads',
      authorizesExecution: false,
    },
    ...overrides,
  };
}

test('W12-A read plans remain authority-neutral and separate Aurora from Meta IDs', () => {
  const result = planMetaAdsDomainIntent(fixture());
  assert.equal(result.status, 'READY');
  if (result.status !== 'READY') return;

  assert.equal(result.plan.boundary, 'READ');
  assert.equal(result.plan.riskClass, 'READ_ONLY');
  assert.equal(result.plan.requiresCurrentApproval, false);
  assert.equal(result.plan.requiresW07Execution, false);
  assert.equal(result.plan.executionPath, 'W08_READ_ONLY');
  assert.equal(result.plan.authorizesExecution, false);
  assert.equal(result.plan.canGrantPermission, false);
  assert.equal(result.plan.target.auroraResourceId, 'aurora-campaign-001');
  assert.equal(result.plan.target.meta?.externalId, '120000000001');
});

test('W12-A creation is paused-first and cannot imply activation authority', () => {
  const result = planMetaAdsDomainIntent(
    fixture({ operation: 'CREATE_PAUSED', target: { auroraResourceId: 'aurora-campaign-new' } }),
  );
  assert.equal(result.status, 'READY');
  if (result.status !== 'READY') return;

  assert.equal(result.plan.pausedFirst, true);
  assert.equal(result.plan.boundary, 'WRITE');
  assert.equal(result.plan.riskClass, 'REVERSIBLE_NON_SERVING_WRITE');
  assert.equal(result.plan.requiresCurrentApproval, true);
  assert.equal(result.plan.requiresW07Execution, true);
  assert.equal(result.plan.requiresW08MetaBinding, true);
  assert.equal(result.plan.requiresProviderReadback, true);
  assert.equal(result.plan.authorizesExecution, false);
});

test('W12-A serving activation fails closed without explicit financial scope', () => {
  const result = planMetaAdsDomainIntent(fixture({ operation: 'ACTIVATE' }));
  assert.deepEqual(result, { status: 'BLOCKED', code: 'FINANCIAL_SCOPE_REQUIRED' });
});

test('W12-A financial writes preserve currency/ceiling and remain W07/W08 governed', () => {
  const result = planMetaAdsDomainIntent(
    fixture({
      operation: 'SET_BUDGET',
      financialScope: { currency: 'BRL', ceilingMinor: 50_000, horizon: 'DAILY' },
    }),
  );
  assert.equal(result.status, 'READY');
  if (result.status !== 'READY') return;

  assert.equal(result.plan.riskClass, 'FINANCIAL_IMPACT_WRITE');
  assert.equal(result.plan.reversibility, 'REVERSIBLE_BUT_FINANCIAL');
  assert.equal(result.plan.financialScope?.currency, 'BRL');
  assert.equal(result.plan.financialScope?.ceilingMinor, 50_000);
  assert.equal(result.plan.executionPath, 'W07_EXECUTOR_TO_W08_META_ADAPTER');
  assert.equal(result.plan.authorizesExecution, false);
});

test('W12-A rejects ambiguous provider identity and mismatched external resource kinds', () => {
  assert.deepEqual(
    planMetaAdsDomainIntent(fixture({ adAccountExternalId: '' })),
    { status: 'BLOCKED', code: 'MISSING_AD_ACCOUNT_EXTERNAL_ID' },
  );

  assert.deepEqual(
    planMetaAdsDomainIntent(
      fixture({
        resourceKind: 'AD_SET',
        target: {
          auroraResourceId: 'aurora-adset-001',
          meta: { provider: 'META_ADS', resourceKind: 'CAMPAIGN', externalId: '120000000002' },
        },
      }),
    ),
    { status: 'BLOCKED', code: 'MISSING_META_EXTERNAL_ID' },
  );
});

test('W12-A rejects malformed financial boundaries and keeps destructive writes explicit', () => {
  assert.deepEqual(
    planMetaAdsDomainIntent(
      fixture({
        operation: 'SET_BID',
        financialScope: { currency: 'brl', ceilingMinor: -1, horizon: 'OPERATION' },
      }),
    ),
    { status: 'BLOCKED', code: 'INVALID_FINANCIAL_SCOPE' },
  );

  const deletion = planMetaAdsDomainIntent(fixture({ operation: 'DELETE' }));
  assert.equal(deletion.status, 'READY');
  if (deletion.status !== 'READY') return;
  assert.equal(deletion.plan.riskClass, 'DESTRUCTIVE_WRITE');
  assert.equal(deletion.plan.reversibility, 'DESTRUCTIVE');
  assert.equal(deletion.plan.requiresCurrentApproval, true);
});
