// @ts-expect-error -- revenue harness has no @types/node; Node 22 provides this built-in.
import assert from 'node:assert/strict';
// @ts-expect-error -- revenue harness has no @types/node; Node 22 provides this built-in.
import test from 'node:test';

import type { TenantId } from '@aurora/contracts';

import { planGoogleAdsSearch, type GoogleAdsSearchPlanningInput } from '../src/google-ads/search-planning.js';

const TENANT = 'ten_01JW13CTENANT000000000000' as TenantId;
const OTHER_TENANT = 'ten_01JW13COTHER00000000000' as TenantId;
const NOW = 1_800_000_000_000;

function fixture(
  overrides: Partial<GoogleAdsSearchPlanningInput> = {},
): GoogleAdsSearchPlanningInput {
  return {
    tenantId: TENANT,
    providerBindingReference: 'w08:google-ads:binding-1',
    customerId: '1234567890',
    nowMs: NOW,
    maxContextAgeMs: 60_000,
    verifiedContext: {
      source: 'W08_VERIFIED_GOOGLE_ADS_CONTEXT',
      tenantId: TENANT,
      providerBindingReference: 'w08:google-ads:binding-1',
      customerId: '1234567890',
      verifiedAtMs: NOW - 5_000,
      authorizesExecution: false,
    },
    objective: 'TRAFFIC',
    biddingStrategy: 'MANUAL_CPC',
    keywords: [
      {
        text: ' Morro   Digital ',
        matchType: 'PHRASE',
        negative: false,
        suggestedBidMicros: 2_500_000,
        evidenceReferences: ['ctx:keyword-1'],
      },
      {
        text: 'cheap',
        matchType: 'BROAD',
        negative: true,
        evidenceReferences: ['ctx:negative-1'],
      },
    ],
    conversions: [],
    ...overrides,
  };
}

test('W13-C deterministically normalizes keyword recommendations without granting authority', () => {
  const result = planGoogleAdsSearch(fixture());
  assert.equal(result.status, 'READY');
  if (result.status !== 'READY') return;

  assert.equal(result.plan.reasoningMode, 'DETERMINISTIC');
  assert.equal(result.plan.authorizesExecution, false);
  assert.equal(result.plan.canGrantPermission, false);
  assert.equal(result.plan.requiresW07ExecutionForMutation, true);
  assert.equal(result.plan.requiresW08GoogleAdsBinding, true);
  assert.equal(result.plan.requiresFinancialApproval, true);
  assert.equal(result.plan.financialRecommendationsAreNonAuthoritative, true);
  assert.deepEqual(
    result.plan.keywords.map(({ text, negative }) => ({ text, negative })),
    [
      { text: 'morro digital', negative: false },
      { text: 'cheap', negative: true },
    ],
  );
});

test('W13-C fails closed when verified provider context crosses tenant/account scope', () => {
  assert.deepEqual(
    planGoogleAdsSearch(
      fixture({
        verifiedContext: { ...fixture().verifiedContext, tenantId: OTHER_TENANT },
      }),
    ),
    { status: 'BLOCKED', code: 'CONTEXT_SCOPE_MISMATCH' },
  );

  assert.deepEqual(
    planGoogleAdsSearch(
      fixture({
        verifiedContext: { ...fixture().verifiedContext, customerId: '0000000000' },
      }),
    ),
    { status: 'BLOCKED', code: 'CONTEXT_SCOPE_MISMATCH' },
  );
});

test('W13-C rejects duplicate keywords and positive/negative collisions', () => {
  const positive = fixture().keywords[0];
  if (positive === undefined) throw new Error('fixture positive keyword is missing');
  assert.deepEqual(
    planGoogleAdsSearch(fixture({ keywords: [positive, { ...positive }] })),
    { status: 'BLOCKED', code: 'DUPLICATE_KEYWORD' },
  );

  assert.deepEqual(
    planGoogleAdsSearch(
      fixture({
        keywords: [
          positive,
          {
            text: 'morro digital',
            matchType: 'EXACT',
            negative: true,
            evidenceReferences: ['ctx:negative-conflict'],
          },
        ],
      }),
    ),
    { status: 'BLOCKED', code: 'POSITIVE_NEGATIVE_CONFLICT' },
  );
});

