// @ts-expect-error -- revenue harness has no @types/node; Node 22 provides this built-in.
import assert from 'node:assert/strict';
// @ts-expect-error -- revenue harness has no @types/node; Node 22 provides this built-in.
import test from 'node:test';

import type { TenantId } from '@aurora/contracts';

import {
  normalizeMetaAdsAnalytics,
  type MetaAdsAnalyticsInput,
} from '../src/meta-ads/analytics.js';

const TENANT = 'ten_01JW12FTENANT000000000000' as TenantId;
const OTHER_TENANT = 'ten_01JW12FOTHER00000000000' as TenantId;
const NOW = 1_800_000_000_000;

function fixture(overrides: Partial<MetaAdsAnalyticsInput> = {}): MetaAdsAnalyticsInput {
  return {
    tenantId: TENANT,
    providerBindingReference: 'w08:meta-ads:binding-1',
    businessAccountExternalId: 'biz_123456789',
    adAccountExternalId: 'act_123456789',
    resourceKind: 'CAMPAIGN',
    resourceExternalId: 'cmp_123',
    currency: 'BRL',
    metrics: {
      impressions: 10_000,
      clicks: 800,
      spendMinor: 125_000,
      conversions: 42.5,
      conversionValueMinor: 630_000,
      reach: 8_500,
    },
    attributionWindow: '7D_CLICK',
    completeness: 'COMPLETE',
    dataThroughMs: NOW - 7_000,
    nowMs: NOW,
    maxObservationAgeMs: 60_000,
    maxVerificationAgeMs: 120_000,
    binding: {
      source: 'W08_PROVIDER_BINDING',
      tenantId: TENANT,
      provider: 'META_ADS',
      bindingReference: 'w08:meta-ads:binding-1',
      businessAccountExternalId: 'biz_123456789',
      adAccountExternalId: 'act_123456789',
      state: 'ACTIVE',
      verificationState: 'VERIFIED',
      bindingVersion: 3,
      verifiedAtMs: NOW - 20_000,
      authorizesExecution: false,
    },
    provenance: {
      source: 'W08_META_ADS_READBACK',
      evidenceRef: 'evd_meta_analytics_1',
      providerQueryId: 'query_123',
      observedAtMs: NOW - 5_000,
    },
    relatedAction: {
      actionId: 'actn_123',
      evidenceRef: 'evd_action_123',
      occurredAtMs: NOW - 30_000,
    },
    ...overrides,
  };
}

test('W12-F normalizes fresh complete metrics as non-authoritative decision support', () => {
  const result = normalizeMetaAdsAnalytics(fixture());
  assert.equal(result.status, 'READY');
  if (result.status !== 'READY') return;

  assert.equal(result.projection.freshness, 'FRESH');
  assert.equal(result.projection.optimizationCandidateEligible, true);
  assert.equal(result.projection.w17TelemetryEligible, true);
  assert.equal(result.projection.w18EvalEligible, true);
  assert.equal(result.projection.claimsCausality, false);
  assert.equal(result.projection.decisionSupportOnly, true);
  assert.equal(result.projection.authorizesExecution, false);
  assert.equal(result.projection.canGrantPermission, false);
  assert.equal(result.projection.verificationAgeMs, 20_000);
  assert.equal(result.projection.observationAgeMs, 5_000);
  assert.equal(result.projection.metrics.conversions, 42.5);
});

test('W12-F preserves delayed attribution without promoting optimization eligibility', () => {
  const result = normalizeMetaAdsAnalytics(fixture({ completeness: 'DELAYED' }));
  assert.equal(result.status, 'READY');
  if (result.status !== 'READY') return;

  assert.equal(result.projection.completeness, 'DELAYED');
  assert.equal(result.projection.optimizationCandidateEligible, false);
  assert.equal(result.projection.w17TelemetryEligible, true);
  assert.equal(result.projection.w18EvalEligible, true);
});

