import { execFileSync } from 'node:child_process';

import { pathAllowedByPatterns } from './frontier-policy.mjs';
import { loadTaskGraph } from './load-task-graph.mjs';

const taskId = process.env.AURORA_TASK_ID || process.argv[2];
if (!taskId) throw new Error('AURORA_TASK_ID or task id argument is required');

const graph = await loadTaskGraph();
const task = graph.tasks.find((entry) => entry.id === taskId);
if (!task) throw new Error(`Unknown Aurora task ${taskId}`);

const changedPaths = execFileSync(
  'git',
  ['diff', '--cached', '--name-only', '--diff-filter=ACMRD'],
  { encoding: 'utf8' },
)
  .split('\n')
  .map((entry) => entry.trim())
  .filter(Boolean);

if (!task.allowedPaths.length) {
  console.log(
    `PATH_FENCE_NOT_DECLARED ${task.id}: live ownership remains authoritative; no machine path widening is granted.`,
  );
  process.exit(0);
}

const invalidPaths = changedPaths.filter(
  (filePath) => !pathAllowedByPatterns(filePath, task.allowedPaths),
);
if (invalidPaths.length) {
  throw new Error(
    [
      `PATH_FENCE_VIOLATION ${task.id}`,
      `Allowed: ${task.allowedPaths.join(', ')}`,
      `Rejected: ${invalidPaths.join(', ')}`,
      'Shared/coordinator-owned publication surfaces must be reconciled by Program Control, not the leaf worker.',
    ].join('\n'),
  );
}

console.log(
  `PATH_FENCE_PASS ${task.id}: ${changedPaths.length} changed path(s) are inside declared task ownership.`,
);
