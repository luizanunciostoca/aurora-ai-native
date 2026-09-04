// @ts-expect-error -- revenue harness has no @types/node; Node 22 provides this built-in.
import assert from 'node:assert/strict';
// @ts-expect-error -- revenue harness has no @types/node; Node 22 provides this built-in.
import test from 'node:test';
import type { TenantId } from '@aurora/contracts';
import {
  normalizeMetaAdsAnalytics,
  type MetaAdsAnalyticsProjection,
} from '../src/meta-ads/analytics.js';
import {
  buildMetaAdsCounterfactualEvalFixture,
  buildMetaAdsOptimizationDecisionSupport,
} from '../src/meta-ads/optimization.js';

const TENANT = 'ten_01JW12GTENANT000000000000' as TenantId;
const NOW = 1_800_000_000_000;

function projection(
  overrides: Readonly<{
    resourceExternalId?: string;
    impressions?: number;
    clicks?: number;
    conversions?: number;
    spendMinor?: number;
    conversionValueMinor?: number;
    completeness?: 'COMPLETE' | 'PARTIAL' | 'DELAYED';
    observedAtMs?: number;
    adAccountExternalId?: string;
  }> = {},
): MetaAdsAnalyticsProjection {
  const result = normalizeMetaAdsAnalytics({
    tenantId: TENANT,
    providerBindingReference: 'w08:meta:binding-1',
    businessAccountExternalId: 'business-1',
    adAccountExternalId: overrides.adAccountExternalId ?? 'act_123456789',
    resourceKind: 'CAMPAIGN',
    resourceExternalId: overrides.resourceExternalId ?? 'campaign-1',
    currency: 'BRL',
    metrics: {
      impressions: overrides.impressions ?? 1_000,
      clicks: overrides.clicks ?? 50,
      spendMinor: overrides.spendMinor ?? 100_000,
      conversions: overrides.conversions ?? 1,
      conversionValueMinor: overrides.conversionValueMinor ?? 120_000,
    },
    attributionWindow: '7D_CLICK',
    completeness: overrides.completeness ?? 'COMPLETE',
    dataThroughMs: NOW - 1_500,
    nowMs: NOW,
    maxObservationAgeMs: 10_000,
    maxVerificationAgeMs: 10_000,
    binding: {
      source: 'W08_PROVIDER_BINDING',
      tenantId: TENANT,
      provider: 'META_ADS',
      bindingReference: 'w08:meta:binding-1',
      businessAccountExternalId: 'business-1',
      adAccountExternalId: overrides.adAccountExternalId ?? 'act_123456789',
      state: 'ACTIVE',
      verificationState: 'VERIFIED',
      bindingVersion: 7,
      verifiedAtMs: NOW - 1_000,
      authorizesExecution: false,
    },
    provenance: {
      source: 'W08_META_ADS_READBACK',
      evidenceRef: `evidence:${overrides.resourceExternalId ?? 'campaign-1'}`,
      providerQueryId: 'query-1',
      observedAtMs: overrides.observedAtMs ?? NOW - 1_000,
    },
  });
  assert.equal(result.status, 'READY');
  if (result.status !== 'READY') throw new Error('fixture must produce W12-F analytics');
  return result.projection;
}

const policy = {
  lowCtrBps: 800,
  lowConversionRateBps: 300,
  maxCostPerConversionMinor: 50_000,
  minImpressions: 100,
  minClicks: 10,
  minEvidenceScoreBps: 7_000,
  highImpactSpendMinor: 75_000,
} as const;

test('W12-G produces deterministic benefit/risk/cost candidates without ActionIntent or authority', () => {
  const input = {
    evaluatedAtMs: NOW,
    analytics: [projection()],
    policy,
    evidenceScoreBps: 9_000,
  } as const;
  const first = buildMetaAdsOptimizationDecisionSupport(input);
  const second = buildMetaAdsOptimizationDecisionSupport(input);
  assert.deepEqual(first, second);
  assert.equal(first.status, 'READY');
  if (first.status !== 'READY') return;
  assert.equal(first.decisionSupport.authorizesExecution, false);
  assert.equal(first.decisionSupport.canGrantPermission, false);
  assert.equal(first.decisionSupport.automaticSpendEscalation, false);
  assert.equal(first.decisionSupport.candidates.length, 3);
  assert.equal(
    first.decisionSupport.candidates.every((item) => item.actionIntent === null),
    true,
  );
  assert.equal(
    first.decisionSupport.candidates.every((item) => item.expectedBenefit.kind === 'ESTIMATE_ONLY'),
    true,
  );
});

