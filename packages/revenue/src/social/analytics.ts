import type { CorrelationId, TenantId } from '@aurora/contracts';

export type SocialAnalyticsProviderStatus = 'FRESH' | 'PARTIAL' | 'STALE';

export interface SocialProviderMetrics {
  readonly impressions?: number;
  readonly reactions?: number;
  readonly comments?: number;
  readonly dmEvents?: number;
  readonly replies?: number;
}

/** Provider data is observation only; it never becomes an Aurora business outcome. */
export interface SocialProviderObservation {
  readonly observationId: string;
  readonly tenantId: TenantId;
  readonly accountReference: string;
  readonly providerReference: string;
  readonly publicationReference?: string;
  readonly correlationId: CorrelationId;
  readonly evidenceReference: string;
  readonly observedAt: string;
  readonly staleAfterMs: number;
  readonly partial: boolean;
  readonly metrics: SocialProviderMetrics;
  readonly authorizesExecution: false;
}

export type SocialBusinessOutcomeKind =
  'LEAD_HANDOFF' | 'QUALIFIED_LEAD' | 'CONVERSION' | 'COMMUNITY_RESOLUTION';

/** Canonical Aurora/W10 outcome projection, kept separate from provider counters. */
export interface SocialBusinessOutcome {
  readonly outcomeId: string;
  readonly tenantId: TenantId;
  readonly kind: SocialBusinessOutcomeKind;
  readonly count: number;
  readonly correlationId: CorrelationId;
  readonly evidenceReference: string;
  readonly occurredAt: string;
  readonly authorizesExecution: false;
}

export interface BuildSocialAnalyticsInput {
  readonly tenantId: TenantId;
  readonly evaluatedAt: string;
  readonly providerObservations: readonly SocialProviderObservation[];
  readonly businessOutcomes: readonly SocialBusinessOutcome[];
}

export interface SocialProviderAggregate {
  readonly impressions: number;
  readonly reactions: number;
  readonly comments: number;
  readonly dmEvents: number;
  readonly replies: number;
}

export interface SocialBusinessOutcomeAggregate {
  readonly leadHandoffs: number;
  readonly qualifiedLeads: number;
  readonly conversions: number;
  readonly communityResolutions: number;
}

export interface W17SocialTelemetryProjection {
  readonly kind: 'W17SocialTelemetryProjection';
  readonly providerStatus: SocialAnalyticsProviderStatus;
  readonly providerObservationCount: number;
  readonly staleProviderObservationCount: number;
  readonly partialProviderObservationCount: number;
  readonly businessOutcomeCount: number;
  readonly correlationIds: readonly CorrelationId[];
  readonly evidenceReferences: readonly string[];
  readonly authorizesExecution: false;
}

export interface W18SocialEvalProjection {
  readonly kind: 'W18SocialEvalProjection';
  readonly providerStatus: SocialAnalyticsProviderStatus;
  readonly providerObservationIds: readonly string[];
  readonly businessOutcomeIds: readonly string[];
  readonly hasProviderBusinessOutcomeSeparation: true;
  readonly authorizesExecution: false;
}

export interface SocialAnalyticsReadModel {
  readonly kind: 'SocialAnalyticsReadModel';
  readonly tenantId: TenantId;
  readonly evaluatedAt: string;
  readonly providerStatus: SocialAnalyticsProviderStatus;
  readonly providerMetrics: SocialProviderAggregate;
  readonly businessOutcomes: SocialBusinessOutcomeAggregate;
  readonly rejectedCrossTenantRecords: number;
  readonly telemetry: W17SocialTelemetryProjection;
  readonly eval: W18SocialEvalProjection;
  readonly authorizesExecution: false;
}

function nonNegativeFinite(value: number | undefined): number {
  return value !== undefined && Number.isFinite(value) && value >= 0 ? value : 0;
}

function unique<T>(values: readonly T[]): readonly T[] {
  return [...new Set(values)];
}

