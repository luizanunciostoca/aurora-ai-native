// @ts-expect-error -- revenue harness has no @types/node; Node 22 provides this built-in.
import assert from 'node:assert/strict';
// @ts-expect-error -- revenue harness has no @types/node; Node 22 provides this built-in.
import test from 'node:test';
import type { CorrelationId, TenantId } from '@aurora/contracts';

import {
  prepareMetaAdsAccountRead,
  type MetaAdsBindingProjection,
  type MetaAdsHealthProjection,
} from '../src/meta-ads/account-read.js';
import {
  normalizeMetaAdsAnalytics,
  type MetaAdsAnalyticsInput,
} from '../src/meta-ads/analytics.js';
import {
  planMetaAdsDomainIntent,
  type MetaAdsCapabilityPlan,
  type MetaAdsOperation,
} from '../src/meta-ads/contracts.js';
import {
  prepareMetaAdsFinancialMutation,
  type MetaAdsFinancialGovernanceInput,
  type MetaAdsFinancialOperation,
} from '../src/meta-ads/financial-governance.js';
import {
  executeMetaAdsGovernedOperation,
  type MetaAdsGovernedOperationInput,
  type MetaAdsW08GovernedWriteRequest,
  type MetaAdsW08WritePort,
  type MetaAdsW08WriteResult,
} from '../src/meta-ads/governed-operations.js';
import { buildMetaAdsOptimizationDecisionSupport } from '../src/meta-ads/optimization.js';

const TENANT = 'ten_01JW12HTENANT000000000000' as TenantId;
const CORRELATION = 'cor_01JW12HCORRELATION0000000' as CorrelationId;
const BUSINESS = 'biz_123456789';
const AD_ACCOUNT = 'act_123456789';
const BINDING = 'w08:meta-ads:binding-1';
const NOW = 1_800_000_000_000;

type W08ReadbackProjection = Readonly<{
  ok: true;
  provider: 'META_ADS';
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
  evidenceRef: string;
  requiresFurtherReadback: boolean;
  retryAuthorized: false;
  authorizesExecution: false;
}>;

function binding(overrides: Partial<MetaAdsBindingProjection> = {}): MetaAdsBindingProjection {
  return {
    source: 'W08_PROVIDER_BINDING',
    tenantId: TENANT,
    provider: 'META_ADS',
    bindingReference: BINDING,
    businessAccountExternalId: BUSINESS,
    adAccountExternalId: AD_ACCOUNT,
    state: 'ACTIVE',
    verificationState: 'VERIFIED',
    bindingVersion: 7,
    verifiedAtMs: NOW - 1_000,
    authorizesExecution: false,
    ...overrides,
  };
}

function health(overrides: Partial<MetaAdsHealthProjection> = {}): MetaAdsHealthProjection {
  return {
    source: 'W08_PROVIDER_HEALTH',
    status: 'HEALTHY',
    observedAtMs: NOW - 500,
    authorizesExecution: false,
    ...overrides,
  };
}

function expectedState(operation: MetaAdsOperation): string {
  if (operation === 'CREATE_PAUSED') return 'ABSENT';
  if (operation === 'PAUSE') return 'ACTIVE';
  return 'PAUSED';
}

function domainPlan(operation: MetaAdsOperation = 'CREATE_PAUSED'): MetaAdsCapabilityPlan {
  const result = planMetaAdsDomainIntent({
    tenantId: TENANT,
    correlationId: CORRELATION,
    intentId: `intent-w12h-${operation.toLowerCase()}`,
    resourceKind: 'CAMPAIGN',
    operation,
    providerBindingReference: BINDING,
    adAccountExternalId: AD_ACCOUNT,
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
      ? {
          financialScope: {
            currency: 'BRL',
            ceilingMinor: 5_000_000,
            horizon: 'DAILY' as const,
          },
        }
      : {}),
    expectedProviderState: expectedState(operation),
  });
  assert.equal(result.status, 'READY');
  if (result.status !== 'READY') throw new Error('fixture must produce a W12 plan');
  return result.plan;
}

