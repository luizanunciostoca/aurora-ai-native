# W06 WAVE CHARTER — CONTEXT ENGINE / COMPILATION / CACHE / SAFE SPECULATION

Date: 2026-09-02  
Status: `W06_00_COORDINATION_FREEZE_CANDIDATE`  
Coordination base main: `8deb67875ba6f3fecd7494f7cc955d5965543e3a`  
Owner: AURORA PROGRAM CONTROL / W06-00

## 1. Mission

Build Aurora's Context Engine as a bounded, tenant-safe, provenance-first information plane that produces the minimum reproducible context required by a task without becoming policy, authority, control-plane truth or an unbounded memory store.

W06 owns `ContextQuery`, source adapters, retrieval/ranking, trust/freshness evaluation, minimal context compilation/compression, context snapshots/invalidation, memory boundaries, semantic cache and reversible speculative preparation.

W06 answers **what verified, sufficiently fresh and appropriately scoped information should intelligence receive for this task?** It never answers **may this action execute?** and never performs an external write side effect.

## 2. Prerequisites and release basis

W06-00 is dependency-eligible because W05-H is accepted.

Canonical upstream state at this freeze:
- W02: `COMPLETE_ACCEPTED / REALITY_GATE_1_AUTHORITY_VERIFIED`.
- W03: accepted durable event/idempotency/replay/timer/lease/workflow foundations.
- W04: accepted lifecycle, CapabilityPlan, GoalGraph, lanes, ExecutionBudget, templates and bounded scheduler.
- W05: complete through W05-H.
- W05-H PR #220 exact accepted candidate `03ce215d6e606d930db922dab7352550987f550d`; merge/main `8deb67875ba6f3fecd7494f7cc955d5965543e3a`.
- W05-H post-merge `main` Quality `33585518047`, Test Build `33585517936`, Security `33585518933`: SUCCESS.

`CURRENT_PROGRAM_STATUS.md` still requires a later Program Control convergence update for W05-H/W05 completion. This drift is recorded here and MUST be closed before runtime descendants rely on a stale summary as release authority.

No descendant W06 node is released merely by this candidate. W06-00 itself must be independently accepted first.

## 3. Canonical inputs

- GitHub live `main`, accepted exact-SHA/PR evidence and `docs/governance/CURRENT_PROGRAM_STATUS.md` under the documented precedence rules.
- Developer Manual v0.5 Audit-Consolidated, especially W06, Risk Validation, Git workflow, DoD and kill criteria.
- Action Plan v0.4.1 Device/Edge amendment, W06 plan and sequencing.
- AURORA Risk & Architecture Validation Framework v1.0.
- W01 canonical `TenantContext`, `CorrelationContext`, identity refs, `DataClassification` and propagation primitives.
- W02 accepted tenant/identity/consent/purpose/jurisdiction/policy/authority boundaries.
- W03 accepted EventEnvelope/replay/invalidation-capable durable foundations.
- W04 accepted ExecutionBudget and task/control metadata.
- W05 accepted intelligence routing outputs as consumers, never authority inputs.
- Legacy `MemoryManager.js` only through the canonical salvage decision `CONCEPT_REUSE`: taxonomy/importance/promotion/index concepts, with Aurora tenant/provenance/trust/freshness/consent/retention semantics added.
- TOCA MCP audited source `8a6cfe055be9b34e498cfbdb481e8232dc51df05`, especially `docs/architecture/asset-intelligence-content-supply.md` (blob `502aa9f0d49c6f4e9364d2430069e8753ee8cf32`) as semantic reference for explicit provenance/evidence, freshness/read timestamp, source lineage and fail-closed eligibility. No TOCA schema/business assumption is canonical Aurora context semantics.

## 4. Live repository audit

At coordination base `8deb6787...`:
- `packages/contracts/src/context/**` already owns canonical W01 context primitives: tenant, correlation, identity refs, deadline/expiry, data classification and propagation.
- no canonical `ContextQuery`, `ContextPack`, `MinimalContextPackage`, semantic cache, context snapshot or W06 retrieval runtime exists on live `main`.
- no `packages/context/**` runtime package exists.
- `docs/governance/copilot/tasks/W06.json` is schema v1 and does not yet carry exact path ownership, shared locks or readiness controls.
- the legacy salvage register assigns `MemoryManager.js` to W06 as `CONCEPT_REUSE`, never direct runtime import.
- W05 explicitly locks W06 retrieval/cache/memory ownership out of the intelligence runtime.

