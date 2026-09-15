# Android UX/UI continuation — September 14, 2026

Status: **W15 LOCAL PRESENTATION PREVIEW / NOT PHYSICALLY ACCEPTED**.

## Baseline and ownership

- Main baseline reviewed for this preview: `d2089407e88480686b879928cf2863c0dc81718e`.
- Interactive v0.16 candidate #517: `bd9081d1016bdf83af0a0ef0959ae97f59e0dc49`.
- v0.17 development foundation #522: `efbc46e1046d55d6ad693efe79e613485eda7da3`.
- Preview branch: `preview/w15-android-accessible-home` / PR #529.
- This line does **not** replace the packaged DP5 candidate or change the DP5 tuple.
- W16 Workspace, Compose integration, Dynamic Views and runtime design-system publication remain dependency-gated.

Repository references:

- [ADR-003](../../docs/architecture/ADR-003_EXPERIENCE_LAYER_UX_UI_RUNTIME.md)
- [W14–W17 UX/UI handoff](../../docs/governance/ux-ui/UX_UI_REQUIREMENTS_HANDOFF_W14_W17.md)
- [Ownership matrix](../../docs/governance/ux-ui/UX_UI_CROSS_WAVE_DEPENDENCY_OWNERSHIP_MATRIX.md)

## Scope boundary

This preview may change local Android presentation, accessibility metadata, responsive layout,
visual hierarchy and presentation-only policies derived from already-decided W15 facts.

It must not:

- grant or infer execution authority;
- widen W07/W14 scope;
- change governed voice capture, executor semantics or device receipts;
- change signing/physical candidate identity;
- resolve, bypass or declare DP5/W15-J acceptance;
- introduce placeholder public contracts for W16 owner waves.

## Delivery status

| Increment | Purpose | Software evidence | Status |
| --- | --- | --- | --- |
| W15-P1 | Orb resource behavior, action priority, readable text/focus | JVM + Android CI line | Implemented; physical checks pending |
| W15-P2 | Stable actions and keyboard/TalkBack focus continuity | policy tests + Android CI | Implemented; physical checks pending |
| W15-P3 | Tablet/split-screen/large-text geometry | exact head `39803da6…` 4/4 PASS | Implemented |
| W15-P4 | Separate system-state cards | exact head `94c24383…` 4/4 PASS | Implemented |
| W15-P5 | Four-step onboarding progress projection | exact head `5149250b…` 4/4 PASS | Implemented |
| W15-P6 | Conversation vs settings hierarchy | exact head `568a6020…` 4/4 PASS | Implemented |
| W15-P7 | Semantic status tones without color-only meaning | exact head `22f16118…` 4/4 PASS | Implemented |
| W15-P8 | Accessible transient-status/non-audio notice | exact head `3009d7fb…` 4/4 PASS | Implemented |
| W15-P9 | Consolidated live-region narration | exact head `e7783eb6…` 4/4 PASS | Implemented |
| W15-P10 | `ESTADO` accessibility/navigation landmark | exact-head CI required | Implemented in preview; CI pending |
| W16-M0+ | Contract/runtime design-system integration | owner/dependency gates | Not claimed / dependency-gated |

## Current behavior

### Presence and motion

- READY/setup/terminal states can render a static orb; active interaction stages may pulse.
- Animation stops when detached, hidden, unfocused, Android animations are disabled, touch
  exploration is active, or battery saver is active.
- Motion/power/accessibility observers are paired with lifecycle cleanup.
- The orb is decorative and excluded from TalkBack because readable state exists in text.

### Responsive tablet layout

- `AuroraWindowLayoutPolicy` handles full tablet, split-screen, very narrow width, short landscape
  and large text without consulting runtime/authority state.
- Decorative padding shrinks in constrained windows while user-selected text scale is preserved.
- Wide tablet layouts constrain content width; compact windows use available width and scroll.
- Buttons and long copy wrap explicitly; supported Android versions use readable break/hyphenation.
- Status cards stack below 720 dp or at font scale >= 1.3.

### Home status and onboarding

