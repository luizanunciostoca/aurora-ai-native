import fs from 'node:fs/promises';

const path = 'docs/governance/copilot/AURORA_COPILOT_EXECUTION_MODE.json';
const mode = JSON.parse(await fs.readFile(path, 'utf8'));

const allowed = new Set(['FREE_ACTIONS_CLI', 'PRO_PLUS_CLOUD_AGENT']);
if (!allowed.has(mode.mode))
  throw new Error(`Unsupported Aurora Copilot execution mode: ${mode.mode}`);

if (!Number.isInteger(mode.maxParallelTasks) || mode.maxParallelTasks < 1) {
  throw new Error('maxParallelTasks must be a positive integer');
}

const scheduler = mode.scheduler || {};
if (scheduler.strategy !== 'READY_FRONTIER') {
  throw new Error('Aurora execution requires scheduler.strategy=READY_FRONTIER');
}
if (scheduler.optimizeFor !== 'MINIMUM_SAFE_CRITICAL_PATH') {
  throw new Error('Aurora scheduler must optimize for MINIMUM_SAFE_CRITICAL_PATH');
}
if (scheduler.selection !== 'EXPLICIT_PRIORITY_THEN_LONGEST_REMAINING_PATH') {
  throw new Error('Unsupported Aurora READY frontier selection policy');
}
if (scheduler.sharedWriteConflictPolicy !== 'FAIL_CLOSED_DEFER') {
  throw new Error('Aurora shared write conflicts must fail closed and defer');
}
if (scheduler.blockedTaskReadinessPolicy !== 'READ_ONLY_ONLY') {
  throw new Error('Blocked Aurora tasks may perform READ_ONLY_ONLY readiness work');
}
if (scheduler.runningTaskActivationPolicy !== 'NON_RETROACTIVE') {
  throw new Error('Scheduler activation must be NON_RETROACTIVE for already-running tasks');
}
if (scheduler.handoffFormat !== 'AURORA_COMPACT_V1') {
  throw new Error('Aurora scheduler must use AURORA_COMPACT_V1 handoffs');
}

if (mode.mode === 'FREE_ACTIONS_CLI') {
  if (!mode.freeActionsCliEnabled)
    throw new Error('FREE_ACTIONS_CLI requires freeActionsCliEnabled=true');
  if (mode.cloudAgentEnabled) throw new Error('FREE_ACTIONS_CLI must keep cloudAgentEnabled=false');
  if (mode.maxParallelTasks > 2) {
    throw new Error('Copilot Free execution mode may not exceed 2 parallel tasks');
  }
}

if (mode.mode === 'PRO_PLUS_CLOUD_AGENT') {
  if (!mode.cloudAgentEnabled)
    throw new Error('PRO_PLUS_CLOUD_AGENT requires cloudAgentEnabled=true');
}

console.log(
  JSON.stringify(
    {
      schemaVersion: mode.schemaVersion || 1,
      mode: mode.mode,
      freeActionsCliEnabled: Boolean(mode.freeActionsCliEnabled),
      cloudAgentEnabled: Boolean(mode.cloudAgentEnabled),
      maxParallelTasks: mode.maxParallelTasks,
      scheduler,
      upgradeTarget: mode.upgradeTarget || null,
    },
    null,
    2,
  ),
);
