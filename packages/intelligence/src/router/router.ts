import type { ReasoningLevel } from '../reasoning-level/types';
import type {
  IntelligenceAbstentionCode,
  IntelligenceRouteDecision,
  IntelligenceRouteEvidence,
  IntelligenceRouteFamily,
  IntelligenceRouteReason,
  IntelligenceRouterRequest,
  RouterStrategyPreferences,
} from './types';

function reasoningLevel(request: IntelligenceRouterRequest): ReasoningLevel | null {
  return request.reasoning.status === 'RESOLVED' ? request.reasoning.level : null;
}

function evidence(
  request: IntelligenceRouterRequest,
  candidateFamilies: readonly IntelligenceRouteFamily[],
): IntelligenceRouteEvidence {
  return {
    taskClass: request.classification.taskClass,
    modality: request.classification.modality,
    reasoningLevel: reasoningLevel(request),
    confidenceBand: request.confidence.band,
    confidenceDisposition: request.confidence.disposition,
    lane: request.lane.lane,
    capabilityPlanStatus: request.capabilityPlan.status,
    budgetState: request.budget.state,
    budgetAction: request.budget.action,
    strategyRegistryVersion: request.strategies.registryVersion,
    candidateFamilies,
  };
}

function sameContext(request: IntelligenceRouterRequest): boolean {
  const tenantId = request.tenant.tenantId;
  const correlationId = request.correlation.correlationId;
  return (
    request.classification.tenant.tenantId === tenantId &&
    request.classification.correlation.correlationId === correlationId &&
    request.reasoning.tenant.tenantId === tenantId &&
    request.reasoning.correlation.correlationId === correlationId &&
    request.confidence.tenant.tenantId === tenantId &&
    request.confidence.correlation.correlationId === correlationId &&
    request.lane.tenantId === tenantId &&
    request.lane.correlationId === correlationId &&
    request.capabilityPlan.tenantId === tenantId &&
    request.capabilityPlan.correlationId === correlationId &&
    request.budget.tenantId === tenantId &&
    request.budget.correlationId === correlationId
  );
}

function validControlProjection(request: IntelligenceRouterRequest): boolean {
  return (
    sameContext(request) &&
    request.classification.authoritySemantics === 'CLASSIFIER_ONLY_NO_AUTHORITY' &&
    request.reasoning.authorizesExecution === false &&
    request.reasoning.canSkipMandatoryValidation === false &&
    request.reasoning.mandatorySafetyValidationRequired === true &&
    request.confidence.authorizesExecution === false &&
    request.confidence.canGrantPermission === false &&
    request.lane.source === 'W04_LANE_RESOLUTION' &&
    request.lane.authorizesExecution === false &&
    request.lane.mandatoryValidations.join('|') ===
      'CURRENT_POLICY|CURRENT_AUTHORITY|EXECUTOR_PRECONDITIONS' &&
    request.capabilityPlan.source === 'W04_CAPABILITY_PLAN' &&
    request.capabilityPlan.authorizesExecution === false &&
    request.budget.source === 'W04_EXECUTION_BUDGET_ASSESSMENT' &&
    request.budget.mandatorySafetyValidationRequired === true &&
    request.budget.canSkipMandatoryValidation === false &&
    request.budget.authorizesExecution === false &&
    Number.isFinite(request.nowEpochMs)
  );
}

function abstain(
  request: IntelligenceRouterRequest,
  code: IntelligenceAbstentionCode,
  candidateFamilies: readonly IntelligenceRouteFamily[],
  recommendedEscalation: 'NONE' | 'HUMAN',
): IntelligenceRouteDecision {
  return {
    status: 'ABSTAINED',
    tenant: request.tenant,
    correlation: request.correlation,
    code,
    evidence: evidence(request, candidateFamilies),
    recommendedEscalation,
    authoritySemantics: 'INTELLIGENCE_ONLY_NO_AUTHORITY',
    downstreamExecutionStillRequiresCurrentValidation: true,
    authorizesExecution: false,
  };
}

function baseFamilies(level: ReasoningLevel): IntelligenceRouteFamily[] {
  switch (level) {
    case 'L0':
    case 'L1':
    case 'L2':
      return ['DETERMINISTIC', 'MODEL', 'SPECIALIST', 'COMPUTER_USE_PLANNING', 'HUMAN'];
    case 'L3':
    case 'L4':
      return ['MODEL', 'SPECIALIST', 'COMPUTER_USE_PLANNING', 'HUMAN'];
    case 'L5':
      return ['SPECIALIST', 'MODEL', 'COMPUTER_USE_PLANNING', 'HUMAN'];
  }
}

