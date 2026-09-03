# W13 — Google Ads Domain Wave Charter

Status: `CANDIDATE_COORDINATION_FREEZE_W13_00`
Task: `W13-00`
Issue: `#113`
Exact base snapshot: `afbeff058d14c8cc18a0ac2b9d34c6c5f9549857`

## Authority and dependency proof

W13-00 is a governance-only coordination node. Live `main`, accepted exact-SHA/PR evidence, canonical program status, Developer Manual v0.5, accepted ADRs and owning governance remain superior authority.

The live graph prerequisites are satisfied on the exact base snapshot:

- W05-H `#138` is closed `aurora:accepted`.
- W06-H `#245` is closed `aurora:accepted`.
- W08-G `#259` is closed `aurora:accepted`.

## Mission

Freeze the Google Ads domain boundary for Search, Performance Max, Display, YouTube assets, keywords, negatives, bids/targets, conversions, budgets, account hierarchy, measurement and optimization support.

TOCA Google Ads references may be semantically re-specified with provenance. They are reference input, not authority. The audited n8n corpus has no real Google Ads/AdWords workflow coverage and must not be used to infer capabilities.

## Canonical task graph

`W13-00 -> W13-A`

`W13-A -> (W13-B || W13-C || W13-D || W13-F)`

`W13-B + W13-C + W13-D + W13-F -> W13-E`

`W13-B + W13-F -> W13-G`

There is no invented dependency edge between W13-E and W13-G. W13-00 acceptance releases W13-A only.

## Cross-wave boundaries

- W01 owns canonical tenant, identity, correlation and classification primitives.
- W02 owns current policy, approval and authority evaluation.
- W03 owns durable event, replay and idempotency foundations.
- W04 owns target-neutral capability, budget and execution-planning control semantics.
- W05 owns reasoning, confidence, routing and strategy.
- W06 owns context trust, freshness, provenance, minimization and cache/snapshot semantics.
- W07 owns generic side-effect execution safety, uncertainty, retry eligibility and reconciliation.
- W08 owns Google Ads credential references, provider transport, account verification/binding, health/rate-limit behavior and readback.
- W13 owns Google Ads business intent, channel-specific planning, financial-governance composition, domain commands, analytics and optimization recommendations.
- W17 owns production telemetry/SLO claims and W18 owns learned promotion.

## Non-negotiable invariants

1. `Account verification != Approval != Authority != Execution`.
2. Every financial mutation binds the exact Aurora tenant, Google Ads customer CID, applicable manager/MCC context, currency, budget/spend scope and time horizon.
3. Customer, campaign, asset-group, keyword and conversion IDs remain provider references, not Aurora canonical identity.
4. Plans and recommendations cannot carry credentials or executable permission.
5. Creation uses paused/non-serving posture where provider semantics permit; activation is a distinct higher-risk action.
6. Budget/bid/target expansion requires current authority and cannot be inferred from model confidence or optimization output.
7. Ambiguous or partial external mutation preserves `EXECUTION_UNCERTAIN` and requires readback/reconciliation before retry.
8. Wrong CID/MCC hierarchy, ambiguous customer binding or stale conversion prerequisites fail closed.
9. Quota/rate-limit handling must not create duplicate mutations.
10. n8n absence cannot be filled by invented Google Ads workflow coverage.
11. Test/staging paths must not create real billable resources.
12. W13 must not duplicate W08 provider transport, W07 executor, W02 authority or W04 budget/capability truth.

## W13-00 acceptance scope

This node may create governance only under `docs/governance/w13/**`. It must not create runtime contracts, credentials, provider calls, campaigns, assets, keyword/conversion mutations, bid/budget changes or activation side effects.

Acceptance requires same-exact-HEAD Quality, Test Build and Security; cleanup/source-of-truth/scope audit; Risk Gates A-D; zero blocking review threads; live-main revalidation; expected-head merge; then post-merge exact-main Quality/Test Build/Security before `#113` may receive `aurora:accepted` and release W13-A.