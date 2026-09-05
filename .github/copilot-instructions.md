# Aurora AI-Native — GitHub Copilot Instructions

You are contributing to `luizanunciostoca/aurora-ai-native` under strict wave-based governance.

## Authority and live-state rule

Before changing code, revalidate the current `main`, `docs/governance/CURRENT_PROGRAM_STATUS.md`, the owning wave's charter/dependency/ownership/acceptance documents, and the task/issue that assigned your scope. Historical/salvage documents never override accepted exact-SHA evidence or a later publication barrier.

## Core architecture invariants

- Intelligence != Authority != Execution.
- Confidence, model output, cache, context, precheck, session state, Android permission, provider verification, credential possession, UI state, MCP exposure or n8n workflow NEVER create authority.
- Policy answers `MAY THIS HAPPEN?`; intelligence answers `WHAT SHOULD HAPPEN?`; executor performs authorized side effects; evidence proves outcomes.
- Deny by default, least authority, explicit tenant/identity and current-policy validation are mandatory where applicable.
- `EXECUTION_UNCERTAIN` is not ordinary failure and must reconcile before retry.
- Duplicate/replayed/reconnected events must not create duplicate side effects where idempotency is required.

## Dependency and ownership guard

- Do not implement dependency-gated work. If prerequisites or publication barriers are not accepted, stop at readiness analysis and report the blocker.
- Modify only paths explicitly granted by the task. Shared barrels, package manifests/export maps, root workspace files, `package-lock.json`, `.github/workflows/**`, `.github/CODEOWNERS` and cross-wave public surfaces are coordinator-owned unless the task explicitly grants a narrow transfer.
- Never create parallel canonical IDs, enums, policy vocabularies, registries or sources of truth.
- Do not implement future-wave scope opportunistically.

## Copilot Pro+ parallel execution

Aurora uses two different forms of AI parallelism. They MUST NOT be confused:

1. **Separate canonical tasks** use separate isolated Copilot sessions/workspaces/worktrees/branches. Each task retains one issue, one canonical owner, one branch and one PR unless Program Control explicitly records a remediation/supersession.
2. **One canonical task** may use Copilot CLI `/fleet` only for genuinely independent intra-task subtasks. The parent session remains the sole task/branch integrator. For Copilot Pro/Pro+, current GitHub product guidance documents a default maximum of four concurrent CLI subagents per session tree; this is execution capacity, never Aurora authority.

Parallelism rules:

- Program Control dynamically computes safe BUILD concurrency from live `BUILD_READY` nodes, ownership/path isolation, shared-write surfaces, available isolated sessions, CI capacity and current account/runtime limits. Historical Free-mode `physicalBuildSlots=2` is not a current fixed Pro+ cap.
- Do not open another write session merely to increase agent count. Every write lane needs an independent path/semantic owner and must reduce real critical-path time.
- Prefer read-only parallel agents for exploration, contract reconnaissance, red-team/code review, dependency analysis and performance analysis.
- Within one `/fleet`, prefer differentiated roles: read-only explore/contract recon, bounded implementation, bounded test/failure work on disjoint paths, and read-only red-team/code review.
- A subagent cannot claim another canonical issue, create an independent canonical PR, self-accept, merge, or take coordinator-owned shared/root/publication surfaces.
- If two active writers collide on one semantic source-of-truth surface, freeze writes and return ownership resolution to Program Control; never merge competing truths.
- Puzzle `READINESS`/`PREBUILD` lanes may run broadly in parallel but remain non-authoritative, cannot satisfy dependencies and require expected-vs-accepted contract reconciliation before BUILD promotion.
- Integration, Red Team, Performance and Acceptance may inspect one immutable candidate in parallel; any required code change creates a new candidate HEAD and invalidates old CI evidence.

Reusable Pro+ invocations live in `.github/prompts/*.prompt.md` on supported Copilot surfaces. Repository instructions and custom agents remain the source for always-on invariants so long prompts do not need to be recopied into every session.

## Branch / PR / acceptance

- One task = one isolated branch/workspace = one PR unless the task explicitly says otherwise.
- Aurora uses **Single-Owner Governed Acceptance**. A second GitHub identity is optional, not required.
- An implementation worker must not silently self-accept. Program Control / repository owner may accept and merge a candidate under the same repository identity only when an explicit owner authorization is recorded and a separate acceptance review is performed against one exact HEAD.
- Record base `main` SHA and final exact HEAD in the PR body.
- Quality, Test Build and Security must pass on the SAME exact final HEAD, together with any task-specific gates.
- Correctness, Safety/Authority, Performance/Economics and Failure/Recoverability must be explicitly reviewed as Risk Gates A-D where applicable before owner-authorized acceptance.
- CI success alone is never acceptance. Stale CI, unresolved P0/P1, authority elevation, ownership/scope violations, duplicate sources of truth, secret leakage or recovery blockers require `REWORK_REQUIRED`.
- If `main` changes before merge, reconcile and rerun required gates; stale CI is not acceptance evidence.
- Same-identity owner merge is allowed only after the recorded owner decision and acceptance evidence above. Do not force merge.
- After merge, revalidate the exact new `main` with required post-merge gates before labeling/closing the task as accepted or releasing successors.

## Testing and evidence

- Add deterministic tests and negative/boundary tests for changed behavior.
- For W03+, treat Correctness, Safety/Authority, Performance/Economics and Failure/Recoverability as independent acceptance dimensions.
- Preserve correlation, deterministic replay/fingerprint and evidence semantics where applicable.
- Never put secrets, credentials, private chain-of-thought or personal data in code, logs, PRs or governance evidence.

## Reuse

Legacy Aurora, Nova Aurora, n8n salvage and TOCA MCP are reference/planning inputs only unless an explicit accepted task promotes a specific pattern. Prefer: knowledge > semantics > patterns > tests > code. Do not copy external/reference source wholesale.

## Completion handoff

Every task must end with a structured handoff in the PR body or final comment containing: Task/Wave ID, base SHA, branch, PR, exact HEAD, changed paths, contracts consumed/produced, schemas/migrations/events, tests, negative tests, risks/limitations, cleanup/deprecations, evidence, blockers and downstream consumers. Owner-authorized same-identity acceptance additionally records the owner decision, acceptance decision, Risk Gates A-D, merge SHA and post-merge verification.
