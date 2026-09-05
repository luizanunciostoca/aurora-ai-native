# W16-00 Workspace Coordination & Surface Freeze — Readiness Artifact

Status: `PREBUILD_READINESS_ONLY`
Base main: `d84ca8c83a24d89aafe7fe4efbb12f0302587f18`
Dependency state at preparation: `W14-H accepted`; `W15-J NOT accepted / DP5 closed`
Issue: `#116`

> This artifact is deliberately non-authoritative. It exercises W16-00's `GOVERNANCE_ARTIFACT` prebuild allowance only. It does not satisfy W16-00, does not authorize W16-A BUILD, and must not be merged to `main` before W15-J is genuinely accepted and W16-00 reconciliation is rerun against live canonical inputs.

## 1. Invariants

1. `INTELLIGENCE != AUTHORITY != EXECUTION`.
2. Workspace state is a projection of canonical backend/read-model state, never a second source of truth.
3. UI clicks, gestures, voice input, local session state, device trust, biometric success, ACKs and cached screens never mint `OwnerDecision`, `PolicyToken`, execution authority, verified outcome or retry eligibility.
4. Human-control actions create bounded requests through owning backend contracts; the UI never mutates executor/policy state directly.
5. `EXECUTION_UNCERTAIN` is rendered explicitly and remains reconcile-before-retry.
6. Unknown, stale, conflicting, revoked and unavailable state must be first-class visible states; absence is never inferred as approval/success.
7. No private chain-of-thought, hidden reasoning trace, secrets, raw credentials or cross-tenant topology enters client-facing projections.

## 2. Live dependency reconciliation required before promotion

W16-00 BUILD/final freeze remains blocked until all graph dependencies are accepted. At promotion time revalidate:

- exact live `main` SHA;
- W14-H accepted interaction/progress/control contracts and any post-acceptance remediation;
- W15-J accepted Android/device-plane integration, DP5 physical evidence and final Risk Gates;
- current W02 authority/request semantics;
- W03 idempotency/replay semantics;
- W04 capability registry/read projection semantics;
- W07 execution/outcome/reconciliation semantics;
- W14 gateway/session/progress/cancellation semantics;
- W15 device/presence semantics;
- tenant/data-classification/redaction contracts;
- any accepted schema that already satisfies a proposed W16 need.

If an accepted primitive already exists, W16 adapts to it instead of creating a duplicate contract.

## 3. Proposed surface families

The workspace should expose schema-driven projections for:

- Executive overview: objectives, outcome/progress references, major blockers and freshness.
- Goals/tasks/DAG/lanes: bounded progress, dependency and cancellation-request state.
- Capabilities: W04 capability identity, target/risk/availability and provenance summaries.
- Workforce: agent/task/lease/evaluation summaries without hidden reasoning.
- Approvals/human control: request state, current canonical decision reference, expiry/revocation and evidence correlation.
- Evidence/receipts: canonical references, status, provenance, reconciliation state and freshness.
- Devices: W14/W15 device/session/presence/capability summaries; device trust/presence is never authority.
- Providers/workflows: target availability, governed route/status summaries and failure/degraded state.
- Budget/latency/cost: bounded observability/intelligence summaries only.

No surface may own a backend state machine.

## 4. Dynamic view strategy — readiness proposal

Do not create a public `DynamicViewManifest` contract in PREBUILD. The final W16-00 freeze should either bind to an existing accepted equivalent or publish one owner-wave contract with these minimum semantics:

- immutable manifest/version identity;
- tenant/data-classification scope;
- view kind and schema version;
- ordered allowlisted component descriptors;
- typed read-model bindings by canonical reference, never arbitrary code/expression execution;
- explicit freshness/provenance/conflict metadata binding;
- capability/feature requirements for rendering only;
- accessibility and responsive hints;
- redaction policy reference;
- unknown-component behavior = reject/fail closed;
- unknown-binding/schema-incompatible behavior = degraded/unsupported state, never guessed data;
- no authority token, executor instruction or client-authored backend truth field.

Runtime view manifests must select presentation; they must not select or bypass policy/execution authority.

## 5. Allowlisted component registry

Proposed registry families:

- text/heading/metric;
- status badge and freshness/provenance indicator;
- progress/DAG/lane visualization;
- table/list/card/detail panels;
- evidence/receipt timeline;
- approval/human-control request panel;
- capability/provider/device status panels;
- budget/latency/cost summary;
- chart primitives that consume bounded aggregate read models;
- degraded/offline/conflict/unknown callouts.

Registry rules:

1. component identity/version is allowlisted at build/runtime policy boundary;
2. manifest cannot reference arbitrary executable modules, URLs, scripts or reflection targets;
3. every component declares accepted input schema versions;
4. tenant/data classification is checked before binding data to a component;
5. rendering failure cannot mutate backend state;
6. unsupported components fail visibly and locally.

## 6. Experience Read Model / UI BFF boundary

The W16 client consumes a purpose-built read/projection boundary rather than joining canonical stores client-side.

The read boundary may:

- aggregate canonical references for presentation;
- normalize freshness/provenance/conflict metadata;
- redact fields by tenant/actor/classification policy;
- provide stable pagination/filter/sort cursors;
- expose presentation-safe summaries of route/cache/template/cost signals;
- expose request endpoints that forward human-control/cancel actions to owning backend contracts.

The read boundary must not:

- mint authority;
- reinterpret stale approval as current;
- convert ACK into success;
- decide retry eligibility;
- duplicate W03/W07/W14 state machines;
- expose private chain-of-thought or secrets;
- synthesize missing canonical truth.

