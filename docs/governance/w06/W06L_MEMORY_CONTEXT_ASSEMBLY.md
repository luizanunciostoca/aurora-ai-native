# W06-L — Memory Fabric Context Assembly Bridge

Status: `BUILD_CANDIDATE / NON-AUTHORITATIVE_UNTIL_ACCEPTED`

Canonical base: `89463e5c546095601e0fea75b142160e66296845`

## Purpose

W06-L connects the accepted Aurora Memory Fabric session surface to the already-accepted W06 context pipeline:

`ContextQuery -> acquisition -> retrieval/trust/freshness -> MinimalContextPackage`

The bridge lets a conversation or agent runtime consume eligible Aurora-owned shared memory as ordinary bounded context without becoming a memory source owner, lifecycle promotion authority, policy authority or executor.

## Accepted foundation reused

W06-L reuses, rather than reimplements:

- W06-I Memory Fabric lifecycle and read projection semantics;
- W03↔W06 durable Memory Fabric persistence and CAS behavior;
- W06-K governed per-tenant Memory Fabric session coordinator;
- W06-A `ContextQuery` and read-only source adapters;
- W06-B retrieval, trust, freshness, conflict preservation and ranking;
- W06-C `MinimalContextPackage` compilation/minimization.

## Architecture

```text
Open MemoryFabricSession
        |
        | explicit requested memory boundaries
        v
Memory Fabric Context Assembly Bridge
        |
        +--> memory source adapters
        +--> optional caller-provided read-only W06 adapters
        |
        v
acquireContextCandidates
        v
evaluateContextRetrieval
        v
compileMinimalContext
        v
MinimalContextPackage
```

The bridge has no model/provider transport and does not itself call intelligence.

## Session and tenant gates

Assembly is allowed only while the supplied Memory Fabric session is `OPEN`.

The query tenant must equal the session tenant before any memory adapter is materialized. A closed or conflicted session fails closed. The bridge also rechecks session state after asynchronous acquisition so a session that becomes closed/conflicted during the read cannot silently produce a usable result.

## Explicit source selection

Memory boundaries are caller-supplied and must be non-empty, valid and unique. W06-L does not silently widen a query to every memory class.

Each requested memory boundary is materialized through the accepted `MemoryFabricSession.sourceAdapter()` surface. Optional additional adapters may be supplied by the caller, but the normal W06 acquisition rules remain authoritative for selector matching, duplicate adapter detection, source-class matching, tenant isolation, classification limits and provenance.

## Memory visibility

W06-L does not alter lifecycle eligibility.

- `TRANSIENT` working memory may be visible only in the live session when explicitly queried.
- `CANDIDATE` memory remains absent from ordinary context.
- `VALIDATED` and `CANONICAL` memory may flow into acquisition/retrieval when selectors, tenant, classification and policy permit it.
- `SUPERSEDED` and `REVOKED` memory remain excluded by the Memory Fabric source adapter.

No lifecycle promotion API exists in this bridge.

## Retrieval and compilation

Trust, freshness, conflict handling, ranking and minimization remain owned by the existing W06 components. W06-L requires an explicit `ContextRetrievalPolicy` and explicit `MinimalContextCompilerLimits`; it does not invent permissive defaults.

A failed compiler result is returned as a non-authoritative `COMPILE_REJECTED` assembly result with the original acquisition/retrieval evidence and compile reasons preserved for audit.

## Authority invariants

Every W06-L result carries:

`authorizesExecution = false`

The bridge does not mint, validate or widen `PolicyToken`, `OwnerDecision`, execution permission, retry permission, device trust or provider credentials.

Core invariants remain:

`Context != Authority`

`INTELLIGENCE != AUTHORITY != EXECUTION`

A successful `MinimalContextPackage` means only that context passed W06 information-quality and minimization gates. It does not mean an action may execute.

## Conflict semantics

W06 retrieval continues to preserve conflicting facts explicitly. W06-L performs no automatic conflict resolution.

W03 durable CAS conflict at the Memory Fabric session level leaves the session `CONFLICTED`; W06-L refuses to assemble from that stale session. Reopen/reconciliation remains caller-controlled.

## DP5 independence

W06-L is backend/context work and has no physical Android dependency. Its acceptance does not satisfy W15-J/DP5, does not validate device execution and does not release W16 BUILD.

## Acceptance target

W06-L is ready for controlled acceptance only when:

- Quality, Test Build and Security pass on one exact final HEAD;
- validated shared memory reaches `MinimalContextPackage` deterministically;
- candidate memory remains hidden from ordinary context;
- additional read-only adapter composition remains bounded by existing W06 rules;
- closed, conflicted and cross-tenant sessions fail closed;
- no authority or retry semantics are introduced;
- temporary diagnostics/finalizers are absent from the final PR surface.
