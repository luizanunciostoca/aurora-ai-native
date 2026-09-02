# W06 ACCEPTANCE MATRIX & RISK GATES

Date: 2026-09-02  
Status: `W06_00_COORDINATION_FREEZE_CANDIDATE`  
Target: `W06_CONTEXT_ENGINE_VERIFIED`

## Global invariants

- Context, trust, freshness, semantic similarity, cache hit and snapshot state are information/evidence, never authority.
- W01 canonical tenant/correlation/identity/classification primitives are reused.
- current policy/authority is never frozen into a context package as executable permission.
- stale/unknown/currentness is explicit and task-relative.
- conflicts are represented, not silently erased by ranking.
- retrieval/context size/fan-out/concurrency are bounded.
- speculation is read-only/reversible and cannot perform external writes.
- W17 owns production SLO claims; W18 owns learned promotion.

## W06-00 coordination freeze acceptance

Required evidence:
1. Charter, Dependency Matrix, Ownership Matrix, this Acceptance Matrix, Risk Register and Context Boundary/Performance Plan agree.
2. `docs/governance/copilot/tasks/W06.json` is schema v2 and represents the same DAG, allowed leaf paths, shared locks and readiness rules.
3. Live repository audit confirms no competing ContextQuery/ContextPack/cache/memory runtime is already canonical and existing W01 primitives are reused.
4. Source/trust/freshness/tenant/classification/provenance boundaries are explicit.
5. MinimalContextPackage/cache/snapshot authority rules are explicit.
6. Context pressure/performance dimensions and poisoning/staleness threat plan are frozen without invented production SLOs.
7. No runtime feature, external side effect, policy/authority issuance or adaptive promotion is introduced by W06-00.
8. Quality, Test Build and Security pass on one exact candidate HEAD; Risk Gates A-D, controlled merge, post-merge verification and Drive/GitHub convergence follow.

## Subwave acceptance

### W06-A — ContextQuery + Source Adapters
Must prove explicit bounded query semantics, approved source classes/adapters, canonical tenant/identity/classification/correlation propagation, purpose/consent/jurisdiction constraints where applicable, finite source fan-out and no default whole-store retrieval. Provider/source reads are read-only context acquisition, not side effects that create business authority.

### W06-B — Retrieval / Ranking / Trust / Freshness
Must prove deterministic behavior for fixed inputs/config, provenance-preserving ranking, explicit freshness/trust basis, conflict/unknown representation, stale rejection when currentness is required, source poisoning defenses and zero conversion of trust/rank score into authority.

### W06-C — MinimalContextPackage + Compression
Must prove reproducible minimum context for equivalent query/source snapshot, included/excluded source references, compression metrics, preservation of critical constraints/provenance/conflicts/classification and bounded context size. Compression cannot hide a policy/authority requirement.

### W06-E — Memory Boundary Model
Must prove explicit working/episodic/semantic/company/user/temporal/operational/evidence boundaries, read/write ownership, retention/freshness/conflict semantics and tenant isolation. No global memory god-store.

### W06-D — ContextSnapshot + Incremental Invalidation
Must prove version/hash/provenance/freshness metadata, W03-driven invalidation, deterministic incremental recompilation and replay/out-of-order safety. Snapshot never freezes current policy/authority.

### W06-F — Semantic Cache
Must prove query/result provenance, tenant/classification binding, TTL/source versions, hit/miss/stale rejection/invalidation semantics, cross-tenant isolation and prohibition on credentials/secrets/authority-token caching.

### W06-G — Safe Speculative Preparation
Must prove prefetch/pre-rank/precompute is bounded, read-only and discardable; context/policy/source invalidation cancels or invalidates speculative results; no external write or executor invocation is reachable.

### W06-H — Context Quality / Performance Tests
Must measure test-scope ContextPackage size, source fan-out, cache hit/miss/stale rejection, invalidation lag, compression ratio and assembly p50/p95/p99; exercise stale/poisoned/conflicting sources and tenant isolation under cache/concurrency. Test metrics are not production SLOs.

