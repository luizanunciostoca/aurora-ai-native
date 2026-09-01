# W04 WAVE CHARTER — CONTROL CORE / CAPABILITY PLANNING / GOAL GRAPH

Date: 2026-09-01  
Status: `W04_00_COORDINATION_FREEZE_CANDIDATE`  
Coordination base main: `76ba0db1bf399c21d08e2190915213ceb8f4eb02`  
Owner: AURORA PROGRAM CONTROL / W04-00

## 1. Mission

Build Aurora's target-neutral control core: Objective/Goal/Task lifecycle, one canonical Capability Registry, CapabilityPlan, GoalGraph DAG, bounded parallel scheduler, Fast/Governed lane selection, ExecutionBudget, and curated PlanTemplate/PlanBinding foundations.

W04 decides and represents **what work is needed and how work is structured**. It does not grant execution authority and does not perform provider/device side effects.

## 2. Prerequisite

W03 is `COMPLETE_ACCEPTED / REALITY_GATE_DURABLE_EVENT_DELIVERY_VERIFIED`.

Canonical W03 release evidence:
- W03-F PR #126.
- Exact accepted candidate HEAD `8108a9259823e27064ca3254785978982d382c2e`.
- Merge/main `76ba0db1bf399c21d08e2190915213ceb8f4eb02`.
- Candidate Quality `33476434872`, Test Build `33476434863`, Security `33476435285`: SUCCESS.
- Exact-head PostgreSQL Reality Gate `33476470808`: SUCCESS.
- Post-merge Quality `33476605969`, Test Build `33476605936`, Security `33476606422`: SUCCESS.
- GitHub issue #88: closed with `aurora:accepted`.
- Drive evidence `W03-F_ACCEPTANCE_EVIDENCE_2026-09-01` / `18cblmxaKykVIRPn6WxV_vvG60I_63Ywp4dQoOv0jmY0`.

## 3. Canonical inputs

- GitHub `main` and accepted exact-SHA evidence.
- `docs/governance/CURRENT_PROGRAM_STATUS.md`.
- Developer Manual v0.5 Audit-Consolidated.
- Action Plan v0.4.1 and accepted ADRs.
- Risk & Architecture Validation Framework v1.0.
- W01 canonical IDs/context/versioning/envelope/action/evidence contracts.
- W02 accepted identity/tenant/policy/authority boundaries and informational precheck semantics.
- W03 accepted durable event/idempotency/replay/timer/lease/workflow primitives.
- `LEGACY_CAPABILITY_AND_REUSE_SALVAGE_REGISTER.md` and its 69 deduplicated seeds as `SEED_ONLY_NOT_CANONICAL`.
- `TOCA_MCP_SERVER_SALVAGE_REGISTER.md`, pinned audited TOCA commit `8a6cfe055be9b34e498cfbdb481e8232dc51df05`, as reference-only.
- Device Plane cross-wave ownership and dependency matrix, especially DP1.

## 4. Live repository audit

At coordination base `76ba0db1...`:
- `packages/registries/src` contains `ids`, `policy`, `versioning` and root `index.ts` only.
- No canonical `packages/registries/src/capabilities/**` exists.
- Repository search finds Capability Registry, CapabilityPlan, GoalGraph, ExecutionBudget and PlanTemplate primarily in governance/task references, not a competing W04 runtime.
- W03 workflow/timer/lease primitives are already canonical durable infrastructure and must be consumed, not duplicated by W04.

Therefore W04 may create its owned control/capability surfaces only after this freeze is accepted.

## 5. Architectural invariants

1. **Capability is not authority.** Availability, compatibility, freshness, installed-app presence, provider account health, model confidence or target discovery never authorizes execution.
2. **Planning is not execution.** CapabilityPlan/GoalGraph/lane/budget/template outputs never perform side effects.
3. **Capability-first, not agent-first.** A plan states required capabilities independent of which future agent/model/provider/device fulfills them.
4. **One Capability Registry.** No second registry may be created in W05, W07, W08, W14, W15 or vertical waves.
5. **W03 durability is reused.** W04 GoalGraph/scheduler may model dependencies and runnable nodes but must not recreate Postgres outbox/inbox, durable leases/timers, replay/DLQ or durable workflow source-of-truth semantics.
6. **Fast Lane is not a bypass.** Fast/Governed lane selection may reduce reasoning/cost/latency but may never skip current Policy/Authority validation or W07 Executor validation.
7. **Budget is not permission.** Budget exhaustion may constrain/degrade/stop strategy; it may not weaken mandatory safety or authority checks.
8. **Templates are curated, not self-promoting.** W04 may define reusable versioned PlanTemplate/PlanBinding; adaptive promotion/learning belongs to W18.
9. **Target-neutral now, concrete execution later.** W04 may describe target kinds/bindings including future DEVICE compatibility but may not create Android runtime, DeviceId/session/trust or provider executor semantics.

