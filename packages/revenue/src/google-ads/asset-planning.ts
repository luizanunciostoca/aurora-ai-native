import type { CorrelationId, TenantId } from '@aurora/contracts';

import type { GoogleAdsCapabilityProjection } from './contracts.js';

export const GOOGLE_ADS_ASSET_PLANNING_SURFACES = [
  'PERFORMANCE_MAX',
  'DISPLAY',
  'YOUTUBE',
] as const;
export type GoogleAdsAssetPlanningSurface = (typeof GOOGLE_ADS_ASSET_PLANNING_SURFACES)[number];

export const GOOGLE_ADS_PLANNING_ASSET_KINDS = [
  'HEADLINE',
  'LONG_HEADLINE',
  'DESCRIPTION',
  'MARKETING_IMAGE',
  'SQUARE_MARKETING_IMAGE',
  'LOGO_IMAGE',
  'YOUTUBE_VIDEO',
] as const;
export type GoogleAdsPlanningAssetKind = (typeof GOOGLE_ADS_PLANNING_ASSET_KINDS)[number];

export interface GoogleAdsAssetProvenance {
  readonly sourceReference: string;
  readonly sourceHash: string;
  readonly verifiedAt: string;
}

export interface GoogleAdsPlanningMedia {
  readonly mediaReference: string;
  readonly mimeType: string;
  readonly width?: number;
  readonly height?: number;
  readonly durationSeconds?: number;
}

export interface GoogleAdsPlanningAsset {
  readonly assetId: string;
  readonly kind: GoogleAdsPlanningAssetKind;
  readonly text?: string;
  readonly media?: GoogleAdsPlanningMedia;
  readonly provenance: GoogleAdsAssetProvenance;
}

export type GoogleAdsCreativeStrategy =
  | {
      readonly mode: 'DETERMINISTIC_TEMPLATE';
      readonly templateId: string;
      readonly rationaleReference: string;
    }
  | {
      readonly mode: 'CUSTOM';
      readonly confidence: number;
      readonly rationaleReference: string;
    };

export interface GoogleAdsExpectedAssetCost {
  readonly currency: string;
  readonly minimumMicros: number;
  readonly maximumMicros: number;
}

export interface GoogleAdsAssetPlanningInput {
  readonly tenantId: TenantId;
  readonly correlationId: CorrelationId;
  readonly planId: string;
  readonly assetGroupKey: string;
  readonly surface: GoogleAdsAssetPlanningSurface;
  readonly customerId: string;
  readonly providerBindingReference: string;
  readonly finalUrl: string;
  readonly capability: GoogleAdsCapabilityProjection;
  readonly strategy: GoogleAdsCreativeStrategy;
  readonly assets: readonly GoogleAdsPlanningAsset[];
  readonly expectedCost?: GoogleAdsExpectedAssetCost;
}

export interface GoogleAdsAssetConstraintSummary {
  readonly profile: 'GOOGLE_ADS_API_2026_08';
  readonly providerAutomationExpected: boolean;
  readonly providerAutomationNotes: readonly string[];
}

export interface GoogleAdsAssetPlan {
  readonly kind: 'W13_GOOGLE_ADS_ASSET_PLAN';
  readonly tenantId: TenantId;
  readonly correlationId: CorrelationId;
  readonly planId: string;
  readonly assetGroupKey: string;
  readonly surface: GoogleAdsAssetPlanningSurface;
  readonly customerId: string;
  readonly providerBindingReference: string;
  readonly finalUrl: string;
  readonly capability: GoogleAdsCapabilityProjection;
  readonly strategy: GoogleAdsCreativeStrategy;
  readonly assets: readonly GoogleAdsPlanningAsset[];
  readonly expectedCost?: GoogleAdsExpectedAssetCost;
  readonly constraints: GoogleAdsAssetConstraintSummary;
  readonly riskClass: 'CREATIVE_PLAN_ONLY' | 'COST_AWARE_CREATIVE_PLAN';
  readonly requiresW08GoogleAdsBinding: true;
  readonly requiresW07Execution: false;
  readonly providerMutation: false;
  readonly authorizesExecution: false;
  readonly canGrantPermission: false;
}