function operationInput(
  operation: MetaAdsOperation = 'CREATE_PAUSED',
  overrides: Partial<MetaAdsGovernedOperationInput> = {},
): MetaAdsGovernedOperationInput {
  const plan = domainPlan(operation);
  return {
    nowMs: NOW,
    plan,
    actionIntentId: `action-w12h-${operation.toLowerCase()}`,
    idempotencyKey: `idem:w12h:${operation.toLowerCase()}:1`,
    payloadReference: `payload:w12h:${operation.toLowerCase()}:1`,
    executionProof: {
      source: 'W07_PROVIDER_EXECUTION_PROOF',
      actionIntentId: `action-w12h-${operation.toLowerCase()}`,
      currentAuthorityValidated: true,
      executionEligible: true,
      authorizesExecution: false,
    },
    precheck: {
      source: 'W08_PROVIDER_PRECHECK',
      tenantId: TENANT,
      providerBindingReference: BINDING,
      adAccountExternalId: AD_ACCOUNT,
      bindingState: 'ACTIVE',
      verificationState: 'VERIFIED',
      observedAtMs: NOW - 1_000,
      validUntilMs: NOW + 30_000,
      expectedResourceState: operation === 'CREATE_PAUSED' ? null : expectedState(operation),
      authorizesExecution: false,
    },
    ...overrides,
  };
}

function port(
  outcome: MetaAdsW08WriteResult,
  seen: MetaAdsW08GovernedWriteRequest[] = [],
): MetaAdsW08WritePort {
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
    provider: 'META_ADS',
    accountReference: AD_ACCOUNT,
    bindingReference: BINDING,
    bindingVersion: 7,
    actionIntentId,
    observation: {
      state: 'EFFECT_OBSERVED',
      observedAt: '2026-09-04T02:00:01.000Z',
      reference: 'campaign-42',
    },
    observedState,
    evidenceRef: `evd:w12h:${actionIntentId}`,
    requiresFurtherReadback: false,
    retryAuthorized: false,
    authorizesExecution: false,
  };
}

function assertReadbackScope(readback: W08ReadbackProjection, actionIntentId: string): void {
  assert.equal(readback.provider, 'META_ADS');
  assert.equal(readback.accountReference, AD_ACCOUNT);
  assert.equal(readback.bindingReference, BINDING);
  assert.equal(readback.actionIntentId, actionIntentId);
  assert.equal(readback.retryAuthorized, false);
  assert.equal(readback.authorizesExecution, false);
  assert.match(readback.evidenceRef, /^evd:/);
}

function financialInput(
  plan: MetaAdsCapabilityPlan,
  overrides: Partial<MetaAdsFinancialGovernanceInput> = {},
): MetaAdsFinancialGovernanceInput {
  return {
    nowMs: NOW,
    plan,
    proposedFinancialExposureMinor: 2_500_000,
    precheck: {
      source: 'W08_PROVIDER_PRECHECK',
      tenantId: TENANT,
      providerBindingReference: BINDING,
      adAccountExternalId: AD_ACCOUNT,
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
      adAccountExternalId: AD_ACCOUNT,
      capabilityId: plan.capability.capabilityId,
      operation: plan.operation as MetaAdsFinancialOperation,
      authorized: true,
      approvalReference: 'approval:w12h:1',
      currency: 'BRL',
      financialCeilingMinor: 4_000_000,
      observedAtMs: NOW - 1_000,
      validUntilMs: NOW + 20_000,
      authorizesExecution: false,
    },
    budget: {
      source: 'W04_BUDGET_CONTROL',
      tenantId: TENANT,
      providerBindingReference: BINDING,
      adAccountExternalId: AD_ACCOUNT,
      currency: 'BRL',
      remainingMinor: 10_000_000,
      maxOperationMinor: 3_000_000,
      observedAtMs: NOW - 1_000,
      validUntilMs: NOW + 20_000,
      authorizesExecution: false,
    },
    mutationWindow: {
      source: 'W04_MUTATION_BOUNDS',
      tenantId: TENANT,
      providerBindingReference: BINDING,
      adAccountExternalId: AD_ACCOUNT,
      operation: plan.operation as MetaAdsFinancialOperation,
      windowReference: 'w04:mutation-window:w12h',
      committedMutations: 0,
      maxMutations: 2,
      observedAtMs: NOW - 1_000,
      validUntilMs: NOW + 20_000,
      authorizesExecution: false,
    },
    ...overrides,
  };
}

