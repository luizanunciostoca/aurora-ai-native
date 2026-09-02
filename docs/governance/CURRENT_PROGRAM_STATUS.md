# Aurora AI-Native — Current Program Status & Document Authority

Status: `ACTIVE_CURRENT_PROGRAM_STATE_W05_G_ACCEPTED_W05_H_BUILD_READY_W07_G_ACCEPTED_W07_H_BUILD_RUNNING`
Audit date: 2026-09-02
Accepted implementation baseline before this status publication: `cf293ca103bd1e6adfb250bc5186668aa6870d4a`

## Authority order

1. GitHub `main` is implementation/code authority.
2. Accepted PR/exact-SHA/post-merge evidence governs implementation and publication acceptance.
3. Google Drive `AURORA_AI_NATIVE_DEVELOPMENT_GOVERNANCE` is live operational governance/evidence authority.
4. Developer Manual v0.5 Audit-Consolidated, accepted ADRs and owning-wave governance define architecture/scope.
5. Risk & Architecture Validation Framework v1.0 is mandatory for W03+.
6. Historical/superseded/salvage material is provenance/reference only.

No prompt, task node, PREBUILD artifact, draft PR, agent output, green CI on a stale SHA or reference source releases a dependency by itself. Historical detail intentionally omitted from this compact current-state file remains preserved in Git history and accepted wave evidence.

## Accepted program state

- W00: `COMPLETE_ACCEPTED`.
- W01: `COMPLETE_ACCEPTED`.
- W02: `COMPLETE_ACCEPTED / REALITY_GATE_1_AUTHORITY_VERIFIED`.
- W03: `COMPLETE_ACCEPTED / REALITY_GATE_DURABLE_EVENT_DELIVERY_VERIFIED`.
- W04: `COMPLETE_ACCEPTED / W04_CONTROL_CORE_VERIFIED`.
- W05-00/A/C/D/E/F/B/G: `COMPLETE_ACCEPTED_MERGED / POST_MERGE_EXACT_MAIN_VERIFIED`.
- W05-H: `DEPENDENCY_READY / PUZZLE_BUILD_READY`; it is the only remaining W05 implementation/convergence node.
- W06: gated on accepted W05-H.
- W07-00/A/B/C/D/E/F/G: `COMPLETE_ACCEPTED_MERGED / POST_MERGE_EXACT_MAIN_VERIFIED`.
- W07-H: `DEPENDENCY_READY / PUZZLE_BUILD_READY`; a Copilot Free worker is currently registered as running, so Program Control must not race its owned BUILD leaf.
- W08-W20 remain dependency-gated except PREBUILD/readiness explicitly allowed by accepted Puzzle governance.
- W15-00 remains additionally dependent on W02-PB5, W03-F, W07-H and W14-H.

## Compact accepted baseline evidence

### W02

Final outcome: `REALITY_GATE_1_AUTHORITY_VERIFIED`.

PB5 release main: `ad664f32949256ccc5751fe1fb88047b66c2d247`. W02-G accepted merge: `4df704ae787947d2138658cae984726470f7633d`; Reality Gate S01-S20 accepted with zero real external side effects.

### W03

Final outcome: `DURABLE_EVENT_DELIVERY_VERIFIED`.

W03-F accepted candidate `8108a9259823e27064ca3254785978982d382c2e`; merge/main `76ba0db1bf399c21d08e2190915213ceb8f4eb02`; post-merge Quality `33476605969`, Test Build `33476605936`, Security `33476606422`: SUCCESS.

Canonical Drive folder: `W03_PERSISTENCE_EVENT_BACKBONE_DURABLE_WORKFLOW` / `1ZO73FVedMQM77dtfRtWF9wm54eulBkXc`.

### W04

Final outcome: `W04_CONTROL_CORE_VERIFIED`.

