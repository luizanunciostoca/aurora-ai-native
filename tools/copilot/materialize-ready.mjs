import fs from 'node:fs/promises';

const [owner, repo] = (process.env.GITHUB_REPOSITORY || '').split('/');
const token = process.env.GITHUB_TOKEN;
if (!owner || !repo || !token) throw new Error('GITHUB_REPOSITORY and GITHUB_TOKEN are required');

const graph = JSON.parse(await fs.readFile('docs/governance/copilot/AURORA_COPILOT_TASK_GRAPH.json', 'utf8'));
const api = 'https://api.github.com';
const headers = {
  Accept: 'application/vnd.github+json',
  Authorization: `Bearer ${token}`,
  'X-GitHub-Api-Version': '2022-11-28',
  'Content-Type': 'application/json',
};

async function request(path, options = {}) {
  const response = await fetch(`${api}${path}`, { ...options, headers: { ...headers, ...(options.headers || {}) } });
  const text = await response.text();
  const data = text ? JSON.parse(text) : null;
  if (!response.ok) throw new Error(`${options.method || 'GET'} ${path}: ${response.status} ${text}`);
  return data;
}

async function listIssues() {
  const all = [];
  for (let page = 1; ; page += 1) {
    const batch = await request(`/repos/${owner}/${repo}/issues?state=all&per_page=100&page=${page}`);
    all.push(...batch.filter((i) => !i.pull_request));
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
  ['aurora:copilot-ready', '0e8a16', 'Dependencies satisfied; eligible for Copilot dispatch'],
  ['aurora:copilot-gated', 'd29922', 'Blocked by task-graph dependencies'],
  ['aurora:copilot-dispatched', '8250df', 'Delegated to GitHub Copilot cloud agent'],
  ['aurora:dispatch-blocked', 'b60205', 'Copilot dispatch could not start; inspect prerequisite/token/policy'],
  ['aurora:accepted', '2da44e', 'Accepted and eligible to satisfy downstream dependency'],
];
for (const [name, color, description] of labelDefs) await ensureLabel(name, color, description);
for (const wave of [...new Set(graph.tasks.map((t) => t.wave))]) {
  await ensureLabel(`wave:${wave}`, '0969da', `Aurora ${wave} task`);
}

let issues = await listIssues();
const taskById = new Map(graph.tasks.map((t) => [t.id, t]));
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
    const issue = issues.find((x) => x.number === task.existingIssueNumber);
    if (issue) issueByTask.set(task.id, issue);
  }
}

const completed = new Set(graph.tasks.filter((t) => t.initiallyComplete).map((t) => t.id));
for (const [taskId, issue] of issueByTask.entries()) {
  if (issue.state === 'closed' && issue.labels?.some((l) => l.name === 'aurora:accepted')) completed.add(taskId);
}

function issueBody(task) {
  return `<!-- AURORA_TASK_ID: ${task.id} -->\n<!-- AURORA_CUSTOM_AGENT: ${task.customAgent} -->\n<!-- AURORA_BASE_REF: main -->\n\n## Execution authority\nThis issue is an operational node from the Aurora Copilot task graph. It does not override live main, accepted exact-SHA evidence, CURRENT_PROGRAM_STATUS, Developer Manual v0.5, accepted ADRs or owning wave governance. Revalidate all of them before writing.\n\n## Task\n**${task.id} — ${task.title}**\n\n## Canonical dependency statement\n${task.sourceDependencies || 'See task graph and live wave governance.'}\n\n## Graph dependencies\n${task.dependsOn.length ? task.dependsOn.map((d) => `- ${d}`).join('\n') : '- none'}\n\n## Mission\n${task.mission}\n\n## Required sources\n${task.sources.length ? task.sources.join('\n') : '- live repository and owning wave governance'}\n\n## Required work\n${task.actions.length ? task.actions.join('\n') : 'Revalidate the canonical task prompt before work.'}\n\n## Exclusive ownership / intended surface\n${task.ownership}\n\n## Out of scope / prohibited\n${task.forbidden}\n\n## Copilot role\nCustom agent: \`${task.customAgent}\`. One task = one isolated branch/workspace = one PR. Do not merge or self-accept. Shared/root/publication surfaces remain coordinator-owned unless this task explicitly grants them.\n\n## Acceptance evidence\n- deterministic positive/negative/boundary tests proportional to the task\n- cleanup/duplicate/source-of-truth/scope-leak audit\n- Risk Gates A/B/C/D where applicable\n- Quality + Test Build + Security on the same exact final HEAD\n- structured Aurora handoff with base SHA, branch, PR, exact HEAD, changed paths, tests, risks, blockers and downstream consumers\n\nIf a live dependency/publication barrier is not actually accepted, STOP implementation and report the blocker; do not materialize gated runtime.\n`;
}

async function setLabels(issue, desired) {
  const current = new Set((issue.labels || []).map((l) => l.name));
  const next = [...new Set([...current, ...desired])].filter((l) => l !== 'aurora:copilot-gated' && l !== 'aurora:dispatch-blocked');
  return request(`/repos/${owner}/${repo}/issues/${issue.number}`, {
    method: 'PATCH',
    body: JSON.stringify({ labels: next }),
  });
}

for (const task of graph.tasks) {
  if (task.initiallyComplete) continue;
  let issue = issueByTask.get(task.id);
  const depsSatisfied = task.dependsOn.every((d) => completed.has(d));

  if (!issue && depsSatisfied) {
    issue = await request(`/repos/${owner}/${repo}/issues`, {
      method: 'POST',
      body: JSON.stringify({
        title: `[AURORA][TASK ${task.id}] ${task.title}`,
        body: issueBody(task),
        labels: ['aurora:task', 'aurora:copilot-ready', `wave:${task.wave}`],
      }),
    });
    issueByTask.set(task.id, issue);
    console.log(`materialized READY ${task.id} as #${issue.number}`);
    continue;
  }

  if (issue && issue.state === 'open' && depsSatisfied) {
    // Retrofit metadata for an existing manually-created issue, then mark it READY.
    if (!taskIdFromIssue(issue)) {
      issue = await request(`/repos/${owner}/${repo}/issues/${issue.number}`, {
        method: 'PATCH',
        body: JSON.stringify({ body: `${issue.body || ''}\n\n${issueBody(task)}` }),
      });
    }
    await setLabels(issue, ['aurora:task', 'aurora:copilot-ready', `wave:${task.wave}`]);
    console.log(`READY ${task.id} on existing #${issue.number}`);
  }
}
