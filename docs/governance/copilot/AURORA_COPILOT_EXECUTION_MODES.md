# Aurora Copilot Execution Modes

Status: `ACTIVE_OPERATIONAL_GOVERNANCE_CANDIDATE`

This document describes how the accepted Aurora Copilot task fabric executes READY nodes under different GitHub Copilot plans. It is operational governance only and never overrides live `main`, exact-SHA acceptance evidence, `CURRENT_PROGRAM_STATUS.md`, Developer Manual v0.5, ADRs, wave ownership/dependency documents or Risk Framework gates.

The execution mechanism and the scheduler are separate concerns. Every mode uses the `READY_FRONTIER` scheduler defined by `AURORA_FULL_WAVE_PARALLEL_EXECUTION_STANDARD.md` and optimizes for `MINIMUM_SAFE_CRITICAL_PATH`.

## READY_FRONTIER scheduler

- Only nodes whose dependencies are fully accepted may enter the implementation frontier.
- The frontier is recalculated after every accepted state transition.
- If READY nodes exceed available execution slots, explicit `dispatchPriority` wins first, then longest remaining DAG path.
- Tasks declaring the same `sharedWriteSurfaces` value cannot occupy the same frontier; the collision is deferred fail-closed to Program Control.
- Blocked nodes may perform only read-only readiness when the task permits it.
- Tasks already running when a new scheduler standard is activated are non-retroactive and keep their legitimate original base/claim contract.
- Workers use `AURORA_COMPACT_V1` handoffs; GitHub and Drive remain the canonical shared memory.

## FREE_ACTIONS_CLI

Current intended mode while the repository owner uses Copilot Free.

- Copilot cloud agent is disabled because GitHub documents it as a paid-plan feature.
- Copilot CLI is available on all Copilot plans and may run in GitHub Actions with the built-in workflow `GITHUB_TOKEN` and `copilot-requests: write` permission.
- Aurora caps task concurrency at 2 in this mode; the scheduler fills those slots from the maximum safe READY frontier rather than simply taking the oldest two tasks.
- The AI worker receives `contents: read` only. It cannot push to `main`, create branches, merge or publish a PR directly.
- Copilot produces a local patch artifact from an exact base SHA.
- A separate deterministic publisher job, with no model invocation, applies the patch to an isolated branch and opens a candidate PR.
- The publisher explicitly dispatches Quality, Test Build and Security against that candidate branch because changes performed with `GITHUB_TOKEN` do not implicitly satisfy Aurora exact-head acceptance requirements.
- No candidate is merged or marked `aurora:accepted` automatically.
- If Copilot exits unsuccessfully or produces no patch, the issue is marked accordingly and no candidate PR is published.
- Infrastructure/control-plane paths are stripped from AI-generated patches before publication.

## PRO_PLUS_CLOUD_AGENT

Planned upgrade mode after the repository owner activates Copilot Pro+.

- Set `mode` to `PRO_PLUS_CLOUD_AGENT` only through a normal reviewed PR.
- Set `cloudAgentEnabled` to `true`.
- The existing governed dispatcher may then use GitHub Copilot cloud-agent assignment for READY task issues.
- Configure any required user-scoped assignment credential only as a GitHub Actions secret; never commit it or place it in issues/comments.
- Existing task graph, READY frontier, custom agents, ownership, exact-head CI, independent acceptance and no-self-merge rules remain unchanged.
- Increasing `maxParallelTasks` does not authorize unsafe fan-out; dependency and shared-write constraints still bound the actual frontier.
- Switching plans never widens Aurora runtime authority or wave ownership.

## Invariants across all modes

1. A task appearing in the 166-task graph is not a dependency release by itself.
2. `aurora:accepted` plus live canonical evidence is required to satisfy downstream graph dependencies.
3. One task has one isolated candidate surface at a time.
4. Intelligence is not authority and neither Copilot nor ChatGPT may invent execution permission.
5. No implementation agent self-accepts or self-merges.
6. Main drift requires reconciliation and new exact-head gates before acceptance.
7. Legacy/reference material remains non-authoritative unless explicitly promoted.
8. W03+ Risk Gates A/B/C/D remain mandatory.
9. Shared-write collisions fail closed to Program Control.
10. The optimization target is minimum safe critical-path duration, not maximum agent count.

## Current switch file

`docs/governance/copilot/AURORA_COPILOT_EXECUTION_MODE.json`

The switch file is validated by `tools/copilot/validate-execution-mode.mjs` and by the Aurora Copilot Fabric Validation workflow.
