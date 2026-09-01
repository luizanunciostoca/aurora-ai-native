import type {
  BudgetProjectionResult,
  BudgetUsageRecordResult,
  ChildBudgetDerivationResult,
  ChildBudgetRequest,
  CreateExecutionBudgetInput,
  ExecutionBudget,
  ExecutionBudgetAssessment,
  ExecutionBudgetCreateResult,
  ExecutionBudgetDimension,
  ExecutionBudgetLimits,
  ExecutionBudgetRemaining,
  ExecutionBudgetTelemetrySnapshot,
  ExecutionBudgetUsage,
  ExecutionBudgetUsageDelta,
  ExecutionBudgetUtilization,
} from './types.ts';

const ZERO_USAGE: ExecutionBudgetUsage = {
  elapsedLatencyMs: 0,
  costMicros: 0,
  reasoningUnits: 0,
  toolCalls: 0,
  activeConcurrency: 0,
  peakConcurrency: 0,
};

function nonEmpty(value: string): boolean {
  return value.trim().length > 0;
}

function positiveSafeInteger(value: number): boolean {
  return Number.isSafeInteger(value) && value > 0;
}

function nonNegativeSafeInteger(value: number): boolean {
  return Number.isSafeInteger(value) && value >= 0;
}

export function isValidExecutionBudgetLimits(limits: ExecutionBudgetLimits): boolean {
  return (
    positiveSafeInteger(limits.maxLatencyMs) &&
    positiveSafeInteger(limits.maxCostMicros) &&
    positiveSafeInteger(limits.maxReasoningUnits) &&
    positiveSafeInteger(limits.maxToolCalls) &&
    positiveSafeInteger(limits.maxConcurrency)
  );
}

export function isValidExecutionBudgetUsage(usage: ExecutionBudgetUsage): boolean {
  return (
    nonNegativeSafeInteger(usage.elapsedLatencyMs) &&
    nonNegativeSafeInteger(usage.costMicros) &&
    nonNegativeSafeInteger(usage.reasoningUnits) &&
    nonNegativeSafeInteger(usage.toolCalls) &&
    nonNegativeSafeInteger(usage.activeConcurrency) &&
    nonNegativeSafeInteger(usage.peakConcurrency) &&
    usage.activeConcurrency <= usage.peakConcurrency
  );
}

function isValidUsageDelta(delta: ExecutionBudgetUsageDelta): boolean {
  return (
    (delta.elapsedLatencyMs === undefined || nonNegativeSafeInteger(delta.elapsedLatencyMs)) &&
    (delta.costMicros === undefined || nonNegativeSafeInteger(delta.costMicros)) &&
    (delta.reasoningUnits === undefined || nonNegativeSafeInteger(delta.reasoningUnits)) &&
    (delta.toolCalls === undefined || nonNegativeSafeInteger(delta.toolCalls)) &&
    (delta.activeConcurrency === undefined || nonNegativeSafeInteger(delta.activeConcurrency))
  );
}

export function createExecutionBudget(
  input: CreateExecutionBudgetInput,
): ExecutionBudgetCreateResult {
  if (!nonEmpty(input.budgetId) || !nonEmpty(input.scopeId)) {
    return { status: 'REJECTED', code: 'INVALID_IDENTITY' };
  }
  if (!Number.isFinite(Date.parse(input.createdAt))) {
    return { status: 'REJECTED', code: 'INVALID_TIMESTAMP' };
  }
  if (!isValidExecutionBudgetLimits(input.limits)) {
    return { status: 'REJECTED', code: 'INVALID_LIMITS' };
  }

  return {
    status: 'CREATED',
    budget: {
      budgetKind: 'AURORA_EXECUTION_BUDGET',
      budgetVersion: '1.0.0',
      budgetId: input.budgetId,
      tenantId: input.tenantId,
      rootCorrelationId: input.rootCorrelationId,
      scope: input.scope,
      scopeId: input.scopeId,
      limits: input.limits,
      exhaustionPolicy: input.exhaustionPolicy,
      createdAt: input.createdAt,
      safetyValidationInvariant: 'MANDATORY_NOT_SKIPPABLE',
    },
  };
}

export function initialExecutionBudgetUsage(): ExecutionBudgetUsage {
  return { ...ZERO_USAGE };
}

function remainingFrom(
  limits: ExecutionBudgetLimits,
  usage: ExecutionBudgetUsage,
): ExecutionBudgetRemaining {
  return {
    latencyMs: Math.max(0, limits.maxLatencyMs - usage.elapsedLatencyMs),
    costMicros: Math.max(0, limits.maxCostMicros - usage.costMicros),
    reasoningUnits: Math.max(0, limits.maxReasoningUnits - usage.reasoningUnits),
    toolCalls: Math.max(0, limits.maxToolCalls - usage.toolCalls),
    concurrencySlots: Math.max(0, limits.maxConcurrency - usage.activeConcurrency),
  };
}

