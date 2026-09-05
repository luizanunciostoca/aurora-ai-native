import fs from 'node:fs';

function positiveInteger(value) {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
}

function booleanSignal(value) {
  return String(value || '').toLowerCase() === 'true';
}

function loadAttestation(mode, supplied) {
  if (supplied !== null && supplied !== undefined) return supplied;
  const path = mode?.runtimeCapabilityDiscovery?.attestationPath;
  if (typeof path !== 'string' || !path) return null;
  try {
    return JSON.parse(fs.readFileSync(path, 'utf8'));
  } catch {
    return null;
  }
}

function validActionsFabricAttestation(mode, attestation, nowMs) {
  const minimum =
    positiveInteger(mode?.runtimeCapabilityDiscovery?.minimumObservedConcurrentSessions) || 4;
  if (
    mode?.mode !== 'PRO_PLUS_ACTIONS_FABRIC' ||
    mode?.proPlusActionsFabricEnabled !== true ||
    attestation?.schema !== 'aurora.pro_plus.runtime_attestation.v1' ||
    attestation?.state !== 'VERIFIED' ||
    attestation?.executionMode !== 'PRO_PLUS_ACTIONS_FABRIC' ||
    attestation?.authority !== false ||
    attestation?.allSessionsNoTool !== true ||
    Number(attestation?.repositorySideEffects || 0) !== 0 ||
    Number(attestation?.providerSideEffects || 0) !== 0 ||
    !positiveInteger(attestation?.workflowRunId) ||
    typeof attestation?.candidateSha !== 'string' ||
    !/^[a-f0-9]{40}$/u.test(attestation.candidateSha) ||
    !positiveInteger(attestation?.observedConcurrentSessions) ||
    attestation.observedConcurrentSessions < minimum ||
    !positiveInteger(attestation?.successfulCopilotSessions) ||
    attestation.successfulCopilotSessions < minimum ||
    Number(attestation?.failedCopilotSessions || 0) !== 0
  )
    return false;
  const observedAt = Date.parse(attestation.observedAt || '');
  const expiresAt = Date.parse(attestation.expiresAt || '');
  return (
    Number.isFinite(observedAt) &&
    Number.isFinite(expiresAt) &&
    observedAt <= nowMs &&
    nowMs < expiresAt
  );
}

export function discoverRuntimeCapabilities(
  mode,
  env = process.env,
  suppliedAttestation = null,
  nowMs = Date.now(),
) {
  const configuredMode = mode?.mode || 'UNKNOWN';
  const freeMode = configuredMode === 'FREE_ACTIONS_CLI';
  const actionsFabricMode = configuredMode === 'PRO_PLUS_ACTIONS_FABRIC';
  const cloudMode = configuredMode === 'PRO_PLUS_CLOUD_AGENT';
  const ciOverride = positiveInteger(env.AURORA_CI_PARALLEL_CAPACITY);
  const creditOverride = positiveInteger(env.AURORA_AI_CREDIT_SLOT_BUDGET);
  const fleetOverride = positiveInteger(
    env.AURORA_FLEET_SUBAGENT_CAP || env.COPILOT_SUBAGENT_MAX_CONCURRENT,
  );

  if (freeMode) {
    const slots = positiveInteger(mode?.physicalBuildSlots) || 1;
    return {
      schema: 'aurora.pro_plus.runtime_capability.v2',
      configuredMode,
      executionProfile: 'FREE',
      executionAvailable: Boolean(mode?.freeActionsCliEnabled),
      proPlusReady: false,
      attestationState: 'NOT_REQUIRED',
      isolatedSessionCapacity: slots,
      ciParallelCapacity: ciOverride || slots,
      creditSlotBudget: creditOverride || slots,
      fleetSubagentCap: fleetOverride || slots,
      authority: false,
    };
  }

  if (actionsFabricMode) {
    const attestation = loadAttestation(mode, suppliedAttestation);
    const fallbackSlots = positiveInteger(mode?.fallbackPhysicalBuildSlots) || 1;
    const verified = validActionsFabricAttestation(mode, attestation, nowMs);
    const measuredSlots = verified
      ? Math.min(
          positiveInteger(mode?.physicalBuildSlots) || fallbackSlots,
          positiveInteger(attestation?.observedConcurrentSessions) || fallbackSlots,
        )
      : fallbackSlots;
    return {
      schema: 'aurora.pro_plus.runtime_capability.v2',
      configuredMode,
      executionProfile: verified ? 'PRO_PLUS' : 'FREE_FALLBACK',
      executionAvailable: verified || Boolean(mode?.freeActionsCliEnabled),
      proPlusReady: verified,
      attestationState: verified ? 'VERIFIED' : attestation?.state || 'MISSING',
      isolatedSessionCapacity: measuredSlots,
      ciParallelCapacity: ciOverride || measuredSlots,
      creditSlotBudget: creditOverride || measuredSlots,
      fleetSubagentCap: fleetOverride || measuredSlots,
      authority: false,
    };
  }

  const cloudAgentAvailable = booleanSignal(env.AURORA_CLOUD_AGENT_AVAILABLE);
  const accountPlanObserved = String(env.AURORA_ACCOUNT_PLAN || '').toLowerCase() === 'pro_plus';
  const isolatedSessionCapacity = positiveInteger(env.AURORA_ISOLATED_SESSION_CAPACITY);
  const proPlusReady = Boolean(
    cloudMode &&
    mode?.cloudAgentEnabled &&
    cloudAgentAvailable &&
    accountPlanObserved &&
    isolatedSessionCapacity &&
    ciOverride &&
    creditOverride,
  );
  return {
    schema: 'aurora.pro_plus.runtime_capability.v2',
    configuredMode,
    executionProfile: proPlusReady ? 'PRO_PLUS_CLOUD' : 'UNAVAILABLE',
    executionAvailable: proPlusReady,
    proPlusReady,
    attestationState: 'ENVIRONMENT_SIGNALS',
    isolatedSessionCapacity: isolatedSessionCapacity || 0,
    ciParallelCapacity: ciOverride || 0,
    creditSlotBudget: creditOverride || 0,
    fleetSubagentCap: fleetOverride || 0,
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
  if (!runtime?.executionAvailable)
    return {
      schema: 'aurora.pro_plus.safe_build_capacity.v2',
      capacity: 0,
      reasons: ['RUNTIME_EXECUTION_UNAVAILABLE'],
      authority: false,
    };
  const configuredCeiling = Math.max(1, Number(mode?.physicalBuildSlots) || 1);
  const availableSessions = Math.max(0, runtime.isolatedSessionCapacity - active);
  const capacity = Math.max(
    0,
    Math.min(
      configuredCeiling,
      availableSessions,
      runtime.ciParallelCapacity,
      runtime.creditSlotBudget,
      ready,
      independent,
    ),
  );
  const reasons = [];
  if (capacity === 0 && active >= runtime.isolatedSessionCapacity)
    reasons.push('SESSION_CAPACITY_EXHAUSTED');
  if (ready === 0) reasons.push('NO_BUILD_READY_CANDIDATES');
  if (independent === 0) reasons.push('NO_PATH_INDEPENDENT_CANDIDATES');
  if (capacity > 0) reasons.push('MINIMUM_SAFE_DIMENSION');
  if (runtime.executionProfile === 'FREE_FALLBACK') reasons.push('PRO_PLUS_ATTESTATION_FALLBACK');
  return {
    schema: 'aurora.pro_plus.safe_build_capacity.v2',
    capacity,
    executionProfile: runtime.executionProfile,
    dimensions: {
      configuredCeiling,
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
