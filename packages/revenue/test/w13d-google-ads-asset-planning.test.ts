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
const MAX_IMAGE_FILE_SIZE_BYTES = 5_120 * 1_024;

function provenance(id: string) {
  return {
    sourceReference: `evidence:w13d:${id}`,
    sourceHash: HASH_A,
    verifiedAt: '2026-09-03T11:00:00.000Z',
  } as const;
}

function textAsset(
  assetId: string,
  kind: 'HEADLINE' | 'LONG_HEADLINE' | 'DESCRIPTION' | 'BUSINESS_NAME',
  text: string,
): GoogleAdsPlanningAsset {
  return { assetId, kind, text, provenance: provenance(assetId) };
}

function imageAsset(
  assetId: string,
  kind: 'MARKETING_IMAGE' | 'SQUARE_MARKETING_IMAGE' | 'LOGO_IMAGE',
  width: number,
  height: number,
  fileSizeBytes = 1_000_000,
): GoogleAdsPlanningAsset {
  return {
    assetId,
    kind,
    media: {
      mediaReference: `asset:${assetId}`,
      mimeType: 'image/png',
      width,
      height,
      fileSizeBytes,
    },
    provenance: provenance(assetId),
  };
}

function videoAsset(assetId = 'video-1', durationSeconds = 30): GoogleAdsPlanningAsset {
  return {
    assetId,
    kind: 'YOUTUBE_VIDEO',
    media: {
      mediaReference: `youtube:${assetId}`,
      mimeType: 'video/mp4',
      durationSeconds,
    },
    provenance: provenance(assetId),
  };
}

function campaignBrandContext() {
  return {
    source: 'W08_VERIFIED_GOOGLE_ADS_BRAND_CONTEXT',
    brandGuidelinesEnabled: true,
    linkageScope: 'CAMPAIGN',
    businessNameAssetCount: 1,
    logoAssetCount: 1,
    verifiedAt: '2026-09-03T11:00:00.000Z',
    authorizesExecution: false,
  } as const;
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

function displayAssets(): readonly GoogleAdsPlanningAsset[] {
  return [
    textAsset('display-headline', 'HEADLINE', 'Conheça a experiência'),
    textAsset(
      'display-long',
      'LONG_HEADLINE',
      'Descubra uma experiência criada para momentos especiais',
    ),
    textAsset('display-description', 'DESCRIPTION', 'Veja detalhes e planeje sua visita.'),
    textAsset('display-business', 'BUSINESS_NAME', 'Toca do Morcego'),
    imageAsset('display-landscape', 'MARKETING_IMAGE', 1200, 628),
    imageAsset('display-square', 'SQUARE_MARKETING_IMAGE', 600, 600),
  ];
}

function fixture(
  overrides: Partial<GoogleAdsAssetPlanningInput> = {},
  includePerformanceMaxBrandContext = true,
): GoogleAdsAssetPlanningInput {
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
    ...(includePerformanceMaxBrandContext
      ? { performanceMaxBrandContext: campaignBrandContext() }
      : {}),
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
  assert.equal(result.plan.performanceMaxBrandContext?.linkageScope, 'CAMPAIGN');
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
    asset.assetId === 'headline-1' ? textAsset('headline-1', 'HEADLINE', 'x'.repeat(31)) : asset,
  );
  assert.deepEqual(planGoogleAdsAssets(fixture({ assets })), {
    status: 'BLOCKED',
    code: 'ASSET_CONSTRAINT_VIOLATION',
  });
});

test('W13-D requires complete responsive Display text, business-name and image classes', () => {
  const missingSquare = displayAssets().filter((asset) => asset.kind !== 'SQUARE_MARKETING_IMAGE');
  assert.deepEqual(
    planGoogleAdsAssets(fixture({ surface: 'DISPLAY', assets: missingSquare }, false)),
    { status: 'BLOCKED', code: 'MISSING_REQUIRED_ASSET' },
  );

  const result = planGoogleAdsAssets(fixture({ surface: 'DISPLAY', assets: displayAssets() }, false));
  assert.equal(result.status, 'READY');
});