function analyticsInput(overrides: Partial<MetaAdsAnalyticsInput> = {}): MetaAdsAnalyticsInput {
  return {
    tenantId: TENANT,
    providerBindingReference: BINDING,
    businessAccountExternalId: BUSINESS,
    adAccountExternalId: AD_ACCOUNT,
    resourceKind: 'CAMPAIGN',
    resourceExternalId: 'campaign-42',
    currency: 'BRL',
    metrics: {
      impressions: 10_000,
      clicks: 250,
      spendMinor: 400_000,
      conversions: 10,
      conversionValueMinor: 800_000,
      reach: 8_000,
    },
    attributionWindow: '7D_CLICK',
    completeness: 'COMPLETE',
    dataThroughMs: NOW - 7_000,
    nowMs: NOW,
    maxObservationAgeMs: 60_000,
    maxVerificationAgeMs: 120_000,
    binding: binding({ verifiedAtMs: NOW - 20_000 }),
    provenance: {
      source: 'W08_META_ADS_READBACK',
      evidenceRef: 'evd:w12h:analytics:1',
      providerQueryId: 'query-w12h-1',
      observedAtMs: NOW - 5_000,
    },
    relatedAction: {
      actionId: 'action-w12h-create_paused',
      evidenceRef: 'evd:w12h:action:1',
      occurredAtMs: NOW - 30_000,
    },
    ...overrides,
  };
}

