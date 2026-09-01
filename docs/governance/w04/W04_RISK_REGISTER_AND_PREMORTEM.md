# W04 RISK REGISTER & PRE-MORTEM

Date: 2026-09-01  
Status: `W04_00_COORDINATION_FREEZE_CANDIDATE`  
Framework: AURORA Risk & Architecture Validation Framework v1.0  
Base main: `76ba0db1bf399c21d08e2190915213ceb8f4eb02`

Exposure = likelihood × impact × detectability. 1-20 LOW; 21-40 MODERATE; 41-70 HIGH; 71-125 CRITICAL.

Independent release blockers remain authority bypass, cross-tenant breach, uncontrolled irreversible side effect, secret exposure, or an execution path that avoids current authority validation.

## W04-R01 — Capability availability becomes authority
Surface: Capability Registry / CapabilityPlan. L4 I5 D5 = 100 CRITICAL.  
Failure: planner interprets compatible/available/permitted-by-target metadata as permission to execute.  
Controls: explicit `capability != authority`, no PolicyToken/OwnerDecision issuance, future W07 validation mandatory, negative tests R05/R13.  
Owner: W04-B/E/H. Status: OPEN_CONTROL_REQUIRED.

## W04-R02 — Second/fragmented capability registry
Surface: registries/control/later waves. L3 I5 D4 = 60 HIGH.  
Failure: W05/W07/W15 or verticals invent parallel capability identities/metadata, creating routing and safety drift.  
Controls: single `packages/registries/src/capabilities/**` source, W04 ownership lock, seed adjudication/provenance, publication barrier DP1.  
Owner: W04-B/Program Control.

## W04-R03 — GoalGraph duplicates W03 durable workflow
Surface: GoalGraph/scheduler. L3 I5 D4 = 60 HIGH.  
Failure: W04 creates second timers/leases/replay/outbox/durable state engine, splitting truth and recovery.  
Controls: W03 is durable foundation; W04 owns logical DAG/runnable semantics only; durable execution consumes W03 primitives. R18.  
Owner: W04-C/D/H.

## W04-R04 — Unbounded DAG/fan-out/task explosion
Surface: graph/scheduler. L4 I4 D4 = 64 HIGH.  
Failure: generated plan creates huge node/fan-out set, exhausting CPU/memory/queue and delaying unrelated work.  
Controls: graph/node/fan-out/concurrency bounds, budget, prevalidation, backpressure, deterministic rejection.  
Owner: W04-C/D/F/H.

## W04-R05 — Scheduler starvation / unfairness
Surface: W04-D. L3 I4 D4 = 48 HIGH.  
Failure: hot objectives or high-priority work indefinitely starve other eligible nodes.  
Controls: explicit fairness policy, bounded priority, aging/backpressure, deterministic ready ordering, load tests.  
Owner: W04-D/H.

## W04-R06 — Fast Lane bypasses governance
Surface: W04-E. L3 I5 D5 = 75 CRITICAL.  
Failure: “fast” is implemented as skipping policy/authority/approval/executor validation to save latency/cost.  
Controls: lane is planning strategy metadata only; mandatory validation invariant; R13; independent release blocker.  
Owner: W04-E/H with W02/W07 invariant.

## W04-R07 — Budget exhaustion weakens safety
Surface: W04-F. L3 I5 D4 = 60 HIGH.  
Failure: low token/cost/time budget suppresses required validation or causes unsafe fallback.  
Controls: mandatory checks outside degradable budget; exhaustion stops/degrades optional strategy only; fail closed. R15.  
Owner: W04-F/H.

## W04-R08 — Stale capability availability / target binding
Surface: registry/binding. L3 I4 D4 = 48 HIGH.  
Failure: stale discovery/permission/trust state causes planner to select capability that no longer exists/is valid.  
Controls: explicit freshness/observedAt/availability state; current resolution required by executor; stale state cannot authorize. R04/R07.  
Owner: W04-B/H; W07/W14/W15 later provide target/runtime freshness.

## W04-R09 — Legacy/TOCA seed imports executable semantics
Surface: capability seed promotion. L3 I5 D4 = 60 HIGH.  
Failure: dynamic plugin, route, Approval/Autonomy authority or direct shell/device/provider behavior is copied because a seed exists.  
Controls: all seeds `SEED_ONLY_NOT_CANONICAL`; explicit ACCEPT/REJECT/RENAME/DECOMPOSE; no direct runtime import; provenance/license gate. R19.  
Owner: W04-B/Program Control.

