function normalizedStringSet(values) {
  return new Set((values || []).filter((value) => typeof value === 'string' && value.length > 0));
}

function staticGlobPrefix(pattern) {
  const wildcardIndex = pattern.search(/[?*]/);
  return wildcardIndex === -1 ? pattern : pattern.slice(0, wildcardIndex);
}

function globToRegExp(pattern) {
  let source = '^';
  for (let index = 0; index < pattern.length; index += 1) {
    const character = pattern[index];
    if (character === '*') {
      if (pattern[index + 1] === '*') {
        source += '.*';
        index += 1;
      } else {
        source += '[^/]*';
      }
      continue;
    }
    if (character === '?') {
      source += '[^/]';
      continue;
    }
    source += character.replace(/[\\^$.*+?()[\]{}|]/g, '\\$&');
  }
  source += '$';
  return new RegExp(source);
}

export function pathAllowedByPatterns(filePath, patterns) {
  return (patterns || []).some((pattern) => globToRegExp(pattern).test(filePath));
}

export function buildDownstreamDepth(tasks) {
  const dependents = new Map(tasks.map((task) => [task.id, []]));
  for (const task of tasks) {
    for (const dependency of task.dependsOn || []) {
      dependents.get(dependency)?.push(task.id);
    }
  }

  const memo = new Map();
  function depth(id) {
    if (memo.has(id)) return memo.get(id);
    const children = dependents.get(id) || [];
    const value = children.length ? 1 + Math.max(...children.map(depth)) : 1;
    memo.set(id, value);
    return value;
  }

  for (const task of tasks) depth(task.id);
  return memo;
}

export function hasSharedWriteConflict(leftTask, rightTask) {
  const left = normalizedStringSet(leftTask.sharedWriteSurfaces);
  const right = normalizedStringSet(rightTask.sharedWriteSurfaces);
  for (const surface of left) {
    if (right.has(surface)) return surface;
  }
  return null;
}

export function hasAllowedPathOverlap(leftTask, rightTask) {
  const leftPatterns = leftTask.allowedPaths || [];
  const rightPatterns = rightTask.allowedPaths || [];
  if (!leftPatterns.length || !rightPatterns.length) return null;

  for (const leftPattern of leftPatterns) {
    const leftPrefix = staticGlobPrefix(leftPattern);
    for (const rightPattern of rightPatterns) {
      const rightPrefix = staticGlobPrefix(rightPattern);
      if (
        !leftPrefix ||
        !rightPrefix ||
        leftPrefix.startsWith(rightPrefix) ||
        rightPrefix.startsWith(leftPrefix)
      ) {
        return `${leftPattern} <> ${rightPattern}`;
      }
    }
  }
  return null;
}

function candidatePriority(candidate, downstreamDepth) {
  const explicit = Number(candidate.task.dispatchPriority || 0);
  const criticalDepth = Number(downstreamDepth.get(candidate.task.id) || 1);
  return { explicit, criticalDepth };
}

function compareCandidates(left, right, downstreamDepth) {
  const a = candidatePriority(left, downstreamDepth);
  const b = candidatePriority(right, downstreamDepth);
  if (a.explicit !== b.explicit) return b.explicit - a.explicit;
  if (a.criticalDepth !== b.criticalDepth) return b.criticalDepth - a.criticalDepth;

  const waveCompare = String(left.task.wave || '').localeCompare(String(right.task.wave || ''));
  if (waveCompare !== 0) return waveCompare;

  const taskCompare = String(left.task.id).localeCompare(String(right.task.id));
  if (taskCompare !== 0) return taskCompare;
  return Number(left.issue?.number || 0) - Number(right.issue?.number || 0);
}

export function selectSafeReadyFrontier(candidates, tasks, limit) {
  if (!Number.isInteger(limit) || limit < 1)
    throw new Error('frontier limit must be a positive integer');

  const downstreamDepth = buildDownstreamDepth(tasks);
  const ordered = [...candidates].sort((left, right) =>
    compareCandidates(left, right, downstreamDepth),
  );
  const selected = [];
  const deferred = [];

  for (const candidate of ordered) {
    if (selected.length >= limit) {
      deferred.push({ candidate, reason: 'PARALLELISM_LIMIT' });
      continue;
    }

    let conflictingSelection = null;
    let conflictReason = null;
    let conflictingSurface = null;
    for (const selectedCandidate of selected) {
      const semanticSurface = hasSharedWriteConflict(candidate.task, selectedCandidate.task);
      if (semanticSurface) {
        conflictingSelection = selectedCandidate;
        conflictReason = 'SHARED_WRITE_SURFACE';
        conflictingSurface = semanticSurface;
        break;
      }

      const pathOverlap = hasAllowedPathOverlap(candidate.task, selectedCandidate.task);
      if (pathOverlap) {
        conflictingSelection = selectedCandidate;
        conflictReason = 'ALLOWED_PATH_OVERLAP';
        conflictingSurface = pathOverlap;
        break;
      }
    }

    if (conflictingSelection) {
      deferred.push({
        candidate,
        reason: conflictReason,
        conflictsWith: conflictingSelection.task.id,
        surface: conflictingSurface,
      });
      continue;
    }

    selected.push(candidate);
  }

  return {
    selected,
    deferred,
    downstreamDepth,
  };
}

export function compactFrontierSummary(frontier) {
  return {
    selected: frontier.selected.map(({ task, issue }) => ({
      taskId: task.id,
      issue: issue?.number || null,
      lane: task.laneHint || null,
      allowedPaths: task.allowedPaths || [],
      sharedWriteSurfaces: task.sharedWriteSurfaces || [],
      criticalPathDepth: frontier.downstreamDepth.get(task.id) || 1,
    })),
    deferred: frontier.deferred.map(({ candidate, reason, conflictsWith, surface }) => ({
      taskId: candidate.task.id,
      issue: candidate.issue?.number || null,
      reason,
      conflictsWith: conflictsWith || null,
      surface: surface || null,
    })),
  };
}
