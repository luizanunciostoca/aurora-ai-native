import type { MetaAdsAnalyticsProjection } from './analytics.js';

export const META_ADS_OPTIMIZATION_CANDIDATE_KINDS = [
  'REVIEW_CREATIVE',
  'REVIEW_CONVERSION_PATH',
  'REVIEW_COST_EFFICIENCY',
  'HOLD_FOR_MORE_EVIDENCE',
] as const;
export type MetaAdsOptimizationCandidateKind =
  (typeof META_ADS_OPTIMIZATION_CANDIDATE_KINDS)[number];

export type MetaAdsOptimizationNextStep = 'REVIEW_ONLY' | 'HUMAN_REVIEW_REQUIRED' | 'ABSTAIN';
export type MetaAdsOptimizationRisk = 'LOW' | 'MEDIUM' | 'HIGH';

export interface MetaAdsOptimizationPolicy {
  readonly lowCtrBps: number;
  readonly lowConversionRateBps: number;
  readonly maxCostPerConversionMinor: number;
  readonly minImpressions: number;
  readonly minClicks: number;
  readonly minEvidenceScoreBps: number;
  readonly highImpactSpendMinor: number;
}

export interface MetaAdsAdaptiveReasoningAdvisory {
  readonly source: 'ADAPTIVE_REASONING_DECISION_SUPPORT';
  readonly suggestedKind: Exclude<MetaAdsOptimizationCandidateKind, 'HOLD_FOR_MORE_EVIDENCE'>;
  readonly confidenceBps: number;
  readonly authorizesExecution: false;
}

export interface MetaAdsOptimizationInput {
  readonly evaluatedAtMs: number;
  readonly analytics: readonly MetaAdsAnalyticsProjection[];
  readonly policy: MetaAdsOptimizationPolicy;
  readonly evidenceScoreBps: number;
  readonly adaptiveReasoning?: MetaAdsAdaptiveReasoningAdvisory;
}

export interface MetaAdsOptimizationCandidate {
  readonly candidateId: string;
  readonly tenantId: MetaAdsAnalyticsProjection['tenantId'];
  readonly providerBindingReference: string;
  readonly adAccountExternalId: string;
  readonly resourceExternalId: string;
  readonly kind: MetaAdsOptimizationCandidateKind;
  readonly expectedBenefit: Readonly<{ kind: 'ESTIMATE_ONLY'; scoreBps: number }>;
  readonly risk: MetaAdsOptimizationRisk;
  readonly estimatedCostImpactMinor: number;
  readonly confidenceBps: number;
  readonly nextStep: MetaAdsOptimizationNextStep;
  readonly evidenceRef: string;
  readonly actionIntent: null;
  readonly authorizesExecution: false;
  readonly canGrantPermission: false;
}

export interface MetaAdsOptimizationDecisionSupport {
  readonly kind: 'W12_META_ADS_OPTIMIZATION_DECISION_SUPPORT';
  readonly evaluatedAtMs: number;
  readonly candidates: readonly MetaAdsOptimizationCandidate[];
  readonly decisionSupportOnly: true;
  readonly automaticSpendEscalation: false;
  readonly authorizesExecution: false;
  readonly canGrantPermission: false;
}

export interface MetaAdsCounterfactualEvalFixture {
  readonly schema: 'aurora.w12g.counterfactual_eval.v1';
  readonly baselineResourceExternalId: string;
  readonly candidateKind: MetaAdsOptimizationCandidateKind;
  readonly baselineMetric: number | null;
  readonly counterfactualMetric: number | null;
  readonly delta: number | null;
  readonly counterfactualOnly: true;
  readonly authorizesExecution: false;
}

export type MetaAdsOptimizationBlockCode =
  | 'INVALID_POLICY'
  | 'INVALID_EVALUATION_TIME'
  | 'INVALID_EVIDENCE_SCORE'
  | 'INVALID_ADAPTIVE_ADVISORY'
  | 'EMPTY_ANALYTICS'
  | 'CROSS_SCOPE_ANALYTICS';

export type MetaAdsOptimizationResult =
  | Readonly<{ status: 'READY'; decisionSupport: MetaAdsOptimizationDecisionSupport }>
  | Readonly<{ status: 'BLOCKED'; code: MetaAdsOptimizationBlockCode }>;