export type GoogleAdsAssetPlanningBlockCode =
  | 'INVALID_PLAN'
  | 'INVALID_ACCOUNT_BINDING'
  | 'INVALID_CAPABILITY'
  | 'INVALID_FINAL_URL'
  | 'INVALID_STRATEGY'
  | 'AMBIGUOUS_CREATIVE_STRATEGY'
  | 'INVALID_COST_ESTIMATE'
  | 'DUPLICATE_ASSET'
  | 'INVALID_PROVENANCE'
  | 'ASSET_CONSTRAINT_VIOLATION'
  | 'MISSING_REQUIRED_ASSET';

export type GoogleAdsAssetPlanningResult =
  | { readonly status: 'READY'; readonly plan: GoogleAdsAssetPlan }
  | { readonly status: 'ESCALATION_REQUIRED'; readonly code: 'AMBIGUOUS_CREATIVE_STRATEGY' }
  | {
      readonly status: 'BLOCKED';
      readonly code: Exclude<GoogleAdsAssetPlanningBlockCode, 'AMBIGUOUS_CREATIVE_STRATEGY'>;
    };

const HASH_PATTERN = /^sha256:[0-9a-f]{64}$/;
const IMAGE_MIME_PATTERN = /^image\/(gif|jpeg|png)$/;
const VIDEO_MIME_PATTERN = /^video\//;
const CUSTOM_STRATEGY_CONFIDENCE_FLOOR = 0.75;

function nonEmpty(value: string): boolean {
  return value.trim().length > 0;
}

function validTimestamp(value: string): boolean {
  return nonEmpty(value) && Number.isFinite(Date.parse(value));
}

function validFinalUrl(value: string): boolean {
  return /^https:\/\/[^\s]+$/i.test(value);
}

function validCost(cost: GoogleAdsExpectedAssetCost): boolean {
  return (
    /^[A-Z]{3}$/.test(cost.currency) &&
    Number.isSafeInteger(cost.minimumMicros) &&
    Number.isSafeInteger(cost.maximumMicros) &&
    cost.minimumMicros >= 0 &&
    cost.maximumMicros >= cost.minimumMicros
  );
}

function imageRatioWithin(
  width: number,
  height: number,
  target: number,
  tolerance: number,
): boolean {
  if (width <= 0 || height <= 0) return false;
  return Math.abs(width / height - target) / target <= tolerance;
}

function validImageMedia(
  media: GoogleAdsPlanningMedia | undefined,
  kind: 'MARKETING_IMAGE' | 'SQUARE_MARKETING_IMAGE' | 'LOGO_IMAGE',
): boolean {
  if (
    !media ||
    !nonEmpty(media.mediaReference) ||
    !IMAGE_MIME_PATTERN.test(media.mimeType) ||
    media.width === undefined ||
    media.height === undefined ||
    !Number.isSafeInteger(media.width) ||
    !Number.isSafeInteger(media.height)
  ) {
    return false;
  }

  if (kind === 'MARKETING_IMAGE') {
    return (
      media.width >= 600 &&
      media.height >= 314 &&
      imageRatioWithin(media.width, media.height, 1.91, 0.01)
    );
  }
  if (kind === 'SQUARE_MARKETING_IMAGE') {
    return (
      media.width >= 300 &&
      media.height >= 300 &&
      imageRatioWithin(media.width, media.height, 1, 0.01)
    );
  }
  const squareLogo =
    media.width >= 128 &&
    media.height >= 128 &&
    imageRatioWithin(media.width, media.height, 1, 0.01);
  const landscapeLogo =
    media.width >= 512 &&
    media.height >= 128 &&
    imageRatioWithin(media.width, media.height, 4, 0.01);
  return squareLogo || landscapeLogo;
}

function validVideoMedia(media: GoogleAdsPlanningMedia | undefined): boolean {
  return (
    !!media &&
    nonEmpty(media.mediaReference) &&
    VIDEO_MIME_PATTERN.test(media.mimeType) &&
    (media.durationSeconds === undefined ||
      (Number.isFinite(media.durationSeconds) && media.durationSeconds > 0))
  );
}

