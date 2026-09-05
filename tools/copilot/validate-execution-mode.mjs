import fs from 'node:fs/promises';

const path = 'docs/governance/copilot/AURORA_COPILOT_EXECUTION_MODE.json';
const mode = JSON.parse(await fs.readFile(path, 'utf8'));

const allowed = new Set(['FREE_ACTIONS_CLI', 'PRO_PLUS_CLOUD_AGENT']);
if (!allowed.has(mode.mode)) {
  throw new Error(`Unsupported Aurora Copilot execution mode: ${mode.mode}`);
}
if ((mode.schemaVersion || 1) < 4) {
  throw new Error('PRO+ runtime orchestration requires execution-mode schemaVersion >= 4');
}

if (!Number.isInteger(mode.physicalBuildSlots) || mode.physicalBuildSlots < 1) {
  throw new Error('physicalBuildSlots must be a positive integer');
}
if (!Number.isInteger(mode.maxParallelTasks) || mode.maxParallelTasks !== mode.physicalBuildSlots) {
  throw new Error('maxParallelTasks must remain a compatibility alias of physicalBuildSlots');
}
if (!Number.isInteger(mode.maxLogicalLanes) || mode.maxLogicalLanes < mode.physicalBuildSlots) {
  throw new Error('maxLogicalLanes must be an integer >= physicalBuildSlots');
}
if (mode.maxLogicalLanes > 256) {
  throw new Error('maxLogicalLanes may not exceed 256 without a new reviewed scheduler policy');
}
if (
  !Number.isInteger(mode.maxPrebuildArtifactLanes) ||
  mode.maxPrebuildArtifactLanes < 0 ||
  mode.maxPrebuildArtifactLanes > mode.maxLogicalLanes
) {
  throw new Error('maxPrebuildArtifactLanes must be between 0 and maxLogicalLanes');
}
if (typeof mode.prebuildWorkerEnabled !== 'boolean') {
  throw new Error('prebuildWorkerEnabled must be boolean');
}

const discovery = mode.runtimeCapabilityDiscovery || {};
if (
  discovery.enabled !== true ||
  discovery.failurePolicy !== 'FAIL_CLOSED' ||
  discovery.requiredForProPlus !== true ||
  !Array.isArray(discovery.signals) ||
  discovery.signals.length < 5
) {
  throw new Error('PRO+ runtime capability discovery must be enabled and fail closed');
}

const capacityController = mode.capacityController || {};
if (
  capacityController.strategy !== 'MINIMUM_SAFE_DIMENSION' ||
  capacityController.subtractActiveSessionLeases !== true ||
  capacityController.respectWriterLeases !== true ||
  capacityController.unknownCapacityPolicy !== 'ZERO_CAPACITY'
) {
  throw new Error('Dynamic BUILD capacity controller policy is invalid');
}

const leaseRegistry = mode.sessionLeaseRegistry || {};
if (
  leaseRegistry.source !== 'LIVE_GITHUB_ISSUE_TASK_PROJECTION' ||
  leaseRegistry.staleLeasePolicy !== 'FAIL_CLOSED_UNTIL_RECONCILED' ||
  leaseRegistry.prOpenConsumesBuildSession !== false ||
  !Array.isArray(leaseRegistry.lockDimensions) ||
  !leaseRegistry.lockDimensions.includes('allowedPaths') ||
  !leaseRegistry.lockDimensions.includes('sharedWriteSurfaces')
) {
  throw new Error('Session lease registry policy is invalid');
}

if (
  mode.developmentTelemetry?.enabled !== true ||
  mode.developmentTelemetry?.schema !== 'aurora.pro_plus.development_telemetry.v1' ||
  mode.developmentTelemetry?.canonicalAuthority !== false
) {
  throw new Error('PRO+ development telemetry must be enabled and non-authoritative');
}

