// @ts-expect-error -- revenue harness has no @types/node; Node 22 provides this built-in.
import assert from 'node:assert/strict';
// @ts-expect-error -- revenue harness has no @types/node; Node 22 provides this built-in.
import test from 'node:test';

import type { CorrelationId, TenantId } from '@aurora/contracts';

import {
  planGoogleAdsAssets,
  type GoogleAdsAssetPlanningInput,
  type GoogleAdsPlanningAsset,
} from '../src/google-ads/asset-planning.js';

const TENANT = 'ten_01JW13DTENANT000000000000' as TenantId;
const CORRELATION = 'cor_01JW13DCORRELATION000000' as CorrelationId;
const HASH_A = `sha256:${'a'.repeat(64)}`;

function provenance(id: string) {
  return {
    sourceReference: `evidence:w13d:${id}`,
    sourceHash: HASH_A,
    verifiedAt: '2026-09-03T11:00:00.000Z',
  } as const;
}

function textAsset(
  assetId: string,
  kind: 'HEADLINE' | 'LONG_HEADLINE' | 'DESCRIPTION',
  text: string,
): GoogleAdsPlanningAsset {
  return { assetId, kind, text, provenance: provenance(assetId) };
}

function imageAsset(
  assetId: string,
  kind: 'MARKETING_IMAGE' | 'SQUARE_MARKETING_IMAGE' | 'LOGO_IMAGE',
  width: number,
  height: number,
): GoogleAdsPlanningAsset {
  return {
    assetId,
    kind,
    media: {
      mediaReference: `asset:${assetId}`,
      mimeType: 'image/png',
      width,
      height,
    },
    provenance: provenance(assetId),
  };
}

function videoAsset(assetId = 'video-1'): GoogleAdsPlanningAsset {
  return {
    assetId,
    kind: 'YOUTUBE_VIDEO',
    media: {
      mediaReference: `youtube:${assetId}`,
      mimeType: 'video/mp4',
      durationSeconds: 30,
    },
    provenance: provenance(assetId),
  };
}

function pmaxAssets(): readonly GoogleAdsPlanningAsset[] {
  return [
    textAsset('headline-3', 'HEADLINE', 'Reserve sua experiência'),
    textAsset('headline-1', 'HEADLINE', 'Sunset inesquecível'),
    textAsset('headline-2', 'HEADLINE', 'Vista para o mar'),
    textAsset('long-1', 'LONG_HEADLINE', 'Viva um sunset inesquecível com vista para o mar'),
    textAsset('description-1', 'DESCRIPTION', 'Celebre o fim de tarde em um cenário único.'),
    textAsset(
      'description-2',
      'DESCRIPTION',
      'Planeje sua visita com informações verificadas e uma experiência memorável.',
    ),
    imageAsset('landscape-1', 'MARKETING_IMAGE', 1200, 628),
    imageAsset('square-1', 'SQUARE_MARKETING_IMAGE', 600, 600),
  ];
}

function fixture(overrides: Partial<GoogleAdsAssetPlanningInput> = {}): GoogleAdsAssetPlanningInput {
  return {
    tenantId: TENANT,
    correlationId: CORRELATION,
    planId: 'w13d-plan-001',
    assetGroupKey: 'asset-group-sunset',
    surface: 'PERFORMANCE_MAX',
    customerId: '1234567890',
    providerBindingReference: 'w08:google-ads-binding:primary',
    finalUrl: 'https://example.com/sunset',
    capability: {
      source: 'W04_CAPABILITY_REGISTRY',
      capabilityId: 'google-ads.asset.plan',
      registryVersion: 'registry-r42',
      targetKind: 'PROVIDER',
      compatibilityKey: 'google-ads',
      authorizesExecution: false,
    },
    strategy: {
      mode: 'DETERMINISTIC_TEMPLATE',
      templateId: 'template.pmax.standard.v1',
      rationaleReference: 'evidence:w13d:template-standard',
    },
    assets: pmaxAssets(),
    ...overrides,
  };
}

test('W13-D creates a deterministic PMax plan without granting provider or financial authority', () => {
  const result = planGoogleAdsAssets(fixture());
  assert.equal(result.status, 'READY');
  if (result.status !== 'READY') return;

  assert.equal(result.plan.requiresW08GoogleAdsBinding, true);
  assert.equal(result.plan.requiresW07Execution, false);
  assert.equal(result.plan.providerMutation, false);
  assert.equal(result.plan.authorizesExecution, false);
  assert.equal(result.plan.canGrantPermission, false);
  assert.equal(result.plan.constraints.profile, 'GOOGLE_ADS_API_2026_08');
  assert.equal(result.plan.constraints.providerAutomationExpected, true);
  assert.deepEqual(result.plan.constraints.providerAutomationNotes, [
    'PERFORMANCE_MAX_VIDEO_MAY_BE_PROVIDER_GENERATED',
  ]);
  assert.deepEqual(
    result.plan.assets.map((asset) => asset.assetId),
    [...result.plan.assets.map((asset) => asset.assetId)].sort(),
  );
});