test('W12-G abstains when evidence is incomplete, stale-ineligible or below benchmark thresholds', () => {
  const incomplete = buildMetaAdsOptimizationDecisionSupport({
    evaluatedAtMs: NOW,
    analytics: [projection({ completeness: 'PARTIAL' })],
    policy,
    evidenceScoreBps: 9_000,
  });
  assert.equal(incomplete.status, 'READY');
  if (incomplete.status !== 'READY') return;
  assert.deepEqual(
    incomplete.decisionSupport.candidates.map((item) => item.kind),
    ['HOLD_FOR_MORE_EVIDENCE'],
  );
  assert.equal(incomplete.decisionSupport.candidates[0]?.nextStep, 'ABSTAIN');

  const weak = buildMetaAdsOptimizationDecisionSupport({
    evaluatedAtMs: NOW,
    analytics: [projection()],
    policy,
    evidenceScoreBps: 6_999,
  });
  assert.equal(weak.status, 'READY');
  if (weak.status !== 'READY') return;
  assert.equal(weak.decisionSupport.candidates[0]?.nextStep, 'ABSTAIN');
});

test('W12-G adaptive reasoning is advisory only and cannot create execution authority', () => {
  const result = buildMetaAdsOptimizationDecisionSupport({
    evaluatedAtMs: NOW,
    analytics: [
      projection({ impressions: 10_000, clicks: 1_000, conversions: 200, spendMinor: 10_000 }),
    ],
    policy,
    evidenceScoreBps: 9_500,
    adaptiveReasoning: {
      source: 'ADAPTIVE_REASONING_DECISION_SUPPORT',
      suggestedKind: 'REVIEW_CREATIVE',
      confidenceBps: 10_000,
      authorizesExecution: false,
    },
  });
  assert.equal(result.status, 'READY');
  if (result.status !== 'READY') return;
  assert.deepEqual(
    result.decisionSupport.candidates.map((item) => item.kind),
    ['REVIEW_CREATIVE'],
  );
  assert.equal(result.decisionSupport.candidates[0]?.actionIntent, null);
  assert.equal(result.decisionSupport.candidates[0]?.authorizesExecution, false);
});

test('W12-G high-impact cost review requires human review and never escalates spend automatically', () => {
  const result = buildMetaAdsOptimizationDecisionSupport({
    evaluatedAtMs: NOW,
    analytics: [projection({ spendMinor: 100_000, conversions: 1 })],
    policy,
    evidenceScoreBps: 9_000,
  });
  assert.equal(result.status, 'READY');
  if (result.status !== 'READY') return;
  const cost = result.decisionSupport.candidates.find(
    (item) => item.kind === 'REVIEW_COST_EFFICIENCY',
  );
  assert.equal(cost?.risk, 'HIGH');
  assert.equal(cost?.nextStep, 'HUMAN_REVIEW_REQUIRED');
  assert.equal(cost?.estimatedCostImpactMinor, 100_000);
  assert.equal(cost?.canGrantPermission, false);
});

test('W12-G blocks cross-account analytics instead of blending tenant/provider evidence', () => {
  const result = buildMetaAdsOptimizationDecisionSupport({
    evaluatedAtMs: NOW,
    analytics: [
      projection(),
      projection({ resourceExternalId: 'campaign-2', adAccountExternalId: 'act_other' }),
    ],
    policy,
    evidenceScoreBps: 9_000,
  });
  assert.deepEqual(result, { status: 'BLOCKED', code: 'CROSS_SCOPE_ANALYTICS' });
});

test('W12-G exposes counterfactual eval fixtures as non-authoritative W18-style evidence', () => {
  const baseline = projection({ clicks: 50, conversions: 1 });
  const counterfactual = projection({ clicks: 100, conversions: 10 });
  const fixture = buildMetaAdsCounterfactualEvalFixture(
    baseline,
    counterfactual,
    'REVIEW_CONVERSION_PATH',
  );
  assert.equal(fixture.schema, 'aurora.w12g.counterfactual_eval.v1');
  assert.equal(fixture.baselineMetric, 0.02);
  assert.equal(fixture.counterfactualMetric, 0.1);
  assert.equal(fixture.delta, 0.08);
  assert.equal(fixture.counterfactualOnly, true);
  assert.equal(fixture.authorizesExecution, false);
});

test('W12-G candidate ordering is deterministic across input ordering', () => {
  const one = projection({ resourceExternalId: 'campaign-1' });
  const two = projection({ resourceExternalId: 'campaign-2', spendMinor: 60_000 });
  const forward = buildMetaAdsOptimizationDecisionSupport({
    evaluatedAtMs: NOW,
    analytics: [one, two],
    policy,
    evidenceScoreBps: 9_000,
  });
  const reverse = buildMetaAdsOptimizationDecisionSupport({
    evaluatedAtMs: NOW,
    analytics: [two, one],
    policy,
    evidenceScoreBps: 9_000,
  });
  assert.deepEqual(forward, reverse);
});
