// @ts-expect-error -- revenue harness has no @types/node; Node 22 provides this built-in.
import assert from 'node:assert/strict';
// @ts-expect-error -- revenue harness has no @types/node; Node 22 provides this built-in.
import test from 'node:test';
import {
  buildGoogleAdsOfflineConversionEvidence,
  dedupeGoogleAdsOfflineConversions,
  type GoogleAdsOfflineConversionInput,
} from '../src/google-ads/conversions.js';
import {
  aggregateGoogleAdsCampaignMetrics,
  buildGoogleAdsMeasurementDecisionSupport,
  evaluateGoogleAdsAttributionEligibility,
  normalizeGoogleAdsMeasurementObservations,
  type GoogleAdsMeasurementDecisionSupportInput,
  type GoogleAdsMeasurementObservation,
} from '../src/google-ads/measurement-calculations.js';

const DAY_MS = 24 * 60 * 60 * 1000;

function conversion(
  overrides: Partial<GoogleAdsOfflineConversionInput> = {},
): GoogleAdsOfflineConversionInput {
  return {
    tenantId: 'tenant-a',
    eventId: 'event-1',
    conversionActionId: 'purchase',
    occurredAtMs: 1_000,
    observedAtMs: 1_500,
    campaignId: 'campaign-1',
    agentId: 'agent-1',
    source: 'CRM',
    consent: {
      adStorage: 'GRANTED',
      analyticsStorage: 'GRANTED',
      adUserData: 'GRANTED',
      adPersonalization: 'GRANTED',
      source: 'CMP',
      observedAtMs: 900,
    },
    clickIdentifiers: { gclid: 'gclid-1' },
    valueMicros: 5_000_000,
    currency: 'BRL',
    ...overrides,
  };
}

function observation(
  overrides: Partial<GoogleAdsMeasurementObservation> = {},
): GoogleAdsMeasurementObservation {
  return {
    observationId: 'obs-1',
    tenantId: 'tenant-a',
    correlationId: 'correlation-a',
    customerId: 'customer-1',
    managerCustomerId: 'manager-1',
    providerBindingReference: 'binding-google-ads-1',
    sourceRevision: 'google-ads-report:v1',
    campaignId: 'campaign-1',
    agentId: 'agent-a',
    occurredAtMs: 1_000,
    observedAtMs: 1_200,
    impressions: 100,
    clicks: 10,
    conversions: 2,
    costMicros: 2_000_000,
    conversionValueMicros: 6_000_000,
    conversionDataState: 'COMPLETE',
    ...overrides,
  };
}

function decisionSupportInput(
  overrides: Partial<GoogleAdsMeasurementDecisionSupportInput> = {},
): GoogleAdsMeasurementDecisionSupportInput {
  return {
    tenantId: 'tenant-a',
    correlationId: 'correlation-a',
    customerId: 'customer-1',
    managerCustomerId: 'manager-1',
    providerBindingReference: 'binding-google-ads-1',
    evaluatedAtMs: 2_000,
    maxObservationAgeMs: 2_000,
    observations: [observation()],
    optimizationPolicy: {
      lowCtrBps: 1_500,
      lowConversionRateBps: 2_500,
      maxCostPerConversionMicros: 1_500_000,
      minImpressionsForCtr: 50,
      minClicksForConversionRate: 5,
    },
    ...overrides,
  };
}

test('W13-G builds non-authoritative offline conversion evidence from explicit CMP consent', () => {
  const result = buildGoogleAdsOfflineConversionEvidence(conversion());
  assert.equal(result.status, 'READY');
  if (result.status !== 'READY') return;
  assert.equal(result.evidence.dedupeKey, 'tenant-a:purchase:event-1');
  assert.equal(result.evidence.authorizesExecution, false);
  assert.equal(result.evidence.uploadAllowed, false);
  assert.equal(Object.isFrozen(result.evidence), true);
});

test('W13-G blocks denied consent and does not manufacture consent', () => {
  const denied = buildGoogleAdsOfflineConversionEvidence(
    conversion({ consent: { ...conversion().consent, adUserData: 'DENIED' } }),
  );
  assert.deepEqual(denied, { status: 'BLOCKED', code: 'CONSENT_DENIED' });
});

