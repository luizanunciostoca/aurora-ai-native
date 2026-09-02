# W08 — Dependency Matrix

Status: `W08_00_BUILD_CANDIDATE / DAG_FROZEN`
Date: 2026-09-02
Base exact main at branch creation: `5715ffa4e9d4cd628c1f6d4d6e7a3410ea3d5324`

## Upstream dependencies

| Upstream | Required contract/behavior | W08 rule |
| --- | --- | --- |
| W01 | canonical IDs, tenant/correlation/context/versioning families | consume; never create provider-derived Aurora IDs |
| W02 | current Policy/Authority validation | W08 never authorizes; writes remain below W07 current validation |
| W03 | durable event/idempotency/replay foundations | compose through W07; no second idempotency/event ledger |
| W04 | Capability Registry and target-neutral CapabilityPlan | consume and bind; no second capability registry |
| W07 | `PROVIDER` execution target, generic executor, receipts/readback/reconciliation/fault containment | mandatory write boundary; no provider bypass |
| Device-plane ownership | provider/device separation and W14/W15 ownership | provider is never device; W08 owns no Android runtime |

W08-00 is released by accepted W07-H. Earlier accepted W01-W04/W03 foundations remain inherited dependencies rather than a license to reinterpret them.

## W08 internal DAG

| Task | Depends on | Releases / contribution |
| --- | --- | --- |
| W08-00 | accepted W07-H and inherited canonical foundations | W08-A, W08-B |
| W08-A | W08-00 | W08-C, W08-D, W08-E |
| W08-B | W08-00 | W08-C, W08-D, W08-E |
| W08-C | W08-A + W08-B | W08-F |
| W08-D | W08-A + W08-B | W08-F |
| W08-E | W08-A + W08-B | W08-F |
| W08-F | W08-C + W08-D + W08-E | W08-G |
| W08-G | W08-F | W08 foundation acceptance / downstream W11-W13 provider consumption |

## Downstream dependency map

- W11 requires W08-G provider foundation for Instagram/Meta social read/write/readback composition.
- W12 requires W08-G provider foundation for Meta Ads operations and provider observations.
- W13 requires W08-G provider foundation for Google Ads operations and provider observations.
- W09 may coexist with W08 but owns the governed workflow bridge, not provider adapters.
- W14/W15 consume generic execution semantics but do not depend on provider-specific W08 runtime to define Device Runtime.
- W17/W18 consume evidence/telemetry/eval inputs from provider activity only through their own owner-wave contracts.

## Build promotion rules

1. `BUILD_READY` is not `ACCEPTED`.
2. A child task cannot begin canonical BUILD until every graph dependency is accepted on live main and its expected inputs are reconciled against actual accepted contracts.
3. PREBUILD/readiness artifacts are non-authoritative and cannot satisfy dependencies.
4. If live main changes after a candidate's exact-head gates, revalidate mergeability/scope and rerun any stale gate required by governance.
5. No descendant may use a candidate branch or unmerged PR as canonical dependency authority.

## Current freeze conclusion

At the W08-00 candidate base, W08-A and W08-B remain blocked until this coordination/freeze is independently accepted and merged. W08-C/D/E/F/G remain gated by the table above.