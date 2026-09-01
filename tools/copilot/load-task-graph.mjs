import fs from 'node:fs/promises';
import path from 'node:path';

const TASK_DIR = 'docs/governance/copilot/tasks';
const EXPECTED_TASK_COUNT = 166;
const SUPPORTED_SCHEMA_VERSIONS = new Set([1, 2, 3]);
const PREBUILD_POLICIES = new Set([
  'NONE',
  'READINESS_ONLY',
  'GOVERNANCE_ARTIFACT',
  'ISOLATED_PATCH',
]);

function stringArray(value, fallback = []) {
  return Array.isArray(value) ? value : fallback;
}

function defaultPrebuildPolicy(task, defaults) {
  if (task.prebuildPolicy) return task.prebuildPolicy;
  if (defaults.prebuildPolicy) return defaults.prebuildPolicy;
  if (String(task.id || '').endsWith('-00')) return 'GOVERNANCE_ARTIFACT';
  return 'READINESS_ONLY';
}

export async function loadTaskGraph() {
  const names = (await fs.readdir(TASK_DIR)).filter((name) => /^W\d\d\.json$/.test(name)).sort();
  if (!names.length) throw new Error(`No wave task files found under ${TASK_DIR}`);

  const tasks = [];
  const sources = [];
  for (const name of names) {
    const raw = JSON.parse(await fs.readFile(path.join(TASK_DIR, name), 'utf8'));
    if (!SUPPORTED_SCHEMA_VERSIONS.has(raw.schemaVersion || 1)) {
      throw new Error(`${name} uses unsupported schemaVersion ${raw.schemaVersion}`);
    }

    const defaults = raw.defaults || {};
    for (const task of raw.tasks || []) {
      tasks.push({
        ...defaults,
        ...task,
        wave: task.wave || raw.wave || task.id?.slice(0, 3),
        mode: task.mode || defaults.mode || 'IMPLEMENTATION',
        sourceDependencies: task.sourceDependencies || defaults.sourceDependencies || '',
        mission: task.mission || defaults.mission || '',
        sources: stringArray(task.sources, stringArray(defaults.sources)),
        actions: stringArray(task.actions),
        dependsOn: stringArray(task.dependsOn),
        allowedPaths: stringArray(task.allowedPaths, stringArray(defaults.allowedPaths)),
        sharedWriteSurfaces: stringArray(
          task.sharedWriteSurfaces,
          stringArray(defaults.sharedWriteSurfaces),
        ),
        coordinatorSurfaces: stringArray(
          task.coordinatorSurfaces,
          stringArray(defaults.coordinatorSurfaces),
        ),
        readinessPolicy:
          task.readinessPolicy || defaults.readinessPolicy || 'READ_ONLY_WHILE_BLOCKED',
        handoffFormat: task.handoffFormat || defaults.handoffFormat || 'AURORA_COMPACT_V1',
        laneHint: task.laneHint || defaults.laneHint || null,
        dispatchPriority: Number(task.dispatchPriority ?? defaults.dispatchPriority ?? 0),
        prebuildPolicy: defaultPrebuildPolicy(task, defaults),
        prebuildAllowedPaths: stringArray(
          task.prebuildAllowedPaths,
          stringArray(defaults.prebuildAllowedPaths),
        ),
        expectedInputContracts: stringArray(
          task.expectedInputContracts,
          stringArray(defaults.expectedInputContracts),
        ),
        outputContracts: stringArray(task.outputContracts, stringArray(defaults.outputContracts)),
        integrationPoints: stringArray(
          task.integrationPoints,
          stringArray(defaults.integrationPoints),
        ),
        speculationBudget: Number(task.speculationBudget ?? defaults.speculationBudget ?? 32),
      });
    }
    sources.push(name);
  }

  const ids = new Set();
  for (const task of tasks) {
    if (!task.id) throw new Error('Task missing id');
    if (ids.has(task.id)) throw new Error(`Duplicate Aurora task id: ${task.id}`);
    ids.add(task.id);
    if (!task.customAgent) throw new Error(`Task ${task.id} missing customAgent`);
    if (!task.ownership) throw new Error(`Task ${task.id} missing ownership`);
    if (!task.forbidden) throw new Error(`Task ${task.id} missing forbidden scope`);
    if (!Number.isFinite(task.dispatchPriority)) {
      throw new Error(`Task ${task.id} has invalid dispatchPriority`);
    }
    if (!Number.isInteger(task.speculationBudget) || task.speculationBudget < 0) {
      throw new Error(`Task ${task.id} has invalid speculationBudget`);
    }
    for (const field of [
      'allowedPaths',
      'sharedWriteSurfaces',
      'coordinatorSurfaces',
      'prebuildAllowedPaths',
      'expectedInputContracts',
      'outputContracts',
      'integrationPoints',
    ]) {
      if (!task[field].every((entry) => typeof entry === 'string' && entry.length > 0)) {
        throw new Error(`Task ${task.id} has invalid ${field}`);
      }
    }
    if (!['READ_ONLY_WHILE_BLOCKED', 'NONE'].includes(task.readinessPolicy)) {
      throw new Error(`Task ${task.id} has invalid readinessPolicy ${task.readinessPolicy}`);
    }
    if (!PREBUILD_POLICIES.has(task.prebuildPolicy)) {
      throw new Error(`Task ${task.id} has invalid prebuildPolicy ${task.prebuildPolicy}`);
    }
    if (task.prebuildPolicy === 'ISOLATED_PATCH' && task.prebuildAllowedPaths.length === 0) {
      throw new Error(`Task ${task.id} ISOLATED_PATCH prebuild requires prebuildAllowedPaths`);
    }
    if (task.handoffFormat !== 'AURORA_COMPACT_V1') {
      throw new Error(`Task ${task.id} has unsupported handoffFormat ${task.handoffFormat}`);
    }
  }

  for (const task of tasks) {
    for (const dependency of task.dependsOn) {
      if (!ids.has(dependency))
        throw new Error(`Task ${task.id} depends on unknown task ${dependency}`);
      if (dependency === task.id) throw new Error(`Task ${task.id} depends on itself`);
    }
  }

  const visiting = new Set();
  const visited = new Set();
  const byId = new Map(tasks.map((task) => [task.id, task]));
  function visit(id, stack = []) {
    if (visited.has(id)) return;
    if (visiting.has(id)) throw new Error(`Cycle detected: ${[...stack, id].join(' -> ')}`);
    visiting.add(id);
    for (const dependency of byId.get(id).dependsOn) visit(dependency, [...stack, id]);
    visiting.delete(id);
    visited.add(id);
  }
  for (const task of tasks) visit(task.id);

  if (tasks.length !== EXPECTED_TASK_COUNT) {
    throw new Error(
      `Task graph count mismatch: expected ${EXPECTED_TASK_COUNT}, found ${tasks.length}`,
    );
  }

  return {
    schemaVersion: 3,
    authority:
      'Operational dispatch mirror only; live main/accepted evidence and canonical Drive governance override this graph.',
    expectedTaskCount: EXPECTED_TASK_COUNT,
    sources,
    tasks,
  };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const graph = await loadTaskGraph();
  const initiallyComplete = graph.tasks.filter((t) => t.initiallyComplete).length;
  const parallelMetadataTasks = graph.tasks.filter(
    (t) => t.sharedWriteSurfaces.length || t.allowedPaths.length || t.laneHint,
  ).length;
  const prebuildEnabledTasks = graph.tasks.filter((t) => t.prebuildPolicy !== 'NONE').length;
  const patchPrebuildTasks = graph.tasks.filter((t) => t.prebuildPolicy === 'ISOLATED_PATCH').length;
  console.log(
    JSON.stringify(
      {
        schemaVersion: graph.schemaVersion,
        taskCount: graph.tasks.length,
        initiallyComplete,
        parallelMetadataTasks,
        prebuildEnabledTasks,
        patchPrebuildTasks,
        waves: [...new Set(graph.tasks.map((t) => t.wave))],
        sources: graph.sources,
      },
      null,
      2,
    ),
  );
}