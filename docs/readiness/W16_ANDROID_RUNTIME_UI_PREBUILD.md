# W16 Android Runtime UI — PREBUILD Handoff

Status: **PREBUILD / NON-CANONICAL / NO AUTHORITY**

This artifact records reusable Android UI/runtime integration work prepared before W16 BUILD eligibility. It does not satisfy W16 dependencies, does not authorize merge to `main`, and does not claim W15-J/DP5 acceptance.

## Exact source state

- canonical main: `d84ca8c83a24d89aafe7fe4efbb12f0302587f18`
- runtime UI prototype branch: `prototype/aurora-runtime-ui-integration-v1`
- validated prototype checkpoint: `656b771fd17fe6a52c7c9020cd3382d77af26001`
- source wake checkpoint: `343b839a6425cef9493619da7ff622b7a29bfb66`
- W15-J canonical candidate: `6c247d2331f4aa4b4cee5455d8658a6fbdad3f4d`
- W15-J PR: `#413` — draft; DP5 physical evidence still required

## Validated build identity

- UI profile: `RUNTIME_UI_INTEGRATION_V1`
- app version: `0.18.0-alpha.1-local`
- version code: `7`
- variant: `localDebug`
- target SDK: `36`
- artifact: `Aurora-Runtime-UI-Integration-V1.apk`
- workflow artifact id: `9967720501`
- workflow artifact digest: `sha256:e2dbdb176b375eeaca0a4e1fc541ee592ac8354210ad3d00a9c4ab4d47a75c1c`

The artifact bundle checksum verified successfully with `sha256sum -c SHA256SUMS.txt`.

## Runtime sources already connected to the Android interface

The prototype consumes existing runtime/read-model owners and does not create duplicate business state:

1. Android Presence/lifecycle state.
2. Network connectivity observation.
3. W14/W15-B local device-session availability.
4. Governed W04 + W15-C + W15-G voice projection snapshot.
5. Current DEVICE capability count derived from governed projection only.
6. Deterministic voice-command count derived from governed vocabulary only.
7. W15-H offline queue state through a read-only store view.
8. Explicit W07 mobile voice-ingress state: `NOT_COMPOSED_FAIL_CLOSED`.

## UI surfaces already upgraded from structural preview

### Devices

Displays live environment/build, Presence, local service, device-session availability, governed voice projection status, W04/W15-G versions, current DEVICE capability count, W07 ingress state and offline queue summary.

### System Health

Displays live network/runtime state and governed voice/offline-queue status. W17-owned SLO/evidence-completeness metrics remain absent and are rendered as unavailable rather than synthesized.

### Device Control

Displays current DEVICE capability availability and W07/queue precondition state. It remains non-executable: availability never equals permission, authority or successful side effect.

### Wake setup

Displays governed voice readiness/fail-closed reason and explicitly states that W07 mobile ingress is not composed. Wake/STT confidence never grants authority.

## Invariants proven by deterministic tests

- missing runtime snapshot provider fails closed;
- snapshot-provider exception fails closed;
- UI runtime state cannot set `authorizesExecution=true`;
- `System Health` keeps connected/live provenance rather than pretending full W17 telemetry exists;
- device workspaces render W07 and queue state without converting either into authority;
- offline queue UI reads do not drain, dispatch, retry or reconcile;
- no PolicyToken, OwnerDecision, DeviceId, tenant id, connection id, private key or gateway credential is added to UI state.

## CI evidence

Workflow run `33960163528` on exact HEAD `656b771fd17fe6a52c7c9020cd3382d77af26001` completed SUCCESS:

- inherited wake evidence tooling validation: SUCCESS
- Android SDK install: SUCCESS
- localDebug unit tests: SUCCESS
- localDebug assembly: SUCCESS
- artifact checksum creation/verification: SUCCESS
- artifact upload: SUCCESS

## W16 reuse map

This prototype is useful input to W16 but is not W16 BUILD.

- W16-00: use these surfaces to freeze request-vs-display boundaries and stale-state semantics.
- W16-A: reuse schema-driven `DynamicViewManifest` rendering and runtime-projection consumption patterns.
- W16-C/D/E/F: reuse live/preview provenance rules and explicit degraded/fail-closed presentation.
- W16-G: reuse tests proving UI does not mint authority and that stale/unavailable data remains visible.

## Promotion constraints

Before any W16 BUILD promotion:

1. W15-J must be accepted with genuine representative physical Android evidence.
2. W16-00 must become BUILD-eligible and freeze canonical surface ownership.
3. Prototype paths must be reconciled against accepted W15 contracts and then promoted through the W16-owned branch/PR, not merged from this prototype directly.
4. Any backend/business projection must come from its canonical owner; no prototype-local fake provider may be promoted as source of truth.

## Known gaps / next safe work

- W07 mobile ingress remains deliberately uncomposed and fail-closed.
- canonical business/domain read models for Marketing, CRM, Providers, Workflows, Approvals and Evidence are not yet connected to this prototype.
- W17 SLO/evidence completeness is not available yet.
- W15-J physical tablet evidence remains external to this PREBUILD artifact.

`INTELLIGENCE != AUTHORITY != EXECUTION`