test('W13-C requires a fresh enabled primary conversion for conversion bidding', () => {
  assert.deepEqual(
    planGoogleAdsSearch(
      fixture({ objective: 'CONVERSIONS', biddingStrategy: 'MAXIMIZE_CONVERSIONS' }),
    ),
    { status: 'BLOCKED', code: 'CONVERSION_REQUIRED' },
  );

  const ready = planGoogleAdsSearch(
    fixture({
      objective: 'CONVERSIONS',
      biddingStrategy: 'TARGET_CPA',
      targetCpaMicros: 35_000_000,
      conversions: [
        {
          resourceName: 'customers/1234567890/conversionActions/44',
          status: 'ENABLED',
          primaryForGoals: true,
          observedAtMs: NOW - 10_000,
          evidenceReference: 'provider:conversion-44',
        },
      ],
    }),
  );
  assert.equal(ready.status, 'READY');
  if (ready.status !== 'READY') return;
  assert.deepEqual(ready.plan.conversionResourceNames, [
    'customers/1234567890/conversionActions/44',
  ]);
  assert.equal(ready.plan.requiresFinancialApproval, true);
  assert.equal(ready.plan.authorizesExecution, false);
});

test('W13-C blocks stale or non-primary conversion facts', () => {
  assert.deepEqual(
    planGoogleAdsSearch(
      fixture({
        objective: 'CONVERSIONS',
        biddingStrategy: 'MAXIMIZE_CONVERSIONS',
        conversions: [
          {
            resourceName: 'customers/1234567890/conversionActions/44',
            status: 'ENABLED',
            primaryForGoals: true,
            observedAtMs: NOW - 60_001,
            evidenceReference: 'provider:conversion-44',
          },
        ],
      }),
    ),
    { status: 'BLOCKED', code: 'CONVERSION_STALE' },
  );

  assert.deepEqual(
    planGoogleAdsSearch(
      fixture({
        objective: 'CONVERSIONS',
        biddingStrategy: 'MAXIMIZE_CONVERSIONS',
        conversions: [
          {
            resourceName: 'customers/1234567890/conversionActions/44',
            status: 'ENABLED',
            primaryForGoals: false,
            observedAtMs: NOW - 5_000,
            evidenceReference: 'provider:conversion-44',
          },
        ],
      }),
    ),
    { status: 'BLOCKED', code: 'CONVERSION_NOT_READY' },
  );
});

test('W13-C enforces bidding/objective compatibility and explicit targets', () => {
  assert.deepEqual(
    planGoogleAdsSearch(
      fixture({
        objective: 'TRAFFIC',
        biddingStrategy: 'TARGET_ROAS',
        targetRoasBasisPoints: 25000,
      }),
    ),
    { status: 'BLOCKED', code: 'BIDDING_OBJECTIVE_MISMATCH' },
  );

  assert.deepEqual(
    planGoogleAdsSearch(
      fixture({ objective: 'CONVERSIONS', biddingStrategy: 'TARGET_CPA' }),
    ),
    { status: 'BLOCKED', code: 'INVALID_TARGET' },
  );

  assert.deepEqual(
    planGoogleAdsSearch(
      fixture({
        objective: 'CONVERSIONS',
        biddingStrategy: 'TARGET_CPA',
        targetCpaMicros: 0,
      }),
    ),
    { status: 'BLOCKED', code: 'INVALID_TARGET' },
  );

  assert.deepEqual(
    planGoogleAdsSearch(
      fixture({
        objective: 'CONVERSIONS',
        biddingStrategy: 'TARGET_CPA',
        targetCpaMicros: 35_000_000,
        targetRoasBasisPoints: 25_000,
      }),
    ),
    { status: 'BLOCKED', code: 'INVALID_TARGET' },
  );
});

test('W13-C never permits bid recommendations on negative keywords', () => {
  const positive = fixture().keywords[0];
  if (positive === undefined) throw new Error('fixture positive keyword is missing');
  assert.deepEqual(
    planGoogleAdsSearch(
      fixture({
        keywords: [
          positive,
          {
            text: 'free',
            matchType: 'BROAD',
            negative: true,
            suggestedBidMicros: 1,
            evidenceReferences: ['ctx:negative'],
          },
        ],
      }),
    ),
    { status: 'BLOCKED', code: 'INVALID_BID_RECOMMENDATION' },
  );
});

test('W13-C rejects stale verified context before planning', () => {
  assert.deepEqual(
    planGoogleAdsSearch(
      fixture({
        verifiedContext: { ...fixture().verifiedContext, verifiedAtMs: NOW - 60_001 },
      }),
    ),
    { status: 'BLOCKED', code: 'CONTEXT_STALE' },
  );
});
