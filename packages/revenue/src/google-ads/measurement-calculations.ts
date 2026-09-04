export const GOOGLE_ADS_ATTRIBUTION_MODELS = ['LAST_CLICK', 'DATA_DRIVEN'] as const;
export type GoogleAdsAttributionModel = (typeof GOOGLE_ADS_ATTRIBUTION_MODELS)[number];

export const GOOGLE_ADS_CONVERSION_DATA_STATES = ['COMPLETE', 'DELAYED', 'INCOMPLETE'] as const;
export type GoogleAdsConversionDataState = (typeof GOOGLE_ADS_CONVERSION_DATA_STATES)[number];

export const GOOGLE_ADS_OPTIMIZATION_RECOMMENDATION_KINDS = [
  'WAIT_FOR_COMPLETE_CONVERSION_DATA',
  'REVIEW_LOW_CTR',
  'REVIEW_LOW_CONVERSION_RATE',
  'REVIEW_HIGH_COST_PER_CONVERSION',
] as const;
export type GoogleAdsOptimizationRecommendationKind =
  (typeof GOOGLE_ADS_OPTIMIZATION_RECOMMENDATION_KINDS)[number];

export interface GoogleAdsAttributionPolicy {
  readonly model: GoogleAdsAttributionModel;
  readonly clickWindowDays: number;
  readonly viewWindowDays: number;
}

export interface GoogleAdsAttributionInteraction {
  readonly interactionId: string;
  readonly kind: 'CLICK' | 'VIEW';
  readonly occurredAtMs: number;
}

export interface GoogleAdsMeasurementObservation {
  readonly observationId: string;
  readonly tenantId: string;
  readonly correlationId: string;
  readonly customerId: string;
  readonly managerCustomerId?: string;
  readonly providerBindingReference: string;
  readonly sourceRevision: string;
  readonly campaignId: string;
  readonly agentId: string;
  readonly occurredAtMs: number;
  readonly observedAtMs: number;
  readonly impressions: number;
  readonly clicks: number;
  readonly conversions: number;
  readonly costMicros: number;
  readonly conversionValueMicros: number;
  readonly conversionDataState: GoogleAdsConversionDataState;
}

export interface GoogleAdsCampaignMetrics {
  readonly tenantId: string;
  readonly correlationId: string;
  readonly customerId: string;
  readonly managerCustomerId?: string;
  readonly providerBindingReference: string;
  readonly sourceRevisions: readonly string[];
  readonly campaignId: string;
  readonly agentIds: readonly string[];
  readonly impressions: number;
  readonly clicks: number;
  readonly conversions: number;
  readonly costMicros: number;
  readonly conversionValueMicros: number;
  readonly ctr: number | null;
  readonly conversionRate: number | null;
  readonly costPerConversionMicros: number | null;
  readonly roas: number | null;
  readonly maxLatencyMs: number;
  readonly conversionDataState: GoogleAdsConversionDataState;
  readonly decisionSupportOnly: true;
  readonly authorizesExecution: false;
}

export interface GoogleAdsOptimizationPolicy {
  readonly lowCtrBps: number;
  readonly lowConversionRateBps: number;
  readonly maxCostPerConversionMicros: number;
  readonly minImpressionsForCtr: number;
  readonly minClicksForConversionRate: number;
}

export interface GoogleAdsOptimizationRecommendation {
  readonly recommendationId: string;
  readonly tenantId: string;
  readonly correlationId: string;
  readonly customerId: string;
  readonly campaignId: string;
  readonly kind: GoogleAdsOptimizationRecommendationKind;
  readonly nextStep: 'REVIEW_ONLY';
  readonly authorizesExecution: false;
  readonly canGrantPermission: false;
}

export interface GoogleAdsOptimizationEvaluationInput {
  readonly schema: 'aurora.w13g.optimization_evaluation.v1';
  readonly tenantId: string;
  readonly correlationId: string;
  readonly customerId: string;
  readonly campaignId: string;
  readonly evaluatedAtMs: number;
  readonly sourceRevisions: readonly string[];
  readonly metrics: GoogleAdsCampaignMetrics;
  readonly recommendationKinds: readonly GoogleAdsOptimizationRecommendationKind[];
  readonly conversionDataState: GoogleAdsConversionDataState;
  readonly authorizesExecution: false;
}