function utilizationFrom(
  limits: ExecutionBudgetLimits,
  usage: ExecutionBudgetUsage,
): ExecutionBudgetUtilization {
  return {
    latency: usage.elapsedLatencyMs / limits.maxLatencyMs,
    cost: usage.costMicros / limits.maxCostMicros,
    reasoning: usage.reasoningUnits / limits.maxReasoningUnits,
    toolCalls: usage.toolCalls / limits.maxToolCalls,
    concurrency: usage.activeConcurrency / limits.maxConcurrency,
  };
}

function exhaustedDimensions(
  limits: ExecutionBudgetLimits,
  usage: ExecutionBudgetUsage,
): ExecutionBudgetDimension[] {
  const exhausted: ExecutionBudgetDimension[] = [];
  if (usage.elapsedLatencyMs >= limits.maxLatencyMs) exhausted.push('LATENCY_MS');
  if (usage.costMicros >= limits.maxCostMicros) exhausted.push('COST_MICROS');
  if (usage.reasoningUnits >= limits.maxReasoningUnits) exhausted.push('REASONING_UNITS');
  if (usage.toolCalls >= limits.maxToolCalls) exhausted.push('TOOL_CALLS');
  if (usage.activeConcurrency >= limits.maxConcurrency) exhausted.push('CONCURRENCY');
  return exhausted;
}

export function assessExecutionBudget(
  budget: ExecutionBudget,
  usage: ExecutionBudgetUsage,
): ExecutionBudgetAssessment {
  if (!isValidExecutionBudgetUsage(usage)) {
    throw new TypeError('ExecutionBudget usage must be finite, non-negative safe integers.');
  }

  const exhausted = exhaustedDimensions(budget.limits, usage);
  if (exhausted.length === 0) {
    return {
      budgetId: budget.budgetId,
      state: 'WITHIN_BUDGET',
      action: 'CONTINUE_OPTIONAL',
      exhaustedDimensions: exhausted,
      remaining: remainingFrom(budget.limits, usage),
      utilization: utilizationFrom(budget.limits, usage),
      mandatorySafetyValidationRequired: true,
      canSkipMandatoryValidation: false,
      authorizesExecution: false,
    };
  }

  const action = budget.exhaustionPolicy;
  return {
    budgetId: budget.budgetId,
    state: action === 'DEGRADE_OPTIONAL' ? 'DEGRADED' : 'EXHAUSTED',
    action,
    exhaustedDimensions: exhausted,
    remaining: remainingFrom(budget.limits, usage),
    utilization: utilizationFrom(budget.limits, usage),
    mandatorySafetyValidationRequired: true,
    canSkipMandatoryValidation: false,
    authorizesExecution: false,
  };
}

function projectUsage(
  usage: ExecutionBudgetUsage,
  delta: ExecutionBudgetUsageDelta,
): ExecutionBudgetUsage | undefined {
  if (!isValidExecutionBudgetUsage(usage) || !isValidUsageDelta(delta)) return undefined;

  const elapsedLatencyMs = usage.elapsedLatencyMs + (delta.elapsedLatencyMs ?? 0);
  const costMicros = usage.costMicros + (delta.costMicros ?? 0);
  const reasoningUnits = usage.reasoningUnits + (delta.reasoningUnits ?? 0);
  const toolCalls = usage.toolCalls + (delta.toolCalls ?? 0);
  const activeConcurrency = delta.activeConcurrency ?? usage.activeConcurrency;
  const peakConcurrency = Math.max(usage.peakConcurrency, activeConcurrency);

  const projected: ExecutionBudgetUsage = {
    elapsedLatencyMs,
    costMicros,
    reasoningUnits,
    toolCalls,
    activeConcurrency,
    peakConcurrency,
  };
  return isValidExecutionBudgetUsage(projected) ? projected : undefined;
}

function exceededDimensions(
  limits: ExecutionBudgetLimits,
  usage: ExecutionBudgetUsage,
): ExecutionBudgetDimension[] {
  const exceeded: ExecutionBudgetDimension[] = [];
  if (usage.elapsedLatencyMs > limits.maxLatencyMs) exceeded.push('LATENCY_MS');
  if (usage.costMicros > limits.maxCostMicros) exceeded.push('COST_MICROS');
  if (usage.reasoningUnits > limits.maxReasoningUnits) exceeded.push('REASONING_UNITS');
  if (usage.toolCalls > limits.maxToolCalls) exceeded.push('TOOL_CALLS');
  if (usage.activeConcurrency > limits.maxConcurrency) exceeded.push('CONCURRENCY');
  return exceeded;
}

