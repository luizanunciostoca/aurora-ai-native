---
description: 'Accelerate one ownership-locked Aurora BUILD task with bounded Pro+ subagents'
---

Task/issue: ${input:task:Enter the canonical Aurora task or issue}

Work on this ONE canonical Aurora task, branch and PR only. Revalidate live `main`, this issue, accepted dependencies, existing canonical ownership and the exact path/semantic fence before writing.

If another canonical owner/PR already exists, do not compete; return to Program Control as a read-only helper.

If the task is BUILD_READY and intra-task parallelism is useful, use `/fleet` with only genuinely independent subtasks. Current Copilot Pro/Pro+ CLI guidance documents a default maximum of four concurrent subagents per session tree.

Preferred roles:

- read-only contract/explore reconnaissance;
- bounded implementation on explicitly owned code paths;
- deterministic tests/failure matrix on disjoint test paths when possible;
- read-only red-team/code review.

Hard boundaries:

- one issue, one parent branch, one final PR, one final exact HEAD;
- one writer per semantic source-of-truth surface;
- no subagent may claim another canonical issue, open an independent canonical PR, merge, self-accept or edit coordinator-owned root/shared/publication surfaces;
- subagent consensus is not acceptance authority.

Parent integrates all outputs, resolves assumptions against accepted contracts, runs canonical formatter/lint/tests, freezes one candidate HEAD and obtains fresh exact-head Quality/Test Build/Security plus task-specific gates.

Return the standard Aurora handoff with base SHA, final HEAD, paths, tests, fleet findings/assumptions, risks and blockers.
