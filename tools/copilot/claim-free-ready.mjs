/* global fetch */
import fs from 'node:fs/promises';
import { loadTaskGraph } from './load-task-graph.mjs';
import { compactFrontierSummary, selectSafeReadyFrontier } from './frontier-policy.mjs';

// Legacy validation marker: READY FRONTIER evolved into the canonical BUILD frontier under PUZZLE_FRONTIER.

const [owner, repo] = (process.env.GITHUB_REPOSITORY || '').split('/');
const token = process.env.GITHUB_TOKEN;
const outputPath = process.env.GITHUB_OUTPUT;
const summaryPath = process.env.GITHUB_STEP_SUMMARY;
const baseSha = process.env.AURORA_BASE_SHA;
if (!owner || !repo || !token || !outputPath || !baseSha) {
  throw new Error(
    'GITHUB_REPOSITORY, GITHUB_TOKEN, GITHUB_OUTPUT and AURORA_BASE_SHA are required',
  );
}

const mode = JSON.parse(
  await fs.readFile('docs/governance/copilot/AURORA_COPILOT_EXECUTION_MODE.json', 'utf8'),
);
if (mode.mode !== 'FREE_ACTIONS_CLI' || !mode.freeActionsCliEnabled) {
  await fs.appendFile(
    outputPath,
    'matrix={"include":[]}\ncount=0\nfrontier={"selected":[],"deferred":[]}\n',
  );
  console.log(`Free worker disabled by mode ${mode.mode}`);
  process.exit(0);
}
if (mode.scheduler?.strategy !== 'PUZZLE_FRONTIER') {
  throw new Error('FREE_ACTIONS_CLI requires PUZZLE_FRONTIER scheduler policy');
}

const graph = await loadTaskGraph();
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

for (const [name, color, description] of [
  ['aurora:copilot-free-ready', '54aeff', 'BUILD_READY task queued for Copilot Free Actions CLI'],
  [
    'aurora:copilot-free-running',
    'fbca04',
    'Copilot Free Actions CLI worker currently owns this canonical BUILD task',
  ],
  ['aurora:copilot-free-pr-open', '8250df', 'Copilot Free candidate PR has been published'],
  [
    'aurora:copilot-free-branch-ready',
    'bf8700',
    'Copilot Free candidate branch exists but PR publication requires Program Control',
  ],
  [
    'aurora:copilot-free-no-change',
    'd4c5f9',
    'Copilot Free worker completed without a candidate patch',
  ],
  [
    'aurora:copilot-free-failed',
    'b60205',
    'Copilot Free worker failed before publishing a candidate PR',
  ],
  [
    'aurora:canonical-pr-open',
    '8250df',
    'A canonical open PR already owns this Aurora task; do not create a duplicate candidate',
  ],
]) {
  await ensureLabel(name, color, description);
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

async function listOpenPullRequests() {
  const all = [];
  for (let page = 1; ; page += 1) {
    const batch = await request(
      `/repos/${owner}/${repo}/pulls?state=open&per_page=100&page=${page}`,
    );
    all.push(...batch);
    if (batch.length < 100) break;
  }
  return all;
}

function taskIdFromIssue(issue) {
  const marker = issue.body?.match(/<!--\s*AURORA_TASK_ID:\s*([^\s]+)\s*-->/i);
  if (marker) return marker[1];
  return issue.title?.match(/^\[AURORA\]\[TASK\s+([^\]]+)\]/i)?.[1];
}

function pullRequestOwnsTask(pullRequest, issue, task) {
  const text = `${pullRequest.title || ''}\n${pullRequest.body || ''}`;
  if (text.includes(task.id)) return true;
  return new RegExp(`(?:closes|fixes|resolves)\\s+#${issue.number}\\b`, 'i').test(text);
}

const issues = await listIssues();
const openPullRequests = await listOpenPullRequests();
const accepted = new Set(
  graph.tasks.filter((task) => task.initiallyComplete).map((task) => task.id),
);
for (const issue of issues) {
  const taskId = taskIdFromIssue(issue);
  if (
    taskId &&
    issue.state === 'closed' &&
    issue.labels?.some((label) => label.name === 'aurora:accepted')
  ) {
    accepted.add(taskId);
  }
}