export interface GoogleAdsMeasurementTelemetryInput {
  readonly schema: 'aurora.w13g.measurement_telemetry.v1';
  readonly tenantId: string;
  readonly correlationId: string;
  readonly customerId: string;
  readonly evaluatedAtMs: number;
  readonly observationCount: number;
  readonly normalizedObservationCount: number;
  readonly duplicateReplayCount: number;
  readonly campaignCount: number;
  readonly recommendationCount: number;
  readonly delayedOrIncompleteCampaignCount: number;
  readonly maxLatencyMs: number;
  readonly sourceRevisions: readonly string[];
  readonly decisionSupportOnly: true;
  readonly authorizesExecution: false;
}

export interface GoogleAdsMeasurementDecisionSupportInput {
  readonly tenantId: string;
  readonly correlationId: string;
  readonly customerId: string;
  readonly managerCustomerId?: string;
  readonly providerBindingReference: string;
  readonly evaluatedAtMs: number;
  readonly maxObservationAgeMs: number;
  readonly observations: readonly GoogleAdsMeasurementObservation[];
  readonly optimizationPolicy: GoogleAdsOptimizationPolicy;
}

export interface GoogleAdsMeasurementDecisionSupport {
  readonly kind: 'W13_GOOGLE_ADS_MEASUREMENT_DECISION_SUPPORT';
  readonly tenantId: string;
  readonly correlationId: string;
  readonly customerId: string;
  readonly managerCustomerId?: string;
  readonly providerBindingReference: string;
  readonly evaluatedAtMs: number;
  readonly sourceRevisions: readonly string[];
  readonly metrics: readonly GoogleAdsCampaignMetrics[];
  readonly recommendations: readonly GoogleAdsOptimizationRecommendation[];
  readonly evaluationInputs: readonly GoogleAdsOptimizationEvaluationInput[];
  readonly telemetry: GoogleAdsMeasurementTelemetryInput;
  readonly decisionSupportOnly: true;
  readonly authorizesExecution: false;
  readonly canGrantPermission: false;
}

export type GoogleAdsMeasurementDecisionSupportBlockCode =
  | 'INVALID_CONTEXT'
  | 'INVALID_OPTIMIZATION_POLICY'
  | 'INVALID_OBSERVATION'
  | 'OBSERVATION_LIMIT_EXCEEDED'
  | 'SCOPE_MISMATCH'
  | 'FUTURE_OBSERVATION'
  | 'STALE_OBSERVATION'
  | 'CONFLICTING_OBSERVATION_REPLAY'
  | 'NO_VALID_OBSERVATIONS';

export type GoogleAdsMeasurementDecisionSupportResult =
  | { readonly status: 'READY'; readonly decisionSupport: GoogleAdsMeasurementDecisionSupport }
  | { readonly status: 'BLOCKED'; readonly code: GoogleAdsMeasurementDecisionSupportBlockCode };

export type GoogleAdsAttributionEligibility =
  | { readonly status: 'ELIGIBLE'; readonly ageMs: number }
  | { readonly status: 'INELIGIBLE'; readonly reason: 'INVALID_TIME' | 'OUTSIDE_WINDOW' };

const DAY_MS = 24 * 60 * 60 * 1000;
const MAX_MEASUREMENT_OBSERVATIONS = 10_000;

function nonEmpty(value: string): boolean {
  return value.trim().length > 0;
}

function finiteNonNegative(value: number): boolean {
  return Number.isFinite(value) && value >= 0;
}

function validPolicy(policy: GoogleAdsAttributionPolicy): boolean {
  return (
    GOOGLE_ADS_ATTRIBUTION_MODELS.includes(policy.model) &&
    Number.isInteger(policy.clickWindowDays) &&
    policy.clickWindowDays >= 0 &&
    policy.clickWindowDays <= 90 &&
    Number.isInteger(policy.viewWindowDays) &&
    policy.viewWindowDays >= 0 &&
    policy.viewWindowDays <= 30
  );
}

