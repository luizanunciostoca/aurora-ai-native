import { hasAllowedPathOverlap, hasSharedWriteConflict } from './frontier-policy.mjs';

const ACTIVE_LABELS = new Set([
  'aurora:copilot-dispatched',
  'aurora:copilot-free-running',
  'aurora:copilot-free-pr-open',
  'aurora:copilot-free-branch-ready',
  'aurora:canonical-pr-open',
  'aurora:copilot-pro-plus-running',
]);

function taskIdFromIssue(issue) {
  const marker = issue.body?.match(/<!--\s*AURORA_TASK_ID:\s*([^\s]+)\s*-->/i);
  if (marker) return marker[1];
  return issue.title?.match(/^\[AURORA\]\[TASK\s+([^\]]+)\]/i)?.[1] || null;
}

export function projectActiveSessionLeases(issues, tasks) {
  const taskById = new Map(tasks.map((task) => [task.id, task]));
  const leases = [];

  for (const issue of issues || []) {
    if (issue.state !== 'open') continue;
    const labels = new Set((issue.labels || []).map((label) => label.name));
    if (![...ACTIVE_LABELS].some((label) => labels.has(label))) continue;

    const taskId = taskIdFromIssue(issue);
    const task = taskById.get(taskId);
    if (!task) continue;

    leases.push({
      schema: 'aurora.pro_plus.session_lease.v1',
      taskId,
      issueNumber: issue.number,
      allowedPaths: task.allowedPaths || [],
      sharedWriteSurfaces: task.sharedWriteSurfaces || [],
      observedAt: issue.updated_at || null,
      failClosedUntilReconciled: true,
      authority: false,
      task,
    });
  }

  return leases.sort((left, right) => left.taskId.localeCompare(right.taskId));
}

export function findActiveLeaseConflict(task, leases) {
  for (const lease of leases || []) {
    if (lease.taskId === task.id) continue;
    const semanticSurface = hasSharedWriteConflict(task, lease.task);
    if (semanticSurface) {
      return {
        reason: 'ACTIVE_SHARED_WRITE_LEASE',
        conflictsWith: lease.taskId,
        surface: semanticSurface,
      };
    }

    const pathOverlap = hasAllowedPathOverlap(task, lease.task);
    if (pathOverlap) {
      return {
        reason: 'ACTIVE_PATH_LEASE',
        conflictsWith: lease.taskId,
        surface: pathOverlap,
      };
    }
  }
  return null;
}

export function filterCandidatesAgainstActiveLeases(candidates, leases) {
  const eligible = [];
  const deferred = [];

  for (const candidate of candidates || []) {
    const conflict = findActiveLeaseConflict(candidate.task, leases);
    if (conflict) deferred.push({ candidate, ...conflict });
    else eligible.push(candidate);
  }

  return { eligible, deferred };
}
