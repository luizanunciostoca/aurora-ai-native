# W12 — Domain Contract and Publication Freeze

Status: `CANDIDATE_COORDINATION_FREEZE_W12_00`
Task: `W12-00`
Issue: `#112`

## Domain scope

W12 may define business-domain contracts for Meta Ads resources and observations including campaign, ad set, ad, creative, audience, placement, budget, bid, conversion/measurement references, delivery state, provider metrics and optimization candidates.

These contracts are provider-aware business semantics. They are not provider transport contracts and do not carry credentials or executable permission.

## Required binding envelope

Any W12 operation that can influence an external Meta resource must preserve an explicit binding to:

- Aurora tenant;
- W08 Meta provider binding;
- Meta Business Manager/ad-account scope as applicable;
- provider external resource references without rebranding them as Aurora IDs;
- correlation and idempotency context;
- currency and financial unit where spend is relevant;
- budget/spend amount or ceiling and time horizon where relevant;
- current approval/authority requirements;
- expected provider state/preconditions where relevant.

Wrong tenant, ambiguous account, stale binding, missing financial scope or incompatible provider state fails closed.

## Read/write separation

Read capability, account verification, credential resolution and provider health do not imply write capability. Planning and analytics surfaces cannot invoke direct provider writes.

W12-D may compose governed writes only after its graph dependencies are accepted and only through W07 plus the exact accepted W08 Meta adapter. No planner/router/model may call provider mutation transport directly.

## Paused-first and activation freeze

Where Meta provider semantics permit it, creation or staging of billable resources defaults to paused/non-serving state. Activation or unpause is a separate action with a fresh current-authority check and exact financial/account scope.

The following are prohibited:

- create-and-activate as an implicit single business action;
- using successful creation as authority to activate;
- using predicted performance or confidence to widen budget or activate;
- retrying an ambiguous create/update/activation without provider reconciliation;
- test/staging flows that can silently become billable production operations.

## Financial-impact classes

W12 governance recognizes at least these risk classes without replacing the canonical Risk Framework:

- read-only observation: no financial mutation;
- reversible paused/non-serving creation or metadata update: external write with bounded financial exposure only if non-serving is provider-guaranteed;
- serving-state activation/unpause: high-impact external write;
- budget, bid, targeting or schedule widening: financial-impact write requiring explicit current scope;
- deletion or destructive replacement: destructive write requiring its applicable authority and reconciliation rules.

A lower-cost or lower-latency route can never downgrade the required safety class.

## Uncertainty and readback

Any provider timeout, connection loss or ambiguous response after mutation begins must preserve `EXECUTION_UNCERTAIN`. W07/W08 readback and reconciliation determine whether the intended external state exists before retry eligibility is considered. W12 cannot grant retry based on a local timeout alone.

## Measurement boundary

Meta delivery and attribution metrics are provider observations with freshness, account scope and provenance. W12-F may normalize them and W12-G may generate recommendations, but neither measurement nor optimization output can authorize spend or serving-state change.

## Publication barriers

- W12-00 acceptance releases W12-A only.
- W12-A acceptance may release W12-B, W12-C, W12-E and W12-F according to live graph state.
- W12-D remains blocked until W12-B, W12-C and W12-E are accepted.
- W12-G remains blocked until W12-F is accepted.
- No W12 external-mutation capability is production-publishable merely because W12-00 is accepted.
- Downstream consumers must bind to exact accepted task outputs, not PREBUILD notes, open PRs or this coordination candidate.

## Secret and evidence boundary

Governance evidence may carry opaque provider/binding/resource references but must not contain access tokens, refresh tokens, app secrets, raw credentials, private provider payloads or hidden model reasoning. Evidence must remain sufficient to reconstruct what was intended, authorized, attempted and observed without leaking secret material.