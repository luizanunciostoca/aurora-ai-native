# W09 — Dependency Matrix

Status: `W09_00_BUILD_CANDIDATE / DAG_FROZEN`
Date: 2026-09-02
Base exact main at branch creation: `5715ffa4e9d4cd628c1f6d4d6e7a3410ea3d5324`

## Upstream dependencies

| Upstream | Required behavior | W09 rule |
| --- | --- | --- |
| W01 | tenant/identity/correlation primitives | consume; no workflow-derived identity truth |
| W02 | policy/current authority semantics through Executor | n8n never mints or replaces authority |
| W03 | durable event, idempotency, replay, timer, lease and generic workflow truth | mandatory foundation; no parallel durable engine |
| W04 | Capability Registry/CapabilityPlan | workflow bindings may reference existing capabilities only |
| W07 | external side-effect boundary, target resolution, receipts/reconciliation/failure containment | mandatory for governed side effects |
| W08 | provider-specific adapter boundary when a workflow targets a provider | downstream composition only; W09 does not own provider transport |
| W14/W15 | device session/runtime when a workflow ultimately targets a device | workflow-only lock; no device runtime in W09 |

W09-00 is dependency-satisfied by accepted W03-F and W07-H. Provider/device descendants are consumed only when their own accepted contracts are required by an actual workflow integration; their absence does not justify inventing substitute transport in W09.

## Internal DAG

| Task | Depends on | Releases |
| --- | --- | --- |
| W09-00 | W03-F + W07-H accepted | W09-A |
| W09-A | W09-00 | W09-B, W09-C, W09-D |
| W09-B | W09-A | W09-E contribution |
| W09-C | W09-A | W09-E contribution |
| W09-D | W09-A | W09-E contribution |
| W09-E | W09-B + W09-C + W09-D | W09-F |
| W09-F | W09-E | accepted W09 fabric publication |

## Downstream use

- W10-W13 may compose curated workflows only after their own domain governance and the required W09/W07/W08 boundaries are accepted.
- W17 may consume workflow run/evidence observations through its owner contracts; W09 does not become telemetry truth.
- W18 may evaluate workflow outcomes but cannot learn-promote W09 changes without W18 governance.
- W14/W15 remain independently owned for device sessions/native execution.

## Promotion rules

1. `BUILD_READY` is not `ACCEPTED`.
2. Child BUILD starts only from accepted live-main dependencies, never an open PR branch.
3. PREBUILD/reference corpus cannot satisfy implementation dependencies.
4. If live main changes before merge, Program Control revalidates compatibility/mergeability/scope and reruns any stale gate required by active governance.
5. Workflow migration cannot outrun binding, credential and evidence/replay foundations.
6. No provider/device-specific side effect is implemented inside W09 to avoid waiting for its owner wave.