import type { CorrelationId, TenantId } from '@aurora/contracts';

export const VERIFIED_FAQ_REASONS = [
  'NO_VERIFIED_FACT',
  'STALE_FACT',
  'SOURCE_CHANGED',
  'MISSING_PROVENANCE',
  'LOW_CONFIDENCE',
  'CONFLICTING_FACTS',
  'TEMPLATE_INVALID',
  'INVALID_EVALUATION_TIME',
  'INVALID_CONFIDENCE_THRESHOLD',
  'INVALID_FACT_TIME',
] as const;
export type VerifiedFaqReason = (typeof VERIFIED_FAQ_REASONS)[number];

export type VerifiedFaqKind = 'HOURS' | 'LOCATION' | 'COMMON_FAQ';

/**
 * Read-only projection of a W06-backed fact. A cache hit or curated fact can
 * accelerate answer planning, but never grants permission to execute a write.
 */
export interface VerifiedFactProjection {
  readonly factId: string;
  readonly tenantId: TenantId;
  readonly kind: VerifiedFaqKind;
  readonly key: string;
  readonly value: string;
  readonly confidence: number;
  readonly sourceReference: string;
  readonly sourceRevision: string;
  readonly expectedSourceRevision: string;
  readonly provenanceReference: string;
  readonly observedAt: string;
  readonly expiresAt: string;
  readonly invalidated: boolean;
  readonly authorizesExecution: false;
}

/** Curated W04/W06 template projection used only to render a deterministic answer. */
export interface VerifiedFaqTemplateProjection {
  readonly templateId: string;
  readonly tenantId: TenantId;
  readonly kind: VerifiedFaqKind;
  readonly key: string;
  readonly body: string;
  readonly active: boolean;
  readonly sourceReference: string;
  readonly sourceRevision: string;
  readonly expectedSourceRevision: string;
  readonly provenanceReference: string;
  readonly authorizesExecution: false;
}

export interface VerifiedFaqLookupInput {
  readonly tenantId: TenantId;
  readonly correlationId: CorrelationId;
  readonly kind: VerifiedFaqKind;
  readonly key: string;
  readonly evaluatedAt: string;
  readonly minimumConfidence: number;
  readonly facts: readonly VerifiedFactProjection[];
  readonly template?: VerifiedFaqTemplateProjection;
}

export type VerifiedFaqLookupResult =
  | Readonly<{
      kind: 'VerifiedFaqLookupResult';
      status: 'ANSWER';
      answer: string;
      factId: string;
      correlationId: CorrelationId;
      evidenceReferences: readonly string[];
      reasons: readonly [];
      authorizesExecution: false;
    }>
  | Readonly<{
      kind: 'VerifiedFaqLookupResult';
      status: 'ESCALATE';
      correlationId: CorrelationId;
      reasons: readonly VerifiedFaqReason[];
      authorizesExecution: false;
    }>;

export interface VerifiedFaqBenchmarkSample {
  readonly baselineLatencyMs: number;
  readonly fastPathLatencyMs: number;
  readonly baselineCostMicros: number;
  readonly fastPathCostMicros: number;
}

export interface VerifiedFaqBenchmarkSummary {
  readonly kind: 'VerifiedFaqBenchmarkSummary';
  readonly sampleCount: number;
  readonly averageBaselineLatencyMs: number;
  readonly averageFastPathLatencyMs: number;
  readonly latencyReductionPercent: number;
  readonly averageBaselineCostMicros: number;
  readonly averageFastPathCostMicros: number;
  readonly costReductionPercent: number;
}