function validAsset(asset: GoogleAdsPlanningAsset): boolean {
  if (!nonEmpty(asset.assetId)) return false;
  if (
    !nonEmpty(asset.provenance.sourceReference) ||
    !HASH_PATTERN.test(asset.provenance.sourceHash) ||
    !validTimestamp(asset.provenance.verifiedAt)
  ) {
    return false;
  }

  switch (asset.kind) {
    case 'HEADLINE':
      return (
        asset.text !== undefined &&
        nonEmpty(asset.text) &&
        asset.text.length <= 30 &&
        asset.media === undefined
      );
    case 'LONG_HEADLINE':
    case 'DESCRIPTION':
      return (
        asset.text !== undefined &&
        nonEmpty(asset.text) &&
        asset.text.length <= 90 &&
        asset.media === undefined
      );
    case 'MARKETING_IMAGE':
    case 'SQUARE_MARKETING_IMAGE':
    case 'LOGO_IMAGE':
      return asset.text === undefined && validImageMedia(asset.media, asset.kind);
    case 'YOUTUBE_VIDEO':
      return asset.text === undefined && validVideoMedia(asset.media);
  }
}

function countKind(
  assets: readonly GoogleAdsPlanningAsset[],
  kind: GoogleAdsPlanningAssetKind,
): number {
  return assets.filter((asset) => asset.kind === kind).length;
}

function hasShortDescription(assets: readonly GoogleAdsPlanningAsset[]): boolean {
  return assets.some(
    (asset) => asset.kind === 'DESCRIPTION' && asset.text !== undefined && asset.text.length <= 60,
  );
}

function satisfiesSurfaceRequirements(
  surface: GoogleAdsAssetPlanningSurface,
  assets: readonly GoogleAdsPlanningAsset[],
): boolean {
  const headlines = countKind(assets, 'HEADLINE');
  const longHeadlines = countKind(assets, 'LONG_HEADLINE');
  const descriptions = countKind(assets, 'DESCRIPTION');
  const marketingImages = countKind(assets, 'MARKETING_IMAGE');
  const squareMarketingImages = countKind(assets, 'SQUARE_MARKETING_IMAGE');
  const logos = countKind(assets, 'LOGO_IMAGE');
  const videos = assets.filter((asset) => asset.kind === 'YOUTUBE_VIDEO');

  if (surface === 'PERFORMANCE_MAX') {
    const videosMeetPmaxDuration = videos.every(
      (asset) => asset.media?.durationSeconds !== undefined && asset.media.durationSeconds >= 10,
    );
    return (
      headlines >= 3 &&
      headlines <= 15 &&
      longHeadlines >= 1 &&
      longHeadlines <= 5 &&
      descriptions >= 2 &&
      descriptions <= 5 &&
      hasShortDescription(assets) &&
      marketingImages >= 1 &&
      marketingImages <= 20 &&
      squareMarketingImages >= 1 &&
      squareMarketingImages <= 20 &&
      logos <= 5 &&
      videos.length <= 15 &&
      videosMeetPmaxDuration
    );
  }

  if (surface === 'DISPLAY') {
    return (
      headlines >= 1 &&
      headlines <= 5 &&
      longHeadlines === 1 &&
      descriptions >= 1 &&
      descriptions <= 5 &&
      marketingImages >= 1 &&
      squareMarketingImages >= 1 &&
      marketingImages + squareMarketingImages <= 15 &&
      logos <= 5 &&
      videos.length <= 5
    );
  }

  return videos.length === 1;
}

function freezeAssets(
  assets: readonly GoogleAdsPlanningAsset[],
): readonly GoogleAdsPlanningAsset[] {
  return Object.freeze(
    [...assets].sort((left, right) => left.assetId.localeCompare(right.assetId)),
  );
}

