import type { TenantId } from '@aurora/contracts';

import type { MetaAdsResourceKind } from './contracts.js';

export type MetaAdsMeasurementCompleteness = 'COMPLETE' | 'PARTIAL' | 'DELAYED';
export type MetaAdsAttributionWindow =
  | 'PROVIDER_DEFAULT'
  | '1D_VIEW'
  | '1D_CLICK'
  | '7D_CLICK'
  | '28D_CLICK';

export interface MetaAdsAnalyticsBindingProjection {
  readonly source: 'W08_PROVIDER_BINDING';
  readonly tenantId: TenantId;
  readonly provider: 'META_ADS';
  readonly bindingReference: string;
  readonly businessAccountExternalId: string;
  readonly adAccountExternalId: string;
  readonly state: 'ACTIVE' | 'INACTIVE' | 'REVOKED';
  readonly verificationState: 'UNVERIFIED' | 'VERIFIED' | 'STALE';
  readonly bindingVersion: number;
  readonly verifiedAtMs: number;
  readonly authorizesExecution: false;
}

export interface MetaAdsNormalizedMetricsInput {
  readonly impressions: number;
  readonly clicks: number;
  readonly spendMinor: number;
  readonly conversions: number;
  readonly conversionValueMinor: number;
  readonly reach?: number;
}

export interface MetaAdsAnalyticsProvenance {
  readonly source: 'W08_META_ADS_READBACK';
  readonly evidenceRef: string;
  readonly providerQueryId: string;
  readonly observedAtMs: number;
}

export interface MetaAdsRelatedActionEvidence {
  readonly actionId: string;
  readonly evidenceRef: string;
  readonly occurredAtMs: number;
}

export interface MetaAdsAnalyticsInput {
  readonly tenantId: TenantId;
  readonly providerBindingReference: string;
  readonly businessAccountExternalId: string;
  readonly adAccountExternalId: string;
  readonly resourceKind: MetaAdsResourceKind;
  readonly resourceExternalId: string;
  readonly currency: string;
  readonly metrics: MetaAdsNormalizedMetricsInput;
  readonly attributionWindow: MetaAdsAttributionWindow;
  readonly completeness: MetaAdsMeasurementCompleteness;
  readonly dataThroughMs: number;
  readonly nowMs: number;
  readonly maxObservationAgeMs: number;
  readonly maxVerificationAgeMs: number;
  readonly binding: MetaAdsAnalyticsBindingProjection;
  readonly provenance: MetaAdsAnalyticsProvenance;
  readonly relatedAction?: MetaAdsRelatedActionEvidence;
}

export interface MetaAdsAnalyticsProjection {
  readonly projectionKind: 'W12_META_ADS_ANALYTICS_PROJECTION';
  readonly tenantId: TenantId;
  readonly providerBindingReference: string;
  readonly businessAccountExternalId: string;
  readonly adAccountExternalId: string;
  readonly bindingVersion: number;
  readonly resourceKind: MetaAdsResourceKind;
  readonly resourceExternalId: string;
  readonly currency: string;
  readonly metrics: MetaAdsNormalizedMetricsInput;
  readonly attributionWindow: MetaAdsAttributionWindow;
  readonly completeness: MetaAdsMeasurementCompleteness;
  readonly dataThroughMs: number;
  readonly observedAtMs: number;
  readonly observationAgeMs: number;
  readonly verificationAgeMs: number;
  readonly freshness: 'FRESH' | 'STALE';
  readonly provenance: MetaAdsAnalyticsProvenance;
  readonly relatedAction?: MetaAdsRelatedActionEvidence;
  readonly optimizationCandidateEligible: boolean;
  readonly w17TelemetryEligible: true;
  readonly w18EvalEligible: true;
  readonly claimsCausality: false;
  readonly decisionSupportOnly: true;
  readonly authorizesExecution: false;
  readonly canGrantPermission: false;
}

export type MetaAdsAnalyticsBlockCode =
  | 'INVALID_REFERENCE'
  | 'INVALID_TIME_BOUNDARY'
  | 'INVALID_METRICS'
  | 'INVALID_CURRENCY'
  | 'INVALID_PROVENANCE'
  | 'WRONG_TENANT'
  | 'WRONG_PROVIDER'
  | 'WRONG_BINDING'
  | 'WRONG_BUSINESS_ACCOUNT'
  | 'WRONG_AD_ACCOUNT'
  | 'BINDING_INACTIVE'
  | 'BINDING_REVOKED'
  | 'ACCOUNT_NOT_VERIFIED'
  | 'ACCOUNT_VERIFICATION_STALE';

export type MetaAdsAnalyticsResult =
  | Readonly<{ status: 'READY'; projection: MetaAdsAnalyticsProjection }>
  | Readonly<{ status: 'BLOCKED'; code: MetaAdsAnalyticsBlockCode }>;

function nonEmpty(value: string): boolean {
  return value.trim().length > 0;
}

function validIntegerMetric(value: number): boolean {
  return Number.isSafeInteger(value) && value >= 0;
}

function validMetrics(metrics: MetaAdsNormalizedMetricsInput): boolean {
  return (
    validIntegerMetric(metrics.impressions) &&
    validIntegerMetric(metrics.clicks) &&
    validIntegerMetric(metrics.spendMinor) &&
    Number.isFinite(metrics.conversions) &&
    metrics.conversions >= 0 &&
    validIntegerMetric(metrics.conversionValueMinor) &&
    (metrics.reach === undefined || validIntegerMetric(metrics.reach))
  );
}