function parseTimestamp(value: string): number | undefined {
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function uniqueReasons(reasons: readonly VerifiedFaqReason[]): readonly VerifiedFaqReason[] {
  return [...new Set(reasons)];
}

function isTemplateUsable(
  template: VerifiedFaqTemplateProjection,
  input: VerifiedFaqLookupInput,
): boolean {
  return (
    template.tenantId === input.tenantId &&
    template.kind === input.kind &&
    template.key === input.key &&
    template.active &&
    template.sourceReference.trim().length > 0 &&
    template.sourceRevision.trim().length > 0 &&
    template.expectedSourceRevision.trim().length > 0 &&
    template.sourceRevision === template.expectedSourceRevision &&
    template.provenanceReference.trim().length > 0 &&
    template.authorizesExecution === false
  );
}

function renderAnswer(template: VerifiedFaqTemplateProjection | undefined, value: string): string {
  if (template === undefined) {
    return value;
  }

  return template.body.replaceAll('{{value}}', value);
}

/**
 * Resolve a deterministic W11-D answer candidate from W06-backed facts.
 * Conflicts, stale data, source drift, weak confidence, or missing provenance
 * fail closed to escalation. This function never performs or authorizes writes.
 */
export function resolveVerifiedFaqFastPath(input: VerifiedFaqLookupInput): VerifiedFaqLookupResult {
  const evaluatedAt = parseTimestamp(input.evaluatedAt);
  if (evaluatedAt === undefined) {
    return {
      kind: 'VerifiedFaqLookupResult',
      status: 'ESCALATE',
      correlationId: input.correlationId,
      reasons: ['INVALID_EVALUATION_TIME'],
      authorizesExecution: false,
    };
  }

  if (
    !Number.isFinite(input.minimumConfidence) ||
    input.minimumConfidence < 0 ||
    input.minimumConfidence > 1
  ) {
    return {
      kind: 'VerifiedFaqLookupResult',
      status: 'ESCALATE',
      correlationId: input.correlationId,
      reasons: ['INVALID_CONFIDENCE_THRESHOLD'],
      authorizesExecution: false,
    };
  }

  const candidates = input.facts.filter(
    (fact) =>
      fact.tenantId === input.tenantId && fact.kind === input.kind && fact.key === input.key,
  );

  if (candidates.length === 0) {
    return {
      kind: 'VerifiedFaqLookupResult',
      status: 'ESCALATE',
      correlationId: input.correlationId,
      reasons: ['NO_VERIFIED_FACT'],
      authorizesExecution: false,
    };
  }

  const reasons: VerifiedFaqReason[] = [];
  const eligible: VerifiedFactProjection[] = [];

  for (const fact of candidates) {
    const observedAt = parseTimestamp(fact.observedAt);
    const expiresAt = parseTimestamp(fact.expiresAt);
    if (
      observedAt === undefined ||
      expiresAt === undefined ||
      observedAt > evaluatedAt ||
      expiresAt <= observedAt
    ) {
      reasons.push('INVALID_FACT_TIME');
      continue;
    }
    if (expiresAt <= evaluatedAt) {
      reasons.push('STALE_FACT');
      continue;
    }

    if (fact.invalidated || fact.sourceRevision !== fact.expectedSourceRevision) {
      reasons.push('SOURCE_CHANGED');
      continue;
    }

    if (
      fact.sourceReference.trim().length === 0 ||
      fact.sourceRevision.trim().length === 0 ||
      fact.expectedSourceRevision.trim().length === 0 ||
      fact.provenanceReference.trim().length === 0
    ) {
      reasons.push('MISSING_PROVENANCE');
      continue;
    }

    if (
      !Number.isFinite(fact.confidence) ||
      fact.confidence < 0 ||
      fact.confidence > 1 ||
      fact.confidence < input.minimumConfidence
    ) {
      reasons.push('LOW_CONFIDENCE');
      continue;
    }

    eligible.push(fact);
  }

  if (eligible.length === 0) {
    return {
      kind: 'VerifiedFaqLookupResult',
      status: 'ESCALATE',
      correlationId: input.correlationId,
      reasons: uniqueReasons(reasons),
      authorizesExecution: false,
    };
  }

  const values = new Set(eligible.map((fact) => fact.value.trim()));
  if (values.size !== 1) {
    return {
      kind: 'VerifiedFaqLookupResult',
      status: 'ESCALATE',
      correlationId: input.correlationId,
      reasons: ['CONFLICTING_FACTS'],
      authorizesExecution: false,
    };
  }

  if (input.template !== undefined && !isTemplateUsable(input.template, input)) {
    return {
      kind: 'VerifiedFaqLookupResult',
      status: 'ESCALATE',
      correlationId: input.correlationId,
      reasons: ['TEMPLATE_INVALID'],
      authorizesExecution: false,
    };
  }

  const selected = eligible[0];
  if (selected === undefined) {
    return {
      kind: 'VerifiedFaqLookupResult',
      status: 'ESCALATE',
      correlationId: input.correlationId,
      reasons: ['NO_VERIFIED_FACT'],
      authorizesExecution: false,
    };
  }

  const evidenceReferences = [selected.provenanceReference, selected.sourceReference];
  if (input.template !== undefined) {
    evidenceReferences.push(input.template.provenanceReference, input.template.sourceReference);
  }

  return {
    kind: 'VerifiedFaqLookupResult',
    status: 'ANSWER',
    answer: renderAnswer(input.template, selected.value),
    factId: selected.factId,
    correlationId: input.correlationId,
    evidenceReferences,
    reasons: [],
    authorizesExecution: false,
  };
}

function average(values: readonly number[]): number {
  if (values.length === 0) {
    return 0;
  }

  return values.reduce((total, value) => total + value, 0) / values.length;
}

function reductionPercent(baseline: number, candidate: number): number {
  if (baseline <= 0) {
    return 0;
  }

  return ((baseline - candidate) / baseline) * 100;
}

/** Quantifies latency/cost improvement without turning the benchmark into authority. */
export function summarizeVerifiedFaqBenchmark(
  samples: readonly VerifiedFaqBenchmarkSample[],
): VerifiedFaqBenchmarkSummary {
  const sanitized = samples.filter(
    (sample) =>
      sample.baselineLatencyMs >= 0 &&
      sample.fastPathLatencyMs >= 0 &&
      sample.baselineCostMicros >= 0 &&
      sample.fastPathCostMicros >= 0 &&
      Number.isFinite(sample.baselineLatencyMs) &&
      Number.isFinite(sample.fastPathLatencyMs) &&
      Number.isFinite(sample.baselineCostMicros) &&
      Number.isFinite(sample.fastPathCostMicros),
  );

  const averageBaselineLatencyMs = average(sanitized.map((sample) => sample.baselineLatencyMs));
  const averageFastPathLatencyMs = average(sanitized.map((sample) => sample.fastPathLatencyMs));
  const averageBaselineCostMicros = average(sanitized.map((sample) => sample.baselineCostMicros));
  const averageFastPathCostMicros = average(sanitized.map((sample) => sample.fastPathCostMicros));

  return {
    kind: 'VerifiedFaqBenchmarkSummary',
    sampleCount: sanitized.length,
    averageBaselineLatencyMs,
    averageFastPathLatencyMs,
    latencyReductionPercent: reductionPercent(averageBaselineLatencyMs, averageFastPathLatencyMs),
    averageBaselineCostMicros,
    averageFastPathCostMicros,
    costReductionPercent: reductionPercent(averageBaselineCostMicros, averageFastPathCostMicros),
  };
}
