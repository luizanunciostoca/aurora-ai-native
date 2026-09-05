# W16 PRO+ Runtime UI — Consolidated PREBUILD Handoff

Status: **PREBUILD / NON-CANONICAL / NO AUTHORITY / NOT W16 BUILD**

This handoff records a validated composition of Android runtime read models with the tablet interface. It is reusable input for W16 only after W15-J/DP5 is accepted and W16 ownership/contracts are reconciled. It does not satisfy W16 dependencies and must not be merged directly from this prototype to `main`.

## Canonical frontier at validation

- canonical `main`: `d84ca8c83a24d89aafe7fe4efbb12f0302587f18`
- W15-J canonical candidate: `6c247d2331f4aa4b4cee5455d8658a6fbdad3f4d`
- W15-J PR: `#413` — OPEN / DRAFT / DP5 physical evidence required
- source wake checkpoint: `343b839a6425cef9493619da7ff622b7a29bfb66`

## Validated PRO+ composition

- branch: `prototype/aurora-proplus-ui-consolidated-v1`
- exact green HEAD: `9384fcf86ed61689db840d56de9ea44865d2fba4`
- workflow run: `33961053881`
- artifact: `aurora-proplus-runtime-ui-v1`
- artifact id: `9967982264`
- artifact zip digest: `sha256:11ae3a16b3d29bd4d0080281661b1cb61430726b3f6206af2575f242b13ab827`
- APK: `Aurora-PROPLUS-Runtime-UI-V1.apk`
- APK SHA-256: `da8e335fa3240bcc45230b94e32fa9f0456a090e4527428d66fa9629ca7348b3`
- profile: `PROPLUS_RUNTIME_UI_V1`
- app version: `0.18.0-alpha.2-local`
- versionCode: `8`
- targetSdk: `36`

Exact-head CI completed SUCCESS for inherited wake tooling validation, Android SDK setup, full localDebug unit tests, localDebug assembly, checksum verification and artifact upload.

## Composed validated source checkpoints

- base runtime/UI checkpoint: `656b771fd17fe6a52c7c9020cd3382d77af26001`
- sanitized Security/Trust UI checkpoint: `5a0d54f85e45a33bcbc21ebe9f26995d36b35314`
- W15-C Native Capability UI checkpoint: `deac2e1fe24629c15d88e2ba6f17117a530b31c4`
- Evidence Runtime UI checkpoint: `20edbb88d9005b40742a96c9696d9b2b60aa7afb`

Each feature lane passed its own isolated CI before composition.

## Runtime sources integrated into UI

The interface consumes read-only state from existing owners:

1. Android Presence/lifecycle.
2. Android network connectivity observation.
3. W14/W15-B device-session availability.
4. Sanitized W15-B key metadata: presence, generation and bound registration version only.
5. Sanitized W14 registration metadata: lifecycle state and registration version only.
6. Sanitized W14 session metadata: presence/expired state and remaining lifetime only.
7. W04/W15-C/W15-G governed voice projection.
8. W15-C native capability observations as aggregate counts only.
9. W15-H offline queue state in read-only mode.
10. Explicit W07 mobile voice ingress state: uncomposed/fail-closed.

## Sensitive data intentionally excluded

The UI diagnostics do not expose or persist:

- DeviceId;
- tenantId;
- deviceSessionId;
- connectionId;
- Keystore alias;
- private/public signing material beyond pre-existing UI-safe fingerprint display;
- gateway credentials;
- PolicyToken;
- OwnerDecision;
- W07 authorization snapshots;
- arbitrary offline action arguments.

Sanitization is deterministic-test covered.

## UI surfaces upgraded

### Devices

Shows real Presence, environment/build, W14 session availability, governed voice versions/counts, W07 fail-closed state and W15-H queue summary.

### System Health

Shows real network/runtime/governed projection state. W17 SLO/evidence-completeness remains absent rather than synthesized.

### Device Control

Shows current read-model availability/preconditions only. No UI path performs a native side effect.

### Wake setup / runtime diagnostics

Shows governed voice readiness, sanitized W14/W15-B trust metadata, W15-C aggregate availability classes and offline queue state. Wake/STT confidence remains non-authoritative.

### Evidence

Shows local runtime provenance/diagnostics while explicitly keeping W17 canonical Evidence disconnected. Runtime projections are not EvidenceRecord, ACK is not success, and `EXECUTION_UNCERTAIN` remains reconciliation-before-retry.

## Safety invariants validated

- UI/read model cannot set `authorizesExecution=true`.
- missing/unreadable runtime providers fail closed.
- W15-C availability is not permission or authority.
- W14 session/trust metadata is not business authority.
- offline queue UI reads never drain, dispatch, retry or reconcile.
- no synthetic EvidenceRecord is produced.
- no verified outcome is inferred from ACK/receipt presence.
- blind retry is prohibited.

## W16 promotion rule

This prototype may be mined/reconciled into future W16-owned BUILD only after:

1. W15-J is accepted with genuine representative physical Android evidence;
2. W16-00 becomes BUILD-eligible;
3. canonical W16 UI/BFF contracts and ownership are frozen;
4. prototype paths are reconciled against accepted contracts;
5. the W16-owned branch/PR reruns required Quality/Test Build/Security/Risk gates on its exact final HEAD.

Until then, this artifact is PREBUILD evidence only.

`INTELLIGENCE != AUTHORITY != EXECUTION`
