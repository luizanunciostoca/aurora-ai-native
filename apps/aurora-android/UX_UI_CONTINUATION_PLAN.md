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

The preview work found and hardened seven presentation areas without creating new execution truth:
1. orb animation/resource behavior;
2. action focus continuity during wake-runtime polling;
3. tablet/split-screen/large-text geometry;
4. dense Home system status;
5. onboarding progress visualization;
6. conversation/settings hierarchy;
7. redundant semantic status tones that never replace readable text.

The seventh item is intentionally conservative: color is supplementary only. Every status still
states its label and value in text, and the accessibility description stays `label: value`. Privacy
uses a dedicated tone rather than an error tone because it is a user choice. `WAKE_RUNTIME` remains
neutral even after all four setup steps because `4 de 4 · Validando` is not equivalent to READY.

## Revised delivery sequence

| Increment | Work | Dependency and evidence | Status |
| --- | --- | --- | --- |
| W15-P1 | Orb motion/resource behavior, primary-action priority, readable text and focus feedback | Existing W15 presentation states | Implemented; physical checks pending |
| W15-P2 | Preserve keyboard/TalkBack focus across action-list refreshes; unify setup surfaces | Existing W15 callbacks/lifecycle | Implemented; physical TalkBack/keyboard checks pending |
| W15-P3 | Tablet portrait/landscape, split-screen, 200% font and long-response hardening | Pure layout policy + Android build | Implemented; CI passed on `39803da6…` |
| W15-P4 | Separate system-state summary from feedback/error and adapt its layout | Existing local state only | Implemented; CI passed on `94c24383…` |
| W15-P5 | Map existing onboarding state to a visual four-step progress summary | Existing `AuroraOnboardingStep` only | Implemented; CI passed on `5149250b…` |
| W15-P6 | Add explicit Conversation and Settings hierarchy landmarks | Existing shared native surface only | Implemented; CI passed on `568a6020…` |
| W15-P7 | Add semantic status tones while retaining textual/non-color meaning | Existing Home presentation facts only | Implemented in preview; exact-head CI pending |
| W16-M0 | Reconcile state vocabulary, path ownership, projection contracts and visual test fixtures | Readiness only; consume accepted owner contracts before integration | Pending reconciliation |
| W16-M1–M3 | Compose foundation, full Presence renderer, conversation continuity and text entry | W15-J acceptance, W16-00 BUILD release, published W14 contracts | Blocked for integrated BUILD |
| W16-M4–M7 | Workspace, Dynamic Views, progress, approval/evidence and operational views | Accepted read models and owner-wave gates | Readiness/specification only |
| W16-M8–M9 | Visual goldens, performance, E2E and acceptance | Exact-head gates plus physical evidence | Future acceptance work |

This preview does not count W15-P1 through W15-P7 as completion of W16 UI IDs or M1/M2. It keeps
Android Views and existing presentation states; no Compose dependency, public schema or duplicate
renderer framework is introduced. The planned conversation-first product direction is retained.

## W15-P1 behavior

- READY and terminal/setup states draw a static orb. Active interaction stages may pulse.
- Detached, hidden or unfocused windows do not animate; accessibility/power constraints select static mode.
- The orb reserves less space with large text or a short window and fits the available width.
- The primary action precedes transcript/history; the decorative orb is skipped by TalkBack.
- Identical live-region text is not reassigned; transcript/response remain selectable.
- Buttons retain 54 dp minimum height with ripple and visible keyboard focus.

## W15-P2 behavior

- Home actions use stable semantic identities instead of disposable controls.
- Identical 500 ms wake-runtime refreshes retain existing action Views and focus.
- Real semantic action changes capture/restore keyboard and accessibility focus.
- No focus is forced when none existed.
- Shared setup/bootstrap helpers use the same visual language without changing callbacks.

## W15-P3 behavior

- `AuroraWindowLayoutPolicy` classifies full tablet, split-screen, narrow, short and large-text windows.
- Decorative padding shrinks where necessary without shrinking requested text scale.
- Wide tablet content remains constrained; compact windows use available width and vertical scrolling.
- Native buttons/text explicitly wrap and use readable line-break/hyphenation strategies where supported.
- WakeVoiceActivity inherits geometry through the shared surface without STT/TTS/executor changes.

## W15-P4 behavior

- Microphone, assistant role, wake readiness and privacy are separate status cards.
- Values come from the same existing Home facts; no new state source or authority inference exists.
- Cards are inline on wide tablet and stack below 720 dp or at font scale >= 1.3.
- Unchanged status lists are not rebuilt during polling.

## W15-P5 behavior