function validOptimizationPolicy(policy: GoogleAdsOptimizationPolicy): boolean {
  return (
    Number.isInteger(policy.lowCtrBps) &&
    policy.lowCtrBps >= 0 &&
    policy.lowCtrBps <= 10_000 &&
    Number.isInteger(policy.lowConversionRateBps) &&
    policy.lowConversionRateBps >= 0 &&
    policy.lowConversionRateBps <= 10_000 &&
    Number.isSafeInteger(policy.maxCostPerConversionMicros) &&
    policy.maxCostPerConversionMicros >= 0 &&
    Number.isSafeInteger(policy.minImpressionsForCtr) &&
    policy.minImpressionsForCtr >= 0 &&
    Number.isSafeInteger(policy.minClicksForConversionRate) &&
    policy.minClicksForConversionRate >= 0
  );
}

export function evaluateGoogleAdsAttributionEligibility(
  conversionOccurredAtMs: number,
  interaction: GoogleAdsAttributionInteraction,
  policy: GoogleAdsAttributionPolicy,
): GoogleAdsAttributionEligibility {
  if (
    !validPolicy(policy) ||
    !Number.isSafeInteger(conversionOccurredAtMs) ||
    !Number.isSafeInteger(interaction.occurredAtMs) ||
    conversionOccurredAtMs < 0 ||
    interaction.occurredAtMs < 0 ||
    conversionOccurredAtMs < interaction.occurredAtMs
  ) {
    return { status: 'INELIGIBLE', reason: 'INVALID_TIME' };
  }

  const ageMs = conversionOccurredAtMs - interaction.occurredAtMs;
  const windowDays = interaction.kind === 'CLICK' ? policy.clickWindowDays : policy.viewWindowDays;
  if (ageMs > windowDays * DAY_MS) {
    return { status: 'INELIGIBLE', reason: 'OUTSIDE_WINDOW' };
  }
  return { status: 'ELIGIBLE', ageMs };
}

function validObservation(observation: GoogleAdsMeasurementObservation): boolean {
  return (
    nonEmpty(observation.observationId) &&
    nonEmpty(observation.tenantId) &&
    nonEmpty(observation.correlationId) &&
    nonEmpty(observation.customerId) &&
    (observation.managerCustomerId === undefined || nonEmpty(observation.managerCustomerId)) &&
    nonEmpty(observation.providerBindingReference) &&
    nonEmpty(observation.sourceRevision) &&
    nonEmpty(observation.campaignId) &&
    nonEmpty(observation.agentId) &&
    Number.isSafeInteger(observation.occurredAtMs) &&
    Number.isSafeInteger(observation.observedAtMs) &&
    observation.occurredAtMs >= 0 &&
    observation.observedAtMs >= observation.occurredAtMs &&
    Number.isSafeInteger(observation.impressions) &&
    Number.isSafeInteger(observation.clicks) &&
    Number.isSafeInteger(observation.conversions) &&
    Number.isSafeInteger(observation.costMicros) &&
    Number.isSafeInteger(observation.conversionValueMicros) &&
    finiteNonNegative(observation.impressions) &&
    finiteNonNegative(observation.clicks) &&
    finiteNonNegative(observation.conversions) &&
    finiteNonNegative(observation.costMicros) &&
    finiteNonNegative(observation.conversionValueMicros) &&
    observation.clicks <= observation.impressions &&
    observation.conversions <= observation.clicks &&
    GOOGLE_ADS_CONVERSION_DATA_STATES.includes(observation.conversionDataState)
  );
}

function ratio(numerator: number, denominator: number): number | null {
  return denominator === 0 ? null : numerator / denominator;
}

function observationFingerprint(observation: GoogleAdsMeasurementObservation): string {
  return JSON.stringify([
    observation.observationId,
    observation.tenantId,
    observation.correlationId,
    observation.customerId,
    observation.managerCustomerId ?? '',
    observation.providerBindingReference,
    observation.sourceRevision,
    observation.campaignId,
    observation.agentId,
    observation.occurredAtMs,
    observation.observedAtMs,
    observation.impressions,
    observation.clicks,
    observation.conversions,
    observation.costMicros,
    observation.conversionValueMicros,
    observation.conversionDataState,
  ]);
}

