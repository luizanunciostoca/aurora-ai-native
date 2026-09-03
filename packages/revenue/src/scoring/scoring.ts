import type { RevenueLifecycleRecord } from '../lifecycle/types.js';
import type {
  QualificationEvaluation,
  QualificationEvaluationInput,
  QualificationEvaluationResult,
  QualificationFeature,
  QualificationFeatureContribution,
  QualificationFreshnessAssessment,
  QualificationFreshnessInput,
  QualificationFreshnessReason,
  QualificationModelAssist,
  QualificationReviewDisposition,
  QualificationStage,
} from './types.js';

const MAX_FEATURES = 64;
const MAX_IDENTIFIER_LENGTH = 512;

function isNonEmptyString(value: unknown, maxLength = MAX_IDENTIFIER_LENGTH): value is string {
  return typeof value === 'string' && value.trim().length > 0 && value.length <= maxLength;
}

function isTimestamp(value: unknown): value is string {
  return isNonEmptyString(value, 128) && Number.isFinite(Date.parse(value));
}

function isSafePositiveInteger(value: unknown): value is number {
  return Number.isSafeInteger(value) && (value as number) >= 1;
}

function isBps(value: unknown): value is number {
  return Number.isInteger(value) && (value as number) >= 0 && (value as number) <= 10_000;
}

function sameEntity(
  left: Readonly<{ kind: string; entityId: string }>,
  right: Readonly<{ kind: string; entityId: string }>,
): boolean {
  return left.kind === right.kind && left.entityId === right.entityId;
}

function recordIsValid(record: RevenueLifecycleRecord): boolean {
  return (
    isNonEmptyString(record?.tenantId) &&
    isNonEmptyString(record?.entity?.entityId) &&
    (record.entity.kind === 'LEAD' ||
      record.entity.kind === 'CUSTOMER' ||
      record.entity.kind === 'CONVERSATION') &&
    isSafePositiveInteger(record.version) &&
    isTimestamp(record.updatedAt) &&
    record.authorizesExecution === false
  );
}

function featureIsValid(feature: QualificationFeature): boolean {
  return (
    isNonEmptyString(feature?.key, 256) &&
    (feature.valueBps === null || isBps(feature.valueBps)) &&
    isBps(feature.weightBps) &&
    feature.weightBps > 0 &&
    typeof feature.critical === 'boolean' &&
    isNonEmptyString(feature.provenance?.tenantId) &&
    isNonEmptyString(feature.provenance?.sourceSystem) &&
    isNonEmptyString(feature.provenance?.sourceRevision) &&
    isTimestamp(feature.provenance?.observedAt) &&
    (feature.provenance.sourceReference === undefined ||
      isNonEmptyString(feature.provenance.sourceReference))
  );
}

function modelAssistIsValid(model: QualificationModelAssist): boolean {
  return (
    isNonEmptyString(model?.tenantId) &&
    isNonEmptyString(model?.modelReference) &&
    isNonEmptyString(model?.modelVersion) &&
    isBps(model?.signalBps) &&
    isTimestamp(model?.evaluatedAt) &&
    isNonEmptyString(model?.provenanceReference) &&
    isNonEmptyString(model?.confidence?.evaluationReference) &&
    (model.confidence.scoreBps === null || isBps(model.confidence.scoreBps)) &&
    (model.confidence.disposition === 'PROCEED_WITH_EVIDENCE' ||
      model.confidence.disposition === 'VERIFY' ||
      model.confidence.disposition === 'ESCALATE' ||
      model.confidence.disposition === 'ABSTAIN') &&
    isNonEmptyString(model.confidence.calibrationInterfaceVersion) &&
    model.confidence.authorizesExecution === false &&
    model.confidence.canGrantPermission === false
  );
}

function thresholdsAreValid(input: QualificationEvaluationInput): boolean {
  return (
    isNonEmptyString(input.thresholds?.version) &&
    isBps(input.thresholds?.qualifiedMinBps) &&
    isBps(input.thresholds?.nurtureMinBps) &&
    input.thresholds.nurtureMinBps <= input.thresholds.qualifiedMinBps
  );
}