## Risk Gate A — Correctness

PASS requires:
- deterministic/reproducible query/ranking/compilation decisions for fixed inputs/config/source revisions;
- stable provenance/version/hash/freshness representation;
- explicit conflict and rejected-source behavior;
- deterministic snapshot/cache invalidation and no stale resurrection;
- no duplicate tenant/identity/classification/source-of-truth primitives;
- consumer/publication compatibility.

## Risk Gate B — Safety / Authority

PASS requires evidence that:
- context/trust/rank/freshness/cache/snapshot/similarity cannot authorize execution;
- cross-tenant or classification-incompatible source data cannot satisfy another tenant/query;
- consent/purpose/jurisdiction constraints are propagated when applicable;
- no credentials/secrets/PolicyToken/OwnerDecision are stored as reusable semantic-cache authority;
- compression cannot strip safety constraints;
- speculation cannot execute external writes.

Authority bypass, cross-tenant breach, secret exposure or speculative/external write outside W07 are independent release blockers.

## Risk Gate C — Performance / Economics

W06-H must measure at test scope:
- retrieval source fan-out;
- package size/context pressure;
- assembly p50/p95/p99;
- freshness-validation overhead;
- cache hit/miss/stale-rejection;
- invalidation lag;
- compression ratio;
- context-attributable model/tool/retrieval calls where observable;
- concurrency/cancellation pressure.

All runtime dimensions are finite/config-bounded. No invented production SLO, provider pricing or unobserved metric may be claimed.

## Risk Gate D — Failure / Recoverability

Must exercise:
- source unavailable/timeout;
- stale/expired/unknown freshness;
- poisoned/tampered provenance;
- conflicting facts;
- cross-tenant source/cache mismatch;
- classification/consent/purpose/jurisdiction mismatch;
- cache stale entry and invalidation race;
- duplicate/replayed/out-of-order invalidation event;
- snapshot source-version drift;
- compression pressure/exhausted context budget;
- speculative result invalidated before consumption;
- bounded degradation/abstention instead of unsafe guessing.

## Final W06 reality scenarios

R01 equivalent ContextQuery + same source revisions yields reproducible eligible context.  
R02 query never retrieves an entire knowledge store merely because no narrow selector exists.  
R03 tenant A source/cache entry cannot satisfy tenant B.  
R04 classification-incompatible data is rejected or explicitly redacted according to owned policy, never silently included.  
R05 stale current-state fact is rejected when currentness is required.  
R06 historical query may intentionally use historical facts while preserving timestamps/provenance.  
R07 high trust/rank cannot create authority.  
R08 conflicting facts remain explicit until governed resolution.  
R09 poisoned/mismatched provenance fails closed or quarantines.  
R10 MinimalContextPackage preserves required provenance and conflict/freshness metadata.  
R11 compression cannot remove mandatory safety/policy/authority requirements from the consumer-visible constraints.  
R12 snapshot invalidation from W03 events is deterministic and replay-safe.  
R13 out-of-order invalidation cannot resurrect stale context.  
R14 semantic-cache hit preserves tenant/classification/source-version/TTL bounds.  
R15 cache never stores credentials, secrets or reusable execution authority.  
R16 W04 ExecutionBudget may reduce optional retrieval/compression work without reducing mandatory safety constraints.  
R17 speculative prefetch is cancelled/discarded on invalidation and cannot invoke W07 writes.  
R18 MemoryManager concepts are re-specified; no legacy runtime import becomes canonical.  
R19 TOCA Creative Truth/Asset Intelligence remains provenance/reference input only; TOCA verdict/business schema is not inferred as Aurora authority.  
R20 W06-H reports measured test context pressure without claiming unobserved production SLOs.

## Final decision vocabulary

`ACCEPT | ACCEPT_WITH_RECORDED_RISK | REJECT | BLOCKED`.

W06-00 may release only A/E after independent acceptance and full exact-head/merge/Drive convergence.
