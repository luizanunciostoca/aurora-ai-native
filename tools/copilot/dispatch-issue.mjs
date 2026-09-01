/* global fetch */
import fs from 'node:fs/promises';
import { loadTaskGraph } from './load-task-graph.mjs';

const [owner, repo] = (process.env.GITHUB_REPOSITORY || '').split('/');
const githubToken = process.env.GITHUB_TOKEN;
const copilotToken = process.env.AURORA_COPILOT_USER_TOKEN;
const eventPath = process.env.GITHUB_EVENT_PATH;
if (!owner || !repo || !githubToken)
  throw new Error('GITHUB_REPOSITORY and GITHUB_TOKEN are required');

const graph = await loadTaskGraph();
const executionMode = JSON.parse(
  await fs.readFile('docs/governance/copilot/AURORA_COPILOT_EXECUTION_MODE.json', 'utf8'),
);
const event = eventPath ? JSON.parse(await fs.readFile(eventPath, 'utf8')) : {};
const issueNumber = Number(process.env.AURORA_ISSUE_NUMBER || event.issue?.number || 0);
if (!issueNumber) throw new Error('No issue number supplied');

const api = 'https://api.github.com';
function headers(token) {
  return {
    Accept: 'application/vnd.github+json',
    Authorization: `Bearer ${token}`,
    'X-GitHub-Api-Version': '2022-11-28',
    'Content-Type': 'application/json',
  };
}
async function request(path, token, options = {}) {
  const response = await fetch(`${api}${path}`, {
    ...options,
    headers: { ...headers(token), ...(options.headers || {}) },
  });
  const text = await response.text();
  let data = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = text;
  }
  if (!response.ok)
    throw new Error(`${options.method || 'GET'} ${path}: ${response.status} ${text}`);
  return data;
}
async function comment(body) {
  return request(`/repos/${owner}/${repo}/issues/${issueNumber}/comments`, githubToken, {
    method: 'POST',
    body: JSON.stringify({ body }),
  });
}
async function patchIssue(body) {
  return request(`/repos/${owner}/${repo}/issues/${issueNumber}`, githubToken, {
    method: 'PATCH',
    body: JSON.stringify(body),
  });
}

const issue = await request(`/repos/${owner}/${repo}/issues/${issueNumber}`, githubToken);
const marker = issue.body?.match(/<!--\s*AURORA_TASK_ID:\s*([^\s]+)\s*-->/i);
const titleMarker = issue.title?.match(/^\[AURORA\]\[TASK\s+([^\]]+)\]/i);
const taskId = marker?.[1] || titleMarker?.[1];
const task = graph.tasks.find((t) => t.id === taskId);
if (!task) throw new Error(`Issue #${issueNumber} is not mapped to an Aurora task`);
if (!issue.labels?.some((l) => l.name === 'aurora:copilot-ready')) {
  console.log(`Issue #${issueNumber} is not READY; skipping`);
  process.exit(0);
}
if (issue.labels?.some((l) => l.name === 'aurora:copilot-dispatched')) {
  console.log(`Issue #${issueNumber} already dispatched; skipping`);
  process.exit(0);
}

const allIssues = [];
for (let page = 1; ; page += 1) {
  const batch = await request(
    `/repos/${owner}/${repo}/issues?state=all&per_page=100&page=${page}`,
    githubToken,
  );
  allIssues.push(...batch.filter((i) => !i.pull_request));
  if (batch.length < 100) break;
}
const accepted = new Set(graph.tasks.filter((t) => t.initiallyComplete).map((t) => t.id));
for (const i of allIssues) {
  const m =
    i.body?.match(/<!--\s*AURORA_TASK_ID:\s*([^\s]+)\s*-->/i) ||
    i.title?.match(/^\[AURORA\]\[TASK\s+([^\]]+)\]/i);
  if (m && i.state === 'closed' && i.labels?.some((l) => l.name === 'aurora:accepted'))
    accepted.add(m[1]);
}
const missing = task.dependsOn.filter((d) => !accepted.has(d));
if (missing.length) {
  const labels = [
    ...new Set([
      ...(issue.labels || []).map((l) => l.name).filter((l) => l !== 'aurora:copilot-ready'),
      'aurora:copilot-gated',
    ]),
  ];
  await patchIssue({ labels });
  await comment(
    `Copilot dispatch refused fail-closed: graph dependencies are not accepted: ${missing.join(', ')}.`,
  );
  process.exit(0);
}