export function planGoogleAdsAssets(
  input: GoogleAdsAssetPlanningInput,
): GoogleAdsAssetPlanningResult {
  if (!nonEmpty(input.planId) || !nonEmpty(input.assetGroupKey)) {
    return { status: 'BLOCKED', code: 'INVALID_PLAN' };
  }
  if (!nonEmpty(input.customerId) || !nonEmpty(input.providerBindingReference)) {
    return { status: 'BLOCKED', code: 'INVALID_ACCOUNT_BINDING' };
  }
  if (
    input.capability.source !== 'W04_CAPABILITY_REGISTRY' ||
    input.capability.targetKind !== 'PROVIDER' ||
    input.capability.compatibilityKey !== 'google-ads' ||
    input.capability.authorizesExecution !== false ||
    !nonEmpty(input.capability.capabilityId) ||
    !nonEmpty(input.capability.registryVersion)
  ) {
    return { status: 'BLOCKED', code: 'INVALID_CAPABILITY' };
  }
  if (!validFinalUrl(input.finalUrl)) return { status: 'BLOCKED', code: 'INVALID_FINAL_URL' };

  if (input.strategy.mode === 'DETERMINISTIC_TEMPLATE') {
    if (!nonEmpty(input.strategy.templateId) || !nonEmpty(input.strategy.rationaleReference)) {
      return { status: 'BLOCKED', code: 'INVALID_STRATEGY' };
    }
  } else {
    if (
      !Number.isFinite(input.strategy.confidence) ||
      input.strategy.confidence < 0 ||
      input.strategy.confidence > 1 ||
      !nonEmpty(input.strategy.rationaleReference)
    ) {
      return { status: 'BLOCKED', code: 'INVALID_STRATEGY' };
    }
    if (input.strategy.confidence < CUSTOM_STRATEGY_CONFIDENCE_FLOOR) {
      return { status: 'ESCALATION_REQUIRED', code: 'AMBIGUOUS_CREATIVE_STRATEGY' };
    }
  }

  if (input.expectedCost && !validCost(input.expectedCost)) {
    return { status: 'BLOCKED', code: 'INVALID_COST_ESTIMATE' };
  }
  if (input.assets.length === 0) return { status: 'BLOCKED', code: 'MISSING_REQUIRED_ASSET' };

  const assetIds = new Set<string>();
  for (const asset of input.assets) {
    if (assetIds.has(asset.assetId)) return { status: 'BLOCKED', code: 'DUPLICATE_ASSET' };
    assetIds.add(asset.assetId);

    if (
      !nonEmpty(asset.provenance.sourceReference) ||
      !HASH_PATTERN.test(asset.provenance.sourceHash) ||
      !validTimestamp(asset.provenance.verifiedAt)
    ) {
      return { status: 'BLOCKED', code: 'INVALID_PROVENANCE' };
    }
    if (!validAsset(asset)) return { status: 'BLOCKED', code: 'ASSET_CONSTRAINT_VIOLATION' };
  }

  if (!satisfiesSurfaceRequirements(input.surface, input.assets)) {
    return { status: 'BLOCKED', code: 'MISSING_REQUIRED_ASSET' };
  }

  const videoOmitted =
    input.surface === 'PERFORMANCE_MAX' && countKind(input.assets, 'YOUTUBE_VIDEO') === 0;
  const constraints: GoogleAdsAssetConstraintSummary = Object.freeze({
    profile: 'GOOGLE_ADS_API_2026_08',
    providerAutomationExpected: videoOmitted,
    providerAutomationNotes: Object.freeze(
      videoOmitted ? ['PERFORMANCE_MAX_VIDEO_MAY_BE_PROVIDER_GENERATED'] : [],
    ),
  });

  const plan: GoogleAdsAssetPlan = Object.freeze({
    kind: 'W13_GOOGLE_ADS_ASSET_PLAN',
    tenantId: input.tenantId,
    correlationId: input.correlationId,
    planId: input.planId,
    assetGroupKey: input.assetGroupKey,
    surface: input.surface,
    customerId: input.customerId,
    providerBindingReference: input.providerBindingReference,
    finalUrl: input.finalUrl,
    capability: input.capability,
    strategy: input.strategy,
    assets: freezeAssets(input.assets),
    ...(input.expectedCost ? { expectedCost: input.expectedCost } : {}),
    constraints,
    riskClass: input.expectedCost ? 'COST_AWARE_CREATIVE_PLAN' : 'CREATIVE_PLAN_ONLY',
    requiresW08GoogleAdsBinding: true,
    requiresW07Execution: false,
    providerMutation: false,
    authorizesExecution: false,
    canGrantPermission: false,
  });

  return { status: 'READY', plan };
}