function candidateFamilies(request: IntelligenceRouterRequest, level: ReasoningLevel): IntelligenceRouteFamily[] {
  let families = baseFamilies(level);
  if (request.classification.riskSignals.length > 0) {
    families = families.filter((family) => family !== 'DETERMINISTIC');
  }
  if (request.confidence.disposition === 'VERIFY') {
    families = families.filter((family) => family !== 'DETERMINISTIC');
  } else if (request.confidence.disposition === 'ESCALATE') {
    families = ['SPECIALIST', 'MODEL', 'HUMAN'];
  }
  if (request.lane.lane !== 'GOVERNED') {
    families = families.filter((family) => family !== 'COMPUTER_USE_PLANNING');
  }
  return families;
}

function preferencesFor(
  preferences: RouterStrategyPreferences,
  family: IntelligenceRouteFamily,
): readonly string[] {
  switch (family) {
    case 'DETERMINISTIC':
      return preferences.deterministic;
    case 'MODEL':
      return preferences.model;
    case 'SPECIALIST':
      return preferences.specialist;
    case 'COMPUTER_USE_PLANNING':
      return preferences.computerUsePlanning;
    case 'HUMAN':
      return preferences.human;
  }
}

function selectionReasons(
  request: IntelligenceRouterRequest,
  family: IntelligenceRouteFamily,
  selectedVia: 'PREFERRED' | 'FALLBACK',
  currentAvailability: 'CURRENT_AVAILABLE' | 'CURRENT_DEGRADED',
): IntelligenceRouteReason[] {
  const reasons: IntelligenceRouteReason[] = ['LOWEST_SUFFICIENT_ROUTE'];
  if (family === 'DETERMINISTIC') reasons.push('DETERMINISTIC_NO_AI_PREFERRED');
  if (request.classification.riskSignals.length > 0) reasons.push('RISK_REQUIRES_REASONED_ROUTE');
  if (request.confidence.disposition === 'VERIFY') {
    reasons.push('CONFIDENCE_REQUIRES_VERIFICATION');
  }
  if (request.confidence.disposition === 'ESCALATE') {
    reasons.push('CONFIDENCE_REQUIRES_ESCALATION');
  }
  if (family === 'COMPUTER_USE_PLANNING') reasons.push('GOVERNED_COMPUTER_USE_ONLY');
  if (selectedVia === 'FALLBACK') reasons.push('STRATEGY_FALLBACK_USED');
  if (currentAvailability === 'CURRENT_DEGRADED') reasons.push('DEGRADED_STRATEGY_USED');
  return reasons;
}

export function routeIntelligence(request: IntelligenceRouterRequest): IntelligenceRouteDecision {
  if (!validControlProjection(request)) {
    return abstain(request, 'INVALID_CONTROL_PROJECTION', [], 'NONE');
  }
  if (request.capabilityPlan.status === 'BLOCKED') {
    return abstain(request, 'CAPABILITY_PLAN_BLOCKED', [], 'NONE');
  }
  if (request.reasoning.status === 'HELD') {
    return abstain(request, 'REASONING_HELD', [], 'HUMAN');
  }
  if (request.confidence.disposition === 'ABSTAIN') {
    return abstain(request, 'CONFIDENCE_ABSTAIN', ['HUMAN'], 'HUMAN');
  }
  if (request.budget.state === 'EXHAUSTED' || request.budget.action === 'HOLD') {
    return abstain(request, 'BUDGET_HOLD_OR_EXHAUSTED', [], 'NONE');
  }
  if (request.budget.action === 'STOP_OPTIONAL') {
    return abstain(request, 'OPTIONAL_INTELLIGENCE_STOPPED', [], 'HUMAN');
  }

  const level = request.reasoning.level;
  const families = candidateFamilies(request, level);
  for (const family of families) {
    for (const preferredStrategyId of preferencesFor(request.preferences, family)) {
      if (preferredStrategyId.trim().length === 0) continue;
      const selected = request.strategies.select({
        preferredStrategyId,
        modality: request.classification.modality,
        taskClass: request.classification.taskClass,
        reasoningLevel: level,
        nowEpochMs: request.nowEpochMs,
      });
      if (selected.authorizesExecution !== false || selected.status !== 'SELECTED') continue;
      if (selected.strategy.kind !== family) continue;
      return {
        status: 'SELECTED',
        tenant: request.tenant,
        correlation: request.correlation,
        family,
        strategyId: selected.strategy.strategyId,
        strategyVersion: selected.strategy.semanticVersion,
        selectedVia: selected.selectedVia,
        currentAvailability: selected.currentAvailability,
        reasons: selectionReasons(
          request,
          family,
          selected.selectedVia,
          selected.currentAvailability,
        ),
        evidence: evidence(request, families),
        authoritySemantics: 'INTELLIGENCE_ONLY_NO_AUTHORITY',
        downstreamExecutionStillRequiresCurrentValidation: true,
        authorizesExecution: false,
      };
    }
  }

  return abstain(request, 'NO_COMPATIBLE_AVAILABLE_STRATEGY', families, 'HUMAN');
}
