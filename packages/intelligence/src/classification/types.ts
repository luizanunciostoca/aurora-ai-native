import type { CorrelationContext, TenantContext } from '@aurora/contracts';

export const TASK_OPERATIONS = [
  'LOOKUP',
  'ANALYZE',
  'GENERATE',
  'TRANSFORM',
  'PLAN',
  'DECIDE',
  'EXECUTE',
  'UNKNOWN',
] as const;
export type TaskOperation = (typeof TASK_OPERATIONS)[number];

export const TASK_INPUT_MODALITIES = ['TEXT', 'IMAGE', 'AUDIO', 'VIDEO', 'CODE', 'DATA'] as const;
export type TaskInputModality = (typeof TASK_INPUT_MODALITIES)[number];

export type TaskClass =
  | 'INFORMATIONAL'
  | 'ANALYTICAL'
  | 'GENERATIVE'
  | 'PLANNING'
  | 'DECISION_SUPPORT'
  | 'EXECUTION_REQUEST'
  | 'UNKNOWN';

export type TaskModality = TaskInputModality | 'MULTIMODAL' | 'UNKNOWN';

export type TaskComplexity = 'TRIVIAL' | 'LOW' | 'MEDIUM' | 'HIGH' | 'VERY_HIGH' | 'UNKNOWN';

export type TaskReversibility =
  | 'NOT_APPLICABLE'
  | 'REVERSIBLE'
  | 'PARTIALLY_REVERSIBLE'
  | 'IRREVERSIBLE'
  | 'UNKNOWN';

export type TaskSideEffectProfile =
  | 'NONE'
  | 'REVERSIBLE'
  | 'PARTIALLY_REVERSIBLE'
  | 'IRREVERSIBLE'
  | 'UNKNOWN';

export type TaskEvidenceCompleteness = 'COMPLETE' | 'PARTIAL' | 'INSUFFICIENT' | 'UNKNOWN';
export type TaskAmbiguity = 'NONE' | 'LOW' | 'HIGH' | 'UNKNOWN';
export type ClassificationConfidence = 'HIGH' | 'MEDIUM' | 'LOW' | 'UNKNOWN';

export type TaskRiskFact =
  | 'EXTERNAL_SIDE_EFFECT'
  | 'FINANCIAL_IMPACT'
  | 'SENSITIVE_DATA'
  | 'CROSS_TENANT'
  | 'HIGH_STAKES'
  | 'LEGAL_OR_COMPLIANCE'
  | 'CREDENTIAL_OR_SECRET'
  | 'DESTRUCTIVE_CHANGE';

export type TaskRiskSignal =
  | TaskRiskFact
  | 'IRREVERSIBLE_SIDE_EFFECT'
  | 'AMBIGUOUS_REQUIREMENTS'
  | 'INSUFFICIENT_EVIDENCE';

export interface TaskComplexityDrivers {
  /** Estimated logical work units. Must be a safe integer from 0 through 100000 when supplied. */
  readonly estimatedSteps?: number;
  /** Number of explicit upstream/data/tool dependencies. */
  readonly dependencyCount?: number;
  /** Number of bounded external interactions expected by planning; this is not execution authority. */
  readonly externalInteractionCount?: number;
  readonly requiresSpecializedTool?: boolean;
}

export interface TaskClassificationInput {
  readonly tenant: TenantContext;
  readonly correlation: CorrelationContext;
  readonly operation: TaskOperation;
  readonly modalities: readonly TaskInputModality[];
  readonly sideEffectProfile: TaskSideEffectProfile;
  readonly riskFacts: readonly TaskRiskFact[];
  readonly evidenceCompleteness: TaskEvidenceCompleteness;
  readonly ambiguity: TaskAmbiguity;
  readonly complexityDrivers: TaskComplexityDrivers;
}

export type ClassificationReasonCode =
  | 'TASK_CLASS_FROM_OPERATION'
  | 'TASK_CLASS_UNKNOWN_OPERATION'
  | 'MODALITY_SINGLE'
  | 'MODALITY_MULTIPLE'
  | 'MODALITY_MISSING'
  | 'COMPLEXITY_FROM_BOUNDED_DRIVERS'
  | 'COMPLEXITY_INSUFFICIENT_DRIVERS'
  | 'REVERSIBILITY_FROM_SIDE_EFFECT_PROFILE'
  | 'REVERSIBILITY_UNKNOWN'
  | 'RISK_FROM_EXPLICIT_FACTS'
  | 'RISK_IRREVERSIBILITY_DERIVED'
  | 'RISK_AMBIGUITY_DERIVED'
  | 'RISK_INSUFFICIENT_EVIDENCE_DERIVED'
  | 'CONFIDENCE_FROM_EVIDENCE_QUALITY';

export interface TaskClassification {
  readonly tenant: TenantContext;
  readonly correlation: CorrelationContext;
  readonly taskClass: TaskClass;
  readonly modality: TaskModality;
  readonly complexity: TaskComplexity;
  readonly reversibility: TaskReversibility;
  readonly riskSignals: readonly TaskRiskSignal[];
  /** Local classifier evidence confidence only; W05-D owns the broader Confidence Engine. */
  readonly classificationConfidence: ClassificationConfidence;
  readonly reasons: readonly ClassificationReasonCode[];
  /** Compile/runtime guardrail: this output is never permission or executable authority. */
  readonly authoritySemantics: 'CLASSIFIER_ONLY_NO_AUTHORITY';
}
