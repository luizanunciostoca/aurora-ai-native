import type { CorrelationContext, TenantId } from '@aurora/contracts';
import type { ExecutionOutcome } from '@aurora/contracts/results';

import type { RevenueCrmQueryItem } from '../crm/types.js';
import type { RevenueFastPathSelection } from '../fast-path/types.js';
import type {
  RevenueContactPolicyProjection,
  RevenueFlowPlan,
} from '../flows/types.js';
import type { RevenueEntityRef } from '../lifecycle/types.js';
import type { NextBestActionPlan } from '../nba/types.js';
import type { QualificationEvaluation } from '../scoring/types.js';

export const REVENUE_PROVIDER_READBACK_OBSERVATIONS = [
  'EFFECT_OBSERVED',
  'NO_EFFECT_CONFIRMED',
  'INDETERMINATE',
] as const;
export type RevenueProviderReadbackObservation =
  (typeof REVENUE_PROVIDER_READBACK_OBSERVATIONS)[number];

export const REVENUE_BUSINESS_OUTCOME_TYPES = [
  'LEAD_QUALIFIED',
  'SALES_HANDOFF_ACCEPTED',
  'CONVERSION_RECORDED',
  'CUSTOMER_SUCCESS_ENGAGEMENT',
  'CONVERSATION_RESOLVED',
  'NO_MATERIAL_OUTCOME',
] as const;
export type RevenueBusinessOutcomeType = (typeof REVENUE_BUSINESS_OUTCOME_TYPES)[number];

export const REVENUE_HUMAN_CORRECTION_DISPOSITIONS = [
  'CONFIRM_OUTCOME',
  'REJECT_OUTCOME',
  'REQUIRE_REVIEW',
] as const;
export type RevenueHumanCorrectionDisposition =
  (typeof REVENUE_HUMAN_CORRECTION_DISPOSITIONS)[number];

/**
 * Read-only projection of W07 execution truth. W10-G never creates or mutates
 * execution state and only `VERIFIED` may prove the intended external effect.
 */
export interface RevenueExecutionEvidenceProjection {
  readonly source: 'W07_EXECUTION_RESULT';
  readonly tenantId: TenantId;
  readonly correlationId: string;
  readonly actionIntentReference: string;
  readonly executionReference: string;
  readonly outcome: ExecutionOutcome;
  readonly observedAt: string;
  readonly authoritativeEvidenceReference?: string;
  readonly authorizesExecution: false;
  readonly canGrantPermission: false;
}

/**
 * Read-only W08-F reconciliation projection. Provider readback is evidence for
 * W07; it cannot decide retry or execution authority inside W10.
 */
export interface RevenueProviderReadbackProjection {
  readonly source: 'W08_PROVIDER_READBACK';
  readonly tenantId: TenantId;
  readonly correlationId: string;
  readonly actionIntentReference: string;
  readonly observedAt: string;
  readonly observation: RevenueProviderReadbackObservation;
  readonly reference?: string;
  readonly providerRevision?: string;
  readonly retryAuthorized: false;
  readonly authorizesExecution: false;
  readonly canGrantPermission: false;
}

/** A domain/business fact projection, not permission or adaptive-learning authority. */
export interface RevenueBusinessOutcomeObservation {
  readonly kind: 'REVENUE_BUSINESS_OUTCOME_OBSERVATION';
  readonly schemaVersion: '1.0.0';
  readonly tenantId: TenantId;
  readonly correlationId: string;
  readonly entity: RevenueEntityRef;
  readonly entityVersion: number;
  readonly outcomeType: RevenueBusinessOutcomeType;
  readonly verification: 'VERIFIED_BUSINESS_FACT' | 'UNVERIFIED_OBSERVATION';
  readonly observedAt: string;
  readonly sourceSystem: string;
  readonly sourceRevision: string;
  readonly provenanceReference: string;
  readonly authorizesExecution: false;
  readonly canGrantPermission: false;
}

/** Human correction may adjudicate evidence but never grant execution permission. */
export interface RevenueHumanCorrection {
  readonly kind: 'REVENUE_HUMAN_CORRECTION';
  readonly schemaVersion: '1.0.0';
  readonly correctionId: string;
  readonly tenantId: TenantId;
  readonly correlationId: string;
  readonly entity: RevenueEntityRef;
  readonly entityVersion: number;
  readonly disposition: RevenueHumanCorrectionDisposition;
  readonly observedAt: string;
  readonly rationale: string;
  readonly provenanceReference: string;
  readonly authorizesExecution: false;
  readonly canGrantPermission: false;
}

export interface RevenueIntegrationBudget {
  readonly budgetReference: string;
  readonly maxLatencyMicros: number;
  readonly maxModelCalls: number;
  readonly maxEconomicCostMicrounits: number;
}

/** W10 test/eval proxy only; never represented as provider billing or production SLO. */
export interface RevenueIntegrationMeasurement {
  readonly measurementScope: 'TEST_FIXTURE_PROXY_NOT_PRODUCTION_SLO_OR_PROVIDER_COST';
  readonly latencyMicros: number;
  readonly modelCalls: number;
  readonly economicCostMicrounits: number;
  readonly budget: RevenueIntegrationBudget;
  readonly providerCost: 'NOT_OBSERVED';
  readonly productionSlo: 'NOT_OBSERVED';
}

