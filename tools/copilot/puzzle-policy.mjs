import {
  buildDownstreamDepth,
  hasAllowedPathOverlap,
  hasSharedWriteConflict,
  selectSafeReadyFrontier,
} from './frontier-policy.mjs';

const LOGICAL_STATES = new Set(['PREBUILD', 'READINESS']);

export function missingDependencies(task, accepted) {
  return (task.dependsOn || []).filter((dependency) => !accepted.has(dependency));
}

export function buildSpeculationDepth(tasks, accepted) {
  const byId = new Map(tasks.map((task) => [task.id, task]));
  const memo = new Map();

  function depth(id, visiting = new Set()) {
    if (accepted.has(id)) return 0;
    if (memo.has(id)) return memo.get(id);
    if (visiting.has(id)) throw new Error(`Cycle while calculating speculation depth at ${id}`);

    const task = byId.get(id);
    if (!task) throw new Error(`Unknown task while calculating speculation depth: ${id}`);
    const missing = missingDependencies(task, accepted);
    if (!missing.length) {
      memo.set(id, 0);
      return 0;
    }

    const nextVisiting = new Set(visiting);
    nextVisiting.add(id);
    const value = 1 + Math.max(...missing.map((dependency) => depth(dependency, nextVisiting)));
    memo.set(id, value);
    return value;
  }

  for (const task of tasks) depth(task.id);
  return memo;
}

export function canMaterializePatchPrebuild(task) {
  return task.prebuildPolicy === 'ISOLATED_PATCH' && (task.prebuildAllowedPaths || []).length > 0;
}

export function classifyPuzzleTask(task, accepted, speculationDepth) {
  if (accepted.has(task.id)) return 'ACCEPTED';

  const missing = missingDependencies(task, accepted);
  if (!missing.length) return 'BUILD_READY';

  const depth = Number(speculationDepth.get(task.id) || 1);
  const budget = Number(task.speculationBudget ?? 0);
  if (depth > budget) return 'BLOCKED';

  switch (task.prebuildPolicy) {
    case 'GOVERNANCE_ARTIFACT':
      return 'PREBUILD';
    case 'ISOLATED_PATCH':
      return canMaterializePatchPrebuild(task) ? 'PREBUILD' : 'BLOCKED';
    case 'READINESS_ONLY':
      return task.readinessPolicy === 'NONE' ? 'BLOCKED' : 'READINESS';
    case 'NONE':
    default:
      return 'BLOCKED';
  }
}

function isWaveSeed(task) {
  return String(task.id || '').endsWith('-00');
}

function compareLogical(left, right, speculationDepth, downstreamDepth) {
  const leftSeed = isWaveSeed(left.task) ? 1 : 0;
  const rightSeed = isWaveSeed(right.task) ? 1 : 0;
  if (leftSeed !== rightSeed) return rightSeed - leftSeed;

  const leftDepth = speculationDepth.get(left.task.id) || 0;
  const rightDepth = speculationDepth.get(right.task.id) || 0;
  if (leftDepth !== rightDepth) return leftDepth - rightDepth;

  const leftStateRank = left.state === 'PREBUILD' ? 1 : 0;
  const rightStateRank = right.state === 'PREBUILD' ? 1 : 0;
  if (leftStateRank !== rightStateRank) return rightStateRank - leftStateRank;

  const leftPriority = Number(left.task.dispatchPriority || 0);
  const rightPriority = Number(right.task.dispatchPriority || 0);
  if (leftPriority !== rightPriority) return rightPriority - leftPriority;

  const leftCritical = downstreamDepth.get(left.task.id) || 1;
  const rightCritical = downstreamDepth.get(right.task.id) || 1;
  if (leftCritical !== rightCritical) return rightCritical - leftCritical;

  return String(left.task.id).localeCompare(String(right.task.id));
}

function speculativeConflict(left, right) {
  if (!canMaterializePatchPrebuild(left.task) || !canMaterializePatchPrebuild(right.task)) {
    return null;
  }

  const semantic = hasSharedWriteConflict(left.task, right.task);
  if (semantic) return { reason: 'SPECULATIVE_SHARED_WRITE_SURFACE', surface: semantic };

  const pathOverlap = hasAllowedPathOverlap(
    { ...left.task, allowedPaths: left.task.prebuildAllowedPaths },
    { ...right.task, allowedPaths: right.task.prebuildAllowedPaths },
  );
  if (pathOverlap) return { reason: 'SPECULATIVE_PATH_OVERLAP', surface: pathOverlap };

  return null;
}