W04-H PR #151 accepted candidate `b4de1097b03a4b94bc81ac38f6cbe0019244724b`; merge/main `fcc26c1065961ec6ca52019195108f3562c33365`; post-merge Quality `33507711472`, Test Build `33507711290`, Security `33507712325`: SUCCESS.

Canonical Drive folder: `W04_CONTROL_CORE_CAPABILITY_PLANNING_GOAL_GRAPH` / `1Vz45N4p5zhubQvBFAf_zFinkhCFZcQdp`.

## W05 accepted evidence and frontier

Accepted DAG:

`W05-00 -> (W05-A || W05-C || W05-D || W05-E || W05-F)`

`W05-A + W05-C + W05-D + W05-E -> W05-B`

`W05-B + W05-F -> W05-G -> W05-H -> W06`

### W05-00

Canonical acceptance evidence: `W05_00_ACCEPTANCE_EVIDENCE_2026-09-01` / `156ni-zWA_ko21_SWFM0KJtYpOaWP-N9TV4am5kPZHzM`.

### W05-A

Accepted candidate HEAD `71d1e2e697c2c6ba5992456afd03dc130e0f6bbd`; controlled merge/main `972c2429de43909ee42c1f77ecc1f4fe1af28faa`; post-merge exact-main Quality `33531398574`, Test Build `33531398619`, Security `33531399282`, Copilot Fabric `33531398888`: SUCCESS.

Drive evidence: `W05_A_ACCEPTANCE_EVIDENCE_2026-09-01` / `1-gcU8ir7_IwZAKS7LdTclgrbfUbDwFhgejUEilB1Odg`.

W05-A remains classifier-only; risk, complexity, modality and classification confidence never create authority.

### W05-C / W05-D

W05-C ReasoningLevel L0-L5 accepted integration is represented in current main by `4bc3759d56a0683acee99821808c50025cf9908a` and its accepted task node. W05-C consumes W04 ExecutionBudget as a non-authoritative projection; reasoning level never elevates permission.

W05-D Confidence Engine accepted integration is represented in current main by `44c064b97f91afdf34c657a629a37f61d2185528` and its accepted task node. Confidence/calibration is decision evidence only and never execution authority.

### W05-E

PR #169 accepted exact candidate `13d75a7b05d3f6ea7cd9d5f56f669013db44c082`; controlled merge/main `5768f6f77be6695e72c2cf7cae16ae04f12748da`; post-merge Quality `33527659921`, Test Build `33527659888`, Security `33527660602`: SUCCESS.

Drive evidence: `W05_E_ACCEPTANCE_EVIDENCE_2026-09-01` / `1t6_RcQdJSdOXZQJuMopCZtc2TJDsSpPd6CLxUHi6TLE`.

W05-E Strategy Registry remains separate from W04 Capability Registry and cannot grant authority.

### W05-B

Accepted router merge/main: `2ef14a35b8fd12e0a75e4f44c144ebebdb6941ad`, after exact accepted-candidate Quality/Test Build/Security and Program Control review.

W05-B routes among deterministic/no-AI, model, specialist, computer-use-planning and human strategies using lowest-sufficient reasoning. Route selection, confidence, fallback and model choice never become execution authority.

### W05-F

Accepted bounded Agent Runtime merge/main: `ca0dd2053da55a35f151761f0bc474bd07785aba`, after exact-head Quality/Test Build/Security and Program Control risk review.

W05-F owns bounded worker/pool/lease/heartbeat/reclaim/cancellation semantics and composes W03 durability. Worker ownership, lease state and agent selection are not execution authority.

### W05-G

Final outcome: `COMPLETE_ACCEPTED_MERGED / POST_MERGE_EXACT_MAIN_VERIFIED`.

BUILD PR #216; base main `ca0dd2053da55a35f151761f0bc474bd07785aba`; exact final BUILD HEAD `72bee34a338372ecf57853cb29eb4ecba8b13872`; controlled merge/main `cf293ca103bd1e6adfb250bc5186668aa6870d4a`.