if (executionMode.mode === 'FREE_ACTIONS_CLI') {
  const currentLabels = new Set((issue.labels || []).map((l) => l.name));
  const alreadyQueued = currentLabels.has('aurora:copilot-free-ready');
  currentLabels.delete('aurora:dispatch-blocked');
  currentLabels.add('aurora:copilot-free-ready');
  await patchIssue({ labels: [...currentLabels] });
  if (!alreadyQueued) {
    await comment(
      `Aurora Copilot execution mode is \`FREE_ACTIONS_CLI\`. Cloud-agent assignment is intentionally disabled. Task ${task.id} is queued for the governed Copilot Free GitHub Actions worker, which uses the workflow GITHUB_TOKEN and a maximum of ${executionMode.maxParallelTasks || 2} parallel tasks.`,
    );
  }
  console.log(`queued ${task.id} for FREE_ACTIONS_CLI`);
  process.exit(0);
}

if (!executionMode.cloudAgentEnabled) {
  const labels = [
    ...new Set([...(issue.labels || []).map((l) => l.name), 'aurora:dispatch-blocked']),
  ];
  await patchIssue({ labels });
  await comment(
    `Copilot cloud-agent dispatch is disabled by execution mode ${executionMode.mode}.`,
  );
  process.exit(0);
}

if (!copilotToken) {
  const labels = [
    ...new Set([...(issue.labels || []).map((l) => l.name), 'aurora:dispatch-blocked']),
  ];
  await patchIssue({ labels });
  await comment(
    'Copilot cloud-agent dispatch is enabled but `AURORA_COPILOT_USER_TOKEN` is not configured as a repository secret. No cloud agent was started. Do not paste the token into an issue or repository file.',
  );
  process.exit(0);
}

const customInstructions = `Follow .github/copilot-instructions.md, AGENTS.md and all matching path instructions. This is Aurora task ${task.id}. Revalidate live dependencies and ownership before writing. One task = one isolated branch/PR. Do not merge or self-accept. If a live prerequisite is not actually accepted, stop implementation and report BLOCKED. Respect the issue's ownership and prohibited surfaces exactly.`;

try {
  await request(`/repos/${owner}/${repo}/issues/${issueNumber}/assignees`, copilotToken, {
    method: 'POST',
    body: JSON.stringify({
      assignees: ['copilot-swe-agent[bot]'],
      agent_assignment: {
        target_repo: `${owner}/${repo}`,
        base_branch: 'main',
        custom_instructions: customInstructions,
        custom_agent: task.customAgent || 'aurora-implementation',
      },
    }),
  });

  const labels = [
    ...new Set([
      ...(issue.labels || [])
        .map((l) => l.name)
        .filter((l) => l !== 'aurora:copilot-ready' && l !== 'aurora:dispatch-blocked'),
      'aurora:copilot-dispatched',
    ]),
  ];
  await patchIssue({ labels });
  await comment(
    `Dispatched to GitHub Copilot cloud agent with custom agent \`${task.customAgent}\`. The resulting PR remains subject to Aurora exact-head CI, independent acceptance and no-self-merge rules.`,
  );
  console.log(`dispatched ${task.id} (#${issueNumber}) to ${task.customAgent}`);
} catch (error) {
  const labels = [
    ...new Set([...(issue.labels || []).map((l) => l.name), 'aurora:dispatch-blocked']),
  ];
  await patchIssue({ labels });
  await comment(
    `Copilot dispatch failed closed. No task release is implied. Error: \`${String(error.message).slice(0, 1500)}\``,
  );
  throw error;
}
