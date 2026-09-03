import type { CorrelationContext, TenantId } from '@aurora/contracts';

import type { RevenueCrmQueryItem } from '../crm/types.js';
import type { RevenueEntityKind, RevenueLifecycleState } from '../lifecycle/types.js';
import type {
  ProjectedConfidenceDisposition,
  QualificationEvaluation,
  QualificationStage,
} from '../scoring/types.js';

export type NbaFactStatus = 'VERIFIED_CURRENT' | 'STALE' | 'CONFLICTED' | 'UNKNOWN';

export interface NbaVerifiedFact {
  readonly tenantId: TenantId;
  readonly key: string;
  readonly status: NbaFactStatus;
  readonly sourceSystem: string;
  readonly sourceRevision: string;
  readonly observedAt: string;
  readonly sourceReference?: string;
}

/** Projection of accepted W04 planning and budget evidence; never an execution grant. */
export interface NbaCapabilityPlanProjection {
  readonly source: 'W04_CAPABILITY_PLAN';
  readonly tenantId: TenantId;
  readonly correlationId: string;
  readonly planReference: string;
  readonly registryVersion: string;
  readonly status: 'READY' | 'BLOCKED';
  readonly capabilityId: string;
  readonly budget: {
    readonly budgetReference: string;
    readonly state: 'WITHIN_BUDGET' | 'DEGRADED' | 'EXHAUSTED';
    readonly action: 'CONTINUE_OPTIONAL' | 'DEGRADE_OPTIONAL' | 'STOP_OPTIONAL' | 'HOLD';
    readonly canSkipMandatoryValidation: false;
    readonly authorizesExecution: false;
  };
  readonly authorizesExecution: false;
  readonly canGrantPermission: false;
}

/** Projection of an accepted W05 route when the NBA lane needs reasoning. */
export interface NbaIntelligenceRouteProjection {
  readonly source: 'W05_INTELLIGENCE_ROUTE';
  readonly tenantId: TenantId;
  readonly correlationId: string;
  readonly routeReference: string;
  readonly routeVersion: string;
  readonly status: 'SELECTED' | 'ABSTAINED';
  readonly family?: 'DETERMINISTIC' | 'MODEL' | 'SPECIALIST' | 'HUMAN';
  readonly confidence: {
    readonly evaluationReference: string;
    readonly scoreBps: number | null;
    readonly disposition: ProjectedConfidenceDisposition;
    readonly calibrationInterfaceVersion: string;
    readonly authorizesExecution: false;
    readonly canGrantPermission: false;
  };
  readonly authorizesExecution: false;
  readonly canGrantPermission: false;
}

/** Projection of an accepted W06 minimal-context package. */
export interface NbaContextProjection {
  readonly source: 'W06_MINIMAL_CONTEXT_PACKAGE';
  readonly tenantId: TenantId;
  readonly correlationId: string;
  readonly packageReference: string;
  readonly packageVersion: string;
  readonly compiledAt: string;
  readonly current: boolean;
  readonly conflictingSourceReferences: readonly string[];
  readonly authorizesExecution: false;
  readonly canGrantPermission: false;
}

export const NBA_ACTION_TYPES = [
  'REQUEST_INFORMATION',
  'PREPARE_NURTURE_TOUCH',
  'PREPARE_SALES_HANDOFF',
  'PREPARE_CUSTOMER_SUCCESS_CHECK_IN',
  'PREPARE_CONVERSATION_FOLLOW_UP',
  'NO_ACTION',
] as const;
export type NbaActionType = (typeof NBA_ACTION_TYPES)[number];

export interface NextBestActionRule {
  readonly ruleId: string;
  readonly actionType: NbaActionType;
  readonly entityKinds: readonly RevenueEntityKind[];
  readonly lifecycleStates: readonly RevenueLifecycleState[];
  readonly qualificationStages: readonly QualificationStage[];
  readonly requiredFactKeys: readonly string[];
  readonly priorityBps: number;
  readonly impact: 'INTERNAL_PREPARATION' | 'EXTERNAL_SIDE_EFFECT';
  readonly rationale: string;
  readonly provenanceReferences: readonly string[];
}

export interface NextBestActionPlanningInput {
  readonly tenantId: TenantId;
  readonly correlation: CorrelationContext;
  readonly evaluatedAt: string;
  readonly ruleSetVersion: string;
  readonly reasoningMode: 'DETERMINISTIC' | 'ROUTED';
  readonly crm: RevenueCrmQueryItem;
  readonly qualification: QualificationEvaluation;
  readonly facts: readonly NbaVerifiedFact[];
  readonly capabilityPlan: NbaCapabilityPlanProjection;
  readonly route?: NbaIntelligenceRouteProjection;
  readonly context: NbaContextProjection;
  readonly rules: readonly NextBestActionRule[];
  readonly maxCandidates: number;
}

