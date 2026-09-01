import fs from 'node:fs/promises';
import path from 'node:path';

const TASK_DIR = 'docs/governance/copilot/tasks';
const EXPECTED_TASK_COUNT = 166;

export async function loadTaskGraph() {
  const names = (await fs.readdir(TASK_DIR)).filter((name) => /^W\d\d\.json$/.test(name)).sort();
  if (!names.length) throw new Error(`No wave task files found under ${TASK_DIR}`);

  const tasks = [];
  const sources = [];
  for (const name of names) {
    const raw = JSON.parse(await fs.readFile(path.join(TASK_DIR, name), 'utf8'));
    const defaults = raw.defaults || {};
    for (const task of raw.tasks || []) {
      tasks.push({
        ...defaults,
        ...task,
        wave: task.wave || raw.wave || task.id?.slice(0, 3),
        mode: task.mode || defaults.mode || 'IMPLEMENTATION',
        sourceDependencies: task.sourceDependencies || defaults.sourceDependencies || '',
        mission: task.mission || defaults.mission || '',
        sources: task.sources || defaults.sources || [],
        actions: task.actions || [],
        dependsOn: task.dependsOn || [],
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
    schemaVersion: 1,
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
  console.log(
    JSON.stringify(
      {
        taskCount: graph.tasks.length,
        initiallyComplete,
        waves: [...new Set(graph.tasks.map((t) => t.wave))],
        sources: graph.sources,
      },
      null,
      2,
    ),
  );
}