function scopeFingerprint(observation: GoogleAdsMeasurementObservation): string {
  return JSON.stringify([
    observation.tenantId,
    observation.correlationId,
    observation.customerId,
    observation.managerCustomerId ?? '',
    observation.providerBindingReference,
    observation.campaignId,
  ]);
}

function hasConflictingObservationReplay(
  observations: readonly GoogleAdsMeasurementObservation[],
): boolean {
  const byId = new Map<string, string>();
  for (const observation of observations) {
    const id = observation.observationId.trim();
    const fingerprint = observationFingerprint(observation);
    const existing = byId.get(id);
    if (existing !== undefined && existing !== fingerprint) return true;
    byId.set(id, fingerprint);
  }
  return false;
}

export function normalizeGoogleAdsMeasurementObservations(
  observations: readonly GoogleAdsMeasurementObservation[],
): readonly GoogleAdsMeasurementObservation[] {
  const byId = new Map<string, GoogleAdsMeasurementObservation>();
  for (const observation of observations) {
    if (!validObservation(observation)) continue;
    const normalized = Object.freeze({
      ...observation,
      observationId: observation.observationId.trim(),
      tenantId: observation.tenantId.trim(),
      correlationId: observation.correlationId.trim(),
      customerId: observation.customerId.trim(),
      ...(observation.managerCustomerId
        ? { managerCustomerId: observation.managerCustomerId.trim() }
        : {}),
      providerBindingReference: observation.providerBindingReference.trim(),
      sourceRevision: observation.sourceRevision.trim(),
      campaignId: observation.campaignId.trim(),
      agentId: observation.agentId.trim(),
    });
    const existing = byId.get(normalized.observationId);
    if (!existing || observationFingerprint(normalized) < observationFingerprint(existing)) {
      byId.set(normalized.observationId, normalized);
    }
  }
  return Object.freeze(
    [...byId.values()].sort((left, right) => left.observationId.localeCompare(right.observationId)),
  );
}

function combineConversionDataState(
  observations: readonly GoogleAdsMeasurementObservation[],
): GoogleAdsConversionDataState {
  if (observations.some((observation) => observation.conversionDataState === 'INCOMPLETE')) {
    return 'INCOMPLETE';
  }
  if (observations.some((observation) => observation.conversionDataState === 'DELAYED')) {
    return 'DELAYED';
  }
  return 'COMPLETE';
}

export function aggregateGoogleAdsCampaignMetrics(
  observations: readonly GoogleAdsMeasurementObservation[],
): readonly GoogleAdsCampaignMetrics[] {
  const normalized = normalizeGoogleAdsMeasurementObservations(observations);
  const grouped = new Map<string, GoogleAdsMeasurementObservation[]>();
  for (const observation of normalized) {
    const key = scopeFingerprint(observation);
    const group = grouped.get(key) ?? [];
    group.push(observation);
    grouped.set(key, group);
  }

  const metrics: GoogleAdsCampaignMetrics[] = [];
  for (const key of [...grouped.keys()].sort()) {
    const group = grouped.get(key) ?? [];
    const first = group[0];
    if (!first) continue;
    const impressions = group.reduce((sum, item) => sum + item.impressions, 0);
    const clicks = group.reduce((sum, item) => sum + item.clicks, 0);
    const conversions = group.reduce((sum, item) => sum + item.conversions, 0);
    const costMicros = group.reduce((sum, item) => sum + item.costMicros, 0);
    const conversionValueMicros = group.reduce((sum, item) => sum + item.conversionValueMicros, 0);
    const maxLatencyMs = group.reduce(
      (max, item) => Math.max(max, item.observedAtMs - item.occurredAtMs),
      0,
    );
    metrics.push(
      Object.freeze({
        tenantId: first.tenantId,
        correlationId: first.correlationId,
        customerId: first.customerId,
        ...(first.managerCustomerId ? { managerCustomerId: first.managerCustomerId } : {}),
        providerBindingReference: first.providerBindingReference,
        sourceRevisions: Object.freeze(
          [...new Set(group.map((item) => item.sourceRevision))].sort(),
        ),
        campaignId: first.campaignId,
        agentIds: Object.freeze([...new Set(group.map((item) => item.agentId))].sort()),
        impressions,
        clicks,
        conversions,
        costMicros,
        conversionValueMicros,
        ctr: ratio(clicks, impressions),
        conversionRate: ratio(conversions, clicks),
        costPerConversionMicros: ratio(costMicros, conversions),
        roas: ratio(conversionValueMicros, costMicros),
        maxLatencyMs,
        conversionDataState: combineConversionDataState(group),
        decisionSupportOnly: true,
        authorizesExecution: false,
      }),
    );
  }
  return Object.freeze(metrics);
}

