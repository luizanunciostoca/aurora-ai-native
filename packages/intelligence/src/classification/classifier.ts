import type {
  ClassificationConfidence,
  ClassificationReasonCode,
  TaskClass,
  TaskClassification,
  TaskClassificationInput,
  TaskComplexity,
  TaskModality,
  TaskReversibility,
  TaskRiskSignal,
} from './types';

const MAX_BOUNDED_COUNT = 100_000;

function boundedCount(value: number | undefined, field: string): number | undefined {
  if (value === undefined) return undefined;
  if (!Number.isSafeInteger(value) || value < 0 || value > MAX_BOUNDED_COUNT) {
    throw new RangeError(`${field}: expected safe integer between 0 and ${MAX_BOUNDED_COUNT}`);
  }
  return value;
}

function taskClass(input: TaskClassificationInput): TaskClass {
  switch (input.operation) {
    case 'LOOKUP': return 'INFORMATIONAL';
    case 'ANALYZE': return 'ANALYTICAL';
    case 'GENERATE':
    case 'TRANSFORM': return 'GENERATIVE';
    case 'PLAN': return 'PLANNING';
    case 'DECIDE': return 'DECISION_SUPPORT';
    case 'EXECUTE': return 'EXECUTION_REQUEST';
    case 'UNKNOWN': return 'UNKNOWN';
  }
}

function modality(input: TaskClassificationInput): TaskModality {
  const unique = [...new Set(input.modalities)];
  if (unique.length === 0) return 'UNKNOWN';
  if (unique.length === 1) return unique[0] as TaskModality;
  return 'MULTIMODAL';
}

function driverWeight(value: number | undefined, boundaries: readonly [number, number]): number {
  if (value === undefined || value === 0) return 0;
  if (value <= boundaries[0]) return 1;
  if (value <= boundaries[1]) return 2;
  return 3;
}

function complexity(input: TaskClassificationInput, resolvedModality: TaskModality): TaskComplexity {
  const estimatedSteps = boundedCount(input.complexityDrivers.estimatedSteps, 'TaskClassificationInput.complexityDrivers.estimatedSteps');
  const dependencyCount = boundedCount(input.complexityDrivers.dependencyCount, 'TaskClassificationInput.complexityDrivers.dependencyCount');
  const externalInteractionCount = boundedCount(input.complexityDrivers.externalInteractionCount, 'TaskClassificationInput.complexityDrivers.externalInteractionCount');
  const hasStructuralDriver = estimatedSteps !== undefined || dependencyCount !== undefined || externalInteractionCount !== undefined || input.complexityDrivers.requiresSpecializedTool !== undefined;
  if (!hasStructuralDriver) return 'UNKNOWN';
  const score = driverWeight(estimatedSteps, [1, 8]) + driverWeight(dependencyCount, [1, 4]) + driverWeight(externalInteractionCount, [1, 3]) + (input.complexityDrivers.requiresSpecializedTool ? 1 : 0) + (resolvedModality === 'MULTIMODAL' ? 1 : 0) + (input.operation === 'EXECUTE' ? 1 : 0);
  if (score === 0) return 'TRIVIAL';
  if (score <= 2) return 'LOW';
  if (score <= 4) return 'MEDIUM';
  if (score <= 6) return 'HIGH';
  return 'VERY_HIGH';
}

function reversibility(input: TaskClassificationInput): TaskReversibility {
  switch (input.sideEffectProfile) {
    case 'NONE': return 'NOT_APPLICABLE';
    case 'REVERSIBLE': return 'REVERSIBLE';
    case 'PARTIALLY_REVERSIBLE': return 'PARTIALLY_REVERSIBLE';
    case 'IRREVERSIBLE': return 'IRREVERSIBLE';
    case 'UNKNOWN': return 'UNKNOWN';
  }
}

function riskSignals(input: TaskClassificationInput): readonly TaskRiskSignal[] {
  const signals = new Set<TaskRiskSignal>(input.riskFacts);
  if (input.sideEffectProfile === 'IRREVERSIBLE') signals.add('IRREVERSIBLE_SIDE_EFFECT');
  if (input.ambiguity === 'HIGH' || input.ambiguity === 'UNKNOWN') signals.add('AMBIGUOUS_REQUIREMENTS');
  if (input.evidenceCompleteness === 'INSUFFICIENT' || input.evidenceCompleteness === 'UNKNOWN') signals.add('INSUFFICIENT_EVIDENCE');
  return [...signals].sort();
}

function classificationConfidence(input: TaskClassificationInput): ClassificationConfidence {
  if (input.evidenceCompleteness === 'INSUFFICIENT' || input.evidenceCompleteness === 'UNKNOWN' || input.ambiguity === 'UNKNOWN') return 'UNKNOWN';
  if (input.ambiguity === 'HIGH') return 'LOW';
  if (input.evidenceCompleteness === 'PARTIAL' || input.ambiguity === 'LOW') return 'MEDIUM';
  return 'HIGH';
}

function reasonCodes(input: TaskClassificationInput, resolvedModality: TaskModality, resolvedComplexity: TaskComplexity): readonly ClassificationReasonCode[] {
  const reasons: ClassificationReasonCode[] = [];
  reasons.push(input.operation === 'UNKNOWN' ? 'TASK_CLASS_UNKNOWN_OPERATION' : 'TASK_CLASS_FROM_OPERATION');
  reasons.push(resolvedModality === 'UNKNOWN' ? 'MODALITY_MISSING' : resolvedModality === 'MULTIMODAL' ? 'MODALITY_MULTIPLE' : 'MODALITY_SINGLE');
  reasons.push(resolvedComplexity === 'UNKNOWN' ? 'COMPLEXITY_INSUFFICIENT_DRIVERS' : 'COMPLEXITY_FROM_BOUNDED_DRIVERS');
  reasons.push(input.sideEffectProfile === 'UNKNOWN' ? 'REVERSIBILITY_UNKNOWN' : 'REVERSIBILITY_FROM_SIDE_EFFECT_PROFILE');
  if (input.riskFacts.length > 0) reasons.push('RISK_FROM_EXPLICIT_FACTS');
  if (input.sideEffectProfile === 'IRREVERSIBLE') reasons.push('RISK_IRREVERSIBILITY_DERIVED');
  if (input.ambiguity === 'HIGH' || input.ambiguity === 'UNKNOWN') reasons.push('RISK_AMBIGUITY_DERIVED');
  if (input.evidenceCompleteness === 'INSUFFICIENT' || input.evidenceCompleteness === 'UNKNOWN') reasons.push('RISK_INSUFFICIENT_EVIDENCE_DERIVED');
  reasons.push('CONFIDENCE_FROM_EVIDENCE_QUALITY');
  return reasons;
}

export function classifyTask(input: TaskClassificationInput): TaskClassification {
  const resolvedModality = modality(input);
  const resolvedComplexity = complexity(input, resolvedModality);
  return Object.freeze({
    tenant: input.tenant,
    correlation: input.correlation,
    taskClass: taskClass(input),
    modality: resolvedModality,
    complexity: resolvedComplexity,
    reversibility: reversibility(input),
    riskSignals: Object.freeze(riskSignals(input)),
    classificationConfidence: classificationConfidence(input),
    reasons: Object.freeze(reasonCodes(input, resolvedModality, resolvedComplexity)),
    authoritySemantics: 'CLASSIFIER_ONLY_NO_AUTHORITY',
  });
}
