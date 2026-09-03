# W13 — Ownership Matrix

Status: `CANDIDATE_COORDINATION_FREEZE_W13_00`
Task: `W13-00`
Issue: `#113`

## W13-owned semantics

W13 owns the Google Ads business-domain layer only:

- provider-aware business intents for Search, PMax, Display and YouTube resources;
- keyword, negative, bid/target and conversion planning;
- asset/asset-group planning and provider-constraint composition;
- financial-impact classification and financial-governance composition;
- paused-first domain command semantics over accepted executor/provider surfaces;
- Google Ads analytics/measurement projections and optimization recommendations;
- W13-specific tests, evidence and governance.

## Platform ownership

- W01 owns canonical tenant, identity, correlation and classification primitives.
- W02 owns current policy, approval and authority truth.
- W03 owns generic durability, replay and idempotency infrastructure.
- W04 owns target-neutral capabilities, plans, budgets and control metadata.
- W05 owns reasoning, routing, strategy and confidence semantics.
- W06 owns context trust, freshness, provenance, minimization, snapshots and cache semantics.
- W07 owns generic execution gates, side-effect safety, uncertainty, retry eligibility, reconciliation and receipts.
- W08 owns Google Ads credential references, API/provider transport, account verifier/binding, health, rate-limit behavior and readback.
- W17 owns production telemetry/SLO claims. W18 owns learned promotion.

W13 cannot duplicate any of those sources of truth.

## W13 internal ownership

- W13-A: domain contracts and capability plans.
- W13-B: account verifier/binding/read composition over W08.
- W13-C: Search, keyword and conversion planning.
- W13-D: PMax, Display and YouTube asset planning.
- W13-E: paused-first domain commands over W07/W08.
- W13-F: financial-governance composition over W02/W04/W07.
- W13-G: analytics and optimization decision support.

Shared/root publication surfaces remain Program Control-owned unless explicitly released by a task.

## Provider identity boundary

Google Ads customer CID, manager/MCC ID, campaign ID, ad-group ID, asset/asset-group ID, keyword criterion ID and conversion-action ID are external provider references. They must remain separately mapped through accepted provider/account binding semantics and cannot replace Aurora canonical tenant/entity identity.

Hierarchy verification is a precondition, not permission. A valid customer under a valid manager account does not authorize a mutation.

## Reference-source boundary

TOCA Google Ads client/account-verifier and paid-media artifacts may be reused only through semantic re-specification with recorded provenance/source SHA and current Aurora contracts. They are not copied as authority.

The audited n8n corpus provides no real Google Ads/AdWords workflow coverage. W13 must not invent a workflow bridge, hidden provider support or capability claim from corpus absence.

## Prohibited ownership drift

W13 must not own or duplicate:

- Google credentials, refresh tokens, developer tokens or raw secret material;
- provider API client/transport already owned by W08;
- generic retry/readback/reconciliation owned by W07/W08;
- PolicyToken/OwnerDecision/current approval truth from W02;
- generic budget/capability registry truth from W04;
- canonical identity from W01;
- n8n workflow state as Google Ads or action authority;
- production learning promotion owned by W18.

Any cross-boundary implementation requires explicit Program Control reconciliation before canonical BUILD or acceptance.