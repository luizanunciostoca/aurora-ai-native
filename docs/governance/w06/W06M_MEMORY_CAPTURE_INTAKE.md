# W06-M — Governed Memory Capture / Consolidation Intake

Status: `BUILD_CANDIDATE / NON-AUTHORITATIVE_UNTIL_ACCEPTED`  
Canonical base: `a5af41c57ef08179197c7a94646bcd59af8eb5e1`  
Tracks: `#540`

## 1. Objective

W06-M closes the bounded return path from a user/model/agent/system interaction back into Aurora-owned shared memory.

The intake is deliberately weaker than validation or canonicalization. It can only translate a bounded capture envelope into the already-accepted `MemoryWriteProposal` and stage it through an OPEN `MemoryFabricSession`.

The lifecycle remains:

`interaction/result -> governed capture -> TRANSIENT|CANDIDATE -> source-owner validation -> CANONICAL`

A model answer is never truth merely because it was generated, captured or checkpointed.

## 2. Accepted upstream reused

W06-M reuses without replacing:

- W06-I Memory Fabric lifecycle and conflict semantics;
- W03/W06 durable Memory Fabric adapter and CAS ownership;
- W06-K session coordinator;
- W06-L context assembly path;
- existing memory-boundary tenant/classification/source-owner/provenance/retention checks.

No duplicate persistence, lifecycle reducer, ranking engine or authority plane is introduced.

## 3. Capture contract

`captureMemoryObservation()` accepts:

- OPEN governed `MemoryFabricSession`;
- unique/replay-safe capture reference;
- memory key;
- existing `MemoryBoundaryCandidate`;
- producer provenance;
- content envelope + digest;
- caller classification ceiling.

On acceptance it builds an existing `MemoryWriteProposal` and delegates to `session.stage()`.

The result is always non-authoritative:

- `authorizesExecution=false`;
- `retryAuthorized=false`.

## 4. Producer provenance

Allowed cognitive/session producers are USER, MODEL, AGENT and SYSTEM.

MODEL capture additionally requires both `providerReference` and `modelReference`. This is required so an interchangeable cognitive engine remains provenance, not hidden source-of-truth ownership.

`SOURCE_ADAPTER` is rejected on this intake path. Source adapters already have their own W06 acquisition/source boundary and must not be disguised as model/session output.

## 5. Lifecycle semantics

- `WORKING` capture stages only as `TRANSIENT`.
- all other eligible capture boundaries stage only as `CANDIDATE`.
- this API exposes no transition or promotion primitive.
- duplicate capture references/content reuse the accepted Memory Fabric idempotency semantics.
- conflicting candidate material remains explicit under the accepted Memory Fabric conflict model.

Validation, promotion, supersession and revocation continue to require the governed lifecycle path outside W06-M.

## 6. Source-owned boundary protection

`OPERATIONAL` and `EVIDENCE` are rejected by this cognitive capture intake.

Those boundaries represent source-owned truth/evidence and must enter through the appropriate owning source/adapters. A model, agent or generic system capture must not manufacture operational truth or evidence merely by selecting that boundary.

This does not remove those boundaries from the Memory Fabric. It prevents this specific return path from impersonating their source ownership.

## 7. Content safety and boundedness

Capture rejects content before staging when it is:

- non-JSON-shaped or non-finite;
- cyclic or symbol-bearing;
- non-plain structured material;
- deeper than 32 levels;
- larger than 10,000 traversed nodes;
- larger than 131,072 bounded string/key content units;
- carrying forbidden authority, credential or raw-audio key material.

Forbidden normalized keys include authority/credential classes such as `policyToken`, `ownerDecision`, `credential(s)`, `accessToken`, `refreshToken`, `apiKey`, `privateKey`, `password`, `secret`, `rawAudio` and `audioBytes`.

This is an intake guard, not a claim that arbitrary secret detection is solved. The accepted durable adapter remains an independent fail-closed persistence gate.

`TEXT` and `REFERENCE` content must carry a non-empty string payload. `STRUCTURED` content must still pass the bounded JSON-shape inspection.

## 8. Fail-closed behavior

W06-M rejects before staging when:

- session is CLOSED or CONFLICTED;
- capture tenant does not equal session tenant;
- capture reference/memory key/producer/content is malformed;
- MODEL provenance is incomplete;
- producer is SOURCE_ADAPTER;
- target boundary is OPERATIONAL or EVIDENCE;
- payload is unsafe, forbidden or exceeds bounds.

If the existing Memory Fabric stage rejects the proposal, W06-M returns `STAGE_REJECTED` plus the exact existing stage rejection reasons. It does not reinterpret or suppress them.

## 9. Authority and ownership invariants

W06-M preserves:

`CONTEXT != AUTHORITY`

`MEMORY != AUTHORITY`

`MODEL OUTPUT != SOURCE TRUTH`

`CHECKPOINT != VALIDATION`

`INTELLIGENCE != AUTHORITY != EXECUTION`

It does not issue PolicyToken/OwnerDecision, validate current execution authority, authorize retry, perform a provider call or execute an external side effect.

## 10. DP5 / release independence

W06-M is backend/context-memory work and does not depend on physical DP5 execution.

Its acceptance must not be used to infer:

- W15-J physical DP5 acceptance;
- Android/device readiness;
- W16 BUILD release authority.

## 11. Acceptance target

W06-M is software-acceptable only when the same exact candidate HEAD proves:

- Quality PASS;
- Test Build PASS;
- Security PASS;
- model capture becomes CANDIDATE with explicit provider/model provenance;
- WORKING capture becomes TRANSIENT only;
- duplicate capture remains idempotent;
- candidate capture remains hidden from ordinary context;
- authority/credential/raw-audio material is rejected before staging;
- unsafe/oversized content is rejected before staging;
- OPERATIONAL/EVIDENCE capture is rejected on this intake;
- cross-tenant/CLOSED/CONFLICTED session capture fails closed;
- stage rejection evidence is preserved;
- no authority widening occurs.
