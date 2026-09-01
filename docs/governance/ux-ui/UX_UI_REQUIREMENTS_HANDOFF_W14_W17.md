# UX/UI Requirements Handoff — W14 to W17

Status: `ACCEPTED_FOR_PLANNING`
Date: 2026-09-01
Base main: `c0860ac178bc8b34e1f5a34f3d2b9c6c5a138168`
Sources: Developer Manual v0.5, UX/UI Design & Interaction Manual Master v1.0, ADR-003 proposal, cross-wave matrix.

## Objective

Ensure that W14-W17 coordination freezes implement the user experience defined by the UX/UI Master without introducing duplicate business state, authority, hidden reasoning exposure or premature dependencies.

## W14 handoff additions

During W14-00 freeze, resolve and publish planning decisions for:
1. canonical `InteractionSession` family and lifecycle;
2. interaction-turn references to canonical Objective/Task/Artifact/Receipt/Evidence objects;
3. `AuroraExperienceState` projection vocabulary and reason/freshness/reference fields;
4. safe progress/DAG/lane payloads consumed by Presence/Workspace;
5. authenticated human-control request transport mapped to W02 authority semantics;
6. normalized ExperienceSignal v1 shape or a documented decision that W16 derives it from W14 streams;
7. reconnect/resume behavior for conversation continuity distinct from execution truth.

Acceptance proof must show no PolicyToken/OwnerDecision issuance, no executor side effect and no private reasoning payload.

## W15 handoff additions

During W15-00 and W15-A/G/J, include:
1. Presence renderer state mapping from `AuroraExperienceState`;
2. full voice runtime: activation, VAD, STT, turn detection, TTS, barge-in, audio focus, privacy indicator and transcript/caption fallback;
3. reduced-motion/high-contrast/non-audio equivalents;
4. Core/Field/Pulse/Trace renderer profiles with semantic equivalence across FULL/REDUCED/MINIMAL/STATIC;
5. resource acceptance: frame/render latency, memory, battery and thermal observations;
6. explicit voice ambiguity/escalation tests;
7. no voice confidence or local Android permission may grant Aurora authority.

## W16 handoff additions

During W16-00 freeze, resolve and publish:
1. `DynamicViewManifest` strategy;
2. allowlisted component registry and runtime design-system package layout;
3. Experience Read Model/UI BFF boundary;
4. projection families for executive overview, goals, capabilities, workforce, approvals, evidence, devices, providers and workflows;
5. freshness/provenance/unknown/stale/conflict presentation contract;
6. HumanControlRequest/ApprovalProjection lifecycle mapped to canonical OwnerDecision/policy state;
7. ExperienceSignal/Pulse mapping and redaction rules;
8. responsive tablet/desktop/web behavior and accessibility requirements.

W16-G acceptance must demonstrate that the UI explains state and execution without becoming source of truth.

## W17 handoff additions

During W17-00 telemetry freeze, add privacy-safe product-experience metrics:
- wake/listen/first-response latency;
- turn completion and interruption handling;
- Dynamic Workspace materialization latency;
- reconnect recovery;
- approval completion timing;
- cancellation acknowledgement timing;
- task completion/abandonment where meaningful;
- client rendering profile and degraded-mode observations where useful.

W17 may enrich Aurora Pulse v2, but W15/W16 base UX must work without W17 to preserve the existing dependency direction.

## New planning artifacts — owner-wave only

Potential public contract names below are placeholders until the owner wave freezes naming/versioning:
- `InteractionSession` — W14;
- `InteractionTurn` — W14;
- `AuroraExperienceState` — W14;
- `ExperienceSignalSnapshot` — W14/W16 ownership decision;
- `DynamicViewManifest` — W16;
- `ExperienceReadModelRef` — W16;
- `HumanControlRequest` — naming/representation coordinated with W02/W14/W16, without duplicating OwnerDecision.

Do not create these contracts before the owning coordination freeze accepts the exact semantic need and confirms no equivalent canonical primitive already exists.

## Required tests to add later

- conversation resume after reconnect/process death;
- stale interaction state vs newer execution state;
- DynamicViewManifest unknown component/binding rejection;
- cross-tenant projection isolation;
- approval shown stale/revoked while user acts;
- cancellation request races late completion;
- `EXECUTION_UNCERTAIN` survives UI reconnect;
- voice false wake/transcript ambiguity/barge-in;
- reduced-motion/static mode preserves state meaning;
- Pulse payload contains no secret, private reasoning, sensitive count or tenant topology;
- UI BFF failure/degraded behavior never fabricates backend truth.

## Release effect

None. This handoff is planning-only and cannot release W14-W17. Existing top-level dependencies and owner-wave publication barriers remain unchanged.
