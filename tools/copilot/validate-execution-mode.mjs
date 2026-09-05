import fs from 'node:fs/promises';

const path = 'docs/governance/copilot/AURORA_COPILOT_EXECUTION_MODE.json';
const mode = JSON.parse(await fs.readFile(path, 'utf8'));
const allowed = new Set(['FREE_ACTIONS_CLI', 'PRO_PLUS_ACTIONS_FABRIC', 'PRO_PLUS_CLOUD_AGENT']);
if (!allowed.has(mode.mode))
  throw new Error(`Unsupported Aurora Copilot execution mode: ${mode.mode}`);
if ((mode.schemaVersion || 1) < 5)
  throw new Error('Measured PRO+ activation requires schemaVersion >= 5');
if (!Number.isInteger(mode.physicalBuildSlots) || mode.physicalBuildSlots < 1)
  throw new Error('physicalBuildSlots must be a positive integer');
if (!Number.isInteger(mode.maxParallelTasks) || mode.maxParallelTasks !== mode.physicalBuildSlots)
  throw new Error('maxParallelTasks must remain a compatibility alias of physicalBuildSlots');
if (
  !Number.isInteger(mode.maxLogicalLanes) ||
  mode.maxLogicalLanes < mode.physicalBuildSlots ||
  mode.maxLogicalLanes > 256
)
  throw new Error('maxLogicalLanes must be between physicalBuildSlots and 256');
if (
  !Number.isInteger(mode.maxPrebuildArtifactLanes) ||
  mode.maxPrebuildArtifactLanes < 0 ||
  mode.maxPrebuildArtifactLanes > mode.maxLogicalLanes
)
  throw new Error('maxPrebuildArtifactLanes must be between 0 and maxLogicalLanes');
if (typeof mode.prebuildWorkerEnabled !== 'boolean')
  throw new Error('prebuildWorkerEnabled must be boolean');

const discovery = mode.runtimeCapabilityDiscovery || {};
if (
  discovery.enabled !== true ||
  discovery.requiredForProPlus !== true ||
  !Array.isArray(discovery.signals) ||
  discovery.signals.length < 5
)
  throw new Error('PRO+ runtime capability discovery must be enabled');
if (!['FAIL_CLOSED', 'FAIL_CLOSED_TO_FREE_FALLBACK'].includes(discovery.failurePolicy))
  throw new Error('Unsupported runtime capability failure policy');

const capacity = mode.capacityController || {};
if (
  capacity.strategy !== 'MINIMUM_SAFE_DIMENSION' ||
  capacity.subtractActiveSessionLeases !== true ||
  capacity.respectWriterLeases !== true
)
  throw new Error('Dynamic BUILD capacity controller policy is invalid');

const leases = mode.sessionLeaseRegistry || {};
if (
  leases.source !== 'LIVE_GITHUB_ISSUE_TASK_PROJECTION' ||
  leases.prOpenConsumesBuildSession !== false ||
  !Array.isArray(leases.lockDimensions) ||
  !leases.lockDimensions.includes('allowedPaths') ||
  !leases.lockDimensions.includes('sharedWriteSurfaces')
)
  throw new Error('Session lease registry policy is invalid');

if (
  mode.developmentTelemetry?.enabled !== true ||
  mode.developmentTelemetry?.canonicalAuthority !== false
)
  throw new Error('PRO+ development telemetry must be enabled and non-authoritative');

const scheduler = mode.scheduler || {};
if (
  scheduler.strategy !== 'PUZZLE_FRONTIER' ||
  scheduler.optimizeFor !== 'MINIMUM_SAFE_CRITICAL_PATH' ||
  scheduler.buildSelection !== 'EXPLICIT_PRIORITY_THEN_LONGEST_REMAINING_PATH' ||
  scheduler.prebuildSelection !== 'WAVE_SEEDS_THEN_LOWEST_SPECULATION_DEPTH_THEN_CRITICAL_PATH' ||
  scheduler.canonicalDependencyPolicy !== 'ACCEPTED_ONLY' ||
  scheduler.prebuildPublicationPolicy !== 'ARTIFACT_ONLY_UNTIL_DEPENDENCIES_ACCEPTED' ||
  scheduler.sharedWriteConflictPolicy !== 'FAIL_CLOSED_DEFER' ||
  scheduler.pathFencePolicy !== 'REQUIRED_FOR_PATCH_PREBUILD' ||
  scheduler.contractReconciliationPolicy !== 'REQUIRED_BEFORE_BUILD_PROMOTION' ||
  scheduler.runningTaskActivationPolicy !== 'NON_RETROACTIVE' ||
  scheduler.handoffFormat !== 'AURORA_COMPACT_V1'
)
  throw new Error('Aurora scheduler governance is invalid');

if (mode.mode === 'FREE_ACTIONS_CLI') {
  if (!mode.freeActionsCliEnabled || mode.cloudAgentEnabled || mode.physicalBuildSlots > 2)
    throw new Error('FREE_ACTIONS_CLI safety boundary is invalid');
}
if (mode.mode === 'PRO_PLUS_ACTIONS_FABRIC') {
  if (
    mode.proPlusActionsFabricEnabled !== true ||
    mode.cloudAgentEnabled !== false ||
    mode.freeActionsCliEnabled !== true
  )
    throw new Error(
      'PRO_PLUS_ACTIONS_FABRIC requires Actions fabric plus Free fallback and no cloud-agent claim',
    );
  if (
    !Number.isInteger(mode.fallbackPhysicalBuildSlots) ||
    mode.fallbackPhysicalBuildSlots < 1 ||
    mode.fallbackPhysicalBuildSlots > 2
  )
    throw new Error('PRO+ Free fallback must stay between 1 and 2 slots');
  if (
    !Number.isInteger(discovery.minimumObservedConcurrentSessions) ||
    discovery.minimumObservedConcurrentSessions < 3
  )
    throw new Error('PRO+ Actions Fabric requires measured concurrent-session evidence');
  if (typeof discovery.attestationPath !== 'string' || !discovery.attestationPath.endsWith('.json'))
    throw new Error('PRO+ Actions Fabric requires a runtime attestation path');
}
if (mode.mode === 'PRO_PLUS_CLOUD_AGENT' && !mode.cloudAgentEnabled)
  throw new Error('PRO_PLUS_CLOUD_AGENT requires cloudAgentEnabled=true');

console.log(
  JSON.stringify(
    {
      schemaVersion: mode.schemaVersion,
      mode: mode.mode,
      activationState: mode.activationState || null,
      physicalBuildSlots: mode.physicalBuildSlots,
      fallbackPhysicalBuildSlots: mode.fallbackPhysicalBuildSlots || null,
      runtimeCapabilityDiscovery: discovery,
      capacityController: capacity,
      sessionLeaseRegistry: leases,
      developmentTelemetry: mode.developmentTelemetry,
      scheduler,
    },
    null,
    2,
  ),
);
