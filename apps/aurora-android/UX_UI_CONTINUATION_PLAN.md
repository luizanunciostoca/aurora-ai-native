# Android UX/UI continuation — September 14, 2026

Status: **W15 LOCAL PRESENTATION PREVIEW / NOT PHYSICALLY ACCEPTED**.

## Review baseline and ownership

- Live main baseline reviewed for this preview: `d2089407e88480686b879928cf2863c0dc81718e`.
- Interactive v0.16 candidate #517: `bd9081d1016bdf83af0a0ef0959ae97f59e0dc49`.
- v0.17 development foundation #522: `efbc46e1046d55d6ad693efe79e613485eda7da3`.
- This preview stacks on #522; it does not change #517's packaged APK or the DP5 tuple.
- Scope: existing W15 native Presence/Conversation Views, setup surfaces and their local rendering behavior.
- W16 Workspace, Compose migration and runtime design-system publication remain dependency-gated.

The repository ADR-003, UX/UI handoff and ownership matrix were reviewed alongside the local
September 13 readiness snapshots of the UX/UI Master, implementation blueprint and R0 report.
Those Drive snapshots are design references, not a claim of a fresh Drive revision audit.

References:

- [ADR-003](../../docs/architecture/ADR-003_EXPERIENCE_LAYER_UX_UI_RUNTIME.md)
- [W14–W17 UX/UI handoff](../../docs/governance/ux-ui/UX_UI_REQUIREMENTS_HANDOFF_W14_W17.md)
- [Ownership matrix](../../docs/governance/ux-ui/UX_UI_CROSS_WAVE_DEPENDENCY_OWNERSHIP_MATRIX.md)
- [UX/UI Master](https://drive.google.com/file/d/1_nLd5Y2RrX4BxTWJHzwfrxk9ssP9LCZ6/view)
- [W16 implementation blueprint](https://docs.google.com/document/d/1jRy25eLGABjrp3Wd8vA4aeO-cpzvF2IDBSuyqkyFI08/edit)

## Findings

The interactive candidate already contains the orb, onboarding, manual voice entry, transcript,
response card, permission remediation and developer-only diagnostics. These are candidate code,
not proof of complete product acceptance. Stable development signing is prepared by #522.

The existing orb started an infinite animation whenever attached. It did not gate animation on
window focus, accessibility exploration or power saving. The fixed 270 dp ornament took space
from the primary action in short windows and with large text. The state was represented by both
an accessible orb and live text, and unchanged text was reassigned during status refreshes.
The primary action followed the entire transcript, making long interactions harder to continue.

A second accessibility issue existed in the Home refresh path: `renderStatus()` rebuilt every
action View even when the semantic action set had not changed. During wake-runtime polling this
could replace focused controls every 500 ms. The setup/bootstrap surfaces also relied on the
platform-default button appearance instead of the same dark visual language and visible focus
feedback used by the Home preview.

A third layout issue was the fixed safe-space padding used by every native screen. It was reasonable
on a full tablet window but unnecessarily consumed horizontal room in split-screen and vertical room
in short landscape windows or at 200% font scale. Button and long-copy wrapping also depended on
platform defaults instead of an explicit readable wrapping policy.

The Home also compressed setup progress, microphone, assistant, wake and privacy state into one text
line. That was technically complete but visually dense on tablet and especially weak under large text.
The source states were already available and did not require any new runtime or authority contract.

After separating state and progress, the remaining hierarchy issue was that transcript/response and
secondary configuration buttons were visually adjacent without explicit section landmarks. That made
it harder to distinguish the current conversation from settings when navigating with large text or
accessibility headings.

## Revised delivery sequence

| Increment | Work | Dependency and evidence | Status |
| --- | --- | --- | --- |
| W15-P1 | Local orb motion/resource behavior, primary-action priority, readable text and focus feedback | Existing W15 presentation states; JVM/Android build plus device UX checks | Implemented in this preview; physical checks pending |
| W15-P2 | Preserve keyboard/TalkBack focus across action-list refreshes; review setup and voice-screen navigation | Existing W15 callbacks and lifecycle only; accessibility regression evidence | Implemented in this preview; physical TalkBack/keyboard checks pending |
| W15-P3 | Tablet portrait/landscape, split-screen, 200% font and long-response layout hardening | Pure layout policy + exact-head Android build | Implemented; CI passed on `39803da6…`; physical layout acceptance pending |
| W15-P4 | Separate system-state summary from progress/error copy and adapt its layout | Existing local state only; no new authority/runtime contract | Implemented; CI passed on `94c24383…`; physical layout acceptance pending |
| W15-P5 | Map existing onboarding state to a visual four-step progress summary | Existing `AuroraOnboardingStep` only | Implemented; CI passed on `5149250b…`; physical layout acceptance pending |
| W15-P6 | Add explicit Conversation and Settings hierarchy landmarks without changing actions | Existing shared native surface only | Implemented in preview; exact-head CI pending |
| W16-M0 | Reconcile state vocabulary, path ownership, projection contracts and visual test fixtures | Readiness only; consume accepted owner contracts before integration | Pending reconciliation |
| W16-M1–M3 | Compose foundation, full Presence renderer, conversation continuity and text entry | W15-J acceptance, W16-00 BUILD release, published W14 contracts | Blocked for integrated BUILD |
| W16-M4–M7 | Workspace, Dynamic Views, progress, approval/evidence and operational views | Accepted read models and owner-wave gates | Readiness/specification only |
| W16-M8–M9 | Visual goldens, performance, E2E and acceptance | Exact-head gates plus physical evidence | Future acceptance work |

This preview does not count W15-P1 through W15-P6 as completion of W16 UI IDs or M1/M2. It keeps
Android Views and existing presentation states; no Compose dependency, public schema or duplicate
renderer framework is introduced. The planned conversation-first product direction is retained.

## W15-P1 behavior

- READY and terminal/setup states draw a static orb. Active interaction stages may pulse.
- Detached, hidden or unfocused windows do not animate. Re-entry rechecks the platform settings.
- Android animation disabling, touch exploration and battery saving select static rendering.
- Changes to animation scale, touch exploration and power saving are observed while attached;
  observers and the animator are released on detach.
- Static mode changes decoration only: the supplied stage and readable title/detail stay the same.
- The orb reserves less space with large text or a short window and fits the available width.
- The primary action precedes the transcript; secondary configuration actions remain below it.
- The decorative orb is skipped by TalkBack. The title is a heading on supported Android versions.
- Identical live-region text is not reassigned. Transcript and response text can be selected.
- Buttons retain 54 dp minimum height and expose pressed feedback and a visible keyboard-focus border.
- Diagnostics remain opt-in and use brighter text on the dark surface.

## W15-P2 behavior

- Home actions have stable semantic identities instead of being treated as disposable controls.
- An unchanged wake-runtime/status refresh retains the existing action Views and therefore does not
  deliberately discard keyboard or accessibility focus.
- A real semantic action-set change captures the focused action before rebuilding and restores the
  matching action afterward. The primary role may carry focus to the replacement primary action.
- No focus is forced when no action had keyboard or accessibility focus before the rebuild.
- The orb is explicitly excluded from accessibility traversal so readable textual state remains the
  single accessibility representation of presence.
- Shared native setup/bootstrap helpers use the same dark surface, readable text hierarchy,
  54 dp controls, disabled styling, ripple feedback and visible keyboard-focus border as the Home.
- This changes presentation only: existing click callbacks, permission flow, wake enrollment,
  privacy choice, assistant selection, LOCAL bootstrap, authority and execution remain unchanged.

## W15-P3 behavior

- A pure `AuroraWindowLayoutPolicy` classifies full tablet, split-screen, very narrow, short and
  large-text windows without consulting runtime or authority state.
- Full tablet windows retain comfortable 24 dp horizontal / 20 dp vertical safe-space padding.
- Split-screen and large-text windows reduce decorative horizontal padding to 16 dp; very narrow
  windows use 12 dp. This preserves content width without reducing the user's requested text scale.
- Short landscape and large-text windows reduce decorative vertical padding to 12 dp.
- Wide tablet windows keep content width constrained; compact windows use the available width and
  continue to scroll vertically.
- Native helper buttons and Home actions explicitly allow line wrapping rather than clipping.
- Headings, detail/status copy, transcript, response and diagnostics use Android readable line-break
  and hyphenation strategies where supported.
- WakeVoiceActivity inherits these changes through the shared `AuroraAssistantSurface`; STT, TTS,
  governed dispatch, device execution and wake re-arm logic are unchanged.

## W15-P4 behavior

- Microphone, assistant role, wake-word readiness and privacy state are rendered as separate readable
  status cards instead of being concatenated into one long status line.
- The values come from the same `MainActivity.renderStatus()` booleans used before this change; there
  is no new state source or authority inference.
- Full-width tablet layouts can show status cards inline. Width below 720 dp or font scale at/above
  1.3 stacks the cards vertically so each label/value can wrap without clipping.
- Status cards are non-interactive and expose explicit `label: value` accessibility descriptions.
- Unchanged status-item lists are not rebuilt, avoiding unnecessary accessibility-tree churn during
  the 500 ms wake-runtime refresh loop.

## W15-P5 behavior

- A pure `AuroraOnboardingProgressPolicy` maps only the already-selected onboarding step to display
  progress; it never decides readiness, permission, assistant-role, wake state, authority or DP5.
- Setup steps display `Etapa 1 de 4` through `Etapa 4 de 4` without marking the active step complete.
- `WAKE_RUNTIME` displays `4 de 4 · Validando`; `READY` displays `Concluída`.
- `PRIVACY_BLOCKED` hides the progress summary so the UI does not reveal or infer the setup point
  that existed before the user's privacy choice.
- JVM tests cover sequential setup progress, runtime validation, ready and privacy-blocked behavior.

## W15-P6 behavior

- The primary action remains isolated before conversation history and remains the dominant next step.
- A visible conversation card contains an explicit `CONVERSA` heading before transcript/response.
- Secondary configuration controls are grouped under `AJUSTES` only when at least one secondary
  action exists; the heading disappears with `clearActions()` and is not shown for an empty group.
- Both section labels are Android accessibility headings on supported versions, creating useful
  navigation landmarks without creating new interactive controls.
- Existing action IDs, listeners, focus capture/restore and action order are unchanged.
- W15-P6 changes presentation hierarchy only; voice, execution, permissions, wake state and DP5 are
  not consulted or modified.

## Validation and remaining checks

Verification history:

- P1 rendering-policy tests cover all eight assistant stages and animation/resource constraints.
- P2 action-refresh tests cover initial creation, unchanged polling refresh and semantic rebuilds.
- P3 window-layout tests cover full tablet, split-screen, very narrow, 130%/200% font and short landscape.
- P5 onboarding-progress tests cover the four setup steps, runtime validation, READY and privacy block.
- Exact head `39803da680878ddc8f1ea7f64cb5e1aa72a1cc78` passed Security, Quality, Test Build and Android Foundation.
- Exact head `94c24383ab34ff2b432bbe4b4d1ef42d644b32ac` passed Security, Quality, Test Build and Android Foundation.
- Exact head `5149250bc0924d1ae060d9dd034dc8fa1c47f0f0` passed Security, Quality, Test Build and Android Foundation.
- P6 exact-head CI is required before this increment is considered software-validated.
- These checks are not emulator rendering checks or physical acceptance.

Automated acceptance for this preview:

1. JVM policy tests cover orb behavior, focus-refresh identity, responsive geometry and onboarding progress.
2. Android Foundation must compile the native Views and run local unit tests on the exact PR head.
3. Quality, Test Build and Security must pass on that same head.
4. Scope review must show no change to W02/W03/W07/W14, voice capture, executors, signing or DP5 scripts.

Device checks remain **NOT RUN** until recorded against an exact preview build:

| Scenario | Expected result |
| --- | --- |
| Home/setup at rest | Static orb; current setup action remains available |
| Home status summary | Four readable status cards; progress/feedback remains separate |
| Onboarding progress | Correct 1/4–4/4/validating/complete summary; hidden under privacy block |
| Active voice session | Existing stage text and response behavior remain correct |
| Conversation history | `CONVERSA` landmark precedes selectable transcript/response |
| Secondary actions | `AJUSTES` appears only when secondary controls exist |
| Remove animations enabled, including returning from Settings | No pulse; equivalent visible state text |
| TalkBack toggled while open | No duplicate orb stop; state/status/section headings remain readable |
| Battery saver toggled while open | Pulse stops without changing the interaction state |
| Portrait/landscape, split screen, font scale 1.0/1.3/2.0 | No horizontal overflow; text wraps and the surface scrolls normally |
| Long transcript and response | Primary action comes first; content remains selectable and reachable |
| Wake-runtime polling with focused action | Identical refresh keeps the same control instance and focus |
| Semantic onboarding transition with focused action | Matching stable control regains focus; primary role may move to new primary action |
| Setup/bootstrap keyboard navigation | Visible focus border, wrapped labels and original callbacks remain intact |
| Wake, assistant role, microphone and LOCAL bootstrap | Existing behavior unchanged; no authority inferred from visuals |

No emulator screenshots, physical TalkBack checks, frame timings or battery measurements are
claimed by the policy tests. Focus continuity, responsive geometry, state cards, onboarding progress
and section hierarchy are implemented at the View/policy level but are not physical accessibility or
layout acceptance until verified on the exact preview APK.

## Release and handoff

Keep the PR draft and stacked on #522. This task does not install an APK, replace the current DP5
candidate, start a host, renew consent or execute a physical effect. Any future preview packaging
must record exact source/host/variant/signing identity and hashes; successful software checks do
not grant DP5 or W16 acceptance. No secrets, audio, transcripts or new telemetry are persisted here.

Risk review: correctness relies on unchanged caller-supplied stages and callbacks; authority and
execution are untouched; rendering work is event-driven; callbacks/observers have paired lifecycle
cleanup. Physical resource savings, layout behavior and accessibility acceptance remain unmeasured.
Owner review is still required before merge or promotion.
