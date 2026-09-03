# W08 — Ownership Matrix

Status: `W08_00_RECONCILED_BUILD_CANDIDATE / OWNERSHIP_FROZEN`
Date: 2026-09-02
Base exact main at branch creation: `5d7feaeb095c35c748fe7ec17ae9d1d39b3cfbcc`
Supersedes historical candidate: PR `#236` / HEAD `1fb765cd82a40f3a07522614b9b60c6be846e4b0`

## Cross-wave ownership

| Surface / semantic | Owner | W08 constraint |
| --- | --- | --- |
| PolicyToken / OwnerDecision / current authority | W02 | consume only through W07; never mint or reinterpret |
| Event/idempotency/replay backbone | W03 | reuse; no parallel ledger |
| Capability Registry / CapabilityPlan | W04 | provider bindings only; no capability truth fork |
| Generic ExecutionTarget / Executor / Receipt / reconciliation semantics | W07 | W08 implements provider-specific adapters below the accepted boundary |
| Provider bindings / credential resolver / read / write / health / readback | W08 | exclusive provider-specific owner |
| Context/retrieval/cache/speculation semantics | W06 | no reinterpretation or provider-specific fork |
| n8n governed workflow fabric | W09 | W08 must not own workflow runtime |
| Revenue/CRM domain semantics | W10 | W08 transport cannot absorb CRM business logic |
| Social/community business logic | W11 | W08 is transport/integration only |
| Meta Ads domain logic | W12 | W08 is transport/integration only |
| Google Ads domain logic | W13 | W08 is transport/integration only |
| Device Gateway/session/trust | W14 | W08 must not create device identity/session semantics |
| Android Device Runtime/native capabilities | W15 | W08 must not implement device runtime |
| Evidence/telemetry platform truth | W17 | W08 emits/forwards owner-approved provider observations only |
| Adaptive learning/promotion | W18 | provider evidence cannot self-promote runtime behavior |

## Intended W08 package namespace

W08 runtime implementation, when each descendant is released, is confined to provider-specific leaves:

- `packages/providers/src/bindings/**` — W08-A
- `packages/providers/src/credentials/**` — W08-B
- `packages/providers/src/read/**` — W08-C
- `packages/providers/src/write/**` — W08-D
- `packages/providers/src/health/**` — W08-E
- `packages/providers/src/readback/**` — W08-F
- `packages/providers/src/integration/**` — W08-G

Test ownership follows the same leaves:

- `packages/providers/test/w08a-**`
- `packages/providers/test/w08b-**`
- `packages/providers/test/w08c-**`
- `packages/providers/test/w08d-**`
- `packages/providers/test/w08e-**`
- `packages/providers/test/w08f-**`
- `packages/providers/test/w08g-**`

Provider-family implementations may nest below those leaves, for example `read/meta/**` or `write/google-ads/**`, without changing semantic ownership.

## Coordinator-owned W08 surfaces

W08-00 owns only `docs/governance/w08/**` for this freeze.

Shared/root/publication surfaces remain coordinator/Program Control-owned unless an accepted task explicitly grants them, including:

- repository root manifests/configuration;
- root/package public barrels that alter cross-wave API publication;
- shared contract/schema families outside W08-owned leaves;
- canonical status/evidence/change/acceptance registries;
- CI workflow definitions;
- W02/W03/W04/W06/W07 owner surfaces.

A leaf implementation requiring a shared surface must hand the change to the owning integration/coordinator task rather than silently widening its PR.

## Provider boundary rules

- Provider IDs/accounts/resources are external references, not canonical Aurora IDs.
- Credential lookup belongs only behind W08-B's opaque resolver boundary.
- W08-D is an internal provider transport beneath W07; it is not a planner/router/model business API.
- W08-C reads must prove non-mutation.
- W08-E operational health cannot grant authority.
- W08-F readback observes provider state for W07 reconciliation; it cannot rewrite historical evidence or convert ambiguity into success.
- W08-G may publish provider-support bindings through W04's canonical integration point but cannot create a second capability registry.
- Provider transport cannot implement W11/W12/W13 decisions or W14/W15 device semantics.

## Scope-conflict rule

If two tasks require the same writable path, the later task does not proceed until Program Control serializes the work, assigns an explicit integration owner, or moves one task to a non-overlapping leaf. Parallel writes to shared/publication surfaces are prohibited.

## Reconciled acceptance ownership

Risk Gates A-D may be recorded as exact-head technical COMMENT evidence by the connected owner, but this is not a GitHub self-APPROVE event. Integration remains exact-head, drift-fenced and incomplete until post-merge exact-main Quality + Test Build + Security pass and the owning task receives `aurora:accepted`.