function requestShapeIsValid(input: QualificationEvaluationInput): boolean {
  return (
    isNonEmptyString(input?.tenantId) &&
    (input?.entity?.kind === 'LEAD' ||
      input?.entity?.kind === 'CUSTOMER' ||
      input?.entity?.kind === 'CONVERSATION') &&
    isNonEmptyString(input?.entity?.entityId) &&
    isSafePositiveInteger(input?.expectedEntityVersion) &&
    isNonEmptyString(input?.featureSetRevision) &&
    isNonEmptyString(input?.ruleSetVersion) &&
    isTimestamp(input?.evaluatedAt) &&
    isNonEmptyString(input?.correlation?.correlationId) &&
    Array.isArray(input?.features) &&
    input.features.length > 0 &&
    input.features.length <= MAX_FEATURES &&
    isBps(input?.modelAssistWeightBps) &&
    thresholdsAreValid(input)
  );
}

function contribution(feature: QualificationFeature): QualificationFeatureContribution {
  const weightedContributionBps =
    feature.valueBps === null ? 0 : Math.round((feature.valueBps * feature.weightBps) / 10_000);
  return {
    key: feature.key,
    valueBps: feature.valueBps,
    weightBps: feature.weightBps,
    weightedContributionBps,
    critical: feature.critical,
    sourceSystem: feature.provenance.sourceSystem,
    sourceRevision: feature.provenance.sourceRevision,
    observedAt: feature.provenance.observedAt,
    ...(feature.provenance.sourceReference === undefined
      ? {}
      : { sourceReference: feature.provenance.sourceReference }),
  };
}

function stageFor(scoreBps: number, input: QualificationEvaluationInput): QualificationStage {
  if (scoreBps >= input.thresholds.qualifiedMinBps) return 'QUALIFIED';
  if (scoreBps >= input.thresholds.nurtureMinBps) return 'NURTURE';
  return 'UNQUALIFIED';
}

function reviewDisposition(
  model: QualificationModelAssist | undefined,
): QualificationReviewDisposition {
  if (model === undefined || model.confidence.disposition === 'PROCEED_WITH_EVIDENCE')
    return 'NONE';
  if (model.confidence.disposition === 'VERIFY') return 'VERIFY_MODEL_ASSIST';
  if (model.confidence.disposition === 'ESCALATE') return 'ESCALATE_MODEL_ASSIST';
  return 'ABSTAIN_MODEL_ASSIST';
}

function modelSignalCanContribute(model: QualificationModelAssist): boolean {
  return (
    model.confidence.scoreBps !== null &&
    (model.confidence.disposition === 'PROCEED_WITH_EVIDENCE' ||
      model.confidence.disposition === 'VERIFY')
  );
}