const scheduler = mode.scheduler || {};
if (scheduler.strategy !== 'PUZZLE_FRONTIER') {
  throw new Error('Aurora execution requires scheduler.strategy=PUZZLE_FRONTIER');
}
if (scheduler.optimizeFor !== 'MINIMUM_SAFE_CRITICAL_PATH') {
  throw new Error('Aurora scheduler must optimize for MINIMUM_SAFE_CRITICAL_PATH');
}
if (scheduler.buildSelection !== 'EXPLICIT_PRIORITY_THEN_LONGEST_REMAINING_PATH') {
  throw new Error('Unsupported Aurora canonical BUILD selection policy');
}
if (scheduler.prebuildSelection !== 'WAVE_SEEDS_THEN_LOWEST_SPECULATION_DEPTH_THEN_CRITICAL_PATH') {
  throw new Error('Unsupported Aurora PREBUILD selection policy');
}
if (scheduler.canonicalDependencyPolicy !== 'ACCEPTED_ONLY') {
  throw new Error('Canonical BUILD/integration dependencies must be ACCEPTED_ONLY');
}
if (scheduler.prebuildPublicationPolicy !== 'ARTIFACT_ONLY_UNTIL_DEPENDENCIES_ACCEPTED') {
  throw new Error('Aurora PREBUILD must remain artifact-only until dependencies are accepted');
}
if (scheduler.sharedWriteConflictPolicy !== 'FAIL_CLOSED_DEFER') {
  throw new Error('Aurora shared write conflicts must fail closed and defer');
}
if (scheduler.pathFencePolicy !== 'REQUIRED_FOR_PATCH_PREBUILD') {
  throw new Error('Patch PREBUILD requires an explicit path fence');
}
if (scheduler.contractReconciliationPolicy !== 'REQUIRED_BEFORE_BUILD_PROMOTION') {
  throw new Error('PREBUILD contract reconciliation is required before BUILD promotion');
}
if (scheduler.runningTaskActivationPolicy !== 'NON_RETROACTIVE') {
  throw new Error('Scheduler activation must be NON_RETROACTIVE for already-running tasks');
}
if (scheduler.handoffFormat !== 'AURORA_COMPACT_V1') {
  throw new Error('Aurora scheduler must use AURORA_COMPACT_V1 handoffs');
}

if (mode.mode === 'FREE_ACTIONS_CLI') {
  if (!mode.freeActionsCliEnabled) {
    throw new Error('FREE_ACTIONS_CLI requires freeActionsCliEnabled=true');
  }
  if (mode.cloudAgentEnabled) throw new Error('FREE_ACTIONS_CLI must keep cloudAgentEnabled=false');
  if (mode.physicalBuildSlots > 2) {
    throw new Error('Copilot Free canonical BUILD execution may not exceed 2 physical slots');
  }
}

if (mode.mode === 'PRO_PLUS_CLOUD_AGENT' && !mode.cloudAgentEnabled) {
  throw new Error('PRO_PLUS_CLOUD_AGENT requires cloudAgentEnabled=true');
}

console.log(
  JSON.stringify(
    {
      schemaVersion: mode.schemaVersion,
      mode: mode.mode,
      freeActionsCliEnabled: Boolean(mode.freeActionsCliEnabled),
      cloudAgentEnabled: Boolean(mode.cloudAgentEnabled),
      prebuildWorkerEnabled: mode.prebuildWorkerEnabled,
      physicalBuildSlots: mode.physicalBuildSlots,
      maxLogicalLanes: mode.maxLogicalLanes,
      maxPrebuildArtifactLanes: mode.maxPrebuildArtifactLanes,
      runtimeCapabilityDiscovery: discovery,
      capacityController,
      sessionLeaseRegistry: leaseRegistry,
      developmentTelemetry: mode.developmentTelemetry,
      scheduler,
      upgradeTarget: mode.upgradeTarget || null,
    },
    null,
    2,
  ),
);
