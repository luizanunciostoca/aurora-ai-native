# ADR-003 — Experience Layer & UX/UI Runtime Semantics

Status: `PROPOSED_FOR_PLANNING`
Date: 2026-09-01
Base main at proposal: `c0860ac178bc8b34e1f5a34f3d2b9c6c5a138168`
Owner: Program Architecture / W14-W17 cross-wave planning

## Context

The accepted Developer Manual v0.5 already assigns the required product planes correctly: W14 owns gateway/realtime/session transport, W15 owns Android Presence/Voice/Device runtime, W16 owns Workspace/Web/Desktop view/control surfaces, and W17 owns production observability/evidence/SLO/DR. The UX/UI Master v1.0 makes several cross-wave experience semantics explicit that are not yet named as canonical planning contracts.

The gap is semantic, not a new source of truth. The Experience Layer must translate accepted system state into coherent user-facing interaction state without becoming authority, business logic, orchestration truth, or a second runtime state machine.

## Decision 1 — Experience Layer is a projection/interaction boundary

Adopt a thin Experience Layer spanning W14/W15/W16 with W17 enrichment later.

Canonical direction:

`Canonical system state/events -> Experience projections/session semantics -> Presentation state -> Presence/Workspace/Luminous renderer`

The Experience Layer:
- may aggregate and project accepted state;
- may maintain client/session interaction continuity;
- may choose allowlisted view manifests from accepted data;
- may expose safe normalized activity signals;
- must preserve tenant/correlation/data-classification boundaries;
- must never mint authority, reinterpret policy, execute side effects, or become source of truth.

## Decision 2 — InteractionSession

W14 must define a canonical interaction-session family, distinct from execution/job session truth.

Minimum semantic fields:
- interactionSessionId;
- tenant/actor/client or device reference;
- modality (`VOICE`, `TEXT`, `MULTIMODAL`);
- ordered interaction turns with correlation/causation;
- active objective/task/workspace references when present;
- artifact references;
- pending human-control request references;
- session lifecycle and reconnect/resume semantics;
- privacy/data-classification metadata as required.

A conversation may span many commands/jobs. Job/session status remains owned by W14 runtime and domain truths; InteractionSession only provides conversational continuity and references canonical objects.

## Decision 3 — AuroraExperienceState

W14 defines transport-safe experience-state semantics consumed by W15/W16. W15/W16 render them; they do not infer hidden backend state.

Target semantic states include, as applicable:
- `DORMANT`
- `PRESENT`
- `AWAKEN`
- `LISTENING`
- `UNDERSTANDING`
- `RETRIEVING_CONTEXT`
- `REASONING`
- `COORDINATING`
- `WAITING_FOR_APPROVAL`
- `EXECUTING`
- `VERIFYING`
- `SUCCESS`
- `EXECUTION_UNCERTAIN`
- `DEGRADED`
- `OFFLINE`

Rules:
- these are user-facing projections, not a replacement for Goal/Task/Execution state;
- `EXECUTION_UNCERTAIN` must be sourced from canonical execution/reconciliation state, never invented by UI;
- experience state must expose reason/reference/freshness when relevant;
- private chain-of-thought is never a state payload.

## Decision 4 — DynamicViewManifest

W16 owns a schema-driven, allowlisted Dynamic Workspace manifest.

A manifest may include:
- viewId/viewType/title;
- canonical readModelRef;
- component descriptors from an allowlisted component registry;
- data bindings;
- interaction/request bindings;
- field visibility/data-classification rules;
- freshness/provenance/correlation;
- degraded/unknown/conflict presentation rules.

AI may recommend/select an allowed view type, but may not generate executable React/JavaScript or bypass the component registry. The manifest is presentation metadata, not business state or authority.

## Decision 5 — Experience Read Models / UI BFF

W16 must consume dedicated read-model projections rather than joining cross-domain truth ad hoc in the browser/client.

Planned projections include, where applicable:
- ExecutiveOverviewProjection;
- GoalProgressProjection;
- CapabilityCatalogProjection;
- WorkforceProjection;
- ApprovalProjection;
- EvidenceProjection;
- DeviceProjection;
- ProviderHealthProjection;
- WorkflowProjection.

Every projection must define tenant isolation, freshness, provenance, correlation, unknown/stale/conflict semantics and data-classification/redaction.

## Decision 6 — Human-control / approval request lifecycle

Existing `OwnerDecision` remains authorization evidence and is not replaced. W16 requires a user-facing request lifecycle that references canonical backend policy/authority state.

