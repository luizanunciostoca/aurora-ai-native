# UX/UI Experience Layer — Cross-Wave Dependency & Ownership Matrix

Status: `PROPOSED_FOR_PLANNING`
Date: 2026-09-01
Base main: `c0860ac178bc8b34e1f5a34f3d2b9c6c5a138168`
Companion: `docs/architecture/ADR-003_EXPERIENCE_LAYER_UX_UI_RUNTIME.md`

## Purpose

Define where the UX/UI Master v1.0 requirements belong without creating a new authority plane, duplicate state machine or premature runtime implementation.

## Ownership matrix

| Requirement | Primary owner | Upstream dependencies | Consumers | Hard boundary |
|---|---|---|---|---|
| InteractionSession | W14 | W01 IDs/correlation, W03 durability as needed | W15, W16 | Conversation continuity only; not Goal/Task/Execution truth |
| AuroraExperienceState | W14 | W04/W05/W07/W14 canonical status/evidence | W15, W16 | Projection only; no hidden-state inference |
| Presence renderer | W15 | W14 experience/session state | Android user | Visual/audio/haptic presentation only |
| Full voice runtime | W15-G | W14 session transport, W15 lifecycle/permissions | InteractionSession | Voice confidence never authority |
| DynamicViewManifest | W16 | accepted read models/schema families | W16 renderer | Allowlisted components only; no runtime-generated code |
| Experience Read Models / UI BFF | W16 | W02-W15 read/event surfaces | W16 views | No duplicate domain truth/state machines |
| Human-control request surface | W16 with W14 transport | W02 policy/authority/OwnerDecision semantics | W16/W15 clients | Client never mints authority evidence |
| Runtime design system | W16 | UX/UI Master design spec | W15/W16 | Presentation code only |
| Aurora Pulse / ExperienceSignal v1 | W14/W16 | interaction/job/projection states | W15/W16 luminous renderer | Safe normalized signals only |
| Aurora Pulse v2 enrichment | W17 | W17 telemetry after W16 | W15/W16 | W15/W16 base functionality cannot depend on W17 |
| UX/product telemetry | W17 | W14-W16 runtime | W18 analytics/evals where allowed | Observation only; no authority/promotion |
| Accessibility semantics | W15/W16 | experience state + design system | all clients | State never encoded only by motion/color |
| Rendering/battery/thermal profiles | W15/W16 | platform telemetry | clients | Degrade visuals, never semantic meaning |

## Dependency corrections

The existing major wave DAG remains unchanged. These requirements refine internal acceptance, not top-level release order.

### W14 delta

W14 must freeze, before W14-A/B/C implementation where applicable:
- InteractionSession identity/lifecycle;
- conversation turn and artifact reference semantics;
- safe experience-state projection vocabulary;
- safe progress/reason/reference payloads;
- authenticated user-decision request transport;
- ExperienceSignal v1 transport shape if W14 is selected as producer.

No W14 surface may become policy/authority or execute device capabilities.

### W15 delta

W15-A/G/J acceptance adds:
- Presence visual-state mapping from canonical experience state;
- full voice loop with interruption/barge-in;
- microphone/privacy state;
- captions/text alternative;
- reduced-motion/non-audio alternatives;
- rendering profiles and tablet battery/thermal/resource measurements.

W15-H retains existing offline/reconnect/idempotency rules. Interaction continuity may resume offline only within allowed data and request semantics; executable authority is never cached by UI convenience.

### W16 delta

W16-00 must freeze:
- DynamicViewManifest contract strategy;
- allowlisted component registry;
- Experience Read Model/UI BFF ownership;
- interaction request vs read-only view boundaries;
- runtime design-system package boundaries;
- explicit presentation of freshness/provenance/unknown/stale/conflict;
- ApprovalProjection/HumanControlRequest lifecycle mapping;
- Aurora Pulse/Luminous mapping inputs and redaction.

W16-B becomes the principal owner of projection adapters. W16-D owns human-control presentation/request APIs. W16-E owns strategy/observability summaries. W16-F owns desktop/web accessibility and degraded rendering. W16-G proves end-to-end semantics.

### W17 delta

W17-A/C/E/F add privacy-safe UX telemetry dimensions:
- wake-to-listen latency;
- listen-to-understand/first-response latency;
- Workspace materialization latency;
- reconnect recovery time;
- cancellation acknowledgement latency;
- approval request-to-decision duration;
- interruption/barge-in success/failure;
- task completion and abandonment markers where appropriate.

W17 may enrich ExperienceSignal/Pulse after W16 exists, but cannot become a prerequisite for W15/W16 base UX.

## Acceptance matrix additions

### Correctness
- identical canonical state + identical experience projection version yields equivalent semantic UI state;
- reconnect/replay does not duplicate user-control commands;
- stale/conflicting projections are represented explicitly;
- DynamicViewManifest rejects unknown component types/data bindings.

### Safety / Authority
- no Experience contract mints/widens/validates authority;
- no offline/stale view enables unauthorized action;
- no tenant/classification leakage through projections, Pulse or UI telemetry;
- no private reasoning or secrets in experience payloads.

### Performance / Economics
- bounded view payload size and component count;
- bounded realtime update frequency/backpressure;
- UI frame/render budgets defined per platform;
- voice wake/turn latency budgets defined;
- Android battery/thermal/resource budgets measured.

### Failure / Recoverability
- reconnect restores interaction continuity without inventing completed work;
- `EXECUTION_UNCERTAIN` persists across reconnect until reconciled;
- voice/STT/TTS failure degrades to text or explicit error where possible;
- renderer failure cannot mutate backend truth;
- corrupted/unsupported manifest fails closed to a safe fallback view.

## Publication gates

These planning additions do not release W14/W15/W16/W17. Before each owner wave starts implementation, its coordination freeze must consume the accepted version of ADR-003 and this matrix. Any new public contract introduced by an owner wave requires versioning, schema tests, exact-head CI, Risk Gates and downstream consumer compatibility evidence.