## 6. Namespace and ownership direction

Canonical W04 semantic surfaces are allocated under:
- `packages/control/**` — W04 lifecycle, capability planning, GoalGraph, lane, budget, template and scheduler semantics.
- `packages/registries/src/capabilities/**` — the single Capability Registry foundation.
- W04-prefixed tests and `docs/governance/w04/**`.

Root package/workspace/lockfile/build config, package manifests/barrels/export maps, CODEOWNERS and CI workflows remain Program Control-owned shared surfaces unless explicitly transferred.

Exact leaf paths are frozen in `W04_OWNERSHIP_MATRIX.md`. Workers must not widen ownership by inference.

## 7. Internal DAG

`W04-00 -> (W04-A || W04-B || W04-F)`

`W04-A + W04-B -> (W04-C || W04-E || W04-G)`

`W04-C + W04-F -> W04-D`

`W04-D + W04-E + W04-G -> W04-H`

Every edge requires accepted predecessor evidence, not an open PR, generated patch or green CI alone.

The true first post-freeze READY set is `{W04-A, W04-B, W04-F}`. In `FREE_ACTIONS_CLI` only two code tasks may execute simultaneously; longest-remaining-path priority should normally start A+B while F remains immediately next-ready, subject to live shared-write reconciliation.

## 8. Publication barriers

- **CP0:** W04-00 coordination/ownership/risk freeze accepted.
- **CP1:** W04-A lifecycle contracts accepted.
- **DP1 / CP2:** W04-B target-neutral Capability Registry + CapabilityPlan accepted; DEVICE may be represented as a future binding without Android business logic.
- **CP3:** W04-F ExecutionBudget contract accepted.
- **CP4:** W04-C GoalGraph accepted.
- **CP5:** W04-E lane resolver and W04-G curated templates accepted.
- **CP6:** W04-D bounded scheduler accepted.
- **CP7:** W04-H integrated W04 Reality/contract/performance gate accepted.

W05/W07/W14/W15 consumers may only release when their own live dependency matrices and the required W04 publication barrier are satisfied.

## 9. Legacy and TOCA capability seed rule

The 69 legacy seeds and all TOCA capability/route vocabulary are planning inputs only. W04-B must explicitly accept, reject, rename or decompose semantic candidates before they enter the canonical registry.

No legacy/TOCA ID, route, approval record, provider binding, executable wrapper or dynamic plugin implementation is canonical by inheritance. Any promotion must preserve provenance and be re-specified against Aurora IDs, tenant, risk, authority, availability/freshness, evidence/readback and versioning.

## 10. Hard boundaries

W04 MUST NOT implement:
- W05 classifier/router/reasoning/agent runtime;
- W06 context/memory/cache runtime;
- W07 ActionIntent execution target resolution, current execution-authority validation, provider/device side effects, readback/reconciliation/circuit breaker/kill switch;
- W08 provider adapters;
- W09 n8n runtime/business automation;
- W14 DeviceId/session/trust/gateway;
- W15 Android/device executor/runtime;
- W17 production telemetry/DR platform;
- W18 adaptive learning/promotion.

## 11. Acceptance target

W04-00 is accepted only when:
- this charter, dependency, ownership, acceptance and risk artifacts agree;
- machine-readable `W04.json` is reconciled to schema v2 with the same DAG/ownership constraints;
- current program status records final W03 acceptance and correct W04 release semantics;
- no duplicate registry/control runtime is introduced;
- official exact-head gates pass on one final candidate;
- main is revalidated, merged, post-merge gates pass and Drive/GitHub evidence converges.

Until W04-00 itself is accepted, W04-A/B/F remain implementation-gated despite their planned post-freeze parallelism.