function validBps(value: number): boolean {
  return Number.isInteger(value) && value >= 0 && value <= 10_000;
}

function validPolicy(policy: MetaAdsOptimizationPolicy): boolean {
  return (
    validBps(policy.lowCtrBps) &&
    validBps(policy.lowConversionRateBps) &&
    Number.isSafeInteger(policy.maxCostPerConversionMinor) &&
    policy.maxCostPerConversionMinor >= 0 &&
    Number.isSafeInteger(policy.minImpressions) &&
    policy.minImpressions >= 0 &&
    Number.isSafeInteger(policy.minClicks) &&
    policy.minClicks >= 0 &&
    validBps(policy.minEvidenceScoreBps) &&
    Number.isSafeInteger(policy.highImpactSpendMinor) &&
    policy.highImpactSpendMinor >= 0
  );
}

function ratio(numerator: number, denominator: number): number | null {
  return denominator === 0 ? null : numerator / denominator;
}

function sameScope(
  first: MetaAdsAnalyticsProjection,
  second: MetaAdsAnalyticsProjection,
): boolean {
  return (
    first.tenantId === second.tenantId &&
    first.providerBindingReference === second.providerBindingReference &&
    first.businessAccountExternalId === second.businessAccountExternalId &&
    first.adAccountExternalId === second.adAccountExternalId
  );
}

function expectedBenefitScore(kind: MetaAdsOptimizationCandidateKind): number {
  switch (kind) {
    case 'REVIEW_CREATIVE':
      return 1_500;
    case 'REVIEW_CONVERSION_PATH':
      return 2_000;
    case 'REVIEW_COST_EFFICIENCY':
      return 2_500;
    case 'HOLD_FOR_MORE_EVIDENCE':
      return 0;
  }
}

function candidate(
  analytics: MetaAdsAnalyticsProjection,
  kind: MetaAdsOptimizationCandidateKind,
  confidenceBps: number,
  policy: MetaAdsOptimizationPolicy,
): MetaAdsOptimizationCandidate {
  const estimatedCostImpactMinor = kind === 'REVIEW_COST_EFFICIENCY' ? analytics.metrics.spendMinor : 0;
  const evidenceWeak =
    !analytics.optimizationCandidateEligible ||
    analytics.freshness !== 'FRESH' ||
    analytics.completeness !== 'COMPLETE';
  const highImpact = estimatedCostImpactMinor >= policy.highImpactSpendMinor;
  const nextStep: MetaAdsOptimizationNextStep =
    kind === 'HOLD_FOR_MORE_EVIDENCE' || evidenceWeak
      ? 'ABSTAIN'
      : highImpact
        ? 'HUMAN_REVIEW_REQUIRED'
        : 'REVIEW_ONLY';
  const risk: MetaAdsOptimizationRisk = highImpact ? 'HIGH' : estimatedCostImpactMinor > 0 ? 'MEDIUM' : 'LOW';
  return Object.freeze({
    candidateId: `w12g:${analytics.adAccountExternalId}:${analytics.resourceExternalId}:${kind}`,
    tenantId: analytics.tenantId,
    providerBindingReference: analytics.providerBindingReference,
    adAccountExternalId: analytics.adAccountExternalId,
    resourceExternalId: analytics.resourceExternalId,
    kind,
    expectedBenefit: Object.freeze({ kind: 'ESTIMATE_ONLY', scoreBps: expectedBenefitScore(kind) }),
    risk,
    estimatedCostImpactMinor,
    confidenceBps,
    nextStep,
    evidenceRef: analytics.provenance.evidenceRef,
    actionIntent: null,
    authorizesExecution: false,
    canGrantPermission: false,
  });
}