export function evaluateQualification(
  record: RevenueLifecycleRecord,
  input: QualificationEvaluationInput,
): QualificationEvaluationResult {
  if (!recordIsValid(record)) return { ok: false, error: 'RECORD_MALFORMED' };
  if (!requestShapeIsValid(input)) return { ok: false, error: 'REQUEST_MALFORMED' };
  if (record.tenantId !== input.tenantId) return { ok: false, error: 'TENANT_MISMATCH' };
  if (!sameEntity(record.entity, input.entity)) return { ok: false, error: 'ENTITY_MISMATCH' };
  if (record.version !== input.expectedEntityVersion) {
    return { ok: false, error: 'ENTITY_VERSION_CONFLICT' };
  }
  if (record.state === 'MERGED') return { ok: false, error: 'ENTITY_NOT_SCORABLE' };
  if (Date.parse(input.evaluatedAt) < Date.parse(record.updatedAt)) {
    return { ok: false, error: 'OUT_OF_ORDER_EVALUATION' };
  }

  const seen = new Set<string>();
  let featureWeightTotal = 0;
  for (const feature of input.features) {
    if (!featureIsValid(feature)) return { ok: false, error: 'REQUEST_MALFORMED' };
    if (feature.provenance.tenantId !== input.tenantId) {
      return { ok: false, error: 'FEATURE_TENANT_MISMATCH' };
    }
    if (Date.parse(feature.provenance.observedAt) > Date.parse(input.evaluatedAt)) {
      return { ok: false, error: 'FEATURE_FUTURE_OBSERVATION' };
    }
    if (seen.has(feature.key)) return { ok: false, error: 'FEATURE_DUPLICATE' };
    seen.add(feature.key);
    featureWeightTotal += feature.weightBps;
  }

  if (featureWeightTotal + input.modelAssistWeightBps !== 10_000) {
    return { ok: false, error: 'WEIGHT_TOTAL_INVALID' };
  }

  if (input.modelAssistWeightBps > 0) {
    if (input.modelAssist === undefined || !modelAssistIsValid(input.modelAssist)) {
      return { ok: false, error: 'MODEL_ASSIST_INVALID' };
    }
    if (
      input.modelAssist.tenantId !== input.tenantId ||
      Date.parse(input.modelAssist.evaluatedAt) > Date.parse(input.evaluatedAt)
    ) {
      return { ok: false, error: 'MODEL_ASSIST_INVALID' };
    }
  } else if (input.modelAssist !== undefined) {
    return { ok: false, error: 'MODEL_ASSIST_INVALID' };
  }

  const ordered = [...input.features].sort((left, right) => left.key.localeCompare(right.key));
  const contributions = ordered.map(contribution);
  const missingCriticalFeatures = ordered
    .filter((feature) => feature.critical && feature.valueBps === null)
    .map((feature) => feature.key);

  const knownFeatureWeight = ordered.reduce(
    (total, feature) => total + (feature.valueBps === null ? 0 : feature.weightBps),
    0,
  );

  let modelContributionBps: number | undefined;
  let modelKnownWeight = 0;
  if (input.modelAssist !== undefined && modelSignalCanContribute(input.modelAssist)) {
    modelContributionBps = Math.round(
      (input.modelAssist.signalBps * input.modelAssistWeightBps) / 10_000,
    );
    modelKnownWeight = input.modelAssistWeightBps;
  }

  const coverageBps = Math.min(10_000, knownFeatureWeight + modelKnownWeight);
  const review = reviewDisposition(input.modelAssist);

  const deterministicScore = contributions.reduce(
    (total, item) => total + item.weightedContributionBps,
    0,
  );

  const scoreBps =
    missingCriticalFeatures.length > 0
      ? null
      : Math.min(10_000, deterministicScore + (modelContributionBps ?? 0));
  const stage = scoreBps === null ? 'INCOMPLETE' : stageFor(scoreBps, input);

  const evaluation: QualificationEvaluation = {
    kind: 'REVENUE_QUALIFICATION_EVALUATION',
    schemaVersion: '1.0.0',
    tenantId: input.tenantId,
    entity: { kind: input.entity.kind, entityId: input.entity.entityId },
    entityVersion: record.version,
    featureSetRevision: input.featureSetRevision,
    ruleSetVersion: input.ruleSetVersion,
    thresholdVersion: input.thresholds.version,
    evaluatedAt: input.evaluatedAt,
    correlation: {
      correlationId: input.correlation.correlationId,
      ...(input.correlation.causation === undefined
        ? {}
        : { causation: { causationId: input.correlation.causation.causationId } }),
    },
    mode: input.modelAssist === undefined ? 'DETERMINISTIC' : 'MODEL_ASSISTED',
    scoreBps,
    stage,
    coverageBps,
    contributions,
    ...(modelContributionBps === undefined ? {} : { modelContributionBps }),
    ...(input.modelAssist === undefined
      ? {}
      : {
          modelReference: input.modelAssist.modelReference,
          modelVersion: input.modelAssist.modelVersion,
          modelConfidenceBps: input.modelAssist.confidence.scoreBps,
          confidenceEvaluationReference: input.modelAssist.confidence.evaluationReference,
        }),
    missingCriticalFeatures,
    reviewDisposition: review,
    authorizesExecution: false,
    canGrantPermission: false,
  };

  return { ok: true, evaluation };
}

export function assessQualificationFreshness(
  previous: QualificationEvaluation,
  current: QualificationFreshnessInput,
): QualificationFreshnessAssessment {
  const reasons: QualificationFreshnessReason[] = [];
  if (previous.entityVersion !== current.entityVersion) reasons.push('ENTITY_VERSION_CHANGED');
  if (previous.featureSetRevision !== current.featureSetRevision) {
    reasons.push('FEATURE_SET_REVISION_CHANGED');
  }
  if (previous.ruleSetVersion !== current.ruleSetVersion) reasons.push('RULE_SET_VERSION_CHANGED');
  if (previous.thresholdVersion !== current.thresholdVersion) {
    reasons.push('THRESHOLD_VERSION_CHANGED');
  }
  if (previous.modelVersion !== current.modelVersion) reasons.push('MODEL_VERSION_CHANGED');
  return {
    current: reasons.length === 0,
    reasons,
    authorizesExecution: false,
  };
}
