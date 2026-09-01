import type { CorrelationContext, TenantContext } from '@aurora/contracts';
import type { TaskClassification } from '../classification/types';
import type { ConfidenceEvaluation } from '../confidence/types';
import type { ReasoningLevel, ReasoningLevelResolution } from '../reasoning-level/types';

export const INTELLIGENCE_ROUTE_FAMILIES = [
  'DETERMINISTIC',
  'MODEL',
  'SPECIALIST',
  'COMPUTER_USE_PLANNING',
  'HUMAN',
] as const;
export type IntelligenceRouteFamily = (typeof INTELLIGENCE_ROUTE_FAMILIES)[number];

export interface RouterLaneProjection {
  readonly source: 'W04_LANE_RESOLUTION';
  readonly tenantId: string;
  readonly correlationId: string;
  readonly lane: 'FAST' | 'GOVERNED';
  readonly mandatoryValidations: readonly [
    'CURRENT_POLICY',
    'CURRENT_AUTHORITY',
    'EXECUTOR_PRECONDITIONS',
  ];
  readonly authorizesExecution: false;
}

export interface RouterCapabilityPlanProjection {
  readonly source: 'W04_CAPABILITY_PLAN';
  readonly tenantId: string;
  readonly correlationId: string;
  readonly status: 'READY' | 'BLOCKED';
  readonly registryVersion: string;
  readonly authorizesExecution: false;
}

export interface RouterBudgetProjection {
  readonly source: 'W04_EXECUTION_BUDGET_ASSESSMENT';
  readonly tenantId: string;
  readonly correlationId: string;
  readonly budgetId: string;
  readonly state: 'WITHIN_BUDGET' | 'DEGRADED' | 'EXHAUSTED';
  readonly action: 'CONTINUE_OPTIONAL' | 'DEGRADE_OPTIONAL' | 'STOP_OPTIONAL' | 'HOLD';
  readonly mandatorySafetyValidationRequired: true;
  readonly canSkipMandatoryValidation: false;
  readonly authorizesExecution: false;
}

export interface StrategySelectionCriteria {
  readonly preferredStrategyId: string;
  readonly modality: string;
  readonly taskClass: string;
  readonly reasoningLevel: ReasoningLevel;
  readonly nowEpochMs: number;
}

export type StrategySelectionProjection =
  | {
      readonly status: 'SELECTED';
      readonly strategy: {
        readonly strategyId: string;
        readonly semanticVersion: string;
        readonly kind: IntelligenceRouteFamily;
      };
      readonly selectedVia: 'PREFERRED' | 'FALLBACK';
      readonly currentAvailability: 'CURRENT_AVAILABLE' | 'CURRENT_DEGRADED';
      readonly authorizesExecution: false;
    }
  | {
      readonly status: 'NOT_SELECTED';
      readonly code: 'NOT_FOUND' | 'NO_COMPATIBLE_AVAILABLE_STRATEGY';
      readonly authorizesExecution: false;
    };

/**
 * W05-E remains the unique strategy registry/availability/fallback source of truth.
 * The router consumes it through this port rather than reimplementing registry semantics.
 */
export interface StrategySelectionPort {
  readonly registryVersion: string;
  select(criteria: StrategySelectionCriteria): StrategySelectionProjection;
}

export interface RouterStrategyPreferences {
  readonly deterministic: readonly string[];
  readonly model: readonly string[];
  readonly specialist: readonly string[];
  readonly computerUsePlanning: readonly string[];
  readonly human: readonly string[];
}

export interface IntelligenceRouterRequest {
  readonly tenant: TenantContext;
  readonly correlation: CorrelationContext;
  readonly classification: TaskClassification;
  readonly reasoning: ReasoningLevelResolution;
  readonly confidence: ConfidenceEvaluation;
  readonly lane: RouterLaneProjection;
  readonly capabilityPlan: RouterCapabilityPlanProjection;
  readonly budget: RouterBudgetProjection;
  readonly strategies: StrategySelectionPort;
  readonly preferences: RouterStrategyPreferences;
  readonly nowEpochMs: number;
}

export type IntelligenceRouteReason =
  | 'LOWEST_SUFFICIENT_ROUTE'
  | 'DETERMINISTIC_NO_AI_PREFERRED'
  | 'RISK_REQUIRES_REASONED_ROUTE'
  | 'CONFIDENCE_REQUIRES_VERIFICATION'
  | 'CONFIDENCE_REQUIRES_ESCALATION'
  | 'GOVERNED_COMPUTER_USE_ONLY'
  | 'STRATEGY_FALLBACK_USED'
  | 'DEGRADED_STRATEGY_USED';

export type IntelligenceAbstentionCode =
  | 'CAPABILITY_PLAN_BLOCKED'
  | 'REASONING_HELD'
  | 'CONFIDENCE_ABSTAIN'
  | 'BUDGET_HOLD_OR_EXHAUSTED'
  | 'OPTIONAL_INTELLIGENCE_STOPPED'
  | 'NO_COMPATIBLE_AVAILABLE_STRATEGY'
  | 'INVALID_CONTROL_PROJECTION';

export interface IntelligenceRouteEvidence {
  readonly taskClass: string;
  readonly modality: string;
  readonly reasoningLevel: ReasoningLevel | null;
  readonly confidenceBand: ConfidenceEvaluation['band'];
  readonly confidenceDisposition: ConfidenceEvaluation['disposition'];
  readonly lane: RouterLaneProjection['lane'];
  readonly capabilityPlanStatus: RouterCapabilityPlanProjection['status'];
  readonly budgetState: RouterBudgetProjection['state'];
  readonly budgetAction: RouterBudgetProjection['action'];
  readonly strategyRegistryVersion: string;
  readonly candidateFamilies: readonly IntelligenceRouteFamily[];
}

export type IntelligenceRouteDecision =
  | {
      readonly status: 'SELECTED';
      readonly tenant: TenantContext;
      readonly correlation: CorrelationContext;
      readonly family: IntelligenceRouteFamily;
      readonly strategyId: string;
      readonly strategyVersion: string;
      readonly selectedVia: 'PREFERRED' | 'FALLBACK';
      readonly currentAvailability: 'CURRENT_AVAILABLE' | 'CURRENT_DEGRADED';
      readonly reasons: readonly IntelligenceRouteReason[];
      readonly evidence: IntelligenceRouteEvidence;
      readonly authoritySemantics: 'INTELLIGENCE_ONLY_NO_AUTHORITY';
      readonly downstreamExecutionStillRequiresCurrentValidation: true;
      readonly authorizesExecution: false;
    }
  | {
      readonly status: 'ABSTAINED';
      readonly tenant: TenantContext;
      readonly correlation: CorrelationContext;
      readonly code: IntelligenceAbstentionCode;
      readonly evidence: IntelligenceRouteEvidence;
      readonly recommendedEscalation: 'NONE' | 'HUMAN';
      readonly authoritySemantics: 'INTELLIGENCE_ONLY_NO_AUTHORITY';
      readonly downstreamExecutionStillRequiresCurrentValidation: true;
      readonly authorizesExecution: false;
    };
