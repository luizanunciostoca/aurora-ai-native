# Aurora AI-Native — Current Program Status & Document Authority

Status: `ACTIVE_CURRENT_PROGRAM_STATE_W05_COMPLETE_W06_00_ACCEPTED_W06_A_E_BUILD_READY_W07_H_BUILD_READY`
Audit date: 2026-09-02
Canonical implementation baseline at this status candidate: `f2e178a2f889d5490c1509ff97a381abaadaee22`

## Authority order

1. GitHub `main` is implementation/code authority.
2. Accepted PR/exact-SHA/post-merge evidence governs implementation and publication acceptance.
3. Google Drive `AURORA_AI_NATIVE_DEVELOPMENT_GOVERNANCE` is live operational governance/evidence authority.
4. Developer Manual v0.5 Audit-Consolidated, accepted ADRs and owning-wave governance define architecture/scope.
5. Risk & Architecture Validation Framework v1.0 is mandatory for W03+.
6. Historical/superseded/salvage material is provenance/reference only.

No prompt, task node, PREBUILD artifact, draft/open PR, agent/model output, green CI on a stale SHA, cache hit or reference source releases a dependency by itself. Historical detail intentionally omitted from this current-state summary remains preserved in Git history, accepted PRs and Drive evidence.

## Accepted program state

- W00: `COMPLETE_ACCEPTED`.
- W01: `COMPLETE_ACCEPTED`.
- W02: `COMPLETE_ACCEPTED / REALITY_GATE_1_AUTHORITY_VERIFIED`.
- W03: `COMPLETE_ACCEPTED / REALITY_GATE_DURABLE_EVENT_DELIVERY_VERIFIED`.
- W04: `COMPLETE_ACCEPTED / W04_CONTROL_CORE_VERIFIED`.
- W05-00/A/B/C/D/E/F/G/H: `COMPLETE_ACCEPTED_MERGED / POST_MERGE_EXACT_MAIN_VERIFIED`; W05 is `COMPLETE_ACCEPTED`.
- W06-00: `COMPLETE_ACCEPTED_MERGED / POST_MERGE_EXACT_MAIN_VERIFIED`.
- W06-A and W06-E: `DEPENDENCY_READY / PUZZLE_BUILD_READY / COPILOT_FREE_FAILED`; their latest Copilot Free attempts failed before publishing a candidate PR, so neither is accepted or currently worker-owned.
- W06-B/C/D/F/G/H remain gated by the accepted W06 DAG.
- W07-00/A/B/C/D/E/F/G: `COMPLETE_ACCEPTED_MERGED / POST_MERGE_EXACT_MAIN_VERIFIED`.
- W07-H: `DEPENDENCY_READY / PUZZLE_BUILD_READY / COPILOT_FREE_FAILED`; repeated Copilot Free attempts failed before publishing a candidate PR and the stale `running` label was removed by Program Control reconciliation.
- W08-W20 remain dependency-gated except PREBUILD/readiness explicitly allowed by accepted Puzzle governance.
- W15 remains additionally dependent on the accepted Device Plane dependency chain, including W07-H and W14-H.

## Compact accepted baseline evidence

### W02

Final outcome: `REALITY_GATE_1_AUTHORITY_VERIFIED`.

PB5 release main: `ad664f32949256ccc5751fe1fb88047b66c2d247`. W02-G accepted merge: `4df704ae787947d2138658cae984726470f7633d`. Reality Gate S01-S20 was accepted with zero real external side effects.

### W03

Final outcome: `DURABLE_EVENT_DELIVERY_VERIFIED`.

W03-F accepted candidate `8108a9259823e27064ca3254785978982d382c2e`; merge/main `76ba0db1bf399c21d08e2190915213ceb8f4eb02`; post-merge Quality `33476605969`, Test Build `33476605936`, Security `33476606422`: SUCCESS.

### W04

Final outcome: `W04_CONTROL_CORE_VERIFIED`.

W04-H PR #151 accepted candidate `b4de1097b03a4b94bc81ac38f6cbe0019244724b`; merge/main `fcc26c1065961ec6ca52019195108f3562c33365`; post-merge Quality `33507711472`, Test Build `33507711290`, Security `33507712325`: SUCCESS.

## W05 — Intelligence Runtime — COMPLETE_ACCEPTED

Accepted DAG:

`W05-00 -> (W05-A || W05-C || W05-D || W05-E || W05-F)`

`W05-A + W05-C + W05-D + W05-E -> W05-B`

`W05-B + W05-F -> W05-G -> W05-H`

Key accepted integration evidence:

