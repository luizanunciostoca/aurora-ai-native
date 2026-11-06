# W16 Cortex — PREBUILD Architecture

Status: **PREBUILD / NON-AUTHORITATIVE / BLOCKED FROM W16 BUILD BY W15-J / DP5**

This document describes software preparation only. It does not accept W15-J, does not create physical evidence, and does not declare Cortex operational.

## Architectural boundary

The prebuild is deliberately implemented as a headless package under `packages/cortex`. `apps/aurora-desktop` remains without an active Cortex application while the formal W15-J gate is open.

Layering:

1. **Contracts and schemas** — bounded projection contracts, runtime snapshot validation, non-authority invariants.
2. **Design system primitives** — interface tokens, adaptive breakpoints, touch target and motion/reduced-motion values.
3. **Headless component models** — global navigation, Inspector, Timeline, Command Palette, global search, Semantic Zoom and common state surfaces.
4. **Accessibility** — landmarks, roving focus semantics, live-region policy and text sanitation.
5. **UI observability** — allowlisted UI events with no arbitrary payload channel and no execution authority.
6. **Read-only data adapter** — mock adapter for deterministic prebuild demonstrations.
7. **Runtime boundary** — a fail-closed adapter placeholder that refuses runtime access until the dependency gate is explicitly released.
8. **Application/rendering shell** — intentionally deferred until W15-J / DP5 formally permits W16 BUILD.

## Information architecture

The global route vocabulary is intentionally small and stable:

- `OVERVIEW` — system/work overview and semantic canvas entry point;
- `TIMELINE` — chronological, correlated activity projection;
- `SEARCH` — global read-only discovery;
- `SYSTEM` — health/gate/runtime information.

Inspector is contextual rather than a top-level route. Command Palette is an overlay surface. Semantic Zoom is a representation mode, not a new source of truth.

## Semantic Zoom

The prebuild defines three deterministic representation levels:

- `OVERVIEW` for scale below 0.85;
- `CONTEXT` from 0.85 to below 1.40;
- `DETAIL` at 1.40 and above.

Zoom changes presentation density only. They never change authority, data truth or execution semantics.

## State model

Every primary data surface can represent `LOADING`, `READY`, `EMPTY`, `DEGRADED`, `OFFLINE` and `ERROR`. Stale-data awareness is preserved explicitly so an offline/degraded UI cannot silently look current.

Error-boundary projections expose a bounded diagnostic kind and stable localization key, not raw exception messages. This prevents accidental secret or sensitive payload leakage through the UI layer.

## Command Palette boundary

Prebuild commands are restricted to `NAVIGATE` or `PREVIEW_ONLY`. Every command carries `authorizesExecution=false`. There is deliberately no executor method on `CortexDataAdapter`.

Any future action command must enter through the accepted Aurora authority/execution path after the dependency gate; the Cortex UI may request an action but cannot mint W07 authority or infer execution success.

## Accessibility and input

The prebuild establishes:

- `navigation`, `main` and `complementary` landmark contracts;
- roving focus behavior for vertical/horizontal composite widgets;
- Home/End and arrow-key behavior;
- assertive announcements for offline/error and polite announcements for loading/degraded/empty;
- 48 px minimum tablet touch target token;
- reduced-motion duration token;
- localization keys rather than hard-coded user-facing component strings.

Screen-reader and keyboard behavior must still be verified in the eventual rendered application.

## Adaptive layout

- `<720 px`: `COMPACT`;
- `720–1119 px`: `MEDIUM`;
- `>=1120 px`: `EXPANDED`.

The model is tablet-first but supports split-screen/compact and larger desktop surfaces. The active renderer must consume the same token contract rather than introducing private breakpoints.

## Observability

UI telemetry is allowlisted to route, Inspector, search, Command Palette, Semantic Zoom, data-state and error-boundary events. The observation schema accepts only bounded identity fields; it has no arbitrary payload bag and explicitly carries:

- `authorizesExecution=false`;
- `provesExecutionSuccess=false`;
- `retryAuthorized=false`.

## Runtime adapter handoff

`MockCortexDataAdapter` is the only usable prebuild data source. `BlockedRuntimeCortexAdapter` fails closed with `CORTEX_RUNTIME_ADAPTER_BLOCKED_BY_W15J_DP5`.

After formal W15-J acceptance, the runtime adapter must consume accepted read-only projections from existing owners. It must not query the Device Plane directly for authority, fabricate receipts, or reinterpret physical acceptance.

## Post-DP5 build sequence

1. Revalidate `main` and formal W15-J / DP5 acceptance evidence.
2. Rebase the Cortex prebuild branch and rerun exact-head Quality, Test Build and Security.
3. Create the active `apps/aurora-desktop` Cortex shell using the prebuilt contracts/tokens/models.
4. Implement the real read-only projection adapter against accepted runtime APIs; keep authority/execution ownership outside Cortex.
5. Add the rendering layer and visual Story/demo catalog for all states, routes and adaptive layouts.
6. Run component, navigation, keyboard, screen-reader and responsive tests against the rendered shell.
7. Add integration/E2E tests for reconnect, stale data, offline/degraded recovery and runtime projection freshness.
8. Complete W16 acceptance evidence only after all formal dependencies and W16 criteria pass.