function recommendation(
  metrics: GoogleAdsCampaignMetrics,
  kind: GoogleAdsOptimizationRecommendationKind,
): GoogleAdsOptimizationRecommendation {
  return Object.freeze({
    recommendationId: `w13g:${metrics.customerId}:${metrics.campaignId}:${kind}`,
    tenantId: metrics.tenantId,
    correlationId: metrics.correlationId,
    customerId: metrics.customerId,
    campaignId: metrics.campaignId,
    kind,
    nextStep: 'REVIEW_ONLY',
    authorizesExecution: false,
    canGrantPermission: false,
  });
}

function generateRecommendations(
  metrics: readonly GoogleAdsCampaignMetrics[],
  policy: GoogleAdsOptimizationPolicy,
): readonly GoogleAdsOptimizationRecommendation[] {
  const recommendations: GoogleAdsOptimizationRecommendation[] = [];
  for (const campaign of metrics) {
    if (campaign.conversionDataState !== 'COMPLETE') {
      recommendations.push(recommendation(campaign, 'WAIT_FOR_COMPLETE_CONVERSION_DATA'));
      continue;
    }
    if (
      campaign.impressions >= policy.minImpressionsForCtr &&
      campaign.ctr !== null &&
      campaign.ctr * 10_000 <= policy.lowCtrBps
    ) {
      recommendations.push(recommendation(campaign, 'REVIEW_LOW_CTR'));
    }
    if (
      campaign.clicks >= policy.minClicksForConversionRate &&
      campaign.conversionRate !== null &&
      campaign.conversionRate * 10_000 <= policy.lowConversionRateBps
    ) {
      recommendations.push(recommendation(campaign, 'REVIEW_LOW_CONVERSION_RATE'));
    }
    if (
      campaign.costPerConversionMicros !== null &&
      campaign.costPerConversionMicros >= policy.maxCostPerConversionMicros
    ) {
      recommendations.push(recommendation(campaign, 'REVIEW_HIGH_COST_PER_CONVERSION'));
    }
  }
  return Object.freeze(
    recommendations.sort((left, right) =>
      left.recommendationId.localeCompare(right.recommendationId),
    ),
  );
}

function matchesDecisionSupportScope(
  input: GoogleAdsMeasurementDecisionSupportInput,
  observation: GoogleAdsMeasurementObservation,
): boolean {
  return (
    observation.tenantId === input.tenantId &&
    observation.correlationId === input.correlationId &&
    observation.customerId === input.customerId &&
    observation.managerCustomerId === input.managerCustomerId &&
    observation.providerBindingReference === input.providerBindingReference
  );
}