- W05-A merge/main `972c2429de43909ee42c1f77ecc1f4fe1af28faa`.
- W05-C accepted integration `4bc3759d56a0683acee99821808c50025cf9908a`.
- W05-D accepted integration `44c064b97f91afdf34c657a629a37f61d2185528`.
- W05-E merge/main `5768f6f77be6695e72c2cf7cae16ae04f12748da`.
- W05-B router merge/main `2ef14a35b8fd12e0a75e4f44c144ebebdb6941ad`.
- W05-F bounded Agent Runtime merge/main `ca0dd2053da55a35f151761f0bc474bd07785aba`.
- W05-G PR #216 accepted exact HEAD `72bee34a338372ecf57853cb29eb4ecba8b13872`; merge/main `cf293ca103bd1e6adfb250bc5186668aa6870d4a`; post-merge Quality `33583396659`, Test Build `33583396870`, Security `33583400102`: SUCCESS.
- W05-H PR #220 accepted exact HEAD `03ce215d6e606d930db922dab7352550987f550d`; merge/main `8deb67875ba6f3fecd7494f7cc955d5965543e3a`; post-merge Quality `33585518047`, Test Build `33585517936`, Security `33585518933`: SUCCESS.
- W05-H Drive evidence: `W05_H_ACCEPTANCE_EVIDENCE_2026-09-02` / `18fFrIUcyExnV_a7dvSE8A9nvR6Cht0MMe9u7jPbcD3A`.

Accepted W05 invariants remain:

- no-AI/deterministic is a legitimate first-class route;
- lowest-sufficient reasoning is preferred where quality/risk allow it;
- confidence, strategy, worker ownership, agent output and loop state never become authority;
- W04 remains control/capability/budget truth;
- W03 remains durable lease/workflow truth;
- W06 owns context runtime;
- W07 remains the generic side-effect boundary;
- W18 owns adaptive learned promotion.

W05 has no remaining implementation node. Its accepted output releases W06 only through W06's own governance/dependency matrix.

## W06 — Context Engine — W06-00 ACCEPTED

Accepted DAG:

`W06-00 -> (W06-A || W06-E)`

`W06-A -> W06-B -> W06-C`

`W06-C + W06-E -> (W06-D || W06-F)`

`W06-D + W06-F -> W06-G -> W06-H`

### W06-00

PR #222 coordination freeze:

- base main `8deb67875ba6f3fecd7494f7cc955d5965543e3a`;
- exact accepted candidate HEAD `2c0c0637413d401657c04e9b89ad825d5a0015ad`;
- controlled merge/main `f2e178a2f889d5490c1509ff97a381abaadaee22`.

Exact-candidate gates: Quality, Test Build, Security, Aurora Copilot Fabric Validation and Aurora Puzzle Validation: SUCCESS.

Post-merge exact-main evidence on `f2e178a2f889d5490c1509ff97a381abaadaee22`:

- Quality run `33587340033`: SUCCESS.
- Test Build run `33587339996`: SUCCESS.
- Security run `33587340430`: SUCCESS.
- Aurora Copilot Fabric Validation run `33587340068`: SUCCESS.
- Aurora Puzzle Validation run `33587340038`: SUCCESS.

Drive evidence: `W06_00_ACCEPTANCE_EVIDENCE_2026-09-02` / `1B672TBZbAhWtsZLnbS9IClffMuJOfnuXmU6xOUjhSqo`.
Drive governance root: `00_GOVERNANCE_AND_ACCEPTANCE` / `10_btAKukgqhltz7tVyEphfB2PTD1TU6E` under `W06_CONTEXT_KNOWLEDGE_MEMORY_TRUTH`.

Accepted W06-00 boundaries:

- W01 `TenantContext`, `CorrelationContext`, identity refs, `DataClassification` and propagation primitives are reused; W06 does not redefine them.
- context/trust/freshness/ranking/cache/snapshot/similarity are information/evidence, never execution authority.
- current Policy/Authority is never frozen into context/cache/snapshot as executable permission.
- stale/unknown/currentness and material conflicts remain explicit.
- source fan-out, package size, retries/attempts and concurrency are finite/bounded.
- semantic cache cannot store secrets, credentials or reusable current authority.
- W03 remains event/replay/invalidation durability truth.
- speculative context preparation is reversible/read-only and cannot call W07/provider/device/workflow/local writes.
- W17 owns production telemetry/SLO claims; W18 owns learned promotion.
- Legacy MemoryManager is `CONCEPT_REUSE` only; TOCA Asset Intelligence is semantic reference only and does not become Aurora business/context authority.

Current W06 frontier is `{ W06-A, W06-E }`.

- W06-A issue #152: BUILD_READY / COPILOT_FREE_FAILED; no canonical candidate PR exists and no acceptance exists.
- W06-E issue #153: BUILD_READY / COPILOT_FREE_FAILED; no canonical candidate PR exists and no acceptance exists.

