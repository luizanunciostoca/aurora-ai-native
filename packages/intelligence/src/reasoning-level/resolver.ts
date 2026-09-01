import type { TaskComplexity } from '../classification/types';
import type {
  ReasoningBudgetProjection,
  ReasoningLevel,
  ReasoningLevelDescriptor,
  ReasoningLevelReason,
  ReasoningLevelRequest,
  ReasoningLevelResolution,
  ReasoningUncertainty,
} from './types';

const DESCRIPTORS: Readonly<Record<ReasoningLevel, ReasoningLevelDescriptor>> = Object.freeze({
  L0: { level: 'L0', ordinal: 0, semantic: 'DETERMINISTIC_OR_NO_REASONING', nominalReasoningUnits: 0 },
  L1: { level: 'L1', ordinal: 1, semantic: 'BOUNDED_DIRECT', nominalReasoningUnits: 1 },
  L2: { level: 'L2', ordinal: 2, semantic: 'STRUCTURED', nominalReasoningUnits: 3 },
  L3: { level: 'L3', ordinal: 3, semantic: 'MULTI_STEP', nominalReasoningUnits: 8 },
  L4: { level: 'L4', ordinal: 4, semantic: 'DEEP', nominalReasoningUnits: 16 },
  L5: { level: 'L5', ordinal: 5, semantic: 'MAXIMUM_BOUNDED', nominalReasoningUnits: 32 },
});

const LEVELS: readonly ReasoningLevel[] = ['L0', 'L1', 'L2', 'L3', 'L4', 'L5'];

export function describeReasoningLevel(level: ReasoningLevel): ReasoningLevelDescriptor {
  return DESCRIPTORS[level];
}

function baseLevel(complexity: TaskComplexity): ReasoningLevel {
  switch (complexity) {
    case 'TRIVIAL':
      return 'L0';
    case 'LOW':
      return 'L1';
    case 'MEDIUM':
      return 'L2';
    case 'HIGH':
      return 'L3';
    case 'VERY_HIGH':
      return 'L4';
    case 'UNKNOWN':
      return 'L3';
  }
}

function escalate(level: ReasoningLevel, steps: number): ReasoningLevel {
  const ordinal = Math.min(5, DESCRIPTORS[level].ordinal + steps);
  return LEVELS[ordinal] ?? 'L5';
}

function requestedLevel(
  complexity: TaskComplexity,
  uncertainty: ReasoningUncertainty,
  reasons: ReasoningLevelReason[],
): ReasoningLevel {
  let level = baseLevel(complexity);
  reasons.push('TASK_NEED_FROM_COMPLEXITY');
  if (complexity === 'UNKNOWN') reasons.push('UNKNOWN_COMPLEXITY_REQUIRES_CAUTION');

  if (uncertainty === 'MEDIUM') {
    level = escalate(level, 1);
    reasons.push('UNCERTAINTY_ESCALATION');
  } else if (uncertainty === 'HIGH' || uncertainty === 'UNKNOWN') {
    level = escalate(level, 2);
    reasons.push('VERY_HIGH_UNCERTAINTY_ESCALATION');
  }
  return level;
}

function validateBudget(budget: ReasoningBudgetProjection): void {
  if (!budget.budgetId) throw new RangeError('budgetId must be non-empty');
  if (!Number.isSafeInteger(budget.remainingReasoningUnits) || budget.remainingReasoningUnits < 0) {
    throw new RangeError('remainingReasoningUnits must be a non-negative safe integer');
  }
  if (
    budget.source !== 'W04_EXECUTION_BUDGET_ASSESSMENT' ||
    budget.mandatorySafetyValidationRequired !== true ||
    budget.canSkipMandatoryValidation !== false ||
    budget.authorizesExecution !== false
  ) {
    throw new Error('invalid W04 ExecutionBudget consumer projection');
  }
}

function highestAffordableLevel(remainingReasoningUnits: number): ReasoningLevel {
  let affordable: ReasoningLevel = 'L0';
  for (const level of LEVELS) {
    if (DESCRIPTORS[level].nominalReasoningUnits <= remainingReasoningUnits) affordable = level;
  }
  return affordable;
}

export function resolveReasoningLevel(request: ReasoningLevelRequest): ReasoningLevelResolution {
  if (request.tenant.tenantId !== request.classification.tenant.tenantId) {
    throw new Error('reasoning request tenant must match classification tenant');
  }
  if (request.correlation.correlationId !== request.classification.correlation.correlationId) {
    throw new Error('reasoning request correlation must match classification correlation');
  }

  const reasons: ReasoningLevelReason[] = [];
  const wanted = requestedLevel(request.classification.complexity, request.uncertainty, reasons);
  const budget = request.budget;
  const base = {
    tenant: request.tenant,
    correlation: request.correlation,
    requestedLevel: wanted,
    mandatorySafetyValidationRequired: true as const,
    canSkipMandatoryValidation: false as const,
    authorizesExecution: false as const,
  };

  if (budget === undefined) {
    return { status: 'RESOLVED', ...base, level: wanted, reasons };
  }

  validateBudget(budget);
  const withBudget = { ...base, budgetId: budget.budgetId };
  if (budget.action === 'HOLD') {
    return { status: 'HELD', ...withBudget, reasons: [...reasons, 'BUDGET_HOLD'] };
  }
  if (budget.state === 'EXHAUSTED' || budget.action === 'STOP_OPTIONAL') {
    return { status: 'HELD', ...withBudget, reasons: [...reasons, 'BUDGET_EXHAUSTED'] };
  }

  const affordable = highestAffordableLevel(budget.remainingReasoningUnits);
  if (DESCRIPTORS[affordable].ordinal < DESCRIPTORS[wanted].ordinal) {
    if (budget.action === 'DEGRADE_OPTIONAL' || budget.state === 'DEGRADED') {
      return {
        status: 'RESOLVED',
        ...withBudget,
        level: affordable,
        reasons: [...reasons, 'BUDGET_OPTIONAL_DEGRADATION'],
      };
    }
    return {
      status: 'HELD',
      ...withBudget,
      reasons: [...reasons, 'BUDGET_INSUFFICIENT_FOR_MINIMUM_TASK_NEED'],
    };
  }

  return { status: 'RESOLVED', ...withBudget, level: wanted, reasons };
}