The UX-facing lifecycle should support states such as `REQUESTED`, `WAITING`, `APPROVED`, `DENIED`, `EXPIRED`, `REVOKED`, `SUPERSEDED`, and `STALE` where canonical backend semantics support them.

Ownership rule:
- W02 remains owner of policy/authority/OwnerDecision semantics;
- W14 exposes authenticated request/response transport;
- W16 renders and submits user decisions through authorized APIs;
- the client never mints `OwnerDecision` or `PolicyToken`.

No new approval primitive may be created if an owning W02/W14 contract can represent the lifecycle through a versioned request/envelope plus canonical decision reference.

## Decision 7 — Aurora Experience Signal / Pulse

Introduce a safe presentation projection for the Luminous System, never raw telemetry.

A bounded `ExperienceSignalSnapshot` may contain normalized values such as:
- interactionActivity;
- contextActivity;
- planningActivity;
- coordinationActivity;
- executionActivity;
- verificationActivity;
- health;
- uncertainty.

Rules:
- no secrets, tenant topology, raw traces, private reasoning or sensitive counts;
- values are presentation signals and never authority or system health truth;
- v1 may derive from W14/W15/W16 interaction/job states;
- W17 may enrich v2 after W17 exists;
- W16/W15 must not depend on W17 for initial Pulse, avoiding a circular dependency.

## Decision 8 — Voice runtime completion

W15-G must treat voice as a full duplex interaction runtime, not only wake-word/STT.

Planning requirements include:
- wake-word or explicit activation;
- VAD/turn detection;
- STT partial/final transcript handling;
- TTS;
- barge-in / interruption;
- audio focus;
- echo/noise handling where platform supports;
- Bluetooth/headset routing as applicable;
- captions/transcript accessibility;
- microphone privacy state;
- timeout/reconnect/error semantics;
- separation of speech confidence from authority.

## Decision 9 — Runtime Design System

W16 owns implementation of the UX/UI design system as code. W15 consumes platform-appropriate shared tokens/semantics where practical.

Required code-level families:
- design tokens;
- semantic status tokens;
- Aurora Core/Field/Pulse/Trace presentation primitives;
- motion primitives;
- Workspace/card/component library;
- accessibility variants;
- chart/data-display components;
- reduced-motion/static fallbacks.

The PDF/Figma specification is design authority, not runtime code.

## Decision 10 — Accessibility and rendering budgets

W15/W16 acceptance must include:
- reduced motion;
- high-contrast/text equivalents;
- screen-reader semantics;
- keyboard/focus navigation where applicable;
- captions and non-audio equivalents;
- no state encoded only by color/glow/motion;
- frame/render latency and memory budgets;
- Android battery/thermal/resource observation;
- graceful rendering profiles (`FULL -> REDUCED -> MINIMAL -> STATIC`) without changing semantic meaning.

## Decision 11 — UX/Product telemetry

W17 should add product-experience measurements where privacy-safe, including wake latency, turn latency, first-response latency, interruption/barge-in handling, reconnect recovery, approval completion, view materialization latency and task-completion funnels.

These are observability signals, not authority or adaptive-promotion decisions.

## Cross-wave ownership

- W14: InteractionSession, experience-state transport, authenticated realtime delivery, progress/cancellation, human-control request transport.
- W15: Presence renderer on Android, full voice runtime, device-local lifecycle/audio/haptics/accessibility/resource degradation.
- W16: DynamicViewManifest, Experience Read Models/UI BFF, Workspace renderer, runtime design system, approval/evidence/control surfaces, desktop/web accessibility.
- W17: production telemetry/evidence enrichment, UX/product measurements, Pulse v2 enrichment.

## Non-negotiable invariants

1. Experience != Authority != Execution.
2. UI state is never source of truth.
3. No client-side `OwnerDecision`/`PolicyToken` issuance.
4. No AI-generated executable UI code in runtime view materialization.
5. No private chain-of-thought, secrets or sensitive topology in Pulse, progress or telemetry UI.
6. Stale/offline UI never authorizes action.
7. `EXECUTION_UNCERTAIN` always preserves reconcile-before-retry semantics.
8. W15/W16 cannot depend on W17 for base functionality; W17 enriches after W16 acceptance.

## Rollout

This ADR is planning-only until governance acceptance. It introduces no runtime, contract, schema, migration or side effect on its own. Owner waves must implement only after their existing dependency gates release them, and must reuse accepted upstream contracts before introducing any new schema.