## W04-R10 — PlanTemplate becomes unsafe stale shortcut
Surface: W04-G. L3 I4 D4 = 48 HIGH.  
Failure: template reuse ignores contract/version/capability/policy incompatibility and bypasses necessary replanning/validation.  
Controls: version/hash/provenance/compatibility/invalidation; template is plan shortcut only, never authority; current execution validation still mandatory. R16.  
Owner: W04-G/H.

## W04-R11 — Agent-first coupling contaminates control core
Surface: lifecycle/capability plan/graph. L3 I4 D3 = 36 MODERATE.  
Failure: W04 contracts encode specific model/agent/provider implementation, preventing substitution and encouraging hidden agent authority.  
Controls: capability-first contracts, strategy/agent runtime deferred W05, target-neutral registry. R06.  
Owner: W04-A/B/C.

## W04-R12 — Cross-tenant plan/control collision
Surface: lifecycle/registry/graph/templates. L2 I5 D5 = 50 HIGH and release-blocking if realized.  
Failure: tenant A lifecycle/plan/template/control state satisfies or mutates tenant B processing.  
Controls: reuse canonical TenantContext/IDs, explicit tenant scope where state is persisted/cached, negative tests, no implicit tenant inference.  
Owner: W04-A/B/G/H.

## W04-R13 — Cancellation/supersession race runs obsolete work
Surface: lifecycle/graph/scheduler. L3 I5 D4 = 60 HIGH.  
Failure: old task/goal remains runnable after cancellation/supersession or races a terminal state.  
Controls: normalized terminal/superseded states, deterministic preconditions, graph propagation, scheduler recheck before dispatch, W03 durable fencing when needed.  
Owner: W04-A/C/D/H.

## W04-R14 — Evidence gap hides planning/control decision
Surface: all W04 transitions. L3 I4 D4 = 48 HIGH.  
Failure: incident cannot reconstruct why capability/lane/budget/template/node became selected/runnable.  
Controls: canonical tenant/correlation/version/reasons/provenance, deterministic decision records, no private reasoning/secrets. R17.  
Owner: W04-A-H; W17 later owns production telemetry platform.

## W04-R15 — Device boundary leakage
Surface: W04-B target bindings. L3 I5 D4 = 60 HIGH.  
Failure: DEVICE binding creates DeviceId/session/trust/Android permissions or native execution semantics inside W04.  
Controls: DP1 only; W14 owns device identity/session/trust, W15 Android runtime; capability binding contains target-neutral descriptors only. R07.  
Owner: W04-B/Program Control.

## PRE-MORTEM — assume W04 failed in production

1. Capability health was treated as permission and a side effect ran without current authority. Action: make capability/availability non-authoritative at type/API/test level and revalidate in W07.
2. GoalGraph became a second workflow engine and recovery disagreed with W03. Action: keep logical DAG in W04; keep durable lease/timer/replay/outbox ownership in W03.
3. One objective produced tens of thousands of nodes and starved the system. Action: hard graph/fan-out/concurrency budgets before scheduling.
4. Fast Lane skipped an approval/policy step for latency. Action: mandatory authority/executor checks cannot be optimized away.
5. Budget exhaustion selected an unsafe fallback. Action: stop/degrade optional work, never mandatory validation.
6. A stale DEVICE binding claimed an app/action was available. Action: freshness is explicit; execution-time target resolution remains W07/W14/W15.
7. A legacy shell/device seed became executable because it was in the 69-item catalog. Action: semantic adjudication only; no direct imports.
8. A curated template survived incompatible contract changes and produced obsolete plans. Action: version/hash/invalidation/compatibility gates.
9. Cancellation raced scheduler dispatch and obsolete work ran. Action: terminal-state precondition recheck plus durable fencing where needed.
10. Incident evidence showed what ran but not why it was planned. Action: deterministic reason/provenance/evidence references at each control transition.

## Stress plan

- invalid/cyclic/deep/wide DAGs;
- 1,500-objective modeled plan pressure with bounded node/fan-out limits appropriate to implemented test environment;
- duplicate/cancel/supersede races;
- scheduler contention/fairness/backpressure;
- stale/unavailable capability and conflicting capability identity;
- Fast/Governed lane safety-negative matrix;
- budget exhaustion at each dimension;
- compatible/incompatible/stale template binding;
- cross-tenant fixtures;
- restart/recovery consuming W03 durable primitives without creating parallel durability;
- DEVICE binding fixtures without Android/runtime implementation.

## Architecture kill criteria

Redesign before acceptance if W04 creates a second Capability Registry, capability-as-authority, second durable workflow engine, unbounded scheduler/fan-out, Fast Lane authority bypass, budget-driven safety bypass, agent/provider/device hard-coupling, cross-tenant collision, unreconstructable control decisions, or any real provider/device side effect in the W04 acceptance gate.