Therefore W06 may allocate a new owned context namespace after this freeze is accepted, while reusing W01 primitives instead of redefining them.

## 5. Canonical context layers

The Developer Manual layers are preserved as semantic source classes:
1. working context;
2. episodic memory;
3. semantic memory;
4. company knowledge;
5. user context;
6. temporal facts;
7. operational state;
8. evidence.

These classes describe information role and ownership boundaries. They are not permission levels, policy decisions or authority classes.

Exact wire enums may be finalized by the owning leaf only if they remain compatible with this freeze.

## 6. Source boundary freeze

Every context item entering W06 MUST be attributable to an approved source adapter and carry enough metadata to reconstruct why it was eligible for inclusion.

Minimum semantic requirements:
- source identity/reference and source class;
- tenant scope and relevant subject/identity binding;
- data classification;
- version/hash or equivalent immutable revision reference where the source supports it;
- observed/retrieved timestamp and freshness basis;
- provenance/evidence reference when applicable;
- trust basis and explicit uncertainty/conflict state;
- purpose/consent/jurisdiction constraints when applicable;
- correlation to the requesting task/query.

Unknown source identity, unresolved tenant scope, incompatible classification or missing mandatory provenance fails closed for inclusion in a trusted/minimal package. A source may remain visible as rejected/uncertain evidence where the consumer contract allows that distinction; it must not be silently promoted to trusted fact.

## 7. Trust and freshness freeze

- **Trust is evidence about information quality/source, not authority.** A high-trust fact cannot mint or widen execution authority.
- **Freshness is task-relative and source-aware.** A cached or historical item can be valid for historical analysis and invalid for a current-state decision.
- stale/expired/unknown freshness is explicit; there is no permissive stale fallback for facts whose currentness is required.
- conflicting facts remain represented as conflict/uncertainty until a governed resolution rule selects a usable projection; ranking score alone cannot erase conflict.
- future timestamps, impossible revision regressions and provenance mismatches are rejected or quarantined.
- current Policy/Authority is never frozen inside a context snapshot as executable permission. Policy references may be contextual information only; current validation remains W02/W07-owned.

Exact trust/freshness scoring formulas belong to W06-B. This freeze prohibits scores from being interpreted as authorization.

## 8. ContextQuery and MinimalContextPackage compatibility

Canonical pipeline:

`Goal/Task -> ContextQuery -> Retrieval -> Ranking -> Freshness -> Trust/constraints -> Compression -> MinimalContextPackage`

Compatibility rules:
- W06-A defines query semantics using existing W01 tenant/correlation/identity/classification primitives.
- W06-C defines the minimal package; it must record included and excluded/rejected source references sufficient for reproducibility and audit.
- compression may remove redundant content but MUST preserve safety-relevant constraints, provenance references, conflicts, freshness state and classification boundaries.
- a minimal package is evidence/input to intelligence, not current policy, approval or executable authority.
- there is no canonical `ContextPack` wire type on live `main` at this freeze. W06 MUST NOT pretend one already exists. If a cross-wave public contract must later enter `packages/contracts/**`, Program Control owns that convergence and compatibility review.

## 9. Cache and snapshot authority rules

Semantic cache and snapshots may accelerate reads/reasoning only.

They MUST NOT cache or replay as authority:
- `PolicyToken` or `OwnerDecision` as a substitute for current validation;
- provider/device credentials or secrets;
- current execution permission;
- tenant-ambiguous context;
- stale source state represented as current.

Every reusable cache/snapshot entry must bind query/result provenance, tenant/classification, source versions, freshness/TTL basis and invalidation semantics. Cache hit is never authority.

W03 events may drive incremental invalidation; replay/out-of-order events must not resurrect invalidated context as current truth.

## 10. Context pressure / performance budget model

W06-00 freezes the dimensions, not invented production SLO numbers.

Required bounded dimensions:
- retrieval source fan-out;
- Context/MinimalContextPackage size (bytes and/or model-context units where applicable);
- assembly latency p50/p95/p99 at test/runtime maturity;
- freshness-validation work;
- cache hit/miss/stale-rejection rate;
- invalidation lag;
- compression ratio;
- retrieval/model/tool calls attributable to context assembly;
- concurrency and cancellation pressure.

