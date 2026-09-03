# W12 — Ownership Matrix

Status: `CANDIDATE_COORDINATION_FREEZE_W12_00`
Task: `W12-00`
Issue: `#112`

## W12-owned semantics

W12 owns the Meta Ads business-domain layer only:

- Meta campaign, ad set, ad, audience and creative business intents;
- domain planning and target constraints;
- financial-impact classification and financial-governance composition;
- paused-first business posture;
- Meta performance/measurement read models as domain projections;
- optimization recommendations and abstain/human-review outcomes;
- W12-specific tests, evidence and governance.

W12 does not own generic authority, provider transport, credentials, durable infrastructure or canonical identity.

## Upstream and platform ownership

### W01 — Identity and tenancy

Owns canonical tenant, identity, correlation and classification primitives. Meta Business Manager, ad-account, campaign, ad-set, ad, audience and creative IDs remain provider references.

### W02 — Policy, consent, approval and authority

Owns current policy and authority truth. W12 may express required financial constraints but cannot create or refresh permission itself.

### W03 — Durability and replay

Owns generic event durability, replay and idempotency foundations. W12 may define domain idempotency inputs but not a second durable execution framework.

### W04 — Capability and control plane

Owns target-neutral capabilities, plans, budgets and control metadata. W12 maps Meta domain intent onto accepted capabilities without redefining global capability truth.

### W05 — Intelligence

Owns reasoning, routing, confidence and strategy semantics. W12 consumes recommendations but cannot reinterpret confidence as budget or activation authority.

### W06 — Context

Owns context trust, freshness, minimization, provenance, cache and snapshot semantics.

### W07 — Executor

Owns generic deterministic side-effect safety, execution gate, uncertainty, retry eligibility, reconciliation and execution receipt semantics.

### W08 — Providers

Owns Meta provider/account binding, credential references, transport, rate-limit/health semantics, provider readback and target-specific adapter behavior. W12 must not create a second Meta API transport or credential path.

### W17 and W18

W17 owns production telemetry/SLO claims. W18 owns learned promotion. W12 evidence may be input only after accepted interfaces and may never self-promote behavior.

## W12 internal ownership

- W12-A: domain contracts and capability plans.
- W12-B: account-binding/read composition over W08.
- W12-C: creative/audience planning.
- W12-D: paused-first governed domain operations over W07/W08.
- W12-E: financial-governance composition over W02/W04/W07.
- W12-F: analytics and measurement projections.
- W12-G: optimization decision support.

These task surfaces remain exclusive to their live issue/ownership definitions. Shared or root publication surfaces remain Program Control-owned unless explicitly released.

## Prohibited ownership drift

W12 must not own or duplicate:

- access tokens, refresh tokens, app secrets or credential material;
- Meta API transport/client ownership already in W08;
- generic executor, retry or reconciliation semantics from W07;
- PolicyToken/OwnerDecision/current approval truth from W02;
- generic capability registry or execution budget truth from W04;
- canonical identity from W01;
- provider external IDs as Aurora canonical entity IDs;
- n8n workflow state as business or execution authority.

Any implementation that crosses one of these fences requires explicit Program Control reconciliation before it can be a canonical candidate.