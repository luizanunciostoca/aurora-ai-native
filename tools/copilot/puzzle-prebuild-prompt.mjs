import { loadTaskGraph } from './load-task-graph.mjs';

const taskId = process.argv[2];
const baseSha = process.argv[3];
const missingDependencies = (process.argv[4] || '')
  .split(',')
  .map((entry) => entry.trim())
  .filter(Boolean);
if (!taskId || !baseSha) {
  throw new Error(
    'Usage: node puzzle-prebuild-prompt.mjs <taskId> <baseSha> [comma-separated-missing-dependencies]',
  );
}

const graph = await loadTaskGraph();
const task = graph.tasks.find((entry) => entry.id === taskId);
if (!task) throw new Error(`Unknown Aurora task ${taskId}`);
if (task.prebuildPolicy === 'NONE') throw new Error(`${task.id} does not permit PREBUILD`);

const artifactKind =
  task.prebuildPolicy === 'GOVERNANCE_ARTIFACT'
    ? 'GOVERNANCE_ARTIFACT'
    : task.prebuildPolicy === 'ISOLATED_PATCH'
      ? 'ISOLATED_PATCH'
      : 'READINESS';

const prompt = `
You are one non-authoritative logical Puzzle lane for Aurora task ${task.id}.

BASE SHA
${baseSha}

PREBUILD ARTIFACT KIND
${artifactKind}

MISSING CANONICAL DEPENDENCIES
${missingDependencies.length ? missingDependencies.map((dependency) => `- ${dependency}`).join('\n') : '- Resolve from the live graph; do not assume they are accepted.'}

PURPOSE
Reduce future critical-path time without pretending that blocked work is canonical. Prepare the piece of the puzzle now so Program Control can reconcile and promote it quickly when real upstream contracts arrive.

TASK
${task.title}

MISSION
${task.mission || 'Prepare only the task-defined scope.'}

EXPECTED INPUT CONTRACTS
${task.expectedInputContracts.length ? task.expectedInputContracts.map((item) => `- ${item}`).join('\n') : '- Discover and record expected upstream interfaces as assumptions, never authority.'}

EXPECTED OUTPUT CONTRACTS
${task.outputContracts.length ? task.outputContracts.map((item) => `- ${item}`).join('\n') : '- Record proposed outputs without declaring them canonical.'}

INTEGRATION POINTS
${task.integrationPoints.length ? task.integrationPoints.map((item) => `- ${item}`).join('\n') : '- Map likely integration points and mark unresolved ones.'}

PREBUILD PATH FENCE
${task.prebuildAllowedPaths.length ? task.prebuildAllowedPaths.map((item) => `- ${item}`).join('\n') : '- NONE. You are not authorized to create a speculative runtime patch.'}

REQUIRED WORK
${task.actions.length ? task.actions.join('\n') : '- Build a readiness artifact for the future canonical task.'}

HARD RULES
- PREBUILD is not authority, acceptance, release, or execution permission.
- Do not satisfy a dependency by inference. Missing dependencies remain missing until Program Control verifies aurora:accepted evidence.
- Do not open a canonical PR, merge, publish to main, change migrations/shared manifests/lockfiles/workflows, or mark the task accepted.
- READINESS: do not modify runtime files. Map contracts, tests, risks, edge cases, ownership and reconciliation steps.
- GOVERNANCE_ARTIFACT: prepare candidate dependency/ownership/acceptance/risk material only. It cannot freeze a future wave early.
- ISOLATED_PATCH: a patch is allowed only inside the explicit PREBUILD PATH FENCE above. It remains an artifact, not a canonical candidate, and must be revalidated/reconciled after dependencies are accepted.
- If the task has no explicit prebuild path fence, never invent one from prose ownership.
- Record every assumption that depends on an unavailable upstream contract.
- Prefer tests/specifications/harness design that can survive upstream contract reconciliation.
- Preserve Intelligence != Authority != Execution.

REQUIRED FINAL ARTIFACT
Return one JSON object compatible with tools/copilot/puzzle-prebuild-artifact.mjs:
{
  "schemaVersion": 1,
  "taskId": "${task.id}",
  "wave": "${task.wave}",
  "baseSha": "${baseSha}",
  "artifactKind": "${artifactKind}",
  "canonicalAuthority": false,
  "requiresReconciliation": true,
  "missingDependencies": [],
  "assumptions": [],
  "expectedInputContracts": [],
  "observedInputContracts": [],
  "outputContracts": [],
  "integrationPoints": [],
  "changedPaths": [],
  "testsPlanned": [],
  "risks": [],
  "blockers": []
}

Do not include private chain-of-thought. Include only verifiable facts, explicit assumptions and proposed integration work.
`;

process.stdout.write(prompt.trim() + '\n');
