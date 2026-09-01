import { loadTaskGraph } from './load-task-graph.mjs';

const taskId = process.argv[2];
const issueNumber = process.argv[3];
const baseSha = process.argv[4];
if (!taskId || !issueNumber || !baseSha) {
  throw new Error('Usage: node free-worker-prompt.mjs <taskId> <issueNumber> <baseSha>');
}

const graph = await loadTaskGraph();
const task = graph.tasks.find((entry) => entry.id === taskId);
if (!task) throw new Error(`Unknown Aurora task ${taskId}`);

const prompt = `
You are executing Aurora AI-Native task ${task.id} from GitHub issue #${issueNumber}.

BASE SHA
${baseSha}

ROLE
Use the project custom agent '${task.customAgent || 'aurora-implementation'}' and obey .github/copilot-instructions.md, AGENTS.md and all matching path instructions.

AUTHORITY
This task graph is operational only. GitHub main/exact-SHA evidence, CURRENT_PROGRAM_STATUS, Developer Manual v0.5, accepted ADRs and owning wave governance override it. Revalidate the repository state available in this checkout before changing anything.

TASK
${task.title}

MODE
${task.mode || 'IMPLEMENTATION'}

CANONICAL DEPENDENCY STATEMENT
${task.sourceDependencies || 'See owning wave governance.'}

GRAPH DEPENDENCIES
${task.dependsOn.length ? task.dependsOn.map((item) => `- ${item}`).join('\n') : '- none'}

MISSION
${task.mission || 'Execute only the task-defined scope.'}

REQUIRED SOURCES
${task.sources.length ? task.sources.join('\n') : '- live repository governance'}

REQUIRED WORK
${task.actions.length ? task.actions.join('\n') : '- Revalidate and implement only the defined task.'}

EXCLUSIVE OWNERSHIP / INTENDED SURFACE
${task.ownership}

OUT OF SCOPE / PROHIBITED
${task.forbidden}

HARD EXECUTION RULES
- One task = one isolated candidate. Do not expand scope to another task or wave.
- Do not weaken Intelligence != Authority != Execution.
- Do not invent authority from confidence, precheck, session, permissions, credentials or provider state.
- Do not modify main, create a PR, push, merge, or self-accept. A deterministic publisher job handles branch/PR publication after your run.
- Do not modify GitHub workflows, CODEOWNERS, root workspace files, shared barrels/manifests, migrations or other coordinator surfaces unless this task explicitly owns them.
- Do not depend on legacy/reference material at runtime unless explicitly promoted by canonical governance.
- If a live prerequisite appears unsatisfied or ownership is ambiguous, make no speculative workaround. Leave the working tree unchanged and explain BLOCKED in your final response.
- Prefer deterministic implementation for validation, policy, authority, retries, state machines and side effects.
- Run targeted tests and relevant quality checks before completing.
- Keep changes minimal, reviewable and attributable to this task only.
- Never include secrets or private chain-of-thought in files or output.

DEFINITION OF DONE
Produce the smallest correct candidate change for this task, with tests/evidence proportional to scope. The repository CI and an independent Aurora acceptance step will decide whether it may merge.
`;

process.stdout.write(prompt.trim() + '\n');