test('W13-G blocks raw PII even when an untyped caller adds it', () => {
  const unsafe = { ...conversion(), email: 'person@example.com' };
  const result = buildGoogleAdsOfflineConversionEvidence(unsafe);
  assert.deepEqual(result, { status: 'BLOCKED', code: 'RAW_PII_DETECTED' });
});

test('W13-G requires a provider attribution identifier or governed site identity hash', () => {
  const result = buildGoogleAdsOfflineConversionEvidence(conversion({ clickIdentifiers: {} }));
  assert.deepEqual(result, { status: 'BLOCKED', code: 'MISSING_ATTRIBUTION_IDENTITY' });
});

test('W13-G dedupe is deterministic and flags conflicting replay payloads', () => {
  const first = buildGoogleAdsOfflineConversionEvidence(conversion());
  const conflict = buildGoogleAdsOfflineConversionEvidence(conversion({ valueMicros: 7_000_000 }));
  assert.equal(first.status, 'READY');
  assert.equal(conflict.status, 'READY');
  if (first.status !== 'READY' || conflict.status !== 'READY') return;

  const forward = dedupeGoogleAdsOfflineConversions([first.evidence, conflict.evidence]);
  const reverse = dedupeGoogleAdsOfflineConversions([conflict.evidence, first.evidence]);
  assert.deepEqual(forward, reverse);
  assert.equal(forward.unique.length, 1);
  assert.equal(forward.conflicts.length, 1);
});

test('W13-G enforces click and view attribution windows at deterministic boundaries', () => {
  const policy = { model: 'DATA_DRIVEN' as const, clickWindowDays: 30, viewWindowDays: 1 };
  assert.equal(
    evaluateGoogleAdsAttributionEligibility(
      30 * DAY_MS,
      { interactionId: 'c', kind: 'CLICK', occurredAtMs: 0 },
      policy,
    ).status,
    'ELIGIBLE',
  );
  assert.deepEqual(
    evaluateGoogleAdsAttributionEligibility(
      30 * DAY_MS + 1,
      { interactionId: 'c', kind: 'CLICK', occurredAtMs: 0 },
      policy,
    ),
    { status: 'INELIGIBLE', reason: 'OUTSIDE_WINDOW' },
  );
  assert.deepEqual(
    evaluateGoogleAdsAttributionEligibility(
      2 * DAY_MS,
      { interactionId: 'v', kind: 'VIEW', occurredAtMs: 0 },
      policy,
    ),
    { status: 'INELIGIBLE', reason: 'OUTSIDE_WINDOW' },
  );
});

test('W13-G normalizes replay and aggregates scoped decision-support-only metrics', () => {
  const observations = [
    observation(),
    observation(),
    observation({
      observationId: 'obs-2',
      agentId: 'agent-b',
      occurredAtMs: 1_300,
      observedAtMs: 1_600,
      impressions: 100,
      clicks: 20,
      conversions: 4,
      costMicros: 4_000_000,
      conversionValueMicros: 12_000_000,
    }),
  ];

  assert.equal(normalizeGoogleAdsMeasurementObservations(observations).length, 2);
  const metrics = aggregateGoogleAdsCampaignMetrics(observations);
  assert.equal(metrics.length, 1);
  assert.equal(metrics[0]?.tenantId, 'tenant-a');
  assert.equal(metrics[0]?.customerId, 'customer-1');
  assert.equal(metrics[0]?.providerBindingReference, 'binding-google-ads-1');
  assert.deepEqual(metrics[0]?.sourceRevisions, ['google-ads-report:v1']);
  assert.deepEqual(metrics[0]?.agentIds, ['agent-a', 'agent-b']);
  assert.equal(metrics[0]?.impressions, 200);
  assert.equal(metrics[0]?.clicks, 30);
  assert.equal(metrics[0]?.conversions, 6);
  assert.equal(metrics[0]?.roas, 3);
  assert.equal(metrics[0]?.maxLatencyMs, 300);
  assert.equal(metrics[0]?.conversionDataState, 'COMPLETE');
  assert.equal(metrics[0]?.decisionSupportOnly, true);
  assert.equal(metrics[0]?.authorizesExecution, false);
});