function validTimeBoundary(input: MetaAdsAnalyticsInput): boolean {
  const values = [
    input.nowMs,
    input.dataThroughMs,
    input.provenance.observedAtMs,
    input.binding.verifiedAtMs,
    input.maxObservationAgeMs,
    input.maxVerificationAgeMs,
  ];
  if (!values.every((value) => Number.isSafeInteger(value) && value >= 0)) return false;
  if (input.provenance.observedAtMs > input.nowMs) return false;
  if (input.dataThroughMs > input.provenance.observedAtMs) return false;
  if (input.binding.verifiedAtMs > input.nowMs) return false;
  if (
    input.relatedAction &&
    (!Number.isSafeInteger(input.relatedAction.occurredAtMs) ||
      input.relatedAction.occurredAtMs < 0 ||
      input.relatedAction.occurredAtMs > input.nowMs)
  ) {
    return false;
  }
  return true;
}

export function normalizeMetaAdsAnalytics(input: MetaAdsAnalyticsInput): MetaAdsAnalyticsResult {
  if (
    !nonEmpty(input.providerBindingReference) ||
    !nonEmpty(input.businessAccountExternalId) ||
    !nonEmpty(input.adAccountExternalId) ||
    !nonEmpty(input.resourceExternalId) ||
    !nonEmpty(input.binding.bindingReference) ||
    !nonEmpty(input.binding.businessAccountExternalId) ||
    !nonEmpty(input.binding.adAccountExternalId)
  ) {
    return { status: 'BLOCKED', code: 'INVALID_REFERENCE' };
  }
  if (!validTimeBoundary(input)) {
    return { status: 'BLOCKED', code: 'INVALID_TIME_BOUNDARY' };
  }
  if (!validMetrics(input.metrics)) {
    return { status: 'BLOCKED', code: 'INVALID_METRICS' };
  }
  if (!/^[A-Z]{3}$/.test(input.currency)) {
    return { status: 'BLOCKED', code: 'INVALID_CURRENCY' };
  }
  if (
    !nonEmpty(input.provenance.evidenceRef) ||
    !nonEmpty(input.provenance.providerQueryId) ||
    (input.relatedAction &&
      (!nonEmpty(input.relatedAction.actionId) || !nonEmpty(input.relatedAction.evidenceRef)))
  ) {
    return { status: 'BLOCKED', code: 'INVALID_PROVENANCE' };
  }
  if (input.binding.tenantId !== input.tenantId) {
    return { status: 'BLOCKED', code: 'WRONG_TENANT' };
  }
  if (input.binding.provider !== 'META_ADS') {
    return { status: 'BLOCKED', code: 'WRONG_PROVIDER' };
  }
  if (input.binding.bindingReference !== input.providerBindingReference) {
    return { status: 'BLOCKED', code: 'WRONG_BINDING' };
  }
  if (input.binding.businessAccountExternalId !== input.businessAccountExternalId) {
    return { status: 'BLOCKED', code: 'WRONG_BUSINESS_ACCOUNT' };
  }
  if (input.binding.adAccountExternalId !== input.adAccountExternalId) {
    return { status: 'BLOCKED', code: 'WRONG_AD_ACCOUNT' };
  }
  if (input.binding.state === 'REVOKED') {
    return { status: 'BLOCKED', code: 'BINDING_REVOKED' };
  }
  if (input.binding.state !== 'ACTIVE') {
    return { status: 'BLOCKED', code: 'BINDING_INACTIVE' };
  }
  if (input.binding.verificationState !== 'VERIFIED') {
    return { status: 'BLOCKED', code: 'ACCOUNT_NOT_VERIFIED' };
  }

  const verificationAgeMs = input.nowMs - input.binding.verifiedAtMs;
  if (verificationAgeMs > input.maxVerificationAgeMs) {
    return { status: 'BLOCKED', code: 'ACCOUNT_VERIFICATION_STALE' };
  }

  const observationAgeMs = input.nowMs - input.provenance.observedAtMs;
  const freshness = observationAgeMs > input.maxObservationAgeMs ? 'STALE' : 'FRESH';
  const optimizationCandidateEligible = freshness === 'FRESH' && input.completeness === 'COMPLETE';

  return {
    status: 'READY',
    projection: {
      projectionKind: 'W12_META_ADS_ANALYTICS_PROJECTION',
      tenantId: input.tenantId,
      providerBindingReference: input.providerBindingReference,
      businessAccountExternalId: input.businessAccountExternalId,
      adAccountExternalId: input.adAccountExternalId,
      bindingVersion: input.binding.bindingVersion,
      resourceKind: input.resourceKind,
      resourceExternalId: input.resourceExternalId,
      currency: input.currency,
      metrics: { ...input.metrics },
      attributionWindow: input.attributionWindow,
      completeness: input.completeness,
      dataThroughMs: input.dataThroughMs,
      observedAtMs: input.provenance.observedAtMs,
      observationAgeMs,
      verificationAgeMs,
      freshness,
      provenance: { ...input.provenance },
      ...(input.relatedAction ? { relatedAction: { ...input.relatedAction } } : {}),
      optimizationCandidateEligible,
      w17TelemetryEligible: true,
      w18EvalEligible: true,
      claimsCausality: false,
      decisionSupportOnly: true,
      authorizesExecution: false,
      canGrantPermission: false,
    },
  };
}