- System facts are separate cards rather than one dense status sentence.
- `AuroraSystemStatusPolicy` receives already-decided facts only.
- Setup progress is projected from the existing `AuroraOnboardingStep`:
  - `Etapa 1 de 4` through `Etapa 4 de 4`;
  - `4 de 4 · Validando` for WAKE_RUNTIME;
  - `Concluída` only for READY;
  - hidden under PRIVACY_BLOCKED.
- `isComplete` is true only for READY, so four setup steps never imply detector readiness.
- Positive/attention/privacy/neutral card tones supplement explicit text; color is never the sole
  status carrier. Runtime validation remains neutral. Privacy is not styled as a generic error.

### Focus and action stability

- Home actions use stable semantic IDs.
- Identical 500 ms wake-runtime refreshes keep existing action Views.
- Real semantic rebuilds capture/restore keyboard and accessibility focus where possible.
- No focus is forced when no action previously had focus.
- Primary action stays before long conversation history.
- Setup/bootstrap buttons retain 54 dp minimum targets, ripple and visible keyboard focus.

### Information hierarchy

- The visible screen title remains a navigable accessibility heading.
- System cards are preceded by `ESTADO` only when the group exists.
- Conversation history is preceded by `CONVERSA` only when transcript/response exists.
- Secondary controls are preceded by `AJUSTES` only when secondary actions exist.
- WakeVoiceActivity does not populate the Home status group and therefore does not expose an empty
  `ESTADO` landmark.

### Accessible announcements and non-audio equivalents

- Eyebrow/orb decoration is excluded from TalkBack to avoid duplicate state narration.
- The title remains a heading but is not a live region.
- Detail is the primary polite live region for stage changes.
- Transcript and response remain selectable readable equivalents and polite live regions.
- Transient status/feedback is a separate high-contrast text card with
  `ACCESSIBILITY_LIVE_REGION_POLITE`.
- The status live region is made visible before new text is assigned; clearing hides it before the
  text is emptied.
- Unchanged text is not reassigned, limiting repeat announcements during polling.

## Exact-head CI history

The following preview heads each passed **Security + Quality + Test Build + Android Foundation**:

- P3: `39803da680878ddc8f1ea7f64cb5e1aa72a1cc78`
- P4: `94c24383ab34ff2b432bbe4b4d1ef42d644b32ac`
- P5: `5149250bc0924d1ae060d9dd034dc8fa1c47f0f0`
- P6: `568a60206f3a9de48fa30b2e9f14bb2a59ca35fd`
- P7: `22f1611830ee888d8048830d47b01efbda76333e`
- P8: `3009d7fbe3cb6c53f5bb4cb92cff8238f9eefb74`
- P9: `e7783eb696d603b00f3404660eb390e31dc4e7a2`

P10 must pass the same four gates on the final exact head that includes this document.

## Physical checks still required

These remain **NOT RUN / NOT ACCEPTED** until recorded on an exact preview APK:

| Scenario | Expected result |
| --- | --- |
| Home/setup at rest | Static readable state; current primary action available |
| TalkBack navigation | Title, ESTADO, CONVERSA and AJUSTES form useful landmarks without duplicates |
| Wake-runtime polling | Identical refresh preserves focused action and does not repeatedly announce unchanged text |
| Semantic onboarding transition | Matching stable action focus is restored where possible |
| Voice session | Stage detail/status/transcript/response remain readable equivalents to audio |
| Remove animations / battery saver | Decorative pulse stops; textual state stays equivalent |
| Portrait / landscape / split-screen | No horizontal overflow; surface scrolls normally |
| Font scale 1.0 / 1.3 / 2.0 | Text remains untruncated; status cards stack where needed |
| Long transcript/response | Primary action remains reachable; history wraps/selects normally |
| Keyboard navigation | Visible focus border and original callbacks remain intact |
| Privacy active | UI reads as user-selected privacy, not generic execution failure |

No emulator screenshot, physical TalkBack result, frame timing or battery measurement is inferred
from policy tests or CI.

## Release boundary

Keep PR #529 **DRAFT / PREVIEW** and stacked on #522. Software CI success does not grant W15-J,
DP5 or W16 acceptance. This work does not install an APK, replace the physical candidate, start a
host, renew consent or execute a physical effect. Any future preview package must record exact source,
host, variant, signing identity and hashes before device testing.
