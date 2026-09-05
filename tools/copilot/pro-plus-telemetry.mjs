export function buildProPlusDevelopmentTelemetry({
  runtime,
  capacity,
  activeLeases = [],
  selected = [],
  deferred = [],
}) {
  const selectedCount = selected.length;
  const activeLeaseCount = activeLeases.length;
  const capacityValue = Number(capacity?.capacity || 0);
  const utilizationBps =
    capacityValue > 0 ? Math.min(10_000, Math.round((selectedCount / capacityValue) * 10_000)) : 0;

  return {
    schema: 'aurora.pro_plus.development_telemetry.v2',
    measurementScope: 'PROGRAM_CONTROL_OPERATIONAL_ONLY',
    executionMode: runtime?.configuredMode || 'UNKNOWN',
    executionProfile: runtime?.executionProfile || 'UNKNOWN',
    proPlusReady: Boolean(runtime?.proPlusReady),
    runtimeExecutionAvailable: Boolean(runtime?.executionAvailable),
    attestationState: runtime?.attestationState || 'UNKNOWN',
    attestationSource: runtime?.attestationSource || 'UNKNOWN',
    isolatedSessionCapacity: Number(runtime?.isolatedSessionCapacity || 0),
    fleetSubagentCap: Number(runtime?.fleetSubagentCap || 0),
    ciParallelCapacity: Number(runtime?.ciParallelCapacity || 0),
    creditSlotBudget: Number(runtime?.creditSlotBudget || 0),
    safeBuildCapacity: capacityValue,
    activeLeaseCount,
    selectedBuildCount: selectedCount,
    deferredBuildCount: deferred.length,
    buildCapacityUtilizationBps: utilizationBps,
    authorityElevationViolations: 0,
    canonicalAuthority: false,
  };
}
