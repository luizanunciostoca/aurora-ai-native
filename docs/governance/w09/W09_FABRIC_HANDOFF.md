# W09 — n8n Fabric Handoff

Status: `W09-F ACCEPTANCE CANDIDATE`
Task: `W09-F`
Issue: `#266`

This handoff becomes accepted canonical evidence only after its containing candidate is merged, required post-merge Quality/Test Build/Security succeed on the exact resulting `main`, and live issue `#266` carries `aurora:accepted`. This document never grants execution authority by itself.

## Accepted fabric boundary

W09 provides a governed n8n workflow bridge around Aurora-owned truth. It does not make n8n a policy engine, authority source, provider executor, durable workflow truth, capability registry, or evidence authority.

The accepted ownership split remains:

- W03 owns durable event/workflow/idempotency semantics;
- W04 owns capability registry truth;
- current Policy/Authority owners decide permission;
- W07 owns governed external execution, retry eligibility, receipts, uncertainty and reconciliation;
- W08 owns provider bindings, provider transport/readback and provider-side observation;
- W09 owns n8n workflow binding, trigger bridging, credential-reference boundary, safe evidence forwarding and curated migration tooling.

## Published W09 surfaces

### W09-A — workflow binding registry

Provides immutable/versioned `N8nWorkflowBinding` registration with tenant, workflow version/hash, W04 capability projection, provenance, credential-reference requirements and lifecycle state. Stale, superseded, disabled, revoked, cross-tenant or incompatible bindings fail closed.

### W09-B — event/webhook/schedule bridge

Normalizes authenticated trigger observations into governed execution requests. Replay uses deterministic idempotency, ordered streams reject stale/reordered sequence, and every side-effecting request retains:

- `executionBoundary = W07_EXECUTOR_REQUIRED`;
- `requiresW07Execution = true`;
- `directSideEffect = false`;
- `authorizesExecution = false`;
- `canGrantPermission = false`.

### W09-C — credential reference boundary

Consumes opaque credential references through the existing credential owner. Plaintext credential material exists only inside the transient callback and is never returned in W09 results/evidence. Wrong tenant/workflow/provider/integration, stale/revoked/rotated/expired references and backend protocol ambiguity fail closed. Credential possession is only a precondition and never permission.

### W09-D — evidence forwarding

Forwards workflow status and W07 receipt/readback references into one correlation chain while preserving binding version/hash/provenance. Workflow completion or provider acknowledgement never manufactures verified external state. `EXECUTION_UNCERTAIN` and cancellation remain explicit; W09 never grants retry eligibility.

### W09-E — curated migration

The sanitized 1,937-pattern corpus remains reference material only. Safe patterns are semantically re-specified against current W03/W04/W07/W08 contracts. Raw bulk import is prohibited. Shell, SSH and Execute Command examples remain `HIGH_RISK_INDEX_ONLY`; direct provider writes and domain decisions remain reference-only owner patterns. Verbatim reuse requires accepted provenance/license evidence.

## W09-F integration evidence

The W09-F acceptance harness composes the already-owned W09-A through W09-E surfaces and proves:

- immutable binding/version drift and exact-current resolution;
- duplicate webhook/event replay does not create a second governed request;
- stale/reordered sequence and idempotency conflicts fail closed;
- a bounded batch of 128 unique triggers plus 128 exact replays preserves one-request-per-idempotency semantics and zero direct side effects;
- credential-owner outage returns sanitized `CREDENTIAL_UNAVAILABLE` without secret leakage or authority;
- cancellation remains terminal when a late W07 acknowledgement arrives;
- `EXECUTION_UNCERTAIN` remains explicit after later W07 readback and does not create retry authority;
- migrated side effects retain one provider mutation attempt maximum and `W07_RECONCILE_BEFORE_RETRY`;
- shell/SSH/Execute Command patterns remain inactive/index-only;
- direct provider-write patterns remain reference-only and cannot bypass W07/W08.

## Performance and fan-out boundary

The W09-F harness uses a deterministic 128-trigger acceptance batch with one exact replay per trigger. This is a correctness/replay budget, not a production throughput claim. W09 does not introduce an unbounded retry loop, fan-out scheduler or provider concurrency controller. Runtime scale limits remain owned by the underlying W03/W07/provider contracts and deployment configuration.

## Failure and recovery boundary

W09 fails closed on stale binding, replay conflict, ordering conflict, credential ambiguity, malformed provenance and unsupported migration patterns. After an ambiguous external mutation, W09 preserves W07-owned uncertainty/readback state and does not rerun the workflow or provider mutation blindly. Crash/restart recovery must resume from durable Aurora state and accepted binding/version rather than n8n local run history alone.

## Security boundary

No production credential, private provider payload or raw corpus secret is published by this handoff. The high-risk local execution corpus remains inactive. Webhook authenticity and credential availability are transport/integration facts, not business authority.

## Downstream use

W10–W13 domain workflows may consume accepted W09 fabric primitives only through their own domain, consent, policy, financial and provider gates. W09 acceptance does not imply those domain waves are complete or authorize any external action.

## Final publication gate

Canonical acceptance requires all of the following on one exact final candidate HEAD and resulting merge SHA:

1. dependency acceptance revalidated live;
2. exact scope/cleanup audit with no diagnostics;
3. deterministic positive/negative/replay/load-bound tests;
4. Risk Gates A-D recorded;
5. Quality, Test Build and Security `SUCCESS` on the same exact candidate HEAD;
6. immediate live-main race-check and expected-head guarded merge;
7. Quality, Test Build and Security `SUCCESS` on the exact resulting `main`;
8. issue `#266` converged to `aurora:accepted`.