test('W12-F preserves incomplete metrics but keeps them out of optimization candidates', () => {
  const result = normalizeMetaAdsAnalytics(fixture({ completeness: 'PARTIAL' }));
  assert.equal(result.status, 'READY');
  if (result.status !== 'READY') return;

  assert.equal(result.projection.completeness, 'PARTIAL');
  assert.equal(result.projection.optimizationCandidateEligible, false);
});

test('W12-F marks stale measurements instead of silently treating them as current', () => {
  const result = normalizeMetaAdsAnalytics(
    fixture({
      provenance: { ...fixture().provenance, observedAtMs: NOW - 60_001 },
      dataThroughMs: NOW - 70_000,
    }),
  );
  assert.equal(result.status, 'READY');
  if (result.status !== 'READY') return;

  assert.equal(result.projection.freshness, 'STALE');
  assert.equal(result.projection.optimizationCandidateEligible, false);
  assert.equal(result.projection.observationAgeMs, 60_001);
});

test('W12-F fails closed on cross-tenant and wrong-account analytics scope', () => {
  assert.deepEqual(
    normalizeMetaAdsAnalytics(
      fixture({ binding: { ...fixture().binding, tenantId: OTHER_TENANT } }),
    ),
    { status: 'BLOCKED', code: 'WRONG_TENANT' },
  );

  assert.deepEqual(
    normalizeMetaAdsAnalytics(
      fixture({ binding: { ...fixture().binding, adAccountExternalId: 'act_wrong' } }),
    ),
    { status: 'BLOCKED', code: 'WRONG_AD_ACCOUNT' },
  );

  assert.deepEqual(
    normalizeMetaAdsAnalytics(
      fixture({ binding: { ...fixture().binding, businessAccountExternalId: 'biz_wrong' } }),
    ),
    { status: 'BLOCKED', code: 'WRONG_BUSINESS_ACCOUNT' },
  );
});

test('W12-F requires current verified account scope even for analytics', () => {
  assert.deepEqual(
    normalizeMetaAdsAnalytics(
      fixture({ binding: { ...fixture().binding, verificationState: 'UNVERIFIED' } }),
    ),
    { status: 'BLOCKED', code: 'ACCOUNT_NOT_VERIFIED' },
  );

  assert.deepEqual(
    normalizeMetaAdsAnalytics(
      fixture({ binding: { ...fixture().binding, verifiedAtMs: NOW - 120_001 } }),
    ),
    { status: 'BLOCKED', code: 'ACCOUNT_VERIFICATION_STALE' },
  );
});

test('W12-F rejects malformed metrics, currency and provenance', () => {
  assert.deepEqual(
    normalizeMetaAdsAnalytics(fixture({ metrics: { ...fixture().metrics, spendMinor: -1 } })),
    { status: 'BLOCKED', code: 'INVALID_METRICS' },
  );
  assert.deepEqual(normalizeMetaAdsAnalytics(fixture({ currency: 'brl' })), {
    status: 'BLOCKED',
    code: 'INVALID_CURRENCY',
  });
  assert.deepEqual(
    normalizeMetaAdsAnalytics(
      fixture({ provenance: { ...fixture().provenance, evidenceRef: '   ' } }),
    ),
    { status: 'BLOCKED', code: 'INVALID_PROVENANCE' },
  );
});

test('W12-F rejects impossible observation and attribution timestamps', () => {
  assert.deepEqual(
    normalizeMetaAdsAnalytics(
      fixture({ provenance: { ...fixture().provenance, observedAtMs: NOW + 1 } }),
    ),
    { status: 'BLOCKED', code: 'INVALID_TIME_BOUNDARY' },
  );
  assert.deepEqual(
    normalizeMetaAdsAnalytics(fixture({ dataThroughMs: NOW })),
    { status: 'BLOCKED', code: 'INVALID_TIME_BOUNDARY' },
  );
});
