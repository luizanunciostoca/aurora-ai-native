# W16-00 PREBUILD Reconciliation

Status: **PREBUILD_READINESS_ONLY / W16 BUILD BLOCKED BY W15-J / DP5**

Live baseline for this reconciliation: `77f0f8532197025ee913dd02fcb56878d9d667a9`.

Prior readiness source reviewed: branch `readiness/w16-00-workspace-surface-freeze`, commit `4a6a882d25baa8ca0031fcdf664129a4638e9caf`.

## Reconciled invariants

The prior W16-00 readiness artifact remains directionally valid and is not treated as accepted W16 evidence. This prebuild incorporates its safe requirements while preserving its explicit prohibition on promoting W16 before W15-J / DP5 acceptance.

The Cortex prebuild therefore preserves these boundaries:

- workspace/UI state is a projection, never a second source of backend truth;
- UI state never mints authority, proves execution success or authorizes retry;
- mock/demo data never becomes physical evidence;
- no public `DynamicViewManifest` is introduced before the final W16-00 owner/equivalent reconciliation;
- unknown or unsupported bindings fail visibly rather than being guessed;
- runtime connectivity remains fail-closed in prebuild.

## Projection state reconciliation

The headless Cortex contract now distinguishes application rendering state from canonical projection freshness/state.

Rendering state remains `LOADING`, `READY`, `EMPTY`, `DEGRADED`, `OFFLINE` or `ERROR`.

Projection state is separately represented as `CURRENT`, `STALE`, `UNKNOWN`, `CONFLICT`, `REVOKED`, `EXPIRED`, `UNAVAILABLE` or `DEGRADED`.

A projection explicitly marked `CURRENT` may be demoted locally to `STALE` after its declared freshness deadline. Cortex never upgrades `CONFLICT`, `REVOKED`, `EXPIRED`, `UNKNOWN`, `UNAVAILABLE` or `DEGRADED` into `CURRENT`; only the owning canonical source may publish a new current observation.

This closes the stale-approval / stale-status presentation gap identified by the W16-00 readiness artifact without duplicating W02, W03, W07, W14 or W15 state machines.

## Deferred final W16-00 work

After genuine W15-J acceptance, W16-00 still must reconcile against the then-current accepted runtime tuple before any BUILD promotion. That reconciliation must bind final owner contracts, read-model/BFF ownership, tenant/redaction requirements and action-request boundaries. This PREBUILD artifact cannot satisfy that gate by itself.
