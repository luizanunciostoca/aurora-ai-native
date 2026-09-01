import fs from 'node:fs/promises';

const path = 'docs/governance/copilot/AURORA_COPILOT_EXECUTION_MODE.json';
const mode = JSON.parse(await fs.readFile(path, 'utf8'));

const allowed = new Set(['FREE_ACTIONS_CLI', 'PRO_PLUS_CLOUD_AGENT']);
if (!allowed.has(mode.mode)) throw new Error(`Unsupported Aurora Copilot execution mode: ${mode.mode}`);

if (!Number.isInteger(mode.maxParallelTasks) || mode.maxParallelTasks < 1) {
  throw new Error('maxParallelTasks must be a positive integer');
}

if (mode.mode === 'FREE_ACTIONS_CLI') {
  if (!mode.freeActionsCliEnabled) throw new Error('FREE_ACTIONS_CLI requires freeActionsCliEnabled=true');
  if (mode.cloudAgentEnabled) throw new Error('FREE_ACTIONS_CLI must keep cloudAgentEnabled=false');
  if (mode.maxParallelTasks > 2) {
    throw new Error('Copilot Free execution mode may not exceed 2 parallel tasks');
  }
}

if (mode.mode === 'PRO_PLUS_CLOUD_AGENT') {
  if (!mode.cloudAgentEnabled) throw new Error('PRO_PLUS_CLOUD_AGENT requires cloudAgentEnabled=true');
}

console.log(
  JSON.stringify(
    {
      mode: mode.mode,
      freeActionsCliEnabled: Boolean(mode.freeActionsCliEnabled),
      cloudAgentEnabled: Boolean(mode.cloudAgentEnabled),
      maxParallelTasks: mode.maxParallelTasks,
      upgradeTarget: mode.upgradeTarget || null,
    },
    null,
    2,
  ),
);