export function selectPuzzleFrontiers(tasks, accepted, config) {
  const physicalBuildSlots = Number(config.physicalBuildSlots);
  const maxLogicalLanes = Number(config.maxLogicalLanes);
  const maxPrebuildArtifactLanes = Number(config.maxPrebuildArtifactLanes);
  if (!Number.isInteger(physicalBuildSlots) || physicalBuildSlots < 1) {
    throw new Error('physicalBuildSlots must be a positive integer');
  }
  if (!Number.isInteger(maxLogicalLanes) || maxLogicalLanes < physicalBuildSlots) {
    throw new Error('maxLogicalLanes must be an integer >= physicalBuildSlots');
  }
  if (
    !Number.isInteger(maxPrebuildArtifactLanes) ||
    maxPrebuildArtifactLanes < 0 ||
    maxPrebuildArtifactLanes > maxLogicalLanes
  ) {
    throw new Error('maxPrebuildArtifactLanes must be between 0 and maxLogicalLanes');
  }

  const speculationDepth = buildSpeculationDepth(tasks, accepted);
  const downstreamDepth = buildDownstreamDepth(tasks);
  const classified = tasks.map((task) => ({
    task,
    state: classifyPuzzleTask(task, accepted, speculationDepth),
    missingDependencies: missingDependencies(task, accepted),
  }));

  const buildCandidates = classified
    .filter((entry) => entry.state === 'BUILD_READY')
    .map((entry) => ({ task: entry.task, issue: entry.issue }));
  const buildFrontier = selectSafeReadyFrontier(buildCandidates, tasks, physicalBuildSlots);

  const orderedLogical = classified
    .filter((entry) => LOGICAL_STATES.has(entry.state))
    .sort((left, right) => compareLogical(left, right, speculationDepth, downstreamDepth));
  const logical = [];
  const logicalDeferred = [];
  let prebuildCount = 0;

  for (const candidate of orderedLogical) {
    if (logical.length >= maxLogicalLanes) {
      logicalDeferred.push({ candidate, reason: 'LOGICAL_LANE_LIMIT' });
      continue;
    }
    if (candidate.state === 'PREBUILD' && prebuildCount >= maxPrebuildArtifactLanes) {
      logicalDeferred.push({ candidate, reason: 'PREBUILD_ARTIFACT_LIMIT' });
      continue;
    }

    let conflict = null;
    let conflictWith = null;
    for (const selected of logical) {
      conflict = speculativeConflict(candidate, selected);
      if (conflict) {
        conflictWith = selected.task.id;
        break;
      }
    }
    if (conflict) {
      logicalDeferred.push({
        candidate,
        reason: conflict.reason,
        conflictsWith: conflictWith,
        surface: conflict.surface,
      });
      continue;
    }

    logical.push(candidate);
    if (candidate.state === 'PREBUILD') prebuildCount += 1;
  }

  const stateCounts = Object.fromEntries(
    ['ACCEPTED', 'BUILD_READY', 'PREBUILD', 'READINESS', 'BLOCKED'].map((state) => [
      state,
      classified.filter((entry) => entry.state === state).length,
    ]),
  );

  return {
    classified,
    buildFrontier,
    logical,
    logicalDeferred,
    speculationDepth,
    downstreamDepth,
    stateCounts,
  };
}

export function compactPuzzleSummary(result) {
  return {
    stateCounts: result.stateCounts,
    buildFrontier: result.buildFrontier.selected.map(({ task }) => ({
      taskId: task.id,
      wave: task.wave,
      lane: task.laneHint || null,
      criticalPathDepth: result.downstreamDepth.get(task.id) || 1,
      allowedPaths: task.allowedPaths || [],
      sharedWriteSurfaces: task.sharedWriteSurfaces || [],
    })),
    buildDeferred: result.buildFrontier.deferred.map(({ candidate, reason, conflictsWith, surface }) => ({
      taskId: candidate.task.id,
      reason,
      conflictsWith: conflictsWith || null,
      surface: surface || null,
    })),
    logicalFrontier: result.logical.map((entry) => ({
      taskId: entry.task.id,
      wave: entry.task.wave,
      state: entry.state,
      prebuildPolicy: entry.task.prebuildPolicy,
      speculationDepth: result.speculationDepth.get(entry.task.id) || 0,
      missingDependencies: entry.missingDependencies,
      integrationPoints: entry.task.integrationPoints || [],
    })),
    logicalDeferred: result.logicalDeferred.map(
      ({ candidate, reason, conflictsWith, surface }) => ({
        taskId: candidate.task.id,
        state: candidate.state,
        reason,
        conflictsWith: conflictsWith || null,
        surface: surface || null,
      }),
    ),
  };
}