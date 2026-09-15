# W06-I — Aurora Memory Fabric

Status: `BUILD_CANDIDATE / NON-AUTHORITATIVE_UNTIL_ACCEPTED`

Initial base: `d2089407e88480686b879928cf2863c0dc81718e`
Tracking issue: `#530`
Canonical branch: `wave/06i-aurora-memory-fabric`

## 1. Purpose

Aurora Memory Fabric extends the accepted W06 context/memory architecture with a model-agnostic shared-memory projection and consolidation layer. The Aurora system owns continuity. Models, agents and future provider adapters are interchangeable producers/consumers of bounded context rather than independent memory authorities.

This work does not replace the accepted W06 source-of-truth boundaries. It creates a governed projection lifecycle that can carry eligible context across conversations, models, agents and devices while retaining tenant, classification, provenance, retention and conflict semantics.

## 2. Existing accepted foundation reused

W06-E already freezes these memory boundaries and source owners:

| Boundary | Source owner |
| --- | --- |
| WORKING | TASK_RUNTIME |
| EPISODIC | EVENT_HISTORY |
| SEMANTIC | SEMANTIC_KNOWLEDGE |
| COMPANY | COMPANY_KNOWLEDGE |
| USER | USER_PROFILE |
| TEMPORAL | TEMPORAL_FACT_SOURCE |
| OPERATIONAL | OPERATIONAL_STATE_SOURCE |
| EVIDENCE | EVIDENCE_SOURCE |

Memory Fabric does not turn W06 into a global memory source of truth. Each proposal is checked against the existing boundary model before it may enter the projection lifecycle.

## 3. Architecture

```text
User / Model / Agent / System / Source Adapter
                  |
                  v
         MemoryWriteProposal
                  |
                  v
     W06-E Memory Boundary Gate
                  |
                  v
    Aurora Memory Fabric staging
        |                  |
        |                  +--> conflict + provenance preservation
        v
   TRANSIENT/CANDIDATE
        |
        | source-owner evidence/commit
        v
      VALIDATED
        |
        | explicit promotion
        v
      CANONICAL
        |
        +--> SUPERSEDED / REVOKED

Eligible projection
        |
        v
ContextSourceAdapter -> ContextQuery -> W06 retrieval/minimization
        |
        v
Intelligence/model/agent consumer
```

`Context != Authority` remains invariant. Every Memory Fabric result carries `authorizesExecution=false`.

## 4. Lifecycle semantics

| State | Meaning | Eligible for context reads |
| --- | --- | --- |
| TRANSIENT | Session/working-memory projection; no durable promotion implied | Yes, for WORKING memory |
| CANDIDATE | Proposed durable memory awaiting source-owner validation | No |
| VALIDATED | Bound to source-owner evidence/commit and eligible for shared context | Yes |
| CANONICAL | Preferred W06 read projection for its key after explicit promotion | Yes |
| SUPERSEDED | Replaced by another explicit projection | No |
| REVOKED | Explicitly invalidated/withdrawn | No |

The word `CANONICAL` applies only to the W06 read projection. It never transfers source-of-truth ownership away from the boundary owner and never represents current execution permission.

Direct `CANDIDATE -> CANONICAL` promotion is rejected. Non-working memory must first become `VALIDATED` with a bounded source commit/evidence reference.

## 5. Conflict and overwrite policy

Memory Fabric preserves conflicts instead of silently choosing a winner.

If two active projections share the same memory key/boundary but differ in content digest, the new proposal is marked `CONFLICTING` and records the conflicting projection references. If an existing `CANONICAL` projection exists, another projection cannot silently replace it. Promotion requires an explicit supersession reference; the old projection is atomically moved to `SUPERSEDED`.

Reusing a proposal reference for different content fails closed. Replaying the same proposal or the same active source/content is idempotent and does not advance the snapshot revision.

## 6. Multi-model sharing contract

Memory Fabric publishes bounded read-only adapters through the existing W06 `ContextSourceAdapter` surface. There is one adapter identity per memory boundary. Selectors remain narrow:

- `memoryKey`;
- `sourceReference`;
- `projectionReference`.

Whole-store reads are not introduced. Candidate, superseded and revoked projections are excluded from the normal context path. Tenant isolation is checked again when a source adapter reads a snapshot.

This lets any approved intelligence route receive the same Aurora-owned context substrate without coupling memory ownership to a particular model/provider.

## 7. Persistence and W03 boundary

The initial implementation is a deterministic tenant-scoped reducer over `MemoryFabricSnapshot`. It intentionally does not create a new database, event log, replay engine, outbox or durable business store.

Durable persistence/replay must bind to accepted W03 primitives/adapters in a later integration step. W03 remains the durability owner; W06 owns memory/context semantics and read projection only.

A future durable adapter should persist lifecycle transitions with idempotency and replay semantics without changing the reducer's authority model.

## 8. Security, privacy and authority invariants

Memory Fabric must preserve the following controls:

- tenant-scoped memory and source reads;
- maximum data-classification enforcement;
- source-owner matching;
- provenance on every accepted proposal;
- governed-retention references where W06-E requires them;
- explicit conflict state;
- no credential or secret caching as memory authority;
- no `PolicyToken` or `OwnerDecision` persistence as current authority;
- no raw-audio memory content type;
- no model/provider identity may promote itself to source-of-truth owner;
- no memory state authorizes a provider/device/business side effect;
- no memory state authorizes retry after `EXECUTION_UNCERTAIN`.

`INTELLIGENCE != AUTHORITY != EXECUTION` and `CONTEXT != AUTHORITY` remain unchanged.

## 9. Ownership boundaries

W06-I owns only:

- `packages/context/src/memory-fabric/**`;
- `packages/context/test/w06i-**`;
- this governance document.

It does not own:

- W03 durable event/replay infrastructure;
- W05 intelligence routing/model selection;
- W07 authority/execution/reconciliation;
- W15 Android/device execution or DP5;
- W16 Workspace publication;
- W18 adaptive learning/promotion.

No root package/publication surface is changed by this candidate.

## 10. Future Brain / Memory UX

A future W16 Workspace surface may visualize Memory Fabric as a graph of projects, people, decisions, documents, events, agents and relationships. That UI should be a governed projection over Memory Fabric and context sources, not a source of execution authority.

The UI may support inspect/search/filter/provenance/conflict/supersession views. Any mutation that affects durable memory must still travel through the appropriate source-owner/governance path.

## 11. DP5 independence

W06-I software development and validation do not require W15-J physical DP5. This candidate does not touch the physical APK tuple, device executor, governed LOCAL host, DP5 evidence or W16 BUILD release state.

No result from W06-I may be used to infer W15-J acceptance or unblock W16.

## 12. Acceptance target

The W06-I candidate must prove at minimum:

1. model/agent proposals begin as non-authoritative candidates;
2. WORKING memory is transient and bounded;
3. non-working memory cannot skip validation;
4. source-owner commit/evidence is required before validation;
5. explicit supersession is required to replace a canonical projection;
6. conflicts are preserved;
7. replay/idempotency does not duplicate memory;
8. cross-tenant and over-classified proposals fail closed;
9. unsupported raw-audio-like content fails closed;
10. revocation removes a projection from context reads;
11. existing W06 `ContextSourceAdapter` can expose eligible shared memory without widening authority;
12. Quality, Test Build and Security are green on the same exact candidate HEAD before acceptance.
