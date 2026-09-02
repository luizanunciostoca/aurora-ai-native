# W06 CONTEXT BOUNDARY, PRESSURE & PERFORMANCE PLAN

Date: 2026-09-02  
Status: `W06_00_COORDINATION_FREEZE_CANDIDATE`  
Base main: `8deb67875ba6f3fecd7494f7cc955d5965543e3a`

## 1. Purpose

Freeze the measurable and security-relevant boundaries W06-A through W06-H must preserve. This artifact defines dimensions and invariants; it intentionally does **not** invent production SLO numbers before runtime/staging measurements exist.

## 2. Context eligibility pipeline

`request/task scope -> source eligibility -> tenant/identity/classification constraints -> retrieval -> provenance validation -> freshness -> trust/conflict evaluation -> ranking -> minimization/compression -> MinimalContextPackage -> consumer`

The order may be optimized only when an optimization is semantically equivalent and cannot admit data that the full constraint set would reject.

## 3. Source classes

Canonical semantic layers from Developer Manual v0.5:
- working;
- episodic;
- semantic;
- company knowledge;
- user context;
- temporal facts;
- operational state;
- evidence.

Adapters map sources into these roles; they do not create new authority classes.

## 4. Required eligibility metadata

A trusted/usable item must have, where applicable:
- canonical tenant scope;
- subject/identity binding;
- data classification;
- source reference and source class;
- version/hash/revision reference;
- observed/retrieved time;
- freshness/expiry basis;
- provenance/evidence reference;
- trust basis;
- conflict/uncertainty state;
- consent/purpose/jurisdiction constraints;
- request correlation.

Mandatory metadata absence results in rejection/unknown, not inference.

## 5. Trust model constraints

Trust may depend on source class, provenance integrity, evidence references, freshness and consistency. W06-B owns the exact deterministic formula/config.

Frozen constraints:
- trust is not execution authority;
- semantic similarity is not trust by itself;
- source popularity/ranking is not proof of correctness;
- conflicting high-trust items remain conflict until explicit resolution;
- untrusted content cannot alter governing metadata by prompt/text instruction;
- trust config/version must be included in reproducibility evidence.

## 6. Freshness model constraints

Freshness is evaluated against query/task need.

Required concepts:
- source observation/retrieval time;
- source revision/version;
- TTL/expiry or source-specific staleness rule;
- currentness requirement from query;
- invalidation state;
- refresh/rejection reason.

Historical facts may remain valid for historical queries. Stale facts may not be relabeled current because refresh is expensive or unavailable.

## 7. MinimalContextPackage requirements

The package must be reproducible from query/config/source revisions to the degree sources permit and expose enough audit metadata to answer:
- what was included;
- what material source/result was excluded/rejected and why;
- which source revisions/hashes were used;
- which freshness/trust/config versions were used;
- what conflicts/unknowns remain;
- what compression/minimization occurred;
- which tenant/classification/purpose constraints apply.

The package is non-authoritative evidence/input. It cannot carry cached approval as current permission.

## 8. Compression protected set

Compression/minimization MUST preserve:
- tenant/subject/classification bindings;
- source/provenance references needed for audit;
- material conflicts/unknowns;
- freshness state and source version;
- mandatory constraints relevant to safe interpretation;
- evidence references needed to distinguish assertion from verified source data.

Redundant natural-language payload may be compressed; the protected semantic set may not be silently dropped to save tokens.

## 9. Semantic cache key/binding requirements

At minimum cache identity must account for the semantic query plus the context that changes eligibility, including tenant/classification and relevant source/config versions. Exact key design belongs to W06-F.

A hit is usable only if:
- tenant/eligibility context matches;
- TTL/freshness remains valid;
- source/config versions remain compatible;
- no invalidation supersedes the entry;
- classification/consent/purpose/jurisdiction requirements remain compatible.

Otherwise it is MISS/STALE/REJECTED, never a permissive hit.

## 10. Snapshot/invalidation requirements

Snapshot metadata includes version/hash/provenance/freshness/source-version set and invalidation state. W03 events may trigger incremental invalidation.

Rules:
- invalidation is idempotent;
- duplicate/replayed event does not duplicate state transitions;
- older/out-of-order invalidation cannot restore newer stale content;
- unknown invalidation ordering makes affected data non-current until reconciled;
- policy/authority references in snapshot remain informational and require current validation at execution time.

## 11. Safe speculation boundary

Allowed: reversible read-only prefetch, pre-rank, precompute and compression preparation.

Forbidden:
- provider/device/workflow/local write;
- W07 executor invocation;
- approval/token issuance;
- durable business mutation;
- speculative result promotion after invalidating context/policy/source version without revalidation.

Every speculative unit has finite time/work/fan-out bounds and is cancellable/discardable.

## 12. Context pressure metrics

W06-H must emit measured test-scope values where observable:
- query count and source fan-out;
- candidates retrieved/eligible/rejected;
- package raw vs final size;
- compression ratio;
- cache hit/miss/stale-rejection;
- invalidation lag;
- freshness validation count/cost proxy;
- assembly p50/p95/p99;
- concurrent query/cache pressure;
- retrieval/model/tool calls attributable to context assembly;
- cancellation/timeout/degraded counts.

Every record identifies fixture/config/source versions and environment. Unobserved provider/model cost/tokens/production SLO remain explicitly unobserved rather than fabricated.

## 13. Budget consumption rules

- source fan-out, candidate count, package size, attempts and concurrency are finite and configurable;
- W04 ExecutionBudget may cap optional context work;
- mandatory tenant/classification/provenance/freshness checks are non-degradable safety work when required by the query;
- budget exhaustion yields bounded degradation, explicit insufficiency or abstention—not a wider/unverified source set;
- performance optimization must compare semantic equivalence/quality, not only latency.

## 14. Poisoning/staleness negative matrix

| Scenario | Expected behavior |
|---|---|
| unknown source identity | reject/quarantine as trusted fact |
| mismatched tenant | fail closed |
| classification mismatch | reject/redact only under explicit compatible rule |
| missing required provenance | reject/unknown |
| future/impossible observation timestamp | reject/unknown |
| stale current-required fact | reject/refresh/abstain |
| conflicting material facts | preserve conflict; no silent top-score winner |
| tampered source hash/version | reject/quarantine |
| stale cache after source version change | stale rejection/miss |
| duplicate invalidation event | idempotent no-op after first effect |
| out-of-order older invalidation | cannot resurrect state |
| consent/purpose/jurisdiction change | invalidate/reject incompatible reuse |
| cache hit containing secret/credential/authority token | prohibited/test failure |
| compression drops protected constraint | test failure |
| speculative read becomes write | release blocker |

## 15. Reference promotion notes

Legacy MemoryManager provides only concept candidates for memory taxonomy, importance/promotion and indices. Aurora adds tenant/provenance/trust/freshness/consent/retention and may reject any legacy semantic that conflicts with this freeze.

TOCA MCP Asset Intelligence at audited source `8a6cfe055be9b34e498cfbdb481e8232dc51df05` demonstrates useful semantic patterns: source/master lineage, evidence references, explicit `readAt`, fail-closed eligibility and the rule that a database snapshot must not infer authoritative Creative Truth. W06 may reuse those **principles**, not TOCA business schemas, venue/brand verdict semantics or source-of-truth ownership.

## 16. Handoff after W06-00 acceptance

- W06-A receives source/query/eligibility/provenance boundaries and may implement only query/source leaves.
- W06-E receives the eight memory/context layers and ownership/retention/conflict constraints.
- W06-B/C/D/F/G remain gated by the canonical DAG.