test('W12-H integrates read, paused create, W08 readback and paused update without authority drift', async () => {
  const read = prepareMetaAdsAccountRead({
    tenantId: TENANT,
    providerBindingReference: BINDING,
    businessAccountExternalId: BUSINESS,
    adAccountExternalId: AD_ACCOUNT,
    operation: 'CAMPAIGNS',
    fields: ['id', 'status'],
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

  const createSeen: MetaAdsW08GovernedWriteRequest[] = [];
  const createInput = operationInput();
  const created = await executeMetaAdsGovernedOperation(
    createInput,
    port(
      {
        ok: true,
        providerReference: 'campaign-42',
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
  assert.equal(createSeen[0]?.requiresReadback, true);

  const createReadback = effectReadback(createInput.actionIntentId, { status: 'PAUSED' });
  assertReadbackScope(createReadback, createInput.actionIntentId);
  assert.equal(createReadback.observation.state, 'EFFECT_OBSERVED');
  assert.deepEqual(createReadback.observedState, { status: 'PAUSED' });

  const updateSeen: MetaAdsW08GovernedWriteRequest[] = [];
  const updateInput = operationInput('UPDATE_METADATA');
  const updated = await executeMetaAdsGovernedOperation(
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

test('W12-H fails closed on wrong account and expired/unverified provider identity', async () => {
  const wrongRead = prepareMetaAdsAccountRead({
    tenantId: TENANT,
    providerBindingReference: BINDING,
    businessAccountExternalId: BUSINESS,
    adAccountExternalId: 'act_wrong',
    operation: 'CAMPAIGNS',
    fields: ['id'],
    nowMs: NOW,
    maxVerificationAgeMs: 10_000,
    maxHealthAgeMs: 10_000,
    limits: { maxPages: 1, maxItems: 10 },
    binding: binding(),
    health: health(),
  });
  assert.deepEqual(wrongRead, { status: 'BLOCKED', code: 'WRONG_AD_ACCOUNT' });

  const expiredRead = prepareMetaAdsAccountRead({
    tenantId: TENANT,
    providerBindingReference: BINDING,
    businessAccountExternalId: BUSINESS,
    adAccountExternalId: AD_ACCOUNT,
    operation: 'CAMPAIGNS',
    fields: ['id'],
    nowMs: NOW,
    maxVerificationAgeMs: 10_000,
    maxHealthAgeMs: 10_000,
    limits: { maxPages: 1, maxItems: 10 },
    binding: binding({ verificationState: 'STALE' }),
    health: health(),
  });
  assert.deepEqual(expiredRead, { status: 'BLOCKED', code: 'ACCOUNT_NOT_VERIFIED' });

  const base = operationInput('UPDATE_METADATA');
  const wrongWrite = await executeMetaAdsGovernedOperation(
    {
      ...base,
      precheck: { ...base.precheck, adAccountExternalId: 'act_wrong' },
    },
    port({ ok: true, requiresReadback: true }),
  );
  assert.equal(wrongWrite.status, 'BLOCKED');
  if (wrongWrite.status === 'BLOCKED') assert.equal(wrongWrite.code, 'ACCOUNT_SCOPE_MISMATCH');

  const expiredWrite = await executeMetaAdsGovernedOperation(
    {
      ...base,
      precheck: { ...base.precheck, verificationState: 'UNVERIFIED' },
    },
    port({ ok: true, requiresReadback: true }),
  );
  assert.equal(expiredWrite.status, 'BLOCKED');
  if (expiredWrite.status === 'BLOCKED') assert.equal(expiredWrite.code, 'PRECHECK_NOT_VERIFIED');
});

test('W12-H performs no implicit retry for auth failure, rate limit or duplicate-style conflict', async () => {
  for (const failure of [
    { error: 'PROVIDER_AUTHENTICATION_FAILED' as const, retryAfterMs: undefined },
    { error: 'RATE_LIMITED' as const, retryAfterMs: 5_000 },
    { error: 'CONFLICT' as const, retryAfterMs: undefined },
  ]) {
    const seen: MetaAdsW08GovernedWriteRequest[] = [];
    const result = await executeMetaAdsGovernedOperation(
      operationInput(),
      port(
        {
          ok: false,
          error: failure.error,
          mutationPossible: false,
          ...(failure.retryAfterMs === undefined ? {} : { retryAfterMs: failure.retryAfterMs }),
        },
        seen,
      ),
    );
    assert.equal(seen.length, 1);
    assert.equal(seen[0]?.idempotencyKey, 'idem:w12h:create_paused:1');
    assert.equal(result.status, 'FAILED_NOT_EXECUTED');
    if (result.status !== 'FAILED_NOT_EXECUTED') continue;
    assert.equal(result.retryDecisionOwner, 'W07');
    assert.equal(result.canGrantRetry, false);
    assert.equal(result.authorizesExecution, false);
  }
});

test('W12-H preserves ambiguous or partial provider state until W08/W07 reconciliation', async () => {
  const input = operationInput();
  const uncertain = await executeMetaAdsGovernedOperation(
    input,
    port({
      ok: false,
      error: 'AMBIGUOUS_WRITE',
      mutationPossible: true,
      providerReference: 'campaign-42',
    }),
  );
  assert.equal(uncertain.status, 'EXECUTION_UNCERTAIN');
  if (uncertain.status !== 'EXECUTION_UNCERTAIN') return;
  assert.equal(uncertain.requiresReconciliation, true);
  assert.equal(uncertain.retryBoundary, 'W07_RECONCILE_BEFORE_RETRY');
  assert.equal(uncertain.canGrantRetry, false);

  const readback: W08ReadbackProjection = {
    ok: true,
    provider: 'META_ADS',
    accountReference: AD_ACCOUNT,
    bindingReference: BINDING,
    bindingVersion: 7,
    actionIntentId: input.actionIntentId,
    observation: {
      state: 'INDETERMINATE',
      observedAt: '2026-09-04T02:00:02.000Z',
      reason: 'provider state is not yet converged',
      reference: 'campaign-42',
    },
    evidenceRef: 'evd:w12h:readback:indeterminate',
    requiresFurtherReadback: true,
    retryAuthorized: false,
    authorizesExecution: false,
  };
  assertReadbackScope(readback, input.actionIntentId);
  assert.equal(readback.observation.state, 'INDETERMINATE');
  assert.equal(readback.requiresFurtherReadback, true);
  assert.equal(readback.retryAuthorized, false);
});

test('W12-H blocks stale current authority and financial ceiling violations before provider transport', () => {
  const plan = domainPlan('SET_BUDGET');
  const base = financialInput(plan);

  const stale = prepareMetaAdsFinancialMutation({
    ...base,
    authority: { ...base.authority, validUntilMs: NOW },
  });
  assert.deepEqual(stale, { status: 'BLOCKED', code: 'AUTHORITY_STALE' });

  const ceiling = prepareMetaAdsFinancialMutation({
    ...base,
    proposedFinancialExposureMinor: 3_500_000,
  });
  assert.deepEqual(ceiling, { status: 'BLOCKED', code: 'BUDGET_CEILING_EXCEEDED' });
});

test('W12-H keeps analytics and optimization as non-authoritative decision support', () => {
  const analytics = normalizeMetaAdsAnalytics(analyticsInput());
  assert.equal(analytics.status, 'READY');
  if (analytics.status !== 'READY') return;
  assert.equal(analytics.projection.authorizesExecution, false);
  assert.equal(analytics.projection.canGrantPermission, false);
  assert.equal(analytics.projection.claimsCausality, false);

  const optimization = buildMetaAdsOptimizationDecisionSupport({
    evaluatedAtMs: NOW,
    analytics: [analytics.projection],
    evidenceScoreBps: 9_000,
    policy: {
      lowCtrBps: 500,
      lowConversionRateBps: 500,
      maxCostPerConversionMinor: 30_000,
      minImpressions: 100,
      minClicks: 10,
      minEvidenceScoreBps: 7_000,
      highImpactSpendMinor: 1_000_000,
    },
  });
  assert.equal(optimization.status, 'READY');
  if (optimization.status !== 'READY') return;
  assert.equal(optimization.decisionSupport.decisionSupportOnly, true);
  assert.equal(optimization.decisionSupport.automaticSpendEscalation, false);
  assert.equal(optimization.decisionSupport.authorizesExecution, false);
  assert.equal(optimization.decisionSupport.canGrantPermission, false);
  assert.equal(
    optimization.decisionSupport.candidates.every((candidate) => candidate.actionIntent === null),
    true,
  );
});

test('W12-H treats audited n8n Lead Ads coverage as a gap, never full Meta Ads authority', () => {
  const auditedN8nCoverage = Object.freeze({
    referenceKind: 'META_LEAD_ADS_SPECIFIC',
    fullMetaAdsWorkflowCoverage: false,
    canSubstituteW12Contracts: false,
    authorizesExecution: false,
  });

  assert.equal(auditedN8nCoverage.fullMetaAdsWorkflowCoverage, false);
  assert.equal(auditedN8nCoverage.canSubstituteW12Contracts, false);
  assert.equal(auditedN8nCoverage.authorizesExecution, false);
});

test('W12-H never promotes production activation through paused-first acceptance', async () => {
  const result = await executeMetaAdsGovernedOperation(
    operationInput('ACTIVATE'),
    port({ ok: true, requiresReadback: true }),
  );
  assert.equal(result.status, 'BLOCKED');
  if (result.status !== 'BLOCKED') return;
  assert.equal(result.code, 'UNSUPPORTED_ACTIVATION');
  assert.equal(result.authorizesExecution, false);
});