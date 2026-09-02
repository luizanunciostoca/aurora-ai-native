# W06 RISK REGISTER & PRE-MORTEM

Date: 2026-09-02  
Status: `W06_00_COORDINATION_FREEZE_CANDIDATE`  
Framework: AURORA Risk & Architecture Validation Framework v1.0  
Base main: `8deb67875ba6f3fecd7494f7cc955d5965543e3a`

Exposure = likelihood × impact × detectability. 1-20 LOW; 21-40 MODERATE; 41-70 HIGH; 71-125 CRITICAL.

Independent release blockers: authority bypass, cross-tenant breach, secret exposure or external/speculative side effect outside the governed executor boundary.

## W06-R01 — Context/cache becomes authority
L4 I5 D5 = 100 CRITICAL. Cached/trusted context is interpreted as permission/current approval. Controls: explicit non-authority contracts, current W02/W07 validation remains mandatory, negative tests. Owner: A/B/C/D/F/H.

## W06-R02 — Cross-tenant cache/source leakage
L3 I5 D5 = 75 CRITICAL and release-blocking if realized. Controls: canonical tenant binding on query/source/result/cache/snapshot, concurrency isolation tests, fail-closed mismatch. Owner: A/B/D/F/H.

## W06-R03 — Stale context presented as current
L4 I5 D4 = 80 CRITICAL. Expired/old fact drives current decision. Controls: task-relative freshness, TTL/source versions, stale rejection and invalidation evidence. Owner: B/C/D/F/H.

## W06-R04 — Context poisoning / provenance forgery
L3 I5 D5 = 75 CRITICAL. Untrusted/tampered content gains trusted status. Controls: explicit source identity/version/hash/evidence, trust basis, quarantine/rejection, later W19 hardening. Owner: A/B/H.

## W06-R05 — Compression removes safety constraints
L3 I5 D4 = 60 HIGH. Minimalization drops provenance/conflict/classification/policy requirements. Controls: protected metadata/constraint set, round-trip/reproducibility tests. Owner: C/H.

## W06-R06 — Retrieval fan-out explosion
L4 I4 D3 = 48 HIGH. Broad query hits excessive sources and increases latency/cost. Controls: finite configurable fan-out, narrow-by-default query, cancellation and ExecutionBudget integration. Owner: A/B/H.

## W06-R07 — Context size/token pressure runaway
L4 I4 D3 = 48 HIGH. Unbounded package degrades latency/model cost. Controls: bounded package size, dedupe/compression, measured pressure and graceful degradation. Owner: C/H.

## W06-R08 — Cache invalidation race resurrects stale state
L3 I5 D4 = 60 HIGH. Replay/out-of-order event makes invalid entry current again. Controls: version-aware monotonic invalidation, W03 replay semantics, negative race tests. Owner: D/F/H.

## W06-R09 — Snapshot freezes policy/authority
L3 I5 D5 = 75 CRITICAL. Old policy/approval inside snapshot is treated as executable permission. Controls: policy/authority references informational only; current validation outside W06. Owner: D/F/H.

## W06-R10 — Global memory god-store
L3 I4 D4 = 48 HIGH. All memory classes merge into one unrestricted store. Controls: explicit memory boundaries/read-write ownership/retention/tenant/classification rules. Owner: E/Program Control.

## W06-R11 — Consent/purpose/jurisdiction drift
L3 I5 D4 = 60 HIGH. Previously eligible personal/company context is reused under incompatible purpose/jurisdiction. Controls: constraint binding on query/cache/snapshot, freshness/invalidation and negative tests. Owner: A/B/E/F/H.

## W06-R12 — Secret/credential/authority-token caching
L2 I5 D5 = 50 HIGH and release-blocking for secret exposure. Controls: prohibited-data classes for semantic cache; scans/negative tests; secret references only when another owner explicitly governs them. Owner: F/H.

## W06-R13 — Speculative preparation performs side effect
L3 I5 D5 = 75 CRITICAL. Prefetch/precompute calls executor/provider write. Controls: read-only adapter interface, no W07 write dependency, static/runtime reachability tests. Owner: G/H.

## W06-R14 — Conflict hidden by ranking score
L3 I4 D4 = 48 HIGH. Highest-score fact silently wins despite material contradiction. Controls: conflict representation/resolution reason, no score-only overwrite. Owner: B/C/H.

## W06-R15 — False performance/quality claims
L3 I4 D4 = 48 HIGH. Test latency or synthetic cache hit rates are presented as production SLO. Controls: environment/version labels, measured-vs-unobserved distinction, W17/W20 production evidence owners. Owner: H.

## W06-R16 — Legacy/TOCA schema promoted as canonical
L3 I4 D3 = 36 MODERATE. MemoryManager or Creative Truth assumptions become Aurora source-of-truth. Controls: smallest semantic reuse only, provenance pinning, W01/W02 context primitives remain canonical. Owner: 00/A/E.

## PRE-MORTEM — assume W06 failed in production

1. A semantic-cache hit reused an expired approval. Action: cache is information only; current authority validation remains outside W06.
2. Tenant A context appeared in tenant B. Action: tenant-key every query/source/result/cache/snapshot and test under concurrency.
3. A stale business fact was ranked highly and treated as current. Action: freshness gate before ranking/compilation eligibility when currentness is required.
4. Malicious source text forged provenance. Action: source/version/hash/evidence metadata and quarantine on mismatch.
5. Compression removed a critical constraint. Action: protected constraint/provenance fields and reproducibility tests.
6. Context query fanned out across the entire knowledge base. Action: narrow-by-default selectors and finite fan-out budget.
7. Event replay resurrected a stale snapshot. Action: monotonic version-aware invalidation based on W03 semantics.
8. One global memory store ignored retention/classification. Action: W06-E explicit memory boundary model.
9. Speculative prefetch accidentally invoked a write-capable adapter. Action: structurally separate read-only speculative ports from W07 execution.
10. Benchmarks looked excellent because they omitted invalidation/freshness cost. Action: W06-H measures full context-pressure dimensions and labels unobserved metrics.

## Stress and failure plan

- stale/poisoned/conflicting source mixtures;
- source timeout/unavailability/partial response;
- broad-query fan-out pressure;
- ContextPackage size/compression pressure;
- cross-tenant cache concurrency;
- cache hit immediately before invalidation;
- duplicate/replayed/out-of-order invalidation events;
- snapshot source-version drift;
- consent/purpose/jurisdiction change after cache population;
- malformed/future timestamps and revision regression;
- speculative prefetch invalidated/cancelled mid-flight;
- test-scope p50/p95/p99 assembly with cache hit/miss/stale rejection.

## Degraded-mode rules

- unavailable optional source -> omit with explicit provenance/reason if task can remain valid;
- unavailable mandatory source -> return insufficient/unknown rather than guess;
- stale current-required fact -> reject/refresh or abstain;
- conflict -> preserve conflict and escalate/abstain according to consumer contract;
- overload -> bound fan-out, cancel optional retrieval, preserve mandatory safety metadata;
- cache uncertainty -> miss/recompute, never permissive hit;
- invalidation uncertainty -> treat affected cache/snapshot as non-current until reconciled.

## Architecture kill criteria

Redesign before acceptance if W06 creates authority from context/trust/cache, cross-tenant leakage, a global unbounded memory store, stale resurrection, provenance-free trusted facts, secret/authority-token caching, compression that can hide safety constraints, unbounded retrieval/context pressure, speculative write paths, duplicate W01/W02 identity/tenant/policy truth or unreconstructable context decisions.
