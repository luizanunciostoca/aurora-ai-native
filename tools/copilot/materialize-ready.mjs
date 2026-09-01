/* global fetch */
import fs from 'node:fs/promises';
import { loadTaskGraph } from './load-task-graph.mjs';
import { compactPuzzleSummary, selectPuzzleFrontiers } from './puzzle-policy.mjs';

const [owner, repo] = (process.env.GITHUB_REPOSITORY || '').split('/');
const token = process.env.GITHUB_TOKEN;
const summaryPath = process.env.GITHUB_STEP_SUMMARY;
if (!owner || !repo || !token) throw new Error('GITHUB_REPOSITORY and GITHUB_TOKEN are required');

const graph = await loadTaskGraph();
const mode = JSON.parse(
  await fs.readFile('docs/governance/copilot/AURORA_COPILOT_EXECUTION_MODE.json', 'utf8'),
);
if (mode.scheduler?.strategy !== 'PUZZLE_FRONTIER') {
  throw new Error('materialize-ready requires PUZZLE_FRONTIER execution mode');
}

const api = 'https://api.github.com';
const headers = {
  Accept: 'application/vnd.github+json',
  Authorization: `Bearer ${token}`,
  'X-GitHub-Api-Version': '2022-11-28',
  'Content-Type': 'application/json',
};

async function request(path, options = {}) {
  const response = await fetch(`${api}${path}`, {
    ...options,
    headers: { ...headers, ...(options.headers || {}) },
  });
  const text = await response.text();
  const data = text ? JSON.parse(text) : null;
  if (!response.ok) {
    throw new Error(`${options.method || 'GET'} ${path}: ${response.status} ${text}`);
  }
  return data;
}

async function listIssues() {
  const all = [];
  for (let page = 1; ; page += 1) {
    const batch = await request(
      `/repos/${owner}/${repo}/issues?state=all&per_page=100&page=${page}`,
    );
    all.push(...batch.filter((item) => !item.pull_request));
    if (batch.length < 100) break;
  }
  return all;
}

async function ensureLabel(name, color, description) {
  try {
    await request(`/repos/${owner}/${repo}/labels/${encodeURIComponent(name)}`);
  } catch {
    await request(`/repos/${owner}/${repo}/labels`, {
      method: 'POST',
      body: JSON.stringify({ name, color, description }),
    });
  }
}

const labelDefs = [
  ['aurora:task', '1f6feb', 'Aurora governed task-graph node'],
  [
    'aurora:copilot-ready',
    '0e8a16',
    'Canonical dependencies accepted; eligible for BUILD dispatch',
  ],
  ['aurora:copilot-gated', 'd29922', 'Not currently in the canonical BUILD frontier'],
  ['aurora:copilot-dispatched', '8250df', 'Delegated to GitHub Copilot cloud agent'],
  [
    'aurora:dispatch-blocked',
    'b60205',
    'Copilot dispatch could not start; inspect prerequisite/token/policy',
  ],
  ['aurora:accepted', '2da44e', 'Accepted and eligible to satisfy downstream dependency'],
  ['aurora:puzzle-build-ready', '0e8a16', 'Puzzle node is canonical BUILD_READY'],
  ['aurora:puzzle-prebuild', 'a371f7', 'Non-authoritative PREBUILD artifact lane'],
  ['aurora:puzzle-readiness', '54aeff', 'Readiness-only logical puzzle lane'],
  [
    'aurora:puzzle-integration-ready',
    'bf8700',
    'Prebuild reconciled and awaiting canonical validation',
  ],
];
for (const [name, color, description] of labelDefs) await ensureLabel(name, color, description);
for (const wave of [...new Set(graph.tasks.map((task) => task.wave))]) {
  await ensureLabel(`wave:${wave}`, '0969da', `Aurora ${wave} task`);
}

const issues = await listIssues();
const issueByTask = new Map();

function taskIdFromIssue(issue) {
  const marker = issue.body?.match(/<!--\s*AURORA_TASK_ID:\s*([^\s]+)\s*-->/i);
  if (marker) return marker[1];
  const title = issue.title?.match(/^\[AURORA\]\[TASK\s+([^\]]+)\]/i);
  return title?.[1];
}