const programControlAgents = new Set([
  'aurora-coordinator',
  'aurora-governance',
  'aurora-acceptance',
]);
const candidates = [];
for (const issue of issues) {
  if (issue.state !== 'open') continue;
  const labels = new Set((issue.labels || []).map((label) => label.name));
  if (!labels.has('aurora:copilot-ready') || !labels.has('aurora:puzzle-build-ready')) continue;
  if (labels.has('aurora:puzzle-prebuild') || labels.has('aurora:puzzle-readiness')) continue;
  if (
    labels.has('aurora:copilot-dispatched') ||
    labels.has('aurora:copilot-free-running') ||
    labels.has('aurora:copilot-free-pr-open') ||
    labels.has('aurora:copilot-free-branch-ready')
  ) {
    continue;
  }

  const taskId = taskIdFromIssue(issue);
  const task = graph.tasks.find((entry) => entry.id === taskId);
  if (!task) continue;
  if (!task.dependsOn.every((dependency) => accepted.has(dependency))) {
    throw new Error(`BUILD_READY issue ${issue.number} for ${task.id} has unaccepted dependency`);
  }

  if (programControlAgents.has(task.customAgent)) {
    console.log(`leaving BUILD_READY ${task.id} for Program Control agent ${task.customAgent}`);
    continue;
  }

  const owningPullRequest = openPullRequests.find((pullRequest) =>
    pullRequestOwnsTask(pullRequest, issue, task),
  );
  if (owningPullRequest) {
    labels.delete('aurora:copilot-free-ready');
    labels.delete('aurora:copilot-free-running');
    labels.add('aurora:canonical-pr-open');
    await request(`/repos/${owner}/${repo}/issues/${issue.number}`, {
      method: 'PATCH',
      body: JSON.stringify({ labels: [...labels] }),
    });
    console.log(
      `skipping ${task.id}: canonical PR #${owningPullRequest.number} already owns issue #${issue.number}`,
    );
    continue;
  }

  candidates.push({ issue, task });
}

const physicalBuildSlots = Number(mode.physicalBuildSlots || mode.maxParallelTasks || 2);
const frontier = selectSafeReadyFrontier(candidates, graph.tasks, physicalBuildSlots);
const selected = frontier.selected;
const frontierSummary = compactFrontierSummary(frontier);
const include = [];

console.log(`CANONICAL BUILD FRONTIER ${JSON.stringify(frontierSummary)}`);
if (summaryPath) {
  const lines = [
    '## Aurora Canonical BUILD Frontier',
    '',
    `Base SHA: \`${baseSha}\``,
    `Physical BUILD slots: ${physicalBuildSlots}`,
    '',
    `Selected: ${frontierSummary.selected.length}; deferred: ${frontierSummary.deferred.length}`,
    '',
    '| Task | Issue | Lane | Critical depth | Shared write surfaces |',
    '|---|---:|---|---:|---|',
    ...frontierSummary.selected.map(
      (entry) =>
        `| ${entry.taskId} | ${entry.issue ?? '-'} | ${entry.lane ?? '-'} | ${entry.criticalPathDepth} | ${entry.sharedWriteSurfaces.join(', ') || '-'} |`,
    ),
  ];
  if (frontierSummary.deferred.length) {
    lines.push('', '### Deferred', '');
    for (const entry of frontierSummary.deferred) {
      lines.push(
        `- ${entry.taskId}: ${entry.reason}${entry.conflictsWith ? ` with ${entry.conflictsWith}` : ''}${entry.surface ? ` on ${entry.surface}` : ''}`,
      );
    }
  }
  await fs.appendFile(summaryPath, `${lines.join('\n')}\n`);
}

for (const { issue, task } of selected) {
  const labels = new Set((issue.labels || []).map((label) => label.name));
  labels.delete('aurora:dispatch-blocked');
  labels.delete('aurora:copilot-free-failed');
  labels.delete('aurora:copilot-free-no-change');
  labels.delete('aurora:canonical-pr-open');
  labels.add('aurora:copilot-free-ready');
  labels.add('aurora:copilot-free-running');
  await request(`/repos/${owner}/${repo}/issues/${issue.number}`, {
    method: 'PATCH',
    body: JSON.stringify({ labels: [...labels] }),
  });

  include.push({
    issue: issue.number,
    taskId: task.id,
    agent: task.customAgent || 'aurora-implementation',
    baseSha,
    lane: task.laneHint || '',
  });
  console.log(
    `claimed BUILD_READY ${task.id} from issue #${issue.number} on ${task.laneHint || 'AUTO'} lane`,
  );
}

await fs.appendFile(
  outputPath,
  `matrix=${JSON.stringify({ include })}\ncount=${include.length}\nfrontier=${JSON.stringify(frontierSummary)}\n`,
);