export interface RevenueIntegrationEvaluationInput {
  readonly evaluationId: string;
  readonly tenantId: TenantId;
  readonly correlation: CorrelationContext;
  readonly evaluatedAt: string;
  readonly entity: RevenueEntityRef;
  readonly entityVersion: number;
  readonly eventReferences: readonly string[];
  readonly crm: RevenueCrmQueryItem;
  readonly qualification: QualificationEvaluation;
  readonly nba: NextBestActionPlan;
  readonly flow?: RevenueFlowPlan;
  readonly fastPath?: RevenueFastPathSelection;
  readonly contactPolicy?: RevenueContactPolicyProjection;
  readonly execution?: RevenueExecutionEvidenceProjection;
  readonly providerReadback?: RevenueProviderReadbackProjection;
  readonly businessOutcome?: RevenueBusinessOutcomeObservation;
  readonly humanCorrection?: RevenueHumanCorrection;
  readonly measurement: RevenueIntegrationMeasurement;
}

export type RevenueIntegrationDisposition = 'PASS' | 'ABSTAIN' | 'ESCALATE';

export type RevenueIntegrationReason =
  | 'INTEGRATION_EVIDENCE_ACCEPTED'
  | 'CRM_NOT_CURRENT'
  | 'QUALIFICATION_INCOMPLETE'
  | 'QUALIFICATION_REVIEW_REQUIRED'
  | 'NBA_ABSTAINED'
  | 'NBA_ESCALATED'
  | 'FLOW_ABSTAINED'
  | 'FLOW_ESCALATED'
  | 'CONSENT_OR_PURPOSE_CHANGED'
  | 'EXECUTION_EVIDENCE_REQUIRED'
  | 'EXECUTION_NOT_ATTEMPTED'
  | 'EXECUTION_REJECTED'
  | 'EXECUTION_FAILED'
  | 'EXECUTION_NOT_VERIFIED'
  | 'RECONCILIATION_REQUIRED'
  | 'EXECUTION_READBACK_CONFLICT'
  | 'BUSINESS_OUTCOME_UNVERIFIED'
  | 'HUMAN_CORRECTION_REQUIRES_REVIEW'
  | 'BUDGET_EXCEEDED';

export type RevenueBusinessOutcomeEvidenceStatus =
  | 'VERIFIED_BUSINESS_OUTCOME'
  | 'UNVERIFIED_BUSINESS_OBSERVATION'
  | 'EXECUTION_VERIFIED_NO_BUSINESS_OUTCOME'
  | 'NO_EXTERNAL_EXECUTION_OR_BUSINESS_OUTCOME'
  | 'HUMAN_REJECTED_OUTCOME';

export interface RevenueBusinessOutcomeEvidence {
  readonly status: RevenueBusinessOutcomeEvidenceStatus;
  readonly outcomeType?: RevenueBusinessOutcomeType;
  readonly businessProvenanceReference?: string;
  readonly executionOutcome?: ExecutionOutcome;
  readonly executionReference?: string;
  readonly providerReadbackObservation?: RevenueProviderReadbackObservation;
  readonly humanCorrectionReference?: string;
  readonly suitableForW17W18Evaluation: boolean;
  readonly adaptiveLearningPromotionAllowed: false;
  readonly authorizesExecution: false;
  readonly canGrantPermission: false;
}

export interface RevenueIntegrationBudgetAssessment {
  readonly budgetReference: string;
  readonly latencyWithinBudget: boolean;
  readonly modelCallsWithinBudget: boolean;
  readonly economicCostWithinBudget: boolean;
  readonly withinBudget: boolean;
  readonly measurementScope: RevenueIntegrationMeasurement['measurementScope'];
  readonly providerCost: 'NOT_OBSERVED';
  readonly productionSlo: 'NOT_OBSERVED';
}

export interface RevenueIntegrationEvaluation {
  readonly kind: 'REVENUE_INTEGRATION_EVALUATION';
  readonly schemaVersion: '1.0.0';
  readonly evaluationId: string;
  readonly tenantId: TenantId;
  readonly correlation: CorrelationContext;
  readonly entity: RevenueEntityRef;
  readonly entityVersion: number;
  readonly evaluatedAt: string;
  readonly disposition: RevenueIntegrationDisposition;
  readonly reason: RevenueIntegrationReason;
  readonly eventReferences: readonly string[];
  readonly evidenceReferences: readonly string[];
  readonly businessOutcome: RevenueBusinessOutcomeEvidence;
  readonly budget: RevenueIntegrationBudgetAssessment;
  readonly downstreamExecutionStillRequiresCurrentValidation: true;
  readonly authoritySemantics: 'INTEGRATION_EVIDENCE_ONLY_NO_ACTION_INTENT';
  readonly adaptiveLearningPromotionAllowed: false;
  readonly authorizesExecution: false;
  readonly canGrantPermission: false;
}

export const REVENUE_INTEGRATION_ERRORS = [
  'REQUEST_MALFORMED',
  'CRM_MALFORMED',
  'QUALIFICATION_MALFORMED',
  'NBA_MALFORMED',
  'FLOW_MALFORMED',
  'FAST_PATH_MALFORMED',
  'CONTACT_POLICY_MALFORMED',
  'EXECUTION_EVIDENCE_MALFORMED',
  'PROVIDER_READBACK_MALFORMED',
  'BUSINESS_OUTCOME_MALFORMED',
  'HUMAN_CORRECTION_MALFORMED',
  'MEASUREMENT_MALFORMED',
  'TENANT_MISMATCH',
  'CORRELATION_MISMATCH',
  'ENTITY_MISMATCH',
  'ENTITY_VERSION_CONFLICT',
  'DUPLICATE_EVENT_REFERENCE',
  'EVIDENCE_FUTURE_OBSERVATION',
  'EXECUTION_READBACK_REFERENCE_MISMATCH',
] as const;
export type RevenueIntegrationError = (typeof REVENUE_INTEGRATION_ERRORS)[number];

export type RevenueIntegrationEvaluationResult =
  | Readonly<{ ok: true; evaluation: RevenueIntegrationEvaluation }>
  | Readonly<{ ok: false; error: RevenueIntegrationError }>;