test('W13-D escalates ambiguous custom creative strategy instead of widening authority', () => {
  assert.deepEqual(
    planGoogleAdsAssets(
      fixture({
        strategy: {
          mode: 'CUSTOM',
          confidence: 0.54,
          rationaleReference: 'evidence:w13d:custom-low-confidence',
        },
      }),
    ),
    { status: 'ESCALATION_REQUIRED', code: 'AMBIGUOUS_CREATIVE_STRATEGY' },
  );
});

test('W13-D rejects text that exceeds current provider planning constraints', () => {
  const assets = pmaxAssets().map((asset) =>
    asset.assetId === 'headline-1'
      ? textAsset('headline-1', 'HEADLINE', 'x'.repeat(31))
      : asset,
  );
  assert.deepEqual(planGoogleAdsAssets(fixture({ assets })), {
    status: 'BLOCKED',
    code: 'ASSET_CONSTRAINT_VIOLATION',
  });
});

test('W13-D requires complete responsive Display text and image classes', () => {
  const displayAssets: readonly GoogleAdsPlanningAsset[] = [
    textAsset('display-headline', 'HEADLINE', 'Conheça a experiência'),
    textAsset('display-long', 'LONG_HEADLINE', 'Descubra uma experiência criada para momentos especiais'),
    textAsset('display-description', 'DESCRIPTION', 'Veja detalhes e planeje sua visita.'),
    imageAsset('display-landscape', 'MARKETING_IMAGE', 1200, 628),
  ];

  assert.deepEqual(
    planGoogleAdsAssets(fixture({ surface: 'DISPLAY', assets: displayAssets })),
    { status: 'BLOCKED', code: 'MISSING_REQUIRED_ASSET' },
  );

  const result = planGoogleAdsAssets(
    fixture({
      surface: 'DISPLAY',
      assets: [...displayAssets, imageAsset('display-square', 'SQUARE_MARKETING_IMAGE', 600, 600)],
    }),
  );
  assert.equal(result.status, 'READY');
});

test('W13-D rejects image dimensions or aspect ratios outside the provider boundary', () => {
  const assets = pmaxAssets().map((asset) =>
    asset.assetId === 'square-1'
      ? imageAsset('square-1', 'SQUARE_MARKETING_IMAGE', 600, 500)
      : asset,
  );

  assert.deepEqual(planGoogleAdsAssets(fixture({ assets })), {
    status: 'BLOCKED',
    code: 'ASSET_CONSTRAINT_VIOLATION',
  });
});

test('W13-D requires an explicit YouTube video for YouTube-only planning', () => {
  assert.deepEqual(
    planGoogleAdsAssets(
      fixture({
        surface: 'YOUTUBE',
        assets: [textAsset('youtube-headline', 'HEADLINE', 'Assista agora')],
      }),
    ),
    { status: 'BLOCKED', code: 'MISSING_REQUIRED_ASSET' },
  );

  const result = planGoogleAdsAssets(fixture({ surface: 'YOUTUBE', assets: [videoAsset()] }));
  assert.equal(result.status, 'READY');
  if (result.status !== 'READY') return;
  assert.equal(result.plan.constraints.providerAutomationExpected, false);
  assert.equal(result.plan.providerMutation, false);
});

test('W13-D fails closed on provenance, duplicate assets, malformed costs and incompatible capability', () => {
  const invalidProvenance: GoogleAdsPlanningAsset = {
    ...pmaxAssets()[0]!,
    provenance: {
      sourceReference: 'evidence:w13d:invalid',
      sourceHash: 'not-a-hash',
      verifiedAt: '2026-09-03T11:00:00.000Z',
    },
  };
  assert.deepEqual(
    planGoogleAdsAssets(fixture({ assets: [invalidProvenance, ...pmaxAssets().slice(1)] })),
    { status: 'BLOCKED', code: 'INVALID_PROVENANCE' },
  );

  assert.deepEqual(
    planGoogleAdsAssets(fixture({ assets: [...pmaxAssets(), pmaxAssets()[0]!] })),
    { status: 'BLOCKED', code: 'DUPLICATE_ASSET' },
  );

  assert.deepEqual(
    planGoogleAdsAssets(
      fixture({ expectedCost: { currency: 'BRL', minimumMicros: 10_000, maximumMicros: 5_000 } }),
    ),
    { status: 'BLOCKED', code: 'INVALID_COST_ESTIMATE' },
  );

  assert.deepEqual(
    planGoogleAdsAssets(
      fixture({
        capability: {
          source: 'W04_CAPABILITY_REGISTRY',
          capabilityId: 'wrong-provider',
          registryVersion: 'registry-r42',
          targetKind: 'PROVIDER',
          compatibilityKey: 'meta-ads' as 'google-ads',
          authorizesExecution: false,
        },
      }),
    ),
    { status: 'BLOCKED', code: 'INVALID_CAPABILITY' },
  );
});
