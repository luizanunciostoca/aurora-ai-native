function positiveInteger(value) {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
}

function booleanSignal(value) {
  return String(value || '').toLowerCase() === 'true';
}

export function discoverRuntimeCapabilities(mode, env = process.env) {
  const configuredMode = mode?.mode || 'UNKNOWN';
  const freeMode = configuredMode === 'FREE_ACTIONS_CLI';
  const proPlusMode = configuredMode === 'PRO_PLUS_CLOUD_AGENT';

  const cloudAgentAvailable = booleanSignal(env.AURORA_CLOUD_AGENT_AVAILABLE);
  const accountPlanObserved = String(env.AURORA_ACCOUNT_PLAN || '').toLowerCase() === 'pro_plus';
  const isolatedSessionCapacity = positiveInteger(env.AURORA_ISOLATED_SESSION_CAPACITY);
  const ciParallelCapacity = positiveInteger(env.AURORA_CI_PARALLEL_CAPACITY);
  const creditSlotBudget = positiveInteger(env.AURORA_AI_CREDIT_SLOT_BUDGET);
  const fleetSubagentCap = positiveInteger(
    env.AURORA_FLEET_SUBAGENT_CAP || env.COPILOT_SUBAGENT_MAX_CONCURRENT,
  );

  if (freeMode) {
    const physicalBuildSlots = positiveInteger(mode?.physicalBuildSlots) || 1;
    return {
      schema: 'aurora.pro_plus.runtime_capability.v1',
      configuredMode,
      executionAvailable: Boolean(mode?.freeActionsCliEnabled),
      proPlusReady: false,
      cloudAgentAvailable: false,
      accountPlanObserved: false,
      isolatedSessionCapacity: physicalBuildSlots,
      ciParallelCapacity: ciParallelCapacity || physicalBuildSlots,
      creditSlotBudget: creditSlotBudget || physicalBuildSlots,
      fleetSubagentCap: fleetSubagentCap || physicalBuildSlots,
      authority: false,
    };
  }

  const proPlusReady = Boolean(
    proPlusMode &&
      mode?.cloudAgentEnabled &&
      cloudAgentAvailable &&
      accountPlanObserved &&
      isolatedSessionCapacity &&
      ciParallelCapacity &&
      creditSlotBudget,
  );

  return {
    schema: 'aurora.pro_plus.runtime_capability.v1',
    configuredMode,
    executionAvailable: proPlusReady,
    proPlusReady,
    cloudAgentAvailable,
    accountPlanObserved,
    isolatedSessionCapacity: isolatedSessionCapacity || 0,
    ciParallelCapacity: ciParallelCapacity || 0,
    creditSlotBudget: creditSlotBudget || 0,
    fleetSubagentCap: fleetSubagentCap || 0,
    authority: false,
  };
}

export function calculateDynamicSafeBuildCapacity({
  mode,
  runtime,
  readyCandidateCount,
  pathIndependentCandidateCount,
  activeLeaseCount = 0,
}) {
  const ready = Math.max(0, Number(readyCandidateCount) || 0);
  const independent = Math.max(0, Number(pathIndependentCandidateCount) || 0);
  const active = Math.max(0, Number(activeLeaseCount) || 0);

  if (!runtime?.executionAvailable) {
    return {
      schema: 'aurora.pro_plus.safe_build_capacity.v1',
      capacity: 0,
      reasons: ['RUNTIME_EXECUTION_UNAVAILABLE'],
      authority: false,
    };
  }

  const configuredCeiling =
    mode?.mode === 'FREE_ACTIONS_CLI'
      ? Math.max(1, Number(mode.physicalBuildSlots) || 1)
      : Number.POSITIVE_INFINITY;
  const availableSessions = Math.max(0, runtime.isolatedSessionCapacity - active);
  const dimensions = [
    configuredCeiling,
    availableSessions,
    runtime.ciParallelCapacity,
    runtime.creditSlotBudget,
    ready,
    independent,
  ];
  const capacity = Math.max(0, Math.min(...dimensions));

  const reasons = [];
  if (capacity === 0 && active >= runtime.isolatedSessionCapacity) reasons.push('SESSION_CAPACITY_EXHAUSTED');
  if (ready === 0) reasons.push('NO_BUILD_READY_CANDIDATES');
  if (independent === 0) reasons.push('NO_PATH_INDEPENDENT_CANDIDATES');
  if (capacity > 0) reasons.push('MINIMUM_SAFE_DIMENSION');

  return {
    schema: 'aurora.pro_plus.safe_build_capacity.v1',
    capacity,
    dimensions: {
      configuredCeiling: Number.isFinite(configuredCeiling) ? configuredCeiling : null,
      availableSessions,
      ciParallelCapacity: runtime.ciParallelCapacity,
      creditSlotBudget: runtime.creditSlotBudget,
      readyCandidateCount: ready,
      pathIndependentCandidateCount: independent,
      activeLeaseCount: active,
    },
    reasons,
    authority: false,
  };
}
