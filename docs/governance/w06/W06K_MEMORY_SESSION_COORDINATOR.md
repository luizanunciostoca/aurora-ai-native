# W06-K — Governed Memory Fabric Session Coordinator

Status: `BUILD_CANDIDATE / NON-AUTHORITATIVE_UNTIL_ACCEPTED`

Tracking issue: `#535`

Initial base: `e0bebff8a32bf1c309f44c8c10ff54989c26a08f`

## Purpose

W06-I established Aurora Memory Fabric. The W03↔W06 durability integration then made durable Memory Fabric state restart-safe. W06-K provides the bounded session-level coordinator that a conversation or agent runtime can consume without becoming a memory authority.

The coordinator is intentionally narrow: open durable state, expose accepted read-only W06 source adapters, stage memory proposals, checkpoint through the accepted durable repository, surface concurrency conflicts and close the session.

It does not validate/promote candidate memory and does not authorize execution.

## Flow

```text
Conversation / Agent Runtime
          |
          v
openMemoryFabricSession
          |
          +--> W03-backed DurableMemoryFabricRepository.load
          |
          v
  live MemoryFabricSnapshot
     |               |
     |               +--> stage MemoryWriteProposal
     |                       |
     |                       +--> CANDIDATE / TRANSIENT only
     |
     +--> ContextSourceAdapter -> W06 retrieval path -> model/agent context
     |
     +--> checkpoint -> W03 CAS durable repository
                           |
                           +--> APPLIED / UNCHANGED
                           +--> CONFLICT -> session CONFLICTED
```

## Session states

- `OPEN`: reads, proposal staging and explicit checkpointing are allowed.
- `CONFLICTED`: a stale durable CAS was detected. Reads, further staging and checkpointing fail closed because the local snapshot may be stale relative to another writer.
- `CLOSED`: no reads, staging or checkpointing are allowed.

There is deliberately no hidden conflict merge and no automatic retry. A caller must explicitly abandon/reopen or route a conflict through a future governed reconciliation flow.

## Durable revision vs memory revision

The coordinator keeps two independent revisions:

- Memory Fabric revision: W06 projection/session revision.
- durable revision: W03 optimistic-concurrency revision.

Only the W03 durable revision is used for checkpoint CAS. A successful checkpoint records the current memory revision as checkpointed. An unchanged session returns `NO_CHANGES` without touching W03.

## Working memory

`WORKING` / `TRANSIENT` memory remains available through the W06 source adapter during an open session. The already accepted durable repository omits it from persistence, therefore a new session after restart does not recover transient working memory.

Durable candidate memory may survive restart, but ordinary model context still excludes `CANDIDATE` records. Only states already eligible under W06-I read rules, such as `VALIDATED` and `CANONICAL`, can flow through the normal source-adapter path.

## Promotion boundary

The session coordinator exposes no lifecycle-promotion method. A model/user/agent observation staged in the session does not become validated or canonical merely because a runtime emitted it.

Validation/promotion remains a separate source-owner-governed flow using accepted W06 lifecycle semantics. This prevents the conversation runtime from becoming a memory source-of-truth owner.

## Concurrency

Every opened session binds to the durable revision returned by W03. If another writer checkpoints first, a stale session receives `CONFLICT`, transitions to `CONFLICTED`, exposes `retryAuthorized=false` and blocks stale reads/mutations.

The coordinator never performs blind last-write-wins, hidden rebase or auto-retry.

## Authority invariants

Every session status/checkpoint surface remains:

- `authorizesExecution=false`;
- `retryAuthorized=false` where surfaced.

Memory retrieval, model output, checkpoint success, durable possession, confidence and UI state never grant execution authority.

`CONTEXT != AUTHORITY`

`INTELLIGENCE != AUTHORITY != EXECUTION`

## Ownership

W06-K owns only the W06 memory session coordination leaf. It does not own:

- W03 persistence implementation;
- W05 model/agent routing;
- W07 policy/authority/execution;
- provider credentials/transports;
- W14/W15 device session or physical effects;
- W16 workspace authority.

## DP5 / W16 boundary

W06-K is software-only and does not modify the Android candidate, physical device, LOCAL host tuple or W15-J evidence. It neither satisfies DP5 nor releases W16 BUILD.

## Acceptance target

Before merge, prove:

1. empty session open is bounded and non-authoritative;
2. model proposals remain candidates and are hidden from ordinary context;
3. already validated shared memory is available through the accepted W06 source-adapter path;
4. WORKING memory is available live but absent after restart;
5. durable candidate checkpoint/restart reconstruction works;
6. no-change checkpoint avoids a durable write;
7. stale CAS enters `CONFLICTED`, blocks stale reads/mutations and never auto-retries;
8. tenant isolation is preserved;
9. close is explicit and fail-closed;
10. Quality, Test Build and Security pass on the same exact final HEAD.