All runtime fan-out/concurrency/size/attempt dimensions MUST have finite configuration bounds. W04 `ExecutionBudget` may constrain optional context work, but context optimization cannot discard mandatory tenant/classification/provenance/safety constraints. Numeric production SLOs are deferred until real measurements exist under W17/W20 governance.

## 11. Namespace and ownership direction

W06 semantic runtime is allocated under `packages/context/**` after W06-00 acceptance.

Program Control owns the package skeleton, manifest/build config, root/public barrels and any cross-package/public-contract publication.

Leaf directions:
- W06-A: `packages/context/src/query/**`, `packages/context/src/sources/**`, tests `packages/context/test/w06a-**`.
- W06-B: `packages/context/src/retrieval/**`, tests `packages/context/test/w06b-**`.
- W06-C: `packages/context/src/minimal-context/**`, tests `packages/context/test/w06c-**`.
- W06-E: `packages/context/src/memory-boundaries/**`, tests `packages/context/test/w06e-**`.
- W06-D: `packages/context/src/snapshots/**`, tests `packages/context/test/w06d-**`.
- W06-F: `packages/context/src/semantic-cache/**`, tests `packages/context/test/w06f-**`.
- W06-G: `packages/context/src/speculation/**`, tests `packages/context/test/w06g-**`.
- W06-H: integration/quality/performance tests `packages/context/test/w06h-**` and W06 evidence only.

Exact locks are frozen in `W06_OWNERSHIP_MATRIX.md`.

## 12. Internal DAG

`W06-00 -> (W06-A || W06-E)`

`W06-A -> W06-B -> W06-C`

`W06-C + W06-E -> (W06-D || W06-F)`

`W06-D + W06-F -> W06-G -> W06-H`

The first true dependency-ready frontier after accepted W06-00 is `{W06-A, W06-E}`.

## 13. Cross-wave interfaces

### W02 -> W06
Tenant/identity/consent/purpose/jurisdiction/classification constraints are consumed, never redefined. Current policy/authority remains outside cache authority.

### W03 -> W06
W06 consumes event/replay foundations for invalidation and durable evidence where appropriate. Event replay cannot silently resurrect stale context.

### W04 -> W06
W06 may consume task/goal context and ExecutionBudget constraints. It does not own GoalGraph, lanes, templates or budget truth.

### W05 -> W06
W05 expresses intelligence needs; W06 returns bounded context. Route/confidence cannot widen context authorization or tenant scope.

### W06 -> W07/W10-W18
Consumers receive context/evidence projections only. W07 still validates current execution authority. W17 owns production telemetry/SLO; W18 owns learned/adaptive promotion.

## 14. Publication barriers

- C0: W06-00 coordination/boundary/ownership/risk/performance freeze accepted.
- C1: W06-A ContextQuery/source adapters accepted.
- C2: W06-E memory boundary model accepted.
- C3: W06-B retrieval/ranking/trust/freshness accepted after A.
- C4: W06-C MinimalContextPackage/compression accepted after B.
- C5: W06-D snapshots/invalidation and W06-F semantic cache may proceed after C + E.
- C6: W06-G safe speculation accepted only after D + F.
- C7: W06-H context quality/performance gate accepted.

No barrier grants execution permission.

## 15. Hard boundaries

W06 MUST NOT implement:
- W02 Policy Engine, authority validation, consent authority or token issuance;
- W03 durable event/workflow replacements;
- W04 control/GoalGraph/ExecutionBudget truth;
- W05 Intelligence Router/confidence/reasoning strategy;
- W07 executor/readback/reconciliation/failure containment;
- provider/device/workflow writes;
- W17 production telemetry platform or W18 adaptive promotion;
- a global memory god-store without explicit tenant/source/retention/ownership boundaries.

## 16. Acceptance target for W06-00

W06-00 is accepted only when:
- charter, dependency, ownership, acceptance, risk and context-boundary/performance artifacts agree;
- `docs/governance/copilot/tasks/W06.json` is reconciled to schema v2 with the same DAG, exact allowed paths, shared locks and readiness semantics;
- live repository audit proves no competing context source of truth is introduced;
- W05-H/current main are revalidated immediately before final exact-head gating;
- Quality, Test Build and Security pass on the same exact candidate HEAD;
- Risk Gates A/B/C/D are independently recorded;
- controlled merge and post-merge exact-main verification succeed;
- Drive/GitHub evidence/status converge before descendants are released.

Until W06-00 is accepted, W06-A and W06-E remain implementation-gated.
