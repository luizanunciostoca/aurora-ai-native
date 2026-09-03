# W08 — Dependency Matrix

Status: `W08_00_RECONCILED_BUILD_CANDIDATE / DAG_FROZEN`
Date: 2026-09-02
Base exact main at branch creation: `5d7feaeb095c35c748fe7ec17ae9d1d39b3cfbcc`
Supersedes historical candidate: PR `#236` / HEAD `1fb765cd82a40f3a07522614b9b60c6be846e4b0`

## Upstream dependencies

| Upstream | Required contract/behavior | W08 rule |
| --- | --- | --- |
| W01 | canonical IDs, tenant/correlation/context/versioning families | consume; never create provider-derived Aurora IDs |
| W02 | current Policy/Authority validation | W08 never authorizes; writes remain below W07 current validation |
| W03 | durable event/idempotency/replay foundations | compose through W07; no second idempotency/event ledger |
| W04 | Capability Registry and target-neutral CapabilityPlan | consume and bind; no second capability registry |
| W07 | `PROVIDER` execution target, generic executor, receipts/readback/reconciliation/fault containment | mandatory write boundary; no provider bypass |
| Device-plane ownership | provider/device separation and W14/W15 ownership | provider is never device; W08 owns no Android runtime |

W07-H issue `#140` is closed `aurora:accepted` on live main and therefore satisfies the graph dependency for W08-00. Earlier accepted W01-W04 foundations remain inherited dependencies rather than permission to reinterpret their semantics.

W06 is complete through H on live main. W08 does not depend on W06 for its own release and must not fork W06 context/cache truth if later consumers compose both foundations.

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

- W11 requires W08-G for Instagram/Meta social read/write/readback composition and also retains its separate W10 dependency.
- W12 requires W08-G for Meta Ads provider operations and observations; accepted W06-H alone does not release W12.
- W13 requires W08-G for Google Ads provider operations and observations; accepted W06-H alone does not release W13.
- W09 may coexist with W08 but owns the governed workflow bridge, never provider adapters.
- W14/W15 own gateway/device runtime and do not acquire provider-specific ownership through W08.
- W17/W18 may consume provider evidence/telemetry only through their own accepted contracts and may not retroactively redefine W08 behavior.

## Build promotion rules

1. `BUILD_READY` is not `ACCEPTED`.
2. A child task cannot begin canonical BUILD until every graph dependency is `aurora:accepted` on live main and expected inputs are reconciled against the accepted contracts.
3. PREBUILD/readiness artifacts are non-authoritative and cannot satisfy dependencies.
4. No candidate branch or unmerged PR may be used as dependency authority.
5. If main or candidate HEAD moves after gates, stale evidence is invalidated and the candidate must be revalidated.
6. Merge uses the exact final HEAD and fails closed on drift; downstream release waits for post-merge exact-main Quality + Test Build + Security.

## Current reconciled conclusion

W08-00 is BUILD_READY because W07-H is accepted. W08-A and W08-B remain blocked until W08-00 itself reaches `aurora:accepted` on live main. W08-C/D/E/F/G remain gated by the DAG above.