W06-A begins the longer critical chain `A -> B -> C`. W06-E is independent at this frontier and remains ready for the next safe parallel capacity.

## W07 — Executor Plane — frontier W07-H

Accepted DAG:

`W07-00 -> W07-A -> (W07-B || W07-C || W07-D || W07-E)`

`W07-B + W07-C + W07-D + W07-E -> (W07-F || W07-G)`

`W07-F + W07-G -> W07-H`

Accepted integration anchors include:

- W07-A merge/main `1bcdb72078dd4d7e89bb92791fb0e14095ffd65b`.
- W07-B current-authority-validation merge/main `c0ea82a88b1706f87de17884940a3fa246af2ff8`, with later hardening `63cb9f17a576e0fa45ea9a4553deb9065714f847`.
- W07-C execution safeguards/idempotency-fence merge/main `6814363507d0199e57e797635b7c2f0c22fc00cb`.
- W07-D merge/main `5318fec80a4e61541cea3690d075d515e5514373`.
- W07-E Receipt/Evidence/readback merge/main `c0860ac178bc8b34e1f5a34f3d2b9c6c5a138168`.
- W07-F uncertainty/reconciliation merge `6383813bfda7cca31440ec3bd529e3e815596e2d`.
- W07-G failure-containment merge `c7a01549abac801915ad161e69a5685a8271f481`.

W07-H issue #140 is the only remaining W07 node. Program Control revalidated repeated Copilot Free worker failures, no published branch/PR, and removed the stale `running` state. W07-H is now `PUZZLE_BUILD_READY / COPILOT_FREE_FAILED` and remains unaccepted.

W07-H must integrate A-G with W03/W04/current-authority foundations, execute consumer fixtures and fault injection, run Risk Gates A-D, and publish dependent-wave surfaces only after exact-head and post-merge verification.

## Architecture boundaries retained

- W03 owns durable event/outbox/inbox/replay/DLQ/timers/leases/workflow truth.
- W04 owns Objective/Goal/Task lifecycle, target-neutral Capability Registry/CapabilityPlan, GoalGraph, bounded scheduler, lanes, ExecutionBudget and curated templates.
- W05 owns intelligence classification/reasoning/confidence/strategy/routing and bounded worker/inspect-repair semantics only.
- W06 owns context retrieval/ranking/trust/freshness/minimization/memory/cache/snapshot/speculation semantics; it does not own authority or execution.
- W07 owns generic deterministic side-effect safety, current authority-validation integration, target resolution, readback/reconciliation and failure containment.
- W08 owns provider adapters/credentials/provider-specific transport.
- W09 owns workflow fabric/bindings.
- W14 owns gateway/realtime/device registration/session/trust/replay/revoke/evidence ingress.
- W15 owns Android/native capability bridge/app integration/permission broker/Device Executor.
- W16 owns Workspace/view/control surfaces only.
- W17 owns production telemetry/SLO/evidence/DR.
- W18 owns eval-driven adaptive learning/promotion.
- W19 owns converged security hardening.
- W20 owns integrated staging/release acceptance.

Core invariants:

- Intelligence != Authority != Execution.
- Context != Authority.
- Capability != Authority.
- Plan/Lane/Budget/Template/Strategy/Confidence/Worker/Loop/Cache/Snapshot != Authority.
- Fast Lane may optimize strategy but cannot bypass current Policy/Authority/Executor validation.
- Receipt/acknowledgement is not verified external state.
- `EXECUTION_UNCERTAIN` requires reconcile-before-retry.

## Development execution fabric

Puzzle/READY_FRONTIER governance remains active. `FREE_ACTIONS_CLI` permits at most two dependency-satisfied code tasks per batch. Program Control owns coordination/acceptance/shared-surface reconciliation. PREBUILD is read-only/non-authoritative and cannot satisfy dependencies. Workers cannot self-accept or auto-merge.

At this status snapshot:

- W07-H is BUILD_READY but its latest Copilot Free attempts failed before candidate publication; no worker currently owns a valid canonical BUILD candidate.
- W06-A and W06-E are BUILD_READY but their latest Free worker attempts also failed before candidate publication.
- after this status publication is accepted, the two highest-value disjoint direct BUILD candidates are W07-H and W06-A; W06-E remains READY for the next safe slot.

## Acceptance discipline

W03+ uses separate Risk Gates A Correctness, B Safety/Authority, C Performance/Economics and D Failure/Recoverability. Release blockers independent of score remain authority bypass, cross-tenant breach, uncontrolled duplicate irreversible side effect, secret exposure and irreversible execution without valid authority.

No stale CI satisfies acceptance. Before every merge or downstream release, revalidate current `main`, exact candidate HEAD, official gates, PR/task state, Drive evidence and active ownership/dependency documents. If `main` moves, reconcile and rerun exact-head CI before integration.
