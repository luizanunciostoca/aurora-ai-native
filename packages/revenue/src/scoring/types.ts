import type { CorrelationContext, TenantId } from '@aurora/contracts';

import type { RevenueEntityRef } from '../lifecycle/types.js';

export const QUALIFICATION_STAGES = ['QUALIFIED', 'NURTURE', 'UNQUALIFIED', 'INCOMPLETE'] as const;
export type QualificationStage = (typeof QUALIFICATION_STAGES)[number];

export const QUALIFICATION_MODES = ['DETERMINISTIC', 'MODEL_ASSISTED'] as const;
export type QualificationMode = (typeof QUALIFICATION_MODES)[number];

export type QualificationReviewDisposition =
  | 'NONE'
  | 'VERIFY_MODEL_ASSIST'
  | 'ESCALATE_MODEL_ASSIST'
  | 'ABSTAIN_MODEL_ASSIST';

export type ProjectedConfidenceDisposition =
  | 'PROCEED_WITH_EVIDENCE'
  | 'VERIFY'
  | 'ESCALATE'
  | 'ABSTAIN';

export interface QualificationFeatureProvenance {
  readonly tenantId: TenantId;
  readonly sourceSystem: string;
  readonly sourceRevision: string;
  readonly observedAt: string;
  readonly sourceReference?: string;
}

export interface QualificationFeature {
  readonly key: string;
  readonly valueBps: number | null;
  readonly weightBps: number;
  readonly critical: boolean;
  readonly provenance: QualificationFeatureProvenance;
}

/**
 * Projection of accepted W05 confidence evidence. This is not a second
 * confidence engine and cannot authorize execution.
 */
export interface QualificationConfidenceProjection {
  readonly evaluationReference: string;
  readonly scoreBps: number | null;
  readonly disposition: ProjectedConfidenceDisposition;
  readonly calibrationInterfaceVersion: string;
  readonly authorizesExecution: false;
  readonly canGrantPermission: false;
}

export interface QualificationModelAssist {
  readonly tenantId: TenantId;
  readonly modelReference: string;
  readonly modelVersion: string;
  readonly signalBps: number;
  readonly evaluatedAt: string;
  readonly provenanceReference: string;
  readonly confidence: QualificationConfidenceProjection;
}

export interface QualificationThresholds {
  readonly version: string;
  readonly qualifiedMinBps: number;
  readonly nurtureMinBps: number;
}

export interface QualificationEvaluationInput {
  readonly tenantId: TenantId;
  readonly entity: RevenueEntityRef;
  readonly expectedEntityVersion: number;
  readonly featureSetRevision: string;
  readonly ruleSetVersion: string;
  readonly evaluatedAt: string;
  readonly correlation: CorrelationContext;
  readonly features: readonly QualificationFeature[];
  readonly modelAssistWeightBps: number;
  readonly modelAssist?: QualificationModelAssist;
  readonly thresholds: QualificationThresholds;
}

export interface QualificationFeatureContribution {
  readonly key: string;
  readonly valueBps: number | null;
  readonly weightBps: number;
  readonly weightedContributionBps: number;
  readonly critical: boolean;
  readonly sourceSystem: string;
  readonly sourceRevision: string;
  readonly observedAt: string;
  readonly sourceReference?: string;
}

export interface QualificationEvaluation {
  readonly kind: 'REVENUE_QUALIFICATION_EVALUATION';
  readonly schemaVersion: '1.0.0';
  readonly tenantId: TenantId;
  readonly entity: RevenueEntityRef;
  readonly entityVersion: number;
  readonly featureSetRevision: string;
  readonly ruleSetVersion: string;
  readonly thresholdVersion: string;
  readonly evaluatedAt: string;
  readonly correlation: CorrelationContext;
  readonly mode: QualificationMode;
  readonly scoreBps: number | null;
  readonly stage: QualificationStage;
  readonly coverageBps: number;
  readonly contributions: readonly QualificationFeatureContribution[];
  readonly modelContributionBps?: number;
  readonly modelReference?: string;
  readonly modelVersion?: string;
  readonly modelConfidenceBps?: number | null;
  readonly confidenceEvaluationReference?: string;
  readonly missingCriticalFeatures: readonly string[];
  readonly reviewDisposition: QualificationReviewDisposition;
  readonly authorizesExecution: false;
  readonly canGrantPermission: false;
}

export const QUALIFICATION_ERRORS = [
  'REQUEST_MALFORMED',
  'RECORD_MALFORMED',
  'TENANT_MISMATCH',
  'ENTITY_MISMATCH',
  'ENTITY_VERSION_CONFLICT',
  'ENTITY_NOT_SCORABLE',
  'OUT_OF_ORDER_EVALUATION',
  'FEATURE_TENANT_MISMATCH',
  'FEATURE_DUPLICATE',
  'WEIGHT_TOTAL_INVALID',
  'MODEL_ASSIST_INVALID',
] as const;
export type QualificationError = (typeof QUALIFICATION_ERRORS)[number];

export type QualificationEvaluationResult =
  | Readonly<{ ok: true; evaluation: QualificationEvaluation }>
  | Readonly<{ ok: false; error: QualificationError }>;

export type QualificationFreshnessReason =
  | 'ENTITY_VERSION_CHANGED'
  | 'FEATURE_SET_REVISION_CHANGED'
  | 'RULE_SET_VERSION_CHANGED'
  | 'THRESHOLD_VERSION_CHANGED'
  | 'MODEL_VERSION_CHANGED';

export interface QualificationFreshnessInput {
  readonly entityVersion: number;
  readonly featureSetRevision: string;
  readonly ruleSetVersion: string;
  readonly thresholdVersion: string;
  readonly modelVersion?: string;
}

export interface QualificationFreshnessAssessment {
  readonly current: boolean;
  readonly reasons: readonly QualificationFreshnessReason[];
  readonly authorizesExecution: false;
}
