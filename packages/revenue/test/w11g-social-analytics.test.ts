// @ts-expect-error -- revenue harness has no @types/node; Node 22 provides this built-in.
import assert from 'node:assert/strict';
// @ts-expect-error -- revenue harness has no @types/node; Node 22 provides this built-in.
import test from 'node:test';

import type { CorrelationId, TenantId } from '@aurora/contracts';

import {
  buildSocialAnalyticsReadModel,
  type SocialBusinessOutcome,
  type SocialProviderObservation,
} from '../src/social/analytics.js';

const TENANT_A = 'ten_01JW11GTENANTA00000000000' as TenantId;
const TENANT_B = 'ten_01JW11GTENANTB00000000000' as TenantId;
const CORRELATION_A = 'cor_01JW11GCORRELATIONA000000' as CorrelationId;
const CORRELATION_B = 'cor_01JW11GCORRELATIONB000000' as CorrelationId;

function observation(
  overrides: Partial<SocialProviderObservation> = {},
): SocialProviderObservation {
  return {
    observationId: 'obs:ig:publication-1',
    tenantId: TENANT_A,
    accountReference: 'ig-account:1',
    providerReference: 'instagram:media:1',
    publicationReference: 'publication:1',
    correlationId: CORRELATION_A,
    evidenceReference: 'evidence:ig:publication-1',
    observedAt: '2026-09-03T15:00:00Z',
    staleAfterMs: 600_000,
    partial: false,
    metrics: {
      impressions: 1000,
      reactions: 120,
      comments: 20,
      dmEvents: 8,
      replies: 12,
    },
    authorizesExecution: false,
    ...overrides,
  };
}

function outcome(overrides: Partial<SocialBusinessOutcome> = {}): SocialBusinessOutcome {
  return {
    outcomeId: 'outcome:lead-handoff:1',
    tenantId: TENANT_A,
    kind: 'LEAD_HANDOFF',
    count: 2,
    correlationId: CORRELATION_A,
    evidenceReference: 'evidence:w10:handoff-1',
    occurredAt: '2026-09-03T15:02:00Z',
    authorizesExecution: false,
    ...overrides,
  };
}

test('keeps provider observations separate from Aurora business outcomes', () => {
  const model = buildSocialAnalyticsReadModel({
    tenantId: TENANT_A,
    evaluatedAt: '2026-09-03T15:05:00Z',
    providerObservations: [observation()],
    businessOutcomes: [outcome()],
  });

  assert.equal(model.providerStatus, 'FRESH');
  assert.deepEqual(model.providerMetrics, {
    impressions: 1000,
    reactions: 120,
    comments: 20,
    dmEvents: 8,
    replies: 12,
  });
  assert.deepEqual(model.businessOutcomes, {
    leadHandoffs: 2,
    qualifiedLeads: 0,
    conversions: 0,
    communityResolutions: 0,
  });
  assert.equal(model.eval.hasProviderBusinessOutcomeSeparation, true);
  assert.equal(model.authorizesExecution, false);
  assert.equal(model.telemetry.authorizesExecution, false);
});

test('marks stale provider analytics without manufacturing business outcomes', () => {
  const model = buildSocialAnalyticsReadModel({
    tenantId: TENANT_A,
    evaluatedAt: '2026-09-03T15:20:01Z',
    providerObservations: [observation({ staleAfterMs: 600_000 })],
    businessOutcomes: [],
  });

  assert.equal(model.providerStatus, 'STALE');
  assert.equal(model.telemetry.staleProviderObservationCount, 1);
  assert.deepEqual(model.businessOutcomes, {
    leadHandoffs: 0,
    qualifiedLeads: 0,
    conversions: 0,
    communityResolutions: 0,
  });
});

test('marks partial provider analytics and exposes W17/W18 evidence links', () => {
  const model = buildSocialAnalyticsReadModel({
    tenantId: TENANT_A,
    evaluatedAt: '2026-09-03T15:05:00Z',
    providerObservations: [observation({ partial: true })],
    businessOutcomes: [
      outcome(),
      outcome({
        outcomeId: 'outcome:qualified:1',
        kind: 'QUALIFIED_LEAD',
        count: 1,
        correlationId: CORRELATION_B,
        evidenceReference: 'evidence:w10:qualified-1',
      }),
    ],
  });

  assert.equal(model.providerStatus, 'PARTIAL');
  assert.equal(model.telemetry.partialProviderObservationCount, 1);
  assert.deepEqual(model.telemetry.correlationIds, [CORRELATION_A, CORRELATION_B]);
  assert.deepEqual(model.telemetry.evidenceReferences, [
    'evidence:ig:publication-1',
    'evidence:w10:handoff-1',
    'evidence:w10:qualified-1',
  ]);
  assert.deepEqual(model.eval.providerObservationIds, ['obs:ig:publication-1']);
  assert.deepEqual(model.eval.businessOutcomeIds, [
    'outcome:lead-handoff:1',
    'outcome:qualified:1',
  ]);
});

test('enforces tenant isolation for provider and business records', () => {
  const model = buildSocialAnalyticsReadModel({
    tenantId: TENANT_A,
    evaluatedAt: '2026-09-03T15:05:00Z',
    providerObservations: [
      observation(),
      observation({
        observationId: 'obs:other-tenant',
        tenantId: TENANT_B,
        metrics: { impressions: 99_999 },
      }),
    ],
    businessOutcomes: [outcome(), outcome({ outcomeId: 'outcome:other', tenantId: TENANT_B })],
  });

  assert.equal(model.rejectedCrossTenantRecords, 2);
  assert.equal(model.providerMetrics.impressions, 1000);
  assert.equal(model.businessOutcomes.leadHandoffs, 2);
  assert.deepEqual(model.eval.providerObservationIds, ['obs:ig:publication-1']);
  assert.deepEqual(model.eval.businessOutcomeIds, ['outcome:lead-handoff:1']);
});

test('sanitizes invalid negative provider counters and outcome counts', () => {
  const model = buildSocialAnalyticsReadModel({
    tenantId: TENANT_A,
    evaluatedAt: '2026-09-03T15:05:00Z',
    providerObservations: [
      observation({ metrics: { impressions: -1, reactions: Number.NaN, comments: 3 } }),
    ],
    businessOutcomes: [outcome({ count: -5 })],
  });

  assert.deepEqual(model.providerMetrics, {
    impressions: 0,
    reactions: 0,
    comments: 3,
    dmEvents: 0,
    replies: 0,
  });
  assert.equal(model.businessOutcomes.leadHandoffs, 0);
});
