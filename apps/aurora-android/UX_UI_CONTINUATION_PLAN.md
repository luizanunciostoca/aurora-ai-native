# Android UX/UI continuation — September 14, 2026

Status: **W15 LOCAL PRESENTATION PREVIEW / NOT PHYSICALLY ACCEPTED**.

## Review baseline and ownership

- Live main: `d2089407e88480686b879928cf2863c0dc81718e`.
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

## Revised delivery sequence

| Increment | Work | Dependency and evidence | Status |
| --- | --- | --- | --- |
| W15-P1 | Local orb motion/resource behavior, primary-action priority, readable text and focus feedback | Existing W15 presentation states; JVM/Android build plus device UX checks | Implemented in this preview; physical checks pending |
| W15-P2 | Preserve keyboard/TalkBack focus across action-list refreshes; review setup and voice-screen navigation | Existing W15 callbacks and lifecycle only; accessibility regression evidence | Implemented in this preview; physical TalkBack/keyboard checks pending |
| W15-P3 | Tablet portrait/landscape, split-screen, 200% font, captions and long-response review | Exact preview APK, representative-device screenshots and observations | Pending physical preview review |
| W16-M0 | Reconcile state vocabulary, path ownership, projection contracts and visual test fixtures | Readiness only; consume accepted owner contracts before integration | Pending reconciliation |
| W16-M1–M3 | Compose foundation, full Presence renderer, conversation continuity and text entry | W15-J acceptance, W16-00 BUILD release, published W14 contracts | Blocked for integrated BUILD |
| W16-M4–M7 | Workspace, Dynamic Views, progress, approval/evidence and operational views | Accepted read models and owner-wave gates | Readiness/specification only |
| W16-M8–M9 | Visual goldens, performance, E2E and acceptance | Exact-head gates plus physical evidence | Future acceptance work |

This preview does not count W15-P1 or W15-P2 as completion of W16 UI IDs or M1/M2. It keeps Android
Views and existing presentation states; no Compose dependency, public schema or duplicate renderer
framework is introduced. The planned conversation-first product direction is retained.

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
- Shared native setup/bootstrap helpers now use the same dark surface, readable text hierarchy,
  54 dp controls, disabled styling, ripple feedback and visible keyboard-focus border as the Home.
- This changes presentation only: existing click callbacks, permission flow, wake enrollment,
  privacy choice, assistant selection, LOCAL bootstrap, authority and execution remain unchanged.

## Validation and remaining checks

Local verification on 2026-09-14 before publication of the P2 increment:

- JUnit: all eight orb rendering-policy tests passed using Kotlin 2.2.10 and JVM target 17.
- Modified P1 native UI sources compiled against the official Android 36 SDK stubs. The compiler
  reported only deprecated system-bar color APIs in the existing surface setup.
- Markdown formatting and `git diff --check` passed for the earlier P1 increment.
- The repository test runner passed its first 120 tests for that earlier increment, then its build
  stage stopped because `tsc` was unavailable. This was not a full repository test-suite pass.
- P2 adds pure JVM tests for action-refresh identity. Exact-head GitHub Android Foundation, Quality,
  Test Build and Security are the authoritative automated validation for the published branch.
- These checks are not an emulator rendering check or physical acceptance.

Automated acceptance for this preview:

1. JVM rendering-policy tests cover all eight stages, every visibility/accessibility/power constraint,
   foreground restoration, narrow-window bounds and large-text layout decisions.
2. Action-refresh policy tests cover initial creation, unchanged wake-runtime refresh and semantic
   action changes that must rebuild controls.
3. Android Foundation must compile the native Views and run local unit tests on the exact PR head.
4. Quality, Test Build and Security must pass on that same head; results belong in the PR.
5. Scope review must show no change to W02/W03/W07/W14, voice capture, executors, signing or DP5 scripts.

Device checks remain **NOT RUN** until recorded against an exact preview build:

| Scenario | Expected result |
| --- | --- |
| Home/setup at rest | Static orb; current setup action remains available |
| Active voice session | Existing stage text and response behavior remain correct |
| Remove animations enabled, including returning from Settings | No pulse; equivalent visible state text |
| TalkBack toggled while open | No duplicate orb stop; state text remains readable; pulse stops |
| Battery saver toggled while open | Pulse stops without changing the interaction state |
| Home/background, hidden view, window focus loss, detach/reattach | No background animation; eligible foreground state can resume |
| Portrait/landscape, split screen, font scale 1.0/1.3/2.0 | No horizontal orb overflow; text and actions scroll normally |
| Long transcript and response | Primary action comes first; text remains selectable and reachable |
| Wake-runtime polling with focused action | Identical refresh keeps the same control instance and focus |
| Semantic onboarding transition with focused action | Matching stable control regains focus; primary role may move to new primary action |
| Setup/bootstrap keyboard navigation | Visible focus border and original callbacks remain intact |
| Wake, assistant role, microphone and LOCAL bootstrap | Existing behavior unchanged; no authority inferred from visuals |

No emulator screenshots, physical TalkBack checks, frame timings or battery measurements are
claimed by the policy tests. Focus continuity is implemented at View/action identity level but is
not a physical accessibility acceptance claim until verified on the exact preview APK.

## Release and handoff

Keep the PR draft and stacked on #522. This task does not install an APK, replace the current DP5
candidate, start a host, renew consent or execute a physical effect. Any future preview packaging
must record exact source/host/variant/signing identity and hashes; successful software checks do
not grant DP5 or W16 acceptance. No secrets, audio, transcripts or new telemetry are persisted here.

Risk review: correctness relies on unchanged caller-supplied stages and callbacks; authority and
execution are untouched; rendering work is event-driven; callbacks/observers have paired lifecycle
cleanup. Physical resource savings and accessibility acceptance remain unmeasured. Owner review is
still required before merge or promotion.