export function projectOptionalBudgetUsage(
  budget: ExecutionBudget,
  usage: ExecutionBudgetUsage,
  delta: ExecutionBudgetUsageDelta,
): BudgetProjectionResult {
  if (!isValidExecutionBudgetUsage(usage)) {
    return { status: 'REJECTED', code: 'INVALID_USAGE' };
  }
  if (!isValidUsageDelta(delta)) {
    return { status: 'REJECTED', code: 'INVALID_DELTA' };
  }

  const projectedUsage = projectUsage(usage, delta);
  if (projectedUsage === undefined) {
    return { status: 'REJECTED', code: 'INVALID_DELTA' };
  }

  const constrainedDimensions = exceededDimensions(budget.limits, projectedUsage);
  if (constrainedDimensions.length > 0) {
    return {
      status: 'CONSTRAINED',
      action: budget.exhaustionPolicy,
      projectedUsage,
      constrainedDimensions,
      mandatorySafetyValidationRequired: true,
      canSkipMandatoryValidation: false,
      authorizesExecution: false,
    };
  }

  return {
    status: 'FITS',
    projectedUsage,
    assessment: assessExecutionBudget(budget, projectedUsage),
  };
}

export function recordObservedBudgetUsage(
  budget: ExecutionBudget,
  usage: ExecutionBudgetUsage,
  delta: ExecutionBudgetUsageDelta,
): BudgetUsageRecordResult {
  if (!isValidExecutionBudgetUsage(usage)) {
    return { status: 'REJECTED', code: 'INVALID_USAGE' };
  }
  if (!isValidUsageDelta(delta)) {
    return { status: 'REJECTED', code: 'INVALID_DELTA' };
  }

  const recorded = projectUsage(usage, delta);
  if (recorded === undefined) {
    return { status: 'REJECTED', code: 'INVALID_DELTA' };
  }

  return {
    status: 'RECORDED',
    usage: recorded,
    assessment: assessExecutionBudget(budget, recorded),
  };
}

function childConstraintDimensions(
  parentLimits: ExecutionBudgetLimits,
  request: ChildBudgetRequest,
  remaining: ExecutionBudgetRemaining,
): ExecutionBudgetDimension[] {
  const constrained: ExecutionBudgetDimension[] = [];
  if (request.limits.maxLatencyMs > remaining.latencyMs) constrained.push('LATENCY_MS');
  if (request.limits.maxCostMicros > remaining.costMicros) constrained.push('COST_MICROS');
  if (request.limits.maxReasoningUnits > remaining.reasoningUnits) {
    constrained.push('REASONING_UNITS');
  }
  if (request.limits.maxToolCalls > remaining.toolCalls) constrained.push('TOOL_CALLS');
  if (request.limits.maxConcurrency > parentLimits.maxConcurrency) constrained.push('CONCURRENCY');
  return constrained;
}

export function deriveChildExecutionBudget(
  parent: ExecutionBudget,
  parentUsage: ExecutionBudgetUsage,
  request: ChildBudgetRequest,
): ChildBudgetDerivationResult {
  if (
    !isValidExecutionBudgetUsage(parentUsage) ||
    !isValidExecutionBudgetLimits(request.limits) ||
    !nonEmpty(request.budgetId) ||
    !nonEmpty(request.scopeId) ||
    !Number.isFinite(Date.parse(request.createdAt))
  ) {
    return { status: 'REJECTED', code: 'INVALID_REQUEST', constrainedDimensions: [] };
  }

  const remaining = remainingFrom(parent.limits, parentUsage);
  const constrainedDimensions = childConstraintDimensions(parent.limits, request, remaining);
  if (constrainedDimensions.length > 0) {
    return {
      status: 'REJECTED',
      code: 'PARENT_BUDGET_INSUFFICIENT',
      constrainedDimensions,
    };
  }

  return {
    status: 'DERIVED',
    budget: {
      budgetKind: 'AURORA_EXECUTION_BUDGET',
      budgetVersion: '1.0.0',
      budgetId: request.budgetId,
      tenantId: parent.tenantId,
      rootCorrelationId: parent.rootCorrelationId,
      scope: request.scope,
      scopeId: request.scopeId,
      limits: request.limits,
      exhaustionPolicy: request.exhaustionPolicy ?? parent.exhaustionPolicy,
      createdAt: request.createdAt,
      safetyValidationInvariant: 'MANDATORY_NOT_SKIPPABLE',
    },
  };
}

export function toExecutionBudgetTelemetrySnapshot(
  budget: ExecutionBudget,
  usage: ExecutionBudgetUsage,
): ExecutionBudgetTelemetrySnapshot {
  const assessment = assessExecutionBudget(budget, usage);
  return {
    ...assessment,
    budgetVersion: budget.budgetVersion,
    tenantId: budget.tenantId,
    rootCorrelationId: budget.rootCorrelationId,
    scope: budget.scope,
    scopeId: budget.scopeId,
    limits: budget.limits,
    usage,
    exhaustionPolicy: budget.exhaustionPolicy,
  };
}