Exact BUILD HEAD Quality, Test Build and Security: SUCCESS. Canonical runner executed all 12 targeted W05-G scenarios successfully.

Post-merge exact-main evidence on `cf293ca103bd1e6adfb250bc5186668aa6870d4a`:

- Quality run `33583396659`: SUCCESS.
- Test Build run `33583396870`: SUCCESS.
- Security run `33583400102`: SUCCESS.

Accepted W05-G invariants:

- bounded deterministic Observe/Plan/Tool-Plan/Observe/Inspect/Repair/Validate control loop only;
- no ModelPort, ToolPort, ExecutorPort or provider/device/workflow/local side-effect port;
- W05-B remains routing source of truth and W05-F remains worker-ownership source of truth;
- W04 CapabilityPlan and ExecutionBudget are consumed as current non-authoritative projections;
- planned tool actions are capability-fenced and fixed to `executionBoundary=W07_REQUIRED`;
- snapshots fix `authorizesExecution=false` and `canInvokeTools=false`;
- UNKNOWN tool observation escalates; blind repair/retry is forbidden;
- iteration, elapsed-time, model-call, tool-planning, repair and W04 budget bounds fail closed;
- tenant/correlation, worker generation, registry, budget, time, cancellation and terminal-state mismatches fail closed;
- evidence is reference-only and private chain-of-thought is not persisted.

Current logical W05 implementation frontier is `{ W05-H }`. W05-H is BUILD_READY and must benchmark/evaluate accepted W05 behavior without introducing new runtime semantics or W18 adaptive production promotion.

Shared-surface controls remain:

- `packages/intelligence/**` publication/bootstrap surfaces are Program Control-owned;
- W05-H owns integration/eval/benchmark tests and W05 evidence only;
- root manifests/barrels/workspace config/lockfiles/CI/CODEOWNERS/cross-package public exports remain Program Control shared surfaces.

## W07 accepted evidence and frontier

Accepted DAG:

`W07-00 -> W07-A -> (W07-B || W07-C || W07-D || W07-E)`

`W07-B + W07-C + W07-D + W07-E -> (W07-F || W07-G)`

`W07-F + W07-G -> W07-H`

### W07-00 / W07-A / W07-D

W07-00 is `COMPLETE_ACCEPTED / POST_MERGE_EXACT_MAIN_VERIFIED`.

W07-A PR #170 accepted exact current-main-reconciled candidate `c47ebe44572cc2540c902c43ab252054edb6c726`; controlled merge/main `1bcdb72078dd4d7e89bb92791fb0e14095ffd65b`; post-merge Quality `33528098556`, Test Build `33528098540`, Security `33528099185`: SUCCESS.

W07-D controlled merge/main: `5318fec80a4e61541cea3690d075d515e5514373`; post-merge exact-main Quality `33534674425`, Test Build `33534674451`, Security `33534675235`: SUCCESS.

### W07-B / W07-C / W07-E

W07-B accepted current-authority-validation merge/main: `c0ea82a88b1706f87de17884940a3fa246af2ff8`, after exact-head Quality/Test Build/Security and Program Control `ACCEPT_WITH_RECORDED_RISK`. Subsequent hardening `63cb9f17a576e0fa45ea9a4553deb9065714f847` closed fail-closed authority-result binding gaps. The concrete current-authority integration remains an explicit W07-H proof obligation; no alternate Policy Engine or bypass is permitted.

W07-C accepted execution-safeguards/idempotency-fence merge/main: `6814363507d0199e57e797635b7c2f0c22fc00cb`, after exact-head Quality/Test Build/Security and Program Control review. W03 remains the durability/idempotency source of truth.

W07-E accepted Receipt/Evidence/readback boundary merge/main: `c0860ac178bc8b34e1f5a34f3d2b9c6c5a138168`, after exact-head Quality/Test Build/Security and Program Control ACCEPT. Receipt/ACK/MATCH remain non-authoritative and cannot self-promote to VERIFIED.

