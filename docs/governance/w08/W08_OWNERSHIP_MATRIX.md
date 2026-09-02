# W08 — Ownership Matrix

Status: `W08_00_BUILD_CANDIDATE / OWNERSHIP_FROZEN`
Date: 2026-09-02
Base exact main at branch creation: `5715ffa4e9d4cd628c1f6d4d6e7a3410ea3d5324`

## Cross-wave ownership

| Surface / semantic | Owner | W08 constraint |
| --- | --- | --- |
| PolicyToken / OwnerDecision / current authority | W02 | consume only through W07; never mint/reinterpret |
| Event/idempotency/replay backbone | W03 | reuse; no parallel ledger |
| Capability Registry / CapabilityPlan | W04 | provider bindings only; no capability truth fork |
| Generic ExecutionTarget / Executor / Receipt / reconciliation semantics | W07 | W08 implements provider-specific adapters below boundary |
| Provider adapters/bindings/credential resolver/read/write/readback | W08 | exclusive provider-specific owner |
| n8n governed workflow fabric | W09 | W08 must not own workflow runtime |
| Social/community business logic | W11 | W08 is transport/integration only |
| Meta Ads domain logic | W12 | W08 is transport/integration only |
| Google Ads domain logic | W13 | W08 is transport/integration only |
| Device Gateway/session/trust | W14 | W08 must not create device identity/session semantics |
| Android Device Runtime/native capabilities | W15 | W08 must not implement device runtime |
| Evidence/telemetry source of truth | W17 | W08 emits/forwards owner-approved observations only |

## Intended W08 package namespace

W08 runtime implementation, when released, is confined to a provider-specific package namespace:

- `packages/providers/src/bindings/**` — W08-A
- `packages/providers/src/credentials/**` — W08-B
- `packages/providers/src/read/**` — W08-C
- `packages/providers/src/write/**` — W08-D
- `packages/providers/src/health/**` — W08-E
- `packages/providers/src/readback/**` — W08-F
- `packages/providers/src/integration/**` — W08-G

Test ownership:

- `packages/providers/test/w08a-**`
- `packages/providers/test/w08b-**`
- `packages/providers/test/w08c-**`
- `packages/providers/test/w08d-**`
- `packages/providers/test/w08e-**`
- `packages/providers/test/w08f-**`
- `packages/providers/test/w08g-**`

Provider-family implementation may be nested beneath the owning leaf, for example `read/meta/**` or `write/google-ads/**`, without changing semantic ownership.

## Coordinator-owned W08 surfaces

W08-00 owns `docs/governance/w08/**` for this freeze.

Shared/root/publication surfaces remain Program Control-owned unless a later accepted task explicitly grants them, including but not limited to:

- repository root manifests/configuration;
- root or package-level public barrels that affect cross-wave API publication;
- shared contract/schema families outside W08-owned provider leaves;
- canonical status/evidence/change/acceptance registries;
- CI workflow definitions;
- W02/W03/W04/W07 owner surfaces.

A leaf implementation that needs one of those surfaces must hand the change to Program Control or an explicitly authorized integration task; it must not silently widen its PR.

## Provider boundary rules

- Provider IDs/accounts/resources are external references, not canonical Aurora IDs.
- Credential lookup belongs only behind W08-B's opaque resolver boundary.
- W08-D write transport is not a public planner/router/model API; it is callable only from the governed W07 execution path.
- W08-C read adapters must prove non-mutation.
- W08-E operational health cannot grant authority.
- W08-F readback observes provider state and feeds W07 reconciliation; it cannot rewrite historical evidence or silently convert ambiguity to success.
- W08-G may bind provider support into W04 through the canonical integration point but cannot create a second capability registry.

## Scope-conflict rule

If two tasks require the same writable path, the later task does not proceed until Program Control either serializes the work, assigns a shared integration owner, or moves one task to a non-overlapping leaf. Parallel writes to a shared root/publication surface are prohibited.