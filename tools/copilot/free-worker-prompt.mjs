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
You are executing canonical Aurora AI-Native BUILD task ${task.id} from GitHub issue #${issueNumber}.

BASE SHA
${baseSha}

ROLE
Use the project custom agent '${task.customAgent || 'aurora-implementation'}' and obey .github/copilot-instructions.md, AGENTS.md and all matching path instructions.

AUTHORITY
This BUILD task reached PUZZLE BUILD_READY only because its graph dependencies were accepted by canonical evidence. GitHub main/exact-SHA evidence, CURRENT_PROGRAM_STATUS, Developer Manual v0.5, accepted ADRs and owning wave governance remain authoritative and override operational task metadata.

TASK
${task.title}

MODE
${task.mode || 'IMPLEMENTATION'}

PUZZLE EXECUTION METADATA
Lane: ${task.laneHint || 'AUTO'}
Dispatch priority: ${task.dispatchPriority || 0}
Prebuild policy: ${task.prebuildPolicy}
Expected input contracts: ${task.expectedInputContracts.length ? task.expectedInputContracts.join(', ') : 'reconcile from accepted upstream authority'}
Output contracts: ${task.outputContracts.length ? task.outputContracts.join(', ') : 'task-defined / wave-freeze governed'}
Integration points: ${task.integrationPoints.length ? task.integrationPoints.join(', ') : 'resolve from accepted architecture'}
Allowed/owned BUILD path hints: ${task.allowedPaths.length ? task.allowedPaths.join(', ') : 'Resolve exactly from owning wave ownership matrix'}
Shared write surfaces: ${task.sharedWriteSurfaces.length ? task.sharedWriteSurfaces.join(', ') : 'none declared'}
Coordinator-retained surfaces: ${task.coordinatorSurfaces.length ? task.coordinatorSurfaces.join(', ') : 'see live governance'}
Handoff format: ${task.handoffFormat}

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
- One BUILD task = one isolated candidate. Do not expand scope to another task or wave.
- Treat this task as one physical BUILD slot inside a wider Puzzle program that may have many logical PREBUILD/READINESS lanes.
- PREBUILD or READINESS artifacts are non-authoritative. Never assume their contracts, code or conclusions are accepted until Program Control reconciles them against accepted upstream contracts.
- Shared/root/publication surfaces remain coordinator-owned. If one is required, stop that edit and report SHARED_SURFACE_RECONCILIATION_REQUIRED.
- Allowed path hints narrow work; they never widen ownership granted by live governance.
- Do not weaken Intelligence != Authority != Execution.
- Do not invent authority from confidence, precheck, session, permissions, credentials or provider state.
- Do not modify main, create a PR, push, merge, or self-accept. A deterministic publisher job handles branch/PR publication after your run.
- Do not modify GitHub workflows, CODEOWNERS, root workspace files, shared barrels/manifests, migrations or other coordinator surfaces unless this task explicitly owns them.
- Do not depend on legacy/reference/PREBUILD material at runtime unless explicitly promoted by canonical governance.
- If a live prerequisite appears unsatisfied or ownership is ambiguous, make no speculative workaround. Leave the working tree unchanged and explain BLOCKED in your final response.
- Canonical BUILD must remain based on accepted dependencies even if downstream PREBUILD pieces already exist.
- Prefer deterministic implementation for validation, policy, authority, retries, state machines and side effects.
- Run targeted tests and relevant quality checks before completing.
- Keep changes minimal, reviewable and attributable to this task only.
- Never include secrets or private chain-of-thought in files or output.

COMPACT HANDOFF — REQUIRED FINAL RESPONSE
Return only verifiable facts using these fields:
TASK
BASE_SHA
BRANCH: publisher-managed
PR: publisher-managed
EXACT_HEAD: publisher-managed until publication
CHANGED_PATHS
TESTS
CI_RUNS: publisher/acceptance-managed
RISKS
KNOWN_LIMITATIONS
BLOCKERS
DOWNSTREAM_CONSUMERS
SHARED_SURFACE_TOUCHES
RECOMMENDED_ACCEPTANCE_STATE

DEFINITION OF DONE
Produce the smallest correct canonical BUILD candidate for this task, with tests/evidence proportional to scope. Repository CI and independent Aurora acceptance decide whether it may integrate.
`;

process.stdout.write(prompt.trim() + '\n');
