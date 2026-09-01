import type {
  LaneResolution,
  LaneResolutionInput,
  LaneResolutionReason,
} from './types.ts';

function preferredStrategy(
  input: LaneResolutionInput,
  lane: LaneResolution['lane'],
): LaneResolution['preferredPlanningStrategy'] {
  if (lane === 'GOVERNED') return 'GOVERNED_REASONING';
  return input.complexity === 'TEMPLATE_ELIGIBLE' ? 'TEMPLATE' : 'DETERMINISTIC';
}

export function resolvePlanningLane(input: LaneResolutionInput): LaneResolution {
  if (input.taskId.trim().length === 0) throw new Error('taskId must not be empty');

  const reasons: LaneResolutionReason[] = [];
  if (input.capabilityPlanStatus === 'BLOCKED') reasons.push('CAPABILITY_PLAN_BLOCKED');
  if (input.riskClass === 'HIGH' || input.riskClass === 'CRITICAL') {
    reasons.push('CRITICAL_OR_HIGH_RISK');
  }
  if (input.sideEffectClass === 'DESTRUCTIVE') reasons.push('DESTRUCTIVE_SIDE_EFFECT');
  if (input.reversibility === 'IRREVERSIBLE' || input.reversibility === 'UNKNOWN') {
    reasons.push('IRREVERSIBLE_OR_UNKNOWN');
  }
  if (input.approvalRequired) reasons.push('APPROVAL_REQUIRED');
  if (input.stepUpRequired) reasons.push('STEP_UP_REQUIRED');
  if (input.complexity === 'ADAPTIVE' || input.complexity === 'UNKNOWN') {
    reasons.push('ADAPTIVE_OR_UNKNOWN_COMPLEXITY');
  }

  const lane = reasons.length === 0 ? 'FAST' : 'GOVERNED';
  if (lane === 'FAST') reasons.push('FAST_ELIGIBLE');

  return {
    lane,
    tenantId: input.tenantId,
    correlationId: input.correlationId,
    reasons,
    evidence: {
      taskId: input.taskId,
      riskClass: input.riskClass,
      sideEffectClass: input.sideEffectClass,
      reversibility: input.reversibility,
      complexity: input.complexity,
      capabilityPlanStatus: input.capabilityPlanStatus,
      approvalRequired: input.approvalRequired,
      stepUpRequired: input.stepUpRequired,
    },
    preferredPlanningStrategy: preferredStrategy(input, lane),
    mandatoryValidations: ['CURRENT_POLICY', 'CURRENT_AUTHORITY', 'EXECUTOR_PRECONDITIONS'],
    authorizesExecution: false,
  };
}