## 7. Presentation state contract

Every materially actionable projection should be able to express:

- `CURRENT` — source observation is current for its contract;
- `STALE` — known but outside freshness window;
- `UNKNOWN` — no trustworthy current observation;
- `CONFLICT` — multiple canonical/evidence inputs disagree and require reconciliation;
- `REVOKED`/`EXPIRED` where the owner contract exposes those states;
- `UNAVAILABLE`/`DEGRADED` for bounded service/read failures.

UI presentation must show source reference/provenance and observation/freshness timestamps where operationally relevant. A cached `CURRENT` screen becomes stale when its source freshness boundary expires even if the client remains online.

## 8. Human-control / approval lifecycle

The workspace action model is request-oriented:

`USER INTENT -> HUMAN_CONTROL_REQUEST -> BACKEND AUTHORITY/POLICY OWNER -> CANONICAL DECISION/STATE -> READ PROJECTION -> UI`

Rules:

- UI may create a request with idempotency/correlation identity when the accepted backend contract allows it.
- Pending UI state is never approval.
- Successful HTTP/gateway ACK is never approval or execution success.
- Decision expiry/revocation invalidates the projection immediately when observed.
- Reconnect must reconcile request identity before allowing duplicate submission.
- Late completion after cancellation is displayed as a race/result from the owner; UI does not rewrite it.
- `EXECUTION_UNCERTAIN` disables blind retry and routes the operator to reconciliation evidence.

## 9. Command/control action matrix

| UI action | Client may do | Must delegate to | Client must never claim |
| --- | --- | --- | --- |
| Request approval/decision | create bounded request | W02/accepted human-control adapter | approval granted |
| Cancel task/job | create idempotent cancel request | W14/runtime owner | executor stopped until canonical confirmation |
| Retry/re-run | request evaluation | W07/W03 reconciliation/authority path | retry eligible |
| Device action | request candidate/action | W07 + W14/W15 owners | device presence/trust authorizes action |
| Refresh/reconnect | request fresh read state | read/BFF + canonical sources | cached state still current |
| Change view/filter | mutate local presentation | client only | backend truth changed |

## 10. ExperienceSignal / Pulse readiness

W16 may consume or project presentation-safe experience signals only after ownership is reconciled with W14/W17. Allowed examples are bounded states such as activity, degraded mode, progress category, latency bucket and UI rendering profile.

Prohibited payloads:

- private chain-of-thought/reasoning traces;
- prompts containing secrets;
- raw credentials/tokens;
- sensitive cross-tenant counts/topology;
- unredacted restricted/secret fields;
- synthetic confidence presented as permission/approval.

W17 telemetry may later enrich metrics; W16 must remain functional without a dependency reversal on W17.

## 11. Responsive / accessibility readiness

Final W16-00 freeze should require:

- tablet, desktop and responsive web layouts from one semantic state model;
- keyboard-complete navigation for desktop/web critical flows;
- screen-reader semantics for status, freshness, approval and error states;
- reduced-motion mode preserving semantic equivalence;
- high-contrast/color-independent state communication;
- non-audio equivalents for voice/status cues;
- focus restoration after dynamic view updates/reconnect;
- no critical state communicated only by animation/color.

## 12. Offline and degraded principles

- Offline mode is read/cache first; cached data is visibly stale with its last observation time.
- Only backend-contract-authorized safe UI requests may be queued.
- Queued request != accepted request != authorized action != executed result.
- Reconnect deduplicates by request identity and reconciles canonical state before resubmission.
- No offline local approval, authority or blind device/action replay.

## 13. Risk premortem

### A. Stale approval illusion

Failure: UI shows an earlier approval after expiry/revocation and enables an unsafe action.
Control: freshness/expiry is part of projection semantics; action endpoint revalidates current backend authority regardless of screen state.

### B. UI becomes shadow state machine

Failure: client derives execution/job truth from local events and diverges after reconnect.
Control: schema-driven read models + explicit unknown/conflict/reconciliation states; no client-owned execution transitions.

### C. Tenant leakage

Failure: dynamic binding or cache key exposes another tenant's data.
Control: tenant/classification scope at read boundary and client cache namespace; negative cross-tenant tests.

### D. Private reasoning exposure

Failure: operational summary accidentally includes chain-of-thought/prompt internals.
Control: allowlisted projection schemas/redaction and tests for forbidden fields/content classes.

### E. ACK interpreted as outcome

Failure: UI labels request/transport ACK as completed side effect.
Control: request, authority, execution and receipt states are distinct types/presentation states.

### F. Duplicate control request after reconnect

Failure: user action replays and causes duplicate side effects.
Control: idempotent request identity; reconnect reconciliation; backend execution remains W03/W07-owned.

### G. Dynamic manifest injection

Failure: manifest selects arbitrary executable client code or unsafe binding.
Control: allowlisted component registry; typed bindings; unknown component = reject.

## 14. Required W16-00 promotion evidence

After W15-J acceptance and live reconciliation, final W16-00 should publish:

- exact accepted dependency SHAs/references;
- final owner/equivalent decision for dynamic-view manifest and read-model/BFF contracts;
- changed-path ownership/fence;
- action/request boundary matrix;
- tenant/classification/redaction rules;
- stale/unknown/conflict semantics;
- responsive/accessibility requirements;
- Risk Gates A-D / premortem disposition;
- downstream contract handoff for W16-A/B/C/D/E/F/G.

Until that reconciliation is complete:

`W16-00 = READINESS PREPARED / BUILD BLOCKED BY W15-J`
