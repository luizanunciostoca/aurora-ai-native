# W12 — Meta Ads Domain Wave Charter

Status: `CANDIDATE_COORDINATION_FREEZE_W12_00`
Task: `W12-00`
Issue: `#112`
Exact base snapshot: `afbeff058d14c8cc18a0ac2b9d34c6c5f9549857`

## Authority and dependency proof

W12-00 is a governance-only coordination node. Live `main`, accepted exact-SHA/PR evidence, the canonical program status, Developer Manual v0.5, accepted ADRs and owning governance remain superior authority.

The live graph prerequisites for W12-00 are satisfied on the exact base snapshot:

- W05-H `#138` is closed `aurora:accepted`.
- W06-H `#245` is closed `aurora:accepted`.
- W08-G `#259` is closed `aurora:accepted`.

This candidate does not convert those upstream components into W12 authority. It only freezes how W12 may consume their accepted surfaces.

## Mission

Freeze the Meta Ads business-domain boundary before W12 runtime work begins: campaign, ad set, ad, creative, audience, budget, bid, placement, conversion, measurement and optimization semantics with explicit financial-impact classification and paused-first execution posture.

W12 may automate planning and governed operations, but no model score, provider health signal, account verification, cached fact, analytics metric, optimization recommendation or UI state may become action authority.

## Canonical task graph

`W12-00 -> W12-A`

`W12-A -> (W12-B || W12-C || W12-E || W12-F)`

`W12-B + W12-C + W12-E -> W12-D`

`W12-F -> W12-G`

There is no invented dependency edge between W12-D and W12-G. Each descendant must satisfy its live issue graph and exact accepted prerequisites. W12-00 acceptance releases W12-A only.

## Cross-wave boundaries

- W01 owns canonical tenant, identity, correlation and classification primitives.
- W02 owns current policy, consent, approval and authority evaluation. Financial scope must be revalidated at execution time.
- W03 owns durable events, idempotency and replay foundations.
- W04 owns target-neutral capability, budget and execution-planning control semantics.
- W05 owns reasoning, confidence, routing and recommendation intelligence. Confidence never widens spend authority.
- W06 owns context trust, freshness, minimization, cache and snapshot semantics.
- W07 owns generic side-effect execution safety, uncertainty and reconcile-before-retry semantics.
- W08 owns Meta provider/account bindings, credential references, transport, health, rate-limit behavior and provider readback.
- W12 owns Meta Ads business intent, domain planning, financial-risk composition, analytics interpretation and optimization decision support.
- W17 owns production telemetry/SLO claims. W18 owns learned promotion and may consume W12 evidence only through accepted boundaries.

## Non-negotiable invariants

1. `Recommendation != Approval != Authority != Execution`.
2. Every financially impactful intent binds the exact Aurora tenant, Meta business/ad-account reference, currency, budget/spend scope and time horizon before execution.
3. Meta external IDs remain provider references and never become canonical Aurora entity identity.
4. Provider credential possession, account verification or API health is a precondition signal only, never permission.
5. Creation defaults to paused/non-serving staging where provider semantics support it.
6. Activation or unpause is a distinct higher-risk action and is never implied by creation.
7. Budget, bid or spend escalation cannot be inferred from confidence, optimization score or historical performance.
8. Ambiguous external mutation preserves `EXECUTION_UNCERTAIN`; readback/reconciliation is mandatory before retry.
9. Blind mutation retry is prohibited.
10. Secrets, access tokens, raw credentials and private provider payloads are prohibited from governance evidence and domain plans.
11. Test/staging paths must not cause a real billable side effect.
12. W12 must not create a second Meta API client, secret store, Policy Engine or generic executor.

## W12-00 acceptance scope

This node may create governance only under `docs/governance/w12/**`. It must not create runtime contracts, provider calls, credentials, campaign resources, budget mutations, activation actions or external side effects.

Acceptance requires same-exact-HEAD Quality, Test Build and Security; cleanup/source-of-truth/scope audit; Risk Gates A-D; zero blocking review threads; immediate live-main revalidation; expected-head merge; and post-merge exact-main Quality/Test Build/Security before `#112` may receive `aurora:accepted` and release W12-A.