for (const issue of issues) {
  const taskId = taskIdFromIssue(issue);
  if (taskId) issueByTask.set(taskId, issue);
}
for (const task of graph.tasks) {
  if (task.existingIssueNumber && !issueByTask.has(task.id)) {
    const issue = issues.find((entry) => entry.number === task.existingIssueNumber);
    if (issue) issueByTask.set(task.id, issue);
  }
}

const accepted = new Set(
  graph.tasks.filter((task) => task.initiallyComplete).map((task) => task.id),
);
for (const [taskId, issue] of issueByTask.entries()) {
  if (issue.state === 'closed' && issue.labels?.some((label) => label.name === 'aurora:accepted')) {
    accepted.add(taskId);
  }
}

const puzzle = selectPuzzleFrontiers(graph.tasks, accepted, {
  physicalBuildSlots: mode.physicalBuildSlots,
  maxLogicalLanes: mode.maxLogicalLanes,
  maxPrebuildArtifactLanes: mode.maxPrebuildArtifactLanes,
});
const summary = compactPuzzleSummary(puzzle);
const classifiedById = new Map(puzzle.classified.map((entry) => [entry.task.id, entry]));
const logicalById = new Map(puzzle.logical.map((entry) => [entry.task.id, entry]));

function puzzlePolicyBody(task) {
  return `\n<!-- AURORA_PUZZLE_MODEL: v1 -->\n## Puzzle execution policy\n- Prebuild policy: \`${task.prebuildPolicy}\`\n- Speculation budget: \`${task.speculationBudget}\` dependency layers\n- Prebuild path fence: ${task.prebuildAllowedPaths.length ? task.prebuildAllowedPaths.map((path) => `\`${path}\``).join(', ') : 'none; no speculative runtime patch is authorized'}\n- Expected input contracts: ${task.expectedInputContracts.length ? task.expectedInputContracts.join(', ') : 'resolve from accepted upstream authority before BUILD promotion'}\n- Output contracts: ${task.outputContracts.length ? task.outputContracts.join(', ') : 'task-defined / wave-freeze governed'}\n- Integration points: ${task.integrationPoints.length ? task.integrationPoints.join(', ') : 'resolve during reconciliation'}\n\nPREBUILD and READINESS artifacts are non-authoritative. They cannot satisfy dependencies, create authority, or merge into canonical main. Promotion to BUILD requires every dependency to be \`aurora:accepted\` plus reconciliation of expected versus actual contracts.\n`;
}

function issueBody(task) {
  return `<!-- AURORA_TASK_ID: ${task.id} -->\n<!-- AURORA_CUSTOM_AGENT: ${task.customAgent} -->\n<!-- AURORA_BASE_REF: main -->\n\n## Execution authority\nThis issue is an operational node from the Aurora Copilot task graph. It does not override live main, accepted exact-SHA evidence, CURRENT_PROGRAM_STATUS, Developer Manual v0.5, accepted ADRs or owning wave governance. Revalidate all of them before writing.\n\n## Task\n**${task.id} — ${task.title}**\n\n## Canonical dependency statement\n${task.sourceDependencies || 'See task graph and live wave governance.'}\n\n## Graph dependencies\n${task.dependsOn.length ? task.dependsOn.map((dependency) => `- ${dependency}`).join('\n') : '- none'}\n\n## Mission\n${task.mission || 'Execute only the task-defined scope.'}\n\n## Required sources\n${task.sources.length ? task.sources.join('\n') : '- live repository and owning wave governance'}\n\n## Required work\n${task.actions.length ? task.actions.join('\n') : 'Revalidate the canonical task prompt before work.'}\n\n## Exclusive ownership / intended surface\n${task.ownership}\n\n## Out of scope / prohibited\n${task.forbidden}\n\n## Copilot role\nCustom agent: \`${task.customAgent}\`. BUILD uses one isolated branch/workspace/PR. PREBUILD/READINESS never opens a canonical PR. Shared/root/publication surfaces remain coordinator-owned unless this task explicitly grants them.\n\n## Acceptance evidence\n- deterministic positive/negative/boundary tests proportional to the task\n- cleanup/duplicate/source-of-truth/scope-leak audit\n- Risk Gates A/B/C/D where applicable\n- Quality + Test Build + Security on the same exact final BUILD HEAD\n- structured Aurora handoff with base SHA, branch, PR, exact HEAD, changed paths, tests, risks, blockers and downstream consumers\n\nCanonical BUILD and integration remain blocked until every live dependency is accepted.\n${puzzlePolicyBody(task)}`;
}