export function buildGoogleAdsMeasurementDecisionSupport(
  input: GoogleAdsMeasurementDecisionSupportInput,
): GoogleAdsMeasurementDecisionSupportResult {
  if (
    !nonEmpty(input.tenantId) ||
    !nonEmpty(input.correlationId) ||
    !nonEmpty(input.customerId) ||
    (input.managerCustomerId !== undefined && !nonEmpty(input.managerCustomerId)) ||
    !nonEmpty(input.providerBindingReference) ||
    !Number.isSafeInteger(input.evaluatedAtMs) ||
    input.evaluatedAtMs < 0 ||
    !Number.isSafeInteger(input.maxObservationAgeMs) ||
    input.maxObservationAgeMs < 0
  ) {
    return { status: 'BLOCKED', code: 'INVALID_CONTEXT' };
  }
  if (!validOptimizationPolicy(input.optimizationPolicy)) {
    return { status: 'BLOCKED', code: 'INVALID_OPTIMIZATION_POLICY' };
  }
  if (input.observations.length > MAX_MEASUREMENT_OBSERVATIONS) {
    return { status: 'BLOCKED', code: 'OBSERVATION_LIMIT_EXCEEDED' };
  }
  if (input.observations.some((observation) => !validObservation(observation))) {
    return { status: 'BLOCKED', code: 'INVALID_OBSERVATION' };
  }
  if (input.observations.some((observation) => !matchesDecisionSupportScope(input, observation))) {
    return { status: 'BLOCKED', code: 'SCOPE_MISMATCH' };
  }
  if (input.observations.some((observation) => observation.observedAtMs > input.evaluatedAtMs)) {
    return { status: 'BLOCKED', code: 'FUTURE_OBSERVATION' };
  }
  if (
    input.observations.some(
      (observation) => input.evaluatedAtMs - observation.observedAtMs > input.maxObservationAgeMs,
    )
  ) {
    return { status: 'BLOCKED', code: 'STALE_OBSERVATION' };
  }
  if (hasConflictingObservationReplay(input.observations)) {
    return { status: 'BLOCKED', code: 'CONFLICTING_OBSERVATION_REPLAY' };
  }

  const normalized = normalizeGoogleAdsMeasurementObservations(input.observations);
  if (normalized.length === 0) return { status: 'BLOCKED', code: 'NO_VALID_OBSERVATIONS' };

  const metrics = aggregateGoogleAdsCampaignMetrics(normalized);
  const recommendations = generateRecommendations(metrics, input.optimizationPolicy);
  const sourceRevisions = Object.freeze(
    [...new Set(normalized.map((observation) => observation.sourceRevision))].sort(),
  );
  const evaluationInputs = Object.freeze(
    metrics.map((metric) =>
      Object.freeze({
        schema: 'aurora.w13g.optimization_evaluation.v1' as const,
        tenantId: input.tenantId,
        correlationId: input.correlationId,
        customerId: input.customerId,
        campaignId: metric.campaignId,
        evaluatedAtMs: input.evaluatedAtMs,
        sourceRevisions: metric.sourceRevisions,
        metrics: metric,
        recommendationKinds: Object.freeze(
          recommendations
            .filter((item) => item.campaignId === metric.campaignId)
            .map((item) => item.kind),
        ),
        conversionDataState: metric.conversionDataState,
        authorizesExecution: false as const,
      }),
    ),
  );
  const telemetry: GoogleAdsMeasurementTelemetryInput = Object.freeze({
    schema: 'aurora.w13g.measurement_telemetry.v1',
    tenantId: input.tenantId,
    correlationId: input.correlationId,
    customerId: input.customerId,
    evaluatedAtMs: input.evaluatedAtMs,
    observationCount: input.observations.length,
    normalizedObservationCount: normalized.length,
    duplicateReplayCount: input.observations.length - normalized.length,
    campaignCount: metrics.length,
    recommendationCount: recommendations.length,
    delayedOrIncompleteCampaignCount: metrics.filter(
      (metric) => metric.conversionDataState !== 'COMPLETE',
    ).length,
    maxLatencyMs: metrics.reduce((max, metric) => Math.max(max, metric.maxLatencyMs), 0),
    sourceRevisions,
    decisionSupportOnly: true,
    authorizesExecution: false,
  });
  const decisionSupport: GoogleAdsMeasurementDecisionSupport = Object.freeze({
    kind: 'W13_GOOGLE_ADS_MEASUREMENT_DECISION_SUPPORT',
    tenantId: input.tenantId,
    correlationId: input.correlationId,
    customerId: input.customerId,
    ...(input.managerCustomerId ? { managerCustomerId: input.managerCustomerId } : {}),
    providerBindingReference: input.providerBindingReference,
    evaluatedAtMs: input.evaluatedAtMs,
    sourceRevisions,
    metrics,
    recommendations,
    evaluationInputs,
    telemetry,
    decisionSupportOnly: true,
    authorizesExecution: false,
    canGrantPermission: false,
  });
  return { status: 'READY', decisionSupport };
}