- `AuroraOnboardingProgressPolicy` maps only the already-selected onboarding step to display progress.
- Setup shows `Etapa 1 de 4` through `Etapa 4 de 4`.
- `WAKE_RUNTIME` shows `4 de 4 · Validando`; `READY` shows `Concluída`.
- `PRIVACY_BLOCKED` hides setup progress.
- `isComplete` is true only for READY; completing four setup steps alone does not imply readiness.

## W15-P6 behavior

- The primary action remains isolated and dominant before history.
- A visible history card contains `CONVERSA` before transcript/response.
- Secondary controls are under `AJUSTES` only when at least one secondary action exists.
- Both labels are accessibility headings on supported Android versions.
- Existing action IDs, listeners, focus behavior and ordering are unchanged.

## W15-P7 behavior

- `AuroraSystemStatusPolicy` receives only already-decided presentation facts and maps them to label,
  value and a supplementary semantic tone.
- READY facts may use a positive tone; pending microphone/assistant/wake use an attention tone.
- Privacy-active wake and privacy state use a dedicated privacy tone rather than an error tone.
- Runtime validation remains neutral even when four setup steps are complete.
- Card text and `contentDescription` remain explicit, so status meaning never depends on color alone.
- Tone rendering changes only card fill/stroke. It does not alter onboarding, permission, wake,
  assistant-role, execution, authority or DP5 behavior.

## Validation and remaining checks

Verification history:

- P1 rendering-policy tests cover all assistant stages and animation/resource constraints.
- P2 action-refresh tests cover initial creation, unchanged polling and semantic rebuilds.
- P3 window-layout tests cover tablet, split-screen, narrow width, 130%/200% font and short landscape.
- P5 onboarding-progress tests cover setup, runtime validation, READY and privacy block.
- P7 status-policy tests cover ready, pending, runtime validation and privacy semantics.
- `39803da680878ddc8f1ea7f64cb5e1aa72a1cc78` passed Security, Quality, Test Build and Android Foundation.
- `94c24383ab34ff2b432bbe4b4d1ef42d644b32ac` passed Security, Quality, Test Build and Android Foundation.
- `5149250bc0924d1ae060d9dd034dc8fa1c47f0f0` passed Security, Quality, Test Build and Android Foundation.
- `568a60206f3a9de48fa30b2e9f14bb2a59ca35fd` passed Security, Quality, Test Build and Android Foundation.
- P7 exact-head CI is required before this increment is software-validated.
- These checks are not emulator rendering checks or physical acceptance.

Automated acceptance for this preview:

1. JVM policy tests cover orb behavior, focus-refresh identity, responsive geometry, onboarding progress and status semantics.
2. Android Foundation must compile the native Views and run local unit tests on the exact PR head.
3. Quality, Test Build and Security must pass on that same head.
4. Scope review must show no change to W02/W03/W07/W14, voice capture, executors, signing or DP5 scripts.

Device checks remain **NOT RUN** until recorded against an exact preview build:

| Scenario | Expected result |
| --- | --- |
| Home/setup at rest | Static orb; current setup action remains available |
| Home status summary | Readable cards; color only supplements explicit text |
| Onboarding progress | Correct 1/4–4/4/validating/complete summary; hidden under privacy block |
| Runtime validation | `4 de 4 · Validando` remains visibly/textually distinct from READY |
| Privacy active | Privacy/wake state reads as user-selected privacy, not generic failure |
| Active voice session | Existing stage text and response behavior remain correct |
| Conversation history | `CONVERSA` landmark precedes selectable transcript/response |
| Secondary actions | `AJUSTES` appears only when secondary controls exist |
| TalkBack / animations / battery saver | Equivalent readable state remains available without decorative dependence |
| Portrait/landscape/split-screen/font 1.0/1.3/2.0 | No horizontal overflow; text wraps and surface scrolls normally |
| Wake-runtime polling with focus | Identical refresh keeps the same control instance and focus |
| Setup/bootstrap keyboard navigation | Visible focus border, wrapped labels and original callbacks remain intact |

No emulator screenshots, physical TalkBack checks, frame timings or battery measurements are
claimed by policy tests. Focus continuity, responsive geometry, status cards/progress, hierarchy and
semantic tones remain preview behavior until verified on the exact preview APK.

## Release and handoff

Keep the PR draft and stacked on #522. This task does not install an APK, replace the current DP5
candidate, start a host, renew consent or execute a physical effect. Any future preview packaging
must record exact source/host/variant/signing identity and hashes; successful software checks do
not grant DP5 or W16 acceptance. No secrets, audio, transcripts or new telemetry are persisted here.

Risk review: correctness relies on unchanged caller-supplied facts and callbacks; authority and
execution are untouched. Physical resource savings, layout behavior and accessibility acceptance
remain unmeasured. Owner review is still required before merge or promotion.