test('W13-G preserves freshness/provenance/account scope and exposes W17/W18 inputs', () => {
  const result = buildGoogleAdsMeasurementDecisionSupport(
    decisionSupportInput({ observations: [observation(), observation()] }),
  );
  assert.equal(result.status, 'READY');
  if (result.status !== 'READY') return;

  assert.equal(result.decisionSupport.customerId, 'customer-1');
  assert.equal(result.decisionSupport.providerBindingReference, 'binding-google-ads-1');
  assert.deepEqual(result.decisionSupport.sourceRevisions, ['google-ads-report:v1']);
  assert.equal(result.decisionSupport.telemetry.duplicateReplayCount, 1);
  assert.equal(result.decisionSupport.telemetry.normalizedObservationCount, 1);
  assert.equal(result.decisionSupport.evaluationInputs.length, 1);
  assert.equal(
    result.decisionSupport.evaluationInputs[0]?.schema,
    'aurora.w13g.optimization_evaluation.v1',
  );
  assert.equal(result.decisionSupport.telemetry.schema, 'aurora.w13g.measurement_telemetry.v1');
  assert.equal(result.decisionSupport.authorizesExecution, false);
  assert.equal(result.decisionSupport.canGrantPermission, false);
});

test('W13-G stale, future and cross-account observations fail closed', () => {
  assert.deepEqual(
    buildGoogleAdsMeasurementDecisionSupport(
      decisionSupportInput({ observations: [observation({ customerId: 'customer-2' })] }),
    ),
    { status: 'BLOCKED', code: 'SCOPE_MISMATCH' },
  );
  assert.deepEqual(
    buildGoogleAdsMeasurementDecisionSupport(
      decisionSupportInput({ observations: [observation({ observedAtMs: 2_001 })] }),
    ),
    { status: 'BLOCKED', code: 'FUTURE_OBSERVATION' },
  );
  assert.deepEqual(
    buildGoogleAdsMeasurementDecisionSupport(
      decisionSupportInput({
        evaluatedAtMs: 10_000,
        maxObservationAgeMs: 1_000,
        observations: [observation({ observedAtMs: 1_500 })],
      }),
    ),
    { status: 'BLOCKED', code: 'STALE_OBSERVATION' },
  );
});

test('W13-G incomplete attribution blocks performance recommendations without hiding uncertainty', () => {
  const result = buildGoogleAdsMeasurementDecisionSupport(
    decisionSupportInput({
      observations: [observation({ conversionDataState: 'INCOMPLETE', conversions: 0 })],
    }),
  );
  assert.equal(result.status, 'READY');
  if (result.status !== 'READY') return;

  assert.deepEqual(
    result.decisionSupport.recommendations.map((item) => item.kind),
    ['WAIT_FOR_COMPLETE_CONVERSION_DATA'],
  );
  assert.equal(result.decisionSupport.telemetry.delayedOrIncompleteCampaignCount, 1);
  assert.equal(result.decisionSupport.recommendations[0]?.nextStep, 'REVIEW_ONLY');
  assert.equal(result.decisionSupport.recommendations[0]?.authorizesExecution, false);
});

test('W13-G optimization candidates are deterministic review-only recommendations', () => {
  const input = decisionSupportInput({
    observations: [
      observation({
        impressions: 1_000,
        clicks: 50,
        conversions: 1,
        costMicros: 5_000_000,
        conversionValueMicros: 4_000_000,
      }),
    ],
  });
  const first = buildGoogleAdsMeasurementDecisionSupport(input);
  const second = buildGoogleAdsMeasurementDecisionSupport(input);
  assert.deepEqual(first, second);
  assert.equal(first.status, 'READY');
  if (first.status !== 'READY') return;

  assert.deepEqual(
    first.decisionSupport.recommendations.map((item) => item.kind),
    ['REVIEW_HIGH_COST_PER_CONVERSION', 'REVIEW_LOW_CONVERSION_RATE', 'REVIEW_LOW_CTR'],
  );
  assert.equal(
    first.decisionSupport.recommendations.every((item) => !item.authorizesExecution),
    true,
  );
  assert.equal(
    first.decisionSupport.recommendations.every((item) => !item.canGrantPermission),
    true,
  );
});

test('W13-G conflicting observation replay is explicit and cannot drive optimization', () => {
  const result = buildGoogleAdsMeasurementDecisionSupport(
    decisionSupportInput({
      observations: [observation(), observation({ clicks: 9 })],
    }),
  );
  assert.deepEqual(result, { status: 'BLOCKED', code: 'CONFLICTING_OBSERVATION_REPLAY' });
});