export function buildMetaAdsOptimizationDecisionSupport(
  input: MetaAdsOptimizationInput,
): MetaAdsOptimizationResult {
  if (!validPolicy(input.policy)) return { status: 'BLOCKED', code: 'INVALID_POLICY' };
  if (!Number.isSafeInteger(input.evaluatedAtMs) || input.evaluatedAtMs < 0) {
    return { status: 'BLOCKED', code: 'INVALID_EVALUATION_TIME' };
  }
  if (!validBps(input.evidenceScoreBps)) {
    return { status: 'BLOCKED', code: 'INVALID_EVIDENCE_SCORE' };
  }
  if (
    input.adaptiveReasoning &&
    (!validBps(input.adaptiveReasoning.confidenceBps) ||
      input.adaptiveReasoning.authorizesExecution !== false)
  ) {
    return { status: 'BLOCKED', code: 'INVALID_ADAPTIVE_ADVISORY' };
  }
  if (input.analytics.length === 0) return { status: 'BLOCKED', code: 'EMPTY_ANALYTICS' };
  const first = input.analytics[0];
  if (!first || input.analytics.some((item) => !sameScope(first, item))) {
    return { status: 'BLOCKED', code: 'CROSS_SCOPE_ANALYTICS' };
  }

  const candidates: MetaAdsOptimizationCandidate[] = [];
  for (const analytics of [...input.analytics].sort((a, b) =>
    a.resourceExternalId.localeCompare(b.resourceExternalId),
  )) {
    if (
      !analytics.optimizationCandidateEligible ||
      input.evidenceScoreBps < input.policy.minEvidenceScoreBps ||
      analytics.metrics.impressions < input.policy.minImpressions ||
      analytics.metrics.clicks < input.policy.minClicks
    ) {
      candidates.push(candidate(analytics, 'HOLD_FOR_MORE_EVIDENCE', input.evidenceScoreBps, input.policy));
      continue;
    }

    const ctr = ratio(analytics.metrics.clicks, analytics.metrics.impressions);
    const conversionRate = ratio(analytics.metrics.conversions, analytics.metrics.clicks);
    const costPerConversion = ratio(analytics.metrics.spendMinor, analytics.metrics.conversions);
    const kinds = new Set<MetaAdsOptimizationCandidateKind>();
    if (ctr !== null && ctr * 10_000 <= input.policy.lowCtrBps) kinds.add('REVIEW_CREATIVE');
    if (conversionRate !== null && conversionRate * 10_000 <= input.policy.lowConversionRateBps) {
      kinds.add('REVIEW_CONVERSION_PATH');
    }
    if (
      costPerConversion !== null &&
      costPerConversion >= input.policy.maxCostPerConversionMinor
    ) {
      kinds.add('REVIEW_COST_EFFICIENCY');
    }
    if (input.adaptiveReasoning) kinds.add(input.adaptiveReasoning.suggestedKind);

    const confidenceBps = Math.min(
      input.evidenceScoreBps,
      input.adaptiveReasoning?.confidenceBps ?? input.evidenceScoreBps,
    );
    for (const kind of [...kinds].sort()) {
      candidates.push(candidate(analytics, kind, confidenceBps, input.policy));
    }
  }

  return {
    status: 'READY',
    decisionSupport: Object.freeze({
      kind: 'W12_META_ADS_OPTIMIZATION_DECISION_SUPPORT',
      evaluatedAtMs: input.evaluatedAtMs,
      candidates: Object.freeze(candidates),
      decisionSupportOnly: true,
      automaticSpendEscalation: false,
      authorizesExecution: false,
      canGrantPermission: false,
    }),
  };
}

export function buildMetaAdsCounterfactualEvalFixture(
  baseline: MetaAdsAnalyticsProjection,
  counterfactual: MetaAdsAnalyticsProjection,
  candidateKind: MetaAdsOptimizationCandidateKind,
): MetaAdsCounterfactualEvalFixture {
  const metric = (projection: MetaAdsAnalyticsProjection): number | null => {
    switch (candidateKind) {
      case 'REVIEW_CREATIVE':
        return ratio(projection.metrics.clicks, projection.metrics.impressions);
      case 'REVIEW_CONVERSION_PATH':
        return ratio(projection.metrics.conversions, projection.metrics.clicks);
      case 'REVIEW_COST_EFFICIENCY':
        return ratio(projection.metrics.spendMinor, projection.metrics.conversions);
      case 'HOLD_FOR_MORE_EVIDENCE':
        return null;
    }
  };
  const baselineMetric = metric(baseline);
  const counterfactualMetric = metric(counterfactual);
  return Object.freeze({
    schema: 'aurora.w12g.counterfactual_eval.v1',
    baselineResourceExternalId: baseline.resourceExternalId,
    candidateKind,
    baselineMetric,
    counterfactualMetric,
    delta:
      baselineMetric === null || counterfactualMetric === null
        ? null
        : counterfactualMetric - baselineMetric,
    counterfactualOnly: true,
    authorizesExecution: false,
  });
}
