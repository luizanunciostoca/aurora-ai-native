# W10 — Revenue / CRM Domain Wave Charter

Status: `CANDIDATE_COORDINATION_FREEZE_W10_00_RECONCILED`
Task: `W10-00`
Issue: `#110`
Reconciled main snapshot: `76aaa67a1f4f8f74b53c3340638c3b579a6c86e3`
Historical candidate base: `5715ffa4e9d4cd628c1f6d4d6e7a3410ea3d5324`

## Authority and dependency proof

W10-00 is a governance-only coordination node. Live `main`, accepted exact-SHA/PR evidence, `CURRENT_PROGRAM_STATUS.md`, Developer Manual v0.5, accepted ADRs and canonical Drive governance remain superior authority.

The graph prerequisites for W10-00 remain satisfied on the reconciled main snapshot:

- W05-H is accepted and W05 is complete; accepted merge anchor `8deb67875ba6f3fecd7494f7cc955d5965543e3a`.
- W07-H is accepted and W07 is complete; accepted merge anchor `3bf15c8d09e01be68bc5a4de1cd04defcb8b5025`.
- W06 dependencies are consumed only from exact accepted surfaces present on canonical main; no open PR or readiness artifact is authority.
- W08-A/W08-B acceptance establishes provider foundation and credential-reference boundaries, but descendant provider-specific writes still wait for the exact required accepted W08 target adapter and remain below W07.

## Mission

Freeze the Revenue/CRM domain boundary before runtime work begins: lead/customer/conversation/opportunity lifecycle, qualification/scoring, CRM persistence/read models, nurture/sales/customer-success flows, next-best-action planning and bounded deterministic/cache/template fast paths.

The wave must maximize useful automation without allowing domain scores, AI reasoning, UI state, CRM state, cached facts or workflow state to become authority.

## Canonical DAG

`W10-00 -> W10-A`

`W10-A -> (W10-B || W10-C)`

`W10-B + W10-C -> (W10-D || W10-E || W10-F)`

`W10-D + W10-E + W10-F -> W10-G`

No descendant is released by this candidate PR. W10-00 must first satisfy the current Single-Owner Governed Acceptance lifecycle and post-merge verification.

## Cross-wave boundaries

- W01 owns canonical identity/tenant/correlation/classification primitives. W10 must not create parallel identity or tenant truth.
- W02 owns policy, consent/purpose/jurisdiction and current authority evaluation. CRM state or score never grants permission.
- W03 owns durable events, idempotency, replay and generic workflow/persistence foundations. W10 may own domain persistence/read models, not a second durability framework.
- W04 owns Objective/Goal/Task lifecycle, Capability Registry, CapabilityPlan, lanes, budgets and curated templates.
- W05 owns intelligence classification, reasoning, confidence, strategy and routing. W10 may consume them for domain decisions but cannot reinterpret confidence as authority.
- W06 owns context retrieval/trust/freshness/minimization/cache/snapshot semantics. W10 descendants consume only exact accepted W06 surfaces.
- W07 owns generic deterministic side-effect safety and current-authority validation.
- W08 owns provider-specific adapters, credentials and transport. W10 owns business intent, never provider transport.
- W09 owns governed n8n workflow bindings/bridge; n8n state is never CRM or action authority.
- W11 owns social/content business automation and consumes accepted W10 handoff surfaces.
- W17 owns production telemetry/SLO claims; W18 owns learned promotion.

## Non-negotiable invariants

1. `Score != Confidence != Authority != Execution`.
2. CRM read models are projections, not permission.
3. Next-best-action output is a candidate/planning artifact, not executable authority.
4. External messages, spend, destructive updates or provider writes remain below W07 and the required W08 target adapter.
5. Current consent/purpose/jurisdiction/policy must be revalidated at the execution boundary; cached or historical consent is not authority.
6. Duplicate outreach must fail safe through domain idempotency keys plus W03/W07 guarantees.
7. Ambiguous provider outcome preserves `EXECUTION_UNCERTAIN` semantics and reconcile-before-retry.
8. Tenant and subject isolation is explicit in every persisted or projected domain record.
9. Business-result evidence may guide W18 later but cannot self-promote runtime behavior in W10.

## W10-00 acceptance scope

This node may create governance only under `docs/governance/w10/**`. It must not create runtime contracts, schemas, services, provider bindings, secrets, external writes, W11 logic or authority semantics.

Acceptance follows the current Single-Owner Governed Acceptance lifecycle: same-exact-HEAD Quality, Test Build and Security; cleanup/source-of-truth/scope audit; Risk Gates A-D; exact live-main revalidation immediately before protected expected-head merge; then post-merge exact-main Quality/Test Build/Security before `aurora:accepted` and descendant release.