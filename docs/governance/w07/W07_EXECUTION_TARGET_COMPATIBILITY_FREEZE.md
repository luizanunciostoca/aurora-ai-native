# W07 EXECUTION TARGET COMPATIBILITY FREEZE

Date: 2026-09-01  
Status: `W07_00_COORDINATION_FREEZE_CANDIDATE`  
Base main: `b502bfa7e97291086c09cc85cd71040f96d3b036`

## 1. Problem observed on live main

The accepted W01 contract family is provider-oriented:
- `ActionIntent` has optional `providerBinding` but no first-class generic execution target.
- `Receipt` requires `provider: ReceiptProviderReference`.
- `Evidence` supports generic executor/system sources but includes provider-specific receipt/readback vocabulary.

This is valid historical W01 state but cannot represent DEVICE, WORKFLOW or LOCAL_SERVICE honestly if callers must fabricate provider identity. ADR-002 and the Device/Edge amendment require first-class target kinds.

## 2. Frozen target kinds

W07-A shall define a versioned `ExecutionTargetReference` family supporting exactly these generic target kinds at this stage:
- `PROVIDER`
- `DEVICE`
- `WORKFLOW`
- `LOCAL_SERVICE`

The generic reference identifies the target kind plus opaque governed binding/reference metadata sufficient for later deterministic resolution. It MUST NOT invent DeviceId/DeviceRef, account secrets, provider credentials or adapter-specific transport semantics.

## 3. Identity boundary

- PROVIDER target references may point to provider/account binding references owned by W08-compatible surfaces.
- DEVICE target references must remain opaque/generic until W14 defines canonical DeviceId/DeviceRef and session/trust semantics.
- WORKFLOW target references must not make n8n a source of truth; W09 owns workflow binding/runtime.
- LOCAL_SERVICE target references identify an allowlisted governed local service binding, never arbitrary shell/child-process authority.

Target identity/availability is a precondition, never authority.

## 4. ActionIntent migration rule

W07-A may add a target-neutral execution-target reference to the canonical ActionIntent family using compatibility-safe versioning/additive evolution.

Existing provider-oriented `providerBinding` remains a legacy/provider compatibility field during the migration window. Rules:
1. new target-neutral consumers prefer `executionTarget`/the accepted equivalent;
2. PROVIDER intents may map legacy `providerBinding` to the target-neutral PROVIDER form through a deterministic compatibility adapter;
3. non-provider targets MUST NOT populate fake `providerBinding` values;
4. conflicting legacy provider and target-neutral fields fail closed;
5. existing accepted provider fixtures remain supported until a separate deprecation/removal barrier explicitly retires them.

The final exact property names/schema versions are W07-A implementation details, but the semantics above are frozen.

## 5. Receipt migration rule

The current Receipt requires a provider reference, so non-provider execution cannot use it unchanged without lying.

W07-A must evolve the **same canonical Receipt family** through explicit versioned compatibility semantics so that:
- the execution target is represented generically;
- provider metadata is present only when the resolved target is PROVIDER;
- DEVICE/WORKFLOW/LOCAL_SERVICE receipts never require fake provider/account identifiers;
- old provider receipts remain parseable during the migration window;
- old consumer behavior is covered by compatibility fixtures/adapters;
- new consumers cannot infer verified external state merely from receipt acknowledgement.

A second unrelated Receipt source of truth is prohibited. A versioned successor/variant inside the canonical Receipt family is permitted if required by TypeScript/schema compatibility and is accompanied by migration tests and explicit deprecation metadata.

## 6. Evidence/readback migration rule

W07-A/E must make evidence/readback target-neutral without erasing valid provider provenance:
- add/accept generic target readback semantics;
- retain historical provider-specific evidence types for existing records during migration;
- target-specific metadata is optional and kind-scoped;
- evidence always records safe target reference, correlation, timestamps and observed result/uncertainty sufficient for reconstruction;
- no credential/secret material enters Evidence;
- readback mismatch is explicit and cannot be translated to success silently.

## 7. Versioning and compatibility tests

W07-A acceptance requires fixtures proving:
- existing W01 provider ActionIntent parses/behaves as before;
- existing provider Receipt/Evidence records remain parseable;
- equivalent provider execution can be represented in the new target-neutral form;
- DEVICE/WORKFLOW/LOCAL_SERVICE examples contain no fake provider identity;
- mixed/conflicting legacy/new target references fail closed;
- schema/type parity remains intact for every supported version;
- public package/barrel changes are reconciled by Program Control.

## 8. Publication rule

Execution-target-neutral contracts are not public/consumable merely because a branch defines them. W07-A must be independently accepted, exact-head gated, merged and published before W08/W09/W14/W15 may depend on them.

## 9. Non-goals

This freeze does not implement target resolution, provider adapters, device registration/session/trust, Android runtime, n8n runtime, local shell execution, credential storage or external side effects.

Architecture kill condition: any design that requires a non-provider target to masquerade as a provider, creates a second ActionIntent/Receipt/Evidence truth, embeds target availability as authority or forces W14/W15 identifiers/runtime into W07-A.