test('W13-D rejects missing or overlong responsive Display business name', () => {
  const missingBusiness = displayAssets().filter((asset) => asset.kind !== 'BUSINESS_NAME');
  assert.deepEqual(
    planGoogleAdsAssets(fixture({ surface: 'DISPLAY', assets: missingBusiness }, false)),
    { status: 'BLOCKED', code: 'MISSING_REQUIRED_ASSET' },
  );

  const overlongBusiness = displayAssets().map((asset) =>
    asset.kind === 'BUSINESS_NAME'
      ? textAsset(asset.assetId, 'BUSINESS_NAME', 'x'.repeat(26))
      : asset,
  );
  assert.deepEqual(
    planGoogleAdsAssets(fixture({ surface: 'DISPLAY', assets: overlongBusiness }, false)),
    { status: 'BLOCKED', code: 'ASSET_CONSTRAINT_VIOLATION' },
  );
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

test('W13-D enforces the documented 5120 KB image and logo file-size boundary', () => {
  const atBoundary = pmaxAssets().map((asset) =>
    asset.assetId === 'square-1'
      ? imageAsset('square-1', 'SQUARE_MARKETING_IMAGE', 600, 600, MAX_IMAGE_FILE_SIZE_BYTES)
      : asset,
  );
  assert.equal(planGoogleAdsAssets(fixture({ assets: atBoundary })).status, 'READY');

  const overBoundary = pmaxAssets().map((asset) =>
    asset.assetId === 'square-1'
      ? imageAsset(
          'square-1',
          'SQUARE_MARKETING_IMAGE',
          600,
          600,
          MAX_IMAGE_FILE_SIZE_BYTES + 1,
        )
      : asset,
  );
  assert.deepEqual(planGoogleAdsAssets(fixture({ assets: overBoundary })), {
    status: 'BLOCKED',
    code: 'ASSET_CONSTRAINT_VIOLATION',
  });
});

test('W13-D requires verified PMax brand context and correct linkage scope', () => {
  assert.deepEqual(planGoogleAdsAssets(fixture({}, false)), {
    status: 'BLOCKED',
    code: 'INVALID_BRAND_CONTEXT',
  });

  assert.deepEqual(
    planGoogleAdsAssets(
      fixture({
        performanceMaxBrandContext: {
          ...campaignBrandContext(),
          linkageScope: 'ASSET_GROUP',
        },
      }),
    ),
    { status: 'BLOCKED', code: 'INVALID_BRAND_CONTEXT' },
  );

  assert.deepEqual(
    planGoogleAdsAssets(
      fixture({
        performanceMaxBrandContext: {
          ...campaignBrandContext(),
          businessNameAssetCount: 0,
        },
      }),
    ),
    { status: 'BLOCKED', code: 'INVALID_BRAND_CONTEXT' },
  );
});

test('W13-D supports asset-group brand assets only when PMax brand guidelines are disabled', () => {
  const assets = [
    ...pmaxAssets(),
    textAsset('business-name-1', 'BUSINESS_NAME', 'Toca do Morcego'),
    imageAsset('brand-logo-1', 'LOGO_IMAGE', 128, 128),
  ];
  const result = planGoogleAdsAssets(
    fixture({
      assets,
      performanceMaxBrandContext: {
        source: 'W08_VERIFIED_GOOGLE_ADS_BRAND_CONTEXT',
        brandGuidelinesEnabled: false,
        linkageScope: 'ASSET_GROUP',
        businessNameAssetCount: 1,
        logoAssetCount: 1,
        verifiedAt: '2026-09-03T11:00:00.000Z',
        authorizesExecution: false,
      },
    }),
  );
  assert.equal(result.status, 'READY');

  assert.deepEqual(
    planGoogleAdsAssets(
      fixture({
        performanceMaxBrandContext: {
          source: 'W08_VERIFIED_GOOGLE_ADS_BRAND_CONTEXT',
          brandGuidelinesEnabled: false,
          linkageScope: 'ASSET_GROUP',
          businessNameAssetCount: 1,
          logoAssetCount: 1,
          verifiedAt: '2026-09-03T11:00:00.000Z',
          authorizesExecution: false,
        },
      }),
    ),
    { status: 'BLOCKED', code: 'INVALID_BRAND_CONTEXT' },
  );
});

test('W13-D requires an explicit YouTube video for YouTube-only planning', () => {
  assert.deepEqual(
    planGoogleAdsAssets(
      fixture({ surface: 'YOUTUBE', assets: [textAsset('youtube-headline', 'HEADLINE', 'Assista agora')] }, false),
    ),
    { status: 'BLOCKED', code: 'MISSING_REQUIRED_ASSET' },
  );

  const result = planGoogleAdsAssets(fixture({ surface: 'YOUTUBE', assets: [videoAsset()] }, false));
  assert.equal(result.status, 'READY');
  if (result.status !== 'READY') return;
  assert.equal(result.plan.constraints.providerAutomationExpected, false);
  assert.equal(result.plan.providerMutation, false);
});

test('W13-D enforces current PMax provider maxima and minimum supplied-video duration', () => {
  const tooManyHeadlines = [
    ...pmaxAssets(),
    ...Array.from({ length: 13 }, (_, index) =>
      textAsset(`extra-headline-${index}`, 'HEADLINE', `Extra headline ${index}`),
    ),
  ];
  assert.deepEqual(planGoogleAdsAssets(fixture({ assets: tooManyHeadlines })), {
    status: 'BLOCKED',
    code: 'MISSING_REQUIRED_ASSET',
  });

  assert.deepEqual(
    planGoogleAdsAssets(fixture({ assets: [...pmaxAssets(), videoAsset('short-video', 9.9)] })),
    { status: 'BLOCKED', code: 'MISSING_REQUIRED_ASSET' },
  );

  const validVideo = planGoogleAdsAssets(
    fixture({ assets: [...pmaxAssets(), videoAsset('valid-video', 10)] }),
  );
  assert.equal(validVideo.status, 'READY');
});

test('W13-D enforces responsive Display combined-media and video maxima', () => {
  const tooManyImages = [
    ...displayAssets(),
    ...Array.from({ length: 14 }, (_, index) =>
      imageAsset(`display-extra-${index}`, 'MARKETING_IMAGE', 1200, 628),
    ),
  ];
  assert.deepEqual(
    planGoogleAdsAssets(fixture({ surface: 'DISPLAY', assets: tooManyImages }, false)),
    { status: 'BLOCKED', code: 'MISSING_REQUIRED_ASSET' },
  );

  const tooManyVideos = [
    ...displayAssets(),
    ...Array.from({ length: 6 }, (_, index) => videoAsset(`display-video-${index}`)),
  ];
  assert.deepEqual(
    planGoogleAdsAssets(fixture({ surface: 'DISPLAY', assets: tooManyVideos }, false)),
    { status: 'BLOCKED', code: 'MISSING_REQUIRED_ASSET' },
  );
});

test('W13-D rejects logo dimensions that match neither supported Google Ads logo ratio', () => {
  assert.deepEqual(
    planGoogleAdsAssets(
      fixture(
        {
          surface: 'DISPLAY',
          assets: [...displayAssets(), imageAsset('invalid-logo', 'LOGO_IMAGE', 400, 300)],
        },
        false,
      ),
    ),
    { status: 'BLOCKED', code: 'ASSET_CONSTRAINT_VIOLATION' },
  );
});

test('W13-D fails closed on provenance, duplicate assets, malformed costs and incompatible capability', () => {
  const [firstPmaxAsset] = pmaxAssets();
  if (!firstPmaxAsset) throw new Error('PMax fixture unexpectedly empty');

  const invalidProvenance: GoogleAdsPlanningAsset = {
    ...firstPmaxAsset,
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

  assert.deepEqual(planGoogleAdsAssets(fixture({ assets: [...pmaxAssets(), firstPmaxAsset] })), {
    status: 'BLOCKED',
    code: 'DUPLICATE_ASSET',
  });

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

const TEMP_W13D_PRETTIER_DIAGNOSTIC_MARKER = true;
test('TEMP W13-D canonical format diagnostic', async () => {
  assert.equal(TEMP_W13D_PRETTIER_DIAGNOSTIC_MARKER, true);
  // @ts-expect-error -- revenue harness has no @types/node; diagnostic is removed before acceptance.
  const { readFile } = await import('node:fs/promises');
  const { format } = await import('prettier');
  const raw = await readFile('packages/revenue/test/w13d-google-ads-asset-planning.test.ts', 'utf8');
  const marker = raw.indexOf('\nconst TEMP_W13D_PRETTIER_DIAGNOSTIC_MARKER');
  const candidate = `${raw.slice(0, marker)}\n`;
  const formatted = await format(candidate, {
    parser: 'typescript',
    arrowParens: 'always',
    endOfLine: 'lf',
    printWidth: 100,
    semi: true,
    singleQuote: true,
    tabWidth: 2,
    trailingComma: 'all',
    useTabs: false,
  });
  console.log('W13D_PRETTIER_OUTPUT_START\n' + formatted + 'W13D_PRETTIER_OUTPUT_END');
});