### W07-F / W07-G

W07-F accepted current-main replacement merge: `6383813bfda7cca31440ec3bd529e3e815596e2d`, after fresh Quality/Test Build/Security on the exact semantic HEAD and Program Control ACCEPT. Canonical `EXECUTION_UNCERTAIN` and `RECONCILE_BEFORE_RETRY` semantics are preserved; retry eligibility is not authority.

W07-G accepted current-main replacement merge: `c7a01549abac801915ad161e69a5685a8271f481`, after fresh Quality/Test Build/Security, 69/69 combined Executor tests, cleanup audit and Program Control ACCEPT. Circuit breaker, kill switch and cancellation containment are non-bypassable by model/router/agent output and remain non-authoritative.

Current logical W07 implementation frontier is `{ W07-H }`. W07-H is BUILD_READY and currently worker-owned/running. It must integrate A-G, bind W03/W04/current-authority foundations, run consumer fixtures and fault injection, execute Risk Gates A-D, and publish dependent-wave surfaces only after exact-head and post-merge verification.

## Architecture boundaries retained

W03 owns durable event/outbox/inbox/replay/DLQ/timers/leases/workflow truth.

W04 owns Objective/Goal/Task lifecycle, target-neutral Capability Registry/CapabilityPlan, GoalGraph, bounded planner scheduler, Fast/Governed lane planning, ExecutionBudget and curated PlanTemplate/PlanBinding foundations.

W05 owns intelligence classification, reasoning levels, confidence, strategy/routing and bounded agent-worker/inspect-repair semantics only. W05 does not own authority, execution, context runtime, concrete provider/device runtime or a second control/durability/capability source of truth.

W06 owns context runtime.

W07 owns generic deterministic execution safety, current authority-validation integration, generic target resolution, readback/reconciliation and failure containment. W07 does not own concrete provider/device/workflow runtimes.

W08 owns provider adapters/credentials/provider-specific transport. W09 owns workflow fabric/bindings. W14 owns DeviceId/DeviceRef, registration, session/trust/attestation/realtime gateway. W15 owns Android/native capability bridge, app integration, permission broker and Device Executor implementation. W17 owns production telemetry/SLO/DR. W18 owns adaptive learning/promotion governance. W19 owns final security hardening.

Core invariants:

- Intelligence != Authority != Execution.
- Capability != Authority.
- Plan/Lane/Budget/Template/Strategy/Confidence/Worker/Loop != Authority.
- Fast Lane may optimize strategy but cannot bypass current Policy/Authority/Executor validation.
- Target availability, model confidence, worker ownership or route selection cannot mint execution permission.
- Receipt/acknowledgement is not verified external state.
- `EXECUTION_UNCERTAIN` requires reconcile-before-retry semantics.

## Development execution fabric

Puzzle/READY_FRONTIER governance remains active. `FREE_ACTIONS_CLI` permits at most two dependency-satisfied code tasks per batch. Program Control owns coordination/acceptance/shared-surface reconciliation. PREBUILD is read-only/non-authoritative and cannot satisfy dependencies. Workers cannot self-accept or auto-merge.

For maximum safe throughput, keep independent BUILD leaves isolated, use the two-task ceiling, and reconcile shared/publication surfaces once per convergence boundary rather than allowing workers to race on manifests, barrels, lockfiles or root configuration.

## Acceptance discipline

W03+ uses separate Risk Gates A Correctness, B Safety/Authority, C Performance/Economics and D Failure/Recoverability. Release blockers independent of score remain authority bypass, cross-tenant breach, uncontrolled duplicate irreversible side effect, secret exposure and irreversible execution without valid authority.

No stale CI satisfies acceptance. Before every merge or downstream release, revalidate current `main`, exact candidate HEAD, official gates, PR state, Drive task/change/evidence/acceptance records and active ownership/dependency documents.
