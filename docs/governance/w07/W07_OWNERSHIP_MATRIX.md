# W07 OWNERSHIP MATRIX

Date: 2026-09-01  
Status: `W07_00_COORDINATION_FREEZE_CANDIDATE`  
Base main: `b502bfa7e97291086c09cc85cd71040f96d3b036`

## Ownership principles

- W07 owns generic deterministic execution safety, not business decisions or target-specific provider/device/workflow implementations.
- Existing W01/W02/W03/W04 canonical contracts/sources remain authoritative in their domains.
- Exact path ownership is narrow. Shared/publication surfaces require Program Control reconciliation.
- No worker widens ownership because a neighboring public contract is convenient.

## W07-A — execution-target contracts and compatibility evolution

Exclusive new leaf namespaces:
- `packages/contracts/src/execution-target/**`;
- `packages/schemas/src/execution-target/**`;
- W07-A-prefixed contract/schema tests.

Compatibility-reviewed existing files W07-A may evolve only as required by the accepted compatibility freeze:
- `packages/contracts/src/actions/action-intent.ts`;
- `packages/contracts/src/receipts/receipt.ts`;
- `packages/contracts/src/evidence/evidence.ts`;
- matching schema files under `packages/schemas/src/actions/**`, `packages/schemas/src/receipts/**`, `packages/schemas/src/evidence/**`.

Package root barrels/export maps, manifests and ID namespace changes remain Program Control-owned shared publication surfaces. W07-A MUST NOT create DeviceId/DeviceRef; W14 owns that decision.

## `services/executors/**`

Existing `services/executors/STATUS.md` is the canonical W07 scaffold and remains Program Control-owned shared metadata.

Leaf allocations:
- W07-B: `services/executors/src/sdk/**`; tests `services/executors/test/w07b-**`.
- W07-C: `services/executors/src/safeguards/**`; tests `services/executors/test/w07c-**`.
- W07-D: `services/executors/src/target-resolution/**`; tests `services/executors/test/w07d-**`.
- W07-E: `services/executors/src/readback/**`; tests `services/executors/test/w07e-**`.
- W07-F: `services/executors/src/reconciliation/**`; tests `services/executors/test/w07f-**`.
- W07-G: `services/executors/src/failure-containment/**`; tests `services/executors/test/w07g-**`.
- W07-H: integration/fault-injection tests `services/executors/test/w07h-**` and W07 evidence/runbooks only.

`services/executors` package/service manifests, tsconfig/build config, root/public barrels, deployment config and cross-package exports remain Program Control-owned shared surfaces.

## Node ownership

| Node | Exclusive semantic ownership | Prohibited overlap |
|---|---|---|
| W07-00 | `docs/governance/w07/**`, W07 machine graph metadata | no runtime/contracts implementation |
| W07-A | execution-target contract/schema leaf + listed compatibility files | no DeviceId, provider adapter or target runtime |
| W07-B | Executor SDK/current validation integration | no token issuance/second Policy Engine |
| W07-C | generic idempotency/preconditions/quotas/deadlines | no provider-specific rate-limit/business budgets |
| W07-D | generic target resolution | no execution in resolver; no device/provider session implementation |
| W07-E | generic Receipt/Evidence/readback runtime | no secrets; no W17 telemetry platform |
| W07-F | uncertainty/reconciliation state machine | no blind retry; no provider-specific adapter ownership |
| W07-G | circuit breaker/kill switch/failure containment | no W17 SLO platform; intelligence cannot override |
| W07-H | integration/fault injection/consumer publication | no new semantic runtime/consumer-wave features |

## Program Control shared surfaces

- root workspace/lockfiles/build config;
- `.github/workflows/**`, CODEOWNERS;
- `packages/contracts/src/index.ts`, package exports/manifest/build config;
- `packages/schemas/src/index.ts`, package exports/manifest/build config;
- `packages/registries/**` shared/publication changes;
- `services/executors/STATUS.md`, manifest/build/deployment/public barrels;
- `docs/governance/CURRENT_PROGRAM_STATUS.md` and cross-wave consumer maps.

## Cross-wave locks

- W02: Policy Engine, authority issuance/validation semantics and informational precheck.
- W03: durable idempotency/event/replay/timer/lease/workflow primitives.
- W04: lifecycle, capability registry/planning, GoalGraph/scheduler, lanes, ExecutionBudget/templates.
- W05: intelligence/router/agent strategy; cannot execute through W07 internals directly.
- W08: provider adapters, credentials, provider-specific transport/rate limits.
- W09: n8n workflow fabric/bindings.
- W14: DeviceId/DeviceRef, registration, session/trust/attestation/realtime gateway.
- W15: Android/native capability bridge, app integration, permission broker and Device Executor implementation.
- W17: production telemetry/SLO/DR; W19: final security hardening.

## Parallel write policy

After W07-A acceptance, B/C/D/E are distinct service leaves and may run concurrently if W07-A public surfaces are stable. F/G may run concurrently after B/C/D/E acceptance. Any new need to modify an existing shared public contract outside the W07-A freeze stops the leaf task and returns it to Program Control for compatibility review.