/* global fetch */
import fs from 'node:fs/promises';
import { loadTaskGraph } from './load-task-graph.mjs';

const [owner, repo] = (process.env.GITHUB_REPOSITORY || '').split('/');
const token = process.env.GITHUB_TOKEN;
const outputPath = process.env.GITHUB_OUTPUT;
const baseSha = process.env.AURORA_BASE_SHA;
if (!owner || !repo || !token || !outputPath || !baseSha) {
  throw new Error('GITHUB_REPOSITORY, GITHUB_TOKEN, GITHUB_OUTPUT and AURORA_BASE_SHA are required');
}

const mode = JSON.parse(
  await fs.readFile('docs/governance/copilot/AURORA_COPILOT_EXECUTION_MODE.json', 'utf8'),
);
if (mode.mode !== 'FREE_ACTIONS_CLI' || !mode.freeActionsCliEnabled) {
  await fs.appendFile(outputPath, 'matrix={"include":[]}\ncount=0\n');
  console.log(`Free worker disabled by mode ${mode.mode}`);
  process.exit(0);
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
  if (!response.ok) throw new Error(`${options.method || 'GET'} ${path}: ${response.status} ${text}`);
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
  ['aurora:copilot-free-ready', '54aeff', 'READY task queued for Copilot Free Actions CLI'],
  ['aurora:copilot-free-running', 'fbca04', 'Copilot Free Actions CLI worker currently owns this task'],
  ['aurora:copilot-free-pr-open', '8250df', 'Copilot Free candidate PR has been published'],
  ['aurora:copilot-free-no-change', 'd4c5f9', 'Copilot Free worker completed without a candidate patch'],
  ['aurora:copilot-free-failed', 'b60205', 'Copilot Free worker failed before publishing a candidate PR'],
]) {
  await ensureLabel(name, color, description);
}

async function listIssues() {
  const all = [];
  for (let page = 1; ; page += 1) {
    const batch = await request(`/repos/${owner}/${repo}/issues?state=all&per_page=100&page=${page}`);
    all.push(...batch.filter((item) => !item.pull_request));
    if (batch.length < 100) break;
  }
  return all;
}

function taskIdFromIssue(issue) {
  const marker = issue.body?.match(/<!--\s*AURORA_TASK_ID:\s*([^\s]+)\s*-->/i);
  if (marker) return marker[1];
  return issue.title?.match(/^\[AURORA\]\[TASK\s+([^\]]+)\]/i)?.[1];
}

const issues = await listIssues();
const accepted = new Set(graph.tasks.filter((task) => task.initiallyComplete).map((task) => task.id));
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

const candidates = [];
for (const issue of issues) {
  if (issue.state !== 'open') continue;
  const labels = new Set((issue.labels || []).map((label) => label.name));
  if (!labels.has('aurora:copilot-ready')) continue;
  if (
    labels.has('aurora:copilot-dispatched') ||
    labels.has('aurora:copilot-free-running') ||
    labels.has('aurora:copilot-free-pr-open')
  ) {
    continue;
  }

  const taskId = taskIdFromIssue(issue);
  const task = graph.tasks.find((entry) => entry.id === taskId);
  if (!task) continue;
  if (!task.dependsOn.every((dependency) => accepted.has(dependency))) continue;

  candidates.push({ issue, task });
}

candidates.sort((a, b) => a.issue.number - b.issue.number);
const selected = candidates.slice(0, Number(mode.maxParallelTasks || 2));
const include = [];

for (const { issue, task } of selected) {
  const labels = new Set((issue.labels || []).map((label) => label.name));
  labels.delete('aurora:dispatch-blocked');
  labels.delete('aurora:copilot-free-failed');
  labels.delete('aurora:copilot-free-no-change');
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
  });
  console.log(`claimed ${task.id} from issue #${issue.number}`);
}

await fs.appendFile(outputPath, `matrix=${JSON.stringify({ include })}\ncount=${include.length}\n`);
