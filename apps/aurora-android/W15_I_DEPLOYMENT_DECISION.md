# W15-I — Dedicated Device / Device Owner / Launcher Decision

Status: `RESOLVED_NOT_JUSTIFIED_CURRENT_DEPLOYMENT`

Exact reconciliation base: `e08009d409c0c8cf7f25b16a1d6202551e4d2119`
Issue: `#337`
Canonical branch: `wave/15i-device-owner-launcher`

## Decision

The current Aurora Android deployment remains **standard-app only**. W15-I does not introduce Android Device Owner provisioning, a Device Admin receiver, launcher replacement, kiosk/lock-task ownership, elevated device-policy permissions, or any other privileged deployment mode.

This is an intentional governed resolution, not an omitted feature.

## Canonical evidence

- `docs/governance/w15/W15_DP4_DP5_PUBLICATION_FREEZE.md` explicitly permits W15-I to resolve as an accepted, evidence-backed decision that Device Owner/Launcher is not justified for the current deployment. DP5 must not force privileged mode merely to satisfy a checklist.
- `docs/governance/w15/W15_RISK_REGISTER_AND_PREMORTEM.md` identifies Device Owner/Launcher privilege as risk W15-R17 and requires an optional isolated profile, explicit justification, and provisioning/unprovisioning/rollback evidence if implemented.
- `docs/governance/w15/W15_DEPENDENCY_AND_OWNERSHIP_MATRIX.md` requires the standard application architecture to remain independent of optional dedicated-device privilege and forbids elevated Android privilege from becoming Aurora action authority.
- The reconciled Android manifest contains only the standard `MAIN` / `LAUNCHER` activity surface. It declares no Device Admin receiver, HOME replacement, privileged policy component, or dedicated-device provisioning surface.
- Live repository reconciliation found no canonical deployment requirement that requires Device Owner controls or launcher replacement for the current W15 target.

## Runtime boundary

`DedicatedDeviceProfilePolicy` records the fail-closed boundary for future deployment proposals:

1. no evidence -> `STANDARD_APP_ONLY`;
2. a normal deployment that does not require privileged controls -> `STANDARD_APP_ONLY`;
3. a privileged request without deployment, requirement, recovery and provisioning-owner references -> `STANDARD_APP_ONLY`;
4. even complete evidence may only produce `PRIVILEGED_IMPLEMENTATION_REVIEW_REQUIRED` — it does not enable Device Owner or launcher replacement.

Every outcome keeps:

- `standardAppRemainsRequired = true`;
- `privilegedProfileImplemented = false`;
- `deviceOwnerEnabled = false`;
- `launcherReplacementEnabled = false`;
- `authorizesExecution = false`;
- `canBypassAuroraAuthority = false`.

## Recovery / rollback consequence

Because no privileged profile is implemented, W15-I adds no provisioning state that requires an unprovision operation and no elevated state that can strand a device. Existing standard-app reinstall/session/Keystore recovery remains owned by the accepted W15-A/W15-B boundaries.

If a future canonical deployment requirement justifies Device Owner/Launcher, it must reopen or supersede this decision through a separately governed implementation with explicit provisioning, unprovisioning, rollback, privilege inventory, Android feasibility evidence, Risk Gates A-D and exact-head acceptance. Privilege may never substitute W02 policy/approval or W07 execution authority.
