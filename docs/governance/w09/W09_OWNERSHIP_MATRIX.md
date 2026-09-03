# W09 — Ownership Matrix

Status: `W09_00_BUILD_CANDIDATE / OWNERSHIP_FROZEN`
Date: 2026-09-02
Base exact main at branch creation: `5715ffa4e9d4cd628c1f6d4d6e7a3410ea3d5324`

## Cross-wave ownership

| Surface / semantic | Owner | W09 constraint |
| --- | --- | --- |
| Tenant/identity/correlation primitives | W01 | consume only |
| Current Policy/Authority | W02/W07 integration | workflow state/credential/webhook never authority |
| Durable events/idempotency/replay/timers/leases/generic workflow state | W03 | consume; no second durable workflow truth |
| Capability Registry / CapabilityPlan | W04 | binding references only; no capability fork |
| Generic Executor/target/receipt/reconciliation/failure containment | W07 | every governed external side effect remains below W07 |
| Provider adapters/credential transport/readback | W08 | W09 may target them only through accepted integration |
| n8n bindings/bridge/credential references/run-evidence forwarding/migration | W09 | exclusive n8n integration owner |
| Revenue/CRM business logic | W10 | workflows do not absorb domain policy |
| Organic/community business logic | W11 | workflows are orchestration only |
| Meta Ads business logic | W12 | W09 cannot decide campaign/spend |
| Google Ads business logic | W13 | W09 cannot decide campaign/spend |
| Device Gateway/session/trust | W14 | no session/device trust model in W09 |
| Android/native execution | W15 | no native capability execution in W09 |
| Production telemetry/SLO/evidence truth | W17 | W09 forwards evidence references/observations only |

## Repository path ownership

Canonical W09 integration target already exists:

- `services/n8n-bridge/**` — W09 runtime/integration owner.

Frozen descendant leaves inside that target:

- `services/n8n-bridge/src/bindings/**` — W09-A.
- `services/n8n-bridge/src/bridge/**` — W09-B.
- `services/n8n-bridge/src/credentials/**` — W09-C.
- `services/n8n-bridge/src/evidence/**` — W09-D.
- `services/n8n-bridge/src/migration/**` — W09-E.
- `services/n8n-bridge/test/**` and integration-specific fixtures — task-specific W09 tests, with W09-F owning final cross-leaf integration/evidence publication.

W09-00 owns `docs/governance/w09/**` for coordination/freeze.

## Explicit exclusions

- `packages/workflow/**` remains generic durable workflow foundation owned by W03. W09 must not modify it silently to make n8n work.
- `packages/contracts/**`, repository/public barrels, root manifests/config, CI workflows and canonical status/evidence registries remain Program Control or existing owner surfaces unless a later accepted integration task explicitly grants a compatibility-safe change.
- `catalog/n8n/**` is governed reference/index material, not runtime workflow registry.
- raw/sanitized reference corpus in Drive is provenance/reference input and is not copied wholesale into runtime paths.

## Shared-surface rule

If W09 needs a shared contract/publication change outside `services/n8n-bridge/**`, the owning leaf submits an integration handoff to Program Control/owning wave. It must not widen its PR or create a duplicate local contract merely to avoid coordination.

## Execution boundary rule

W09 may orchestrate and correlate execution, but a workflow node, webhook, schedule or n8n credential cannot directly create a governed external side effect outside W07. Provider/device/local-service target execution must reach the appropriate accepted owner boundary.