export interface NextBestActionCandidate {
  readonly candidateId: string;
  readonly actionType: NbaActionType;
  readonly rankBps: number;
  readonly impact: NextBestActionRule['impact'];
  readonly rationale: string;
  readonly requiredFactKeys: readonly string[];
  readonly provenanceReferences: readonly string[];
  readonly requiresGovernedExecution: boolean;
  readonly createsActionIntent: false;
  readonly authorizesExecution: false;
  readonly canGrantPermission: false;
}

export type NextBestActionDisposition = 'SELECTED' | 'ABSTAIN' | 'ESCALATE';

export type NextBestActionReason =
  | 'CANDIDATES_RANKED'
  | 'NO_APPLICABLE_RULE'
  | 'REQUIRED_FACT_UNAVAILABLE'
  | 'CRM_NOT_CURRENT'
  | 'QUALIFICATION_INCOMPLETE'
  | 'QUALIFICATION_REVIEW_REQUIRED'
  | 'CAPABILITY_PLAN_BLOCKED'
  | 'BUDGET_RESTRICTED'
  | 'CONTEXT_NOT_CURRENT'
  | 'CONTEXT_CONFLICT'
  | 'ROUTE_REQUIRED'
  | 'ROUTE_ABSTAINED'
  | 'ROUTE_CONFIDENCE_REQUIRES_REVIEW'
  | 'EXTERNAL_SIDE_EFFECT_REQUIRES_GOVERNED_FLOW';

export interface NextBestActionEvidence {
  readonly crmSourceRevision: string;
  readonly crmEntityVersion: number;
  readonly qualificationRuleSetVersion: string;
  readonly qualificationStage: QualificationStage;
  readonly qualificationScoreBps: number | null;
  readonly qualificationReviewDisposition: QualificationEvaluation['reviewDisposition'];
  readonly capabilityPlanReference: string;
  readonly capabilityRegistryVersion: string;
  readonly budgetReference: string;
  readonly budgetState: NbaCapabilityPlanProjection['budget']['state'];
  readonly budgetAction: NbaCapabilityPlanProjection['budget']['action'];
  readonly contextPackageReference: string;
  readonly contextPackageVersion: string;
  readonly routeReference?: string;
  readonly routeVersion?: string;
  readonly confidenceEvaluationReference?: string;
  readonly confidenceScoreBps?: number | null;
  readonly confidenceDisposition?: ProjectedConfidenceDisposition;
}

export interface NextBestActionPlan {
  readonly kind: 'REVENUE_NEXT_BEST_ACTION_PLAN';
  readonly schemaVersion: '1.0.0';
  readonly tenantId: TenantId;
  readonly correlation: CorrelationContext;
  readonly entity: QualificationEvaluation['entity'];
  readonly entityVersion: number;
  readonly evaluatedAt: string;
  readonly ruleSetVersion: string;
  readonly disposition: NextBestActionDisposition;
  readonly reason: NextBestActionReason;
  readonly candidates: readonly NextBestActionCandidate[];
  readonly evidence: NextBestActionEvidence;
  readonly authoritySemantics: 'DOMAIN_CANDIDATE_ONLY_NO_ACTION_INTENT';
  readonly downstreamExecutionStillRequiresCurrentValidation: true;
  readonly authorizesExecution: false;
  readonly canGrantPermission: false;
}

export const NEXT_BEST_ACTION_ERRORS = [
  'REQUEST_MALFORMED',
  'CRM_MALFORMED',
  'QUALIFICATION_MALFORMED',
  'CONTROL_PROJECTION_MALFORMED',
  'ROUTE_PROJECTION_MALFORMED',
  'CONTEXT_PROJECTION_MALFORMED',
  'TENANT_MISMATCH',
  'CORRELATION_MISMATCH',
  'ENTITY_MISMATCH',
  'ENTITY_VERSION_CONFLICT',
  'FACT_DUPLICATE',
  'FACT_FUTURE_OBSERVATION',
  'RULE_DUPLICATE',
] as const;
export type NextBestActionError = (typeof NEXT_BEST_ACTION_ERRORS)[number];

export type NextBestActionPlanningResult =
  | Readonly<{ ok: true; plan: NextBestActionPlan }>
  | Readonly<{ ok: false; error: NextBestActionError }>;