function timestamp(value: string): number | undefined {
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function isStale(observation: SocialProviderObservation, evaluatedAt: number | undefined): boolean {
  const observedAt = timestamp(observation.observedAt);
  if (
    evaluatedAt === undefined ||
    observedAt === undefined ||
    !Number.isFinite(observation.staleAfterMs) ||
    observation.staleAfterMs < 0
  ) {
    return true;
  }

  const ageMs = evaluatedAt - observedAt;
  return ageMs < 0 || ageMs > observation.staleAfterMs;
}

function aggregateProvider(
  observations: readonly SocialProviderObservation[],
): SocialProviderAggregate {
  return observations.reduce<SocialProviderAggregate>(
    (aggregate, observation) => ({
      impressions: aggregate.impressions + nonNegativeFinite(observation.metrics.impressions),
      reactions: aggregate.reactions + nonNegativeFinite(observation.metrics.reactions),
      comments: aggregate.comments + nonNegativeFinite(observation.metrics.comments),
      dmEvents: aggregate.dmEvents + nonNegativeFinite(observation.metrics.dmEvents),
      replies: aggregate.replies + nonNegativeFinite(observation.metrics.replies),
    }),
    { impressions: 0, reactions: 0, comments: 0, dmEvents: 0, replies: 0 },
  );
}

function aggregateBusinessOutcomes(
  outcomes: readonly SocialBusinessOutcome[],
): SocialBusinessOutcomeAggregate {
  const aggregate = {
    leadHandoffs: 0,
    qualifiedLeads: 0,
    conversions: 0,
    communityResolutions: 0,
  };

  for (const outcome of outcomes) {
    const count = nonNegativeFinite(outcome.count);
    switch (outcome.kind) {
      case 'LEAD_HANDOFF':
        aggregate.leadHandoffs += count;
        break;
      case 'QUALIFIED_LEAD':
        aggregate.qualifiedLeads += count;
        break;
      case 'CONVERSION':
        aggregate.conversions += count;
        break;
      case 'COMMUNITY_RESOLUTION':
        aggregate.communityResolutions += count;
        break;
    }
  }

  return aggregate;
}

/**
 * Build a read-only W11-G projection. Provider counters remain observations and
 * are never promoted into CRM/business outcomes or execution authority.
 */
export function buildSocialAnalyticsReadModel(
  input: BuildSocialAnalyticsInput,
): SocialAnalyticsReadModel {
  const providerObservations = input.providerObservations.filter(
    (observation) => observation.tenantId === input.tenantId,
  );
  const businessOutcomes = input.businessOutcomes.filter(
    (outcome) => outcome.tenantId === input.tenantId,
  );
  const rejectedCrossTenantRecords =
    input.providerObservations.length -
    providerObservations.length +
    (input.businessOutcomes.length - businessOutcomes.length);

  const evaluatedAt = timestamp(input.evaluatedAt);
  const staleProviderObservations = providerObservations.filter((observation) =>
    isStale(observation, evaluatedAt),
  );
  const partialProviderObservations = providerObservations.filter(
    (observation) => observation.partial,
  );

  const providerStatus: SocialAnalyticsProviderStatus =
    staleProviderObservations.length > 0
      ? 'STALE'
      : partialProviderObservations.length > 0
        ? 'PARTIAL'
        : 'FRESH';

  const correlationIds = unique([
    ...providerObservations.map((observation) => observation.correlationId),
    ...businessOutcomes.map((outcome) => outcome.correlationId),
  ]);
  const evidenceReferences = unique([
    ...providerObservations.map((observation) => observation.evidenceReference),
    ...businessOutcomes.map((outcome) => outcome.evidenceReference),
  ]).filter((reference) => reference.trim().length > 0);

  return {
    kind: 'SocialAnalyticsReadModel',
    tenantId: input.tenantId,
    evaluatedAt: input.evaluatedAt,
    providerStatus,
    providerMetrics: aggregateProvider(providerObservations),
    businessOutcomes: aggregateBusinessOutcomes(businessOutcomes),
    rejectedCrossTenantRecords,
    telemetry: {
      kind: 'W17SocialTelemetryProjection',
      providerStatus,
      providerObservationCount: providerObservations.length,
      staleProviderObservationCount: staleProviderObservations.length,
      partialProviderObservationCount: partialProviderObservations.length,
      businessOutcomeCount: businessOutcomes.length,
      correlationIds,
      evidenceReferences,
      authorizesExecution: false,
    },
    eval: {
      kind: 'W18SocialEvalProjection',
      providerStatus,
      providerObservationIds: providerObservations.map((observation) => observation.observationId),
      businessOutcomeIds: businessOutcomes.map((outcome) => outcome.outcomeId),
      hasProviderBusinessOutcomeSeparation: true,
      authorizesExecution: false,
    },
    authorizesExecution: false,
  };
}