const puzzleLabels = new Set([
  'aurora:puzzle-build-ready',
  'aurora:puzzle-prebuild',
  'aurora:puzzle-readiness',
  'aurora:puzzle-integration-ready',
]);

function labelsForState(issue, task, state) {
  const labels = new Set((issue?.labels || []).map((label) => label.name));
  labels.delete('aurora:copilot-ready');
  labels.delete('aurora:copilot-gated');
  labels.delete('aurora:dispatch-blocked');
  for (const label of puzzleLabels) labels.delete(label);
  labels.add('aurora:task');
  labels.add(`wave:${task.wave}`);

  if (state === 'BUILD_READY') {
    labels.add('aurora:puzzle-build-ready');
    labels.add('aurora:copilot-ready');
  } else if (state === 'PREBUILD') {
    labels.add('aurora:puzzle-prebuild');
  } else if (state === 'READINESS') {
    labels.add('aurora:puzzle-readiness');
  } else {
    labels.add('aurora:copilot-gated');
  }
  return [...labels];
}

function desiredState(task) {
  const classified = classifiedById.get(task.id);
  if (!classified || classified.state === 'ACCEPTED') return classified?.state || 'BLOCKED';
  if (classified.state === 'BUILD_READY') return 'BUILD_READY';
  return logicalById.get(task.id)?.state || 'BLOCKED';
}

for (const task of graph.tasks) {
  if (task.initiallyComplete || accepted.has(task.id)) continue;
  const state = desiredState(task);
  let issue = issueByTask.get(task.id);

  if (!issue && state !== 'BLOCKED') {
    issue = await request(`/repos/${owner}/${repo}/issues`, {
      method: 'POST',
      body: JSON.stringify({
        title: `[AURORA][TASK ${task.id}] ${task.title}`,
        body: issueBody(task),
        labels: labelsForState(null, task, state),
      }),
    });
    issueByTask.set(task.id, issue);
    console.log(`materialized ${state} ${task.id} as #${issue.number}`);
    continue;
  }

  if (!issue || issue.state !== 'open') continue;

  let body = issue.body || '';
  if (!taskIdFromIssue(issue)) body = `${body}\n\n${issueBody(task)}`;
  else if (!body.includes('AURORA_PUZZLE_MODEL')) body = `${body}\n${puzzlePolicyBody(task)}`;

  await request(`/repos/${owner}/${repo}/issues/${issue.number}`, {
    method: 'PATCH',
    body: JSON.stringify({
      body,
      labels: labelsForState(issue, task, state),
    }),
  });
  console.log(`${state} ${task.id} on existing #${issue.number}`);
}

console.log(`PUZZLE FRONTIER ${JSON.stringify(summary)}`);
if (summaryPath) {
  const lines = [
    '## Aurora Puzzle Frontier',
    '',
    `Physical BUILD slots: ${mode.physicalBuildSlots}`,
    `Logical lanes: ${summary.logicalFrontier.length}/${mode.maxLogicalLanes}`,
    `State counts: \`${JSON.stringify(summary.stateCounts)}\``,
    '',
    '### Canonical BUILD frontier',
    '',
    '| Task | Wave | Lane | Critical depth |',
    '|---|---|---|---:|',
    ...summary.buildFrontier.map(
      (entry) =>
        `| ${entry.taskId} | ${entry.wave} | ${entry.lane || '-'} | ${entry.criticalPathDepth} |`,
    ),
    '',
    '### Logical PREBUILD / READINESS frontier',
    '',
    '| Task | Wave | State | Policy | Speculation depth | Missing dependencies |',
    '|---|---|---|---|---:|---|',
    ...summary.logicalFrontier.map(
      (entry) =>
        `| ${entry.taskId} | ${entry.wave} | ${entry.state} | ${entry.prebuildPolicy} | ${entry.speculationDepth} | ${entry.missingDependencies.join(', ') || '-'} |`,
    ),
  ];
  await fs.appendFile(summaryPath, `${lines.join('\n')}\n`);
}

console.log(
  `Aurora puzzle graph validated: ${graph.tasks.length} tasks across ${new Set(graph.tasks.map((task) => task.wave)).size} waves.`,
);
