# W10 — Revenue / CRM Domain Wave Charter

Status: `CANDIDATE_COORDINATION_FREEZE_W10_00`
Task: `W10-00`
Issue: `#110`
Exact BUILD base: `5715ffa4e9d4cd628c1f6d4d6e7a3410ea3d5324`

## Authority and dependency proof

W10-00 is a governance-only coordination node. Live `main`, accepted exact-SHA/PR evidence, `CURRENT_PROGRAM_STATUS.md`, Developer Manual v0.5, accepted ADRs and canonical Drive governance remain superior authority.

The graph prerequisites for W10-00 are satisfied on the exact base used here:

- W05-H is accepted and W05 is complete; accepted merge anchor `8deb67875ba6f3fecd7494f7cc955d5965543e3a`.
- W07-H is accepted and W07 is complete; accepted merge anchor `3bf15c8d09e01be68bc5a4de1cd04defcb8b5025`.
- W08 is not a graph prerequisite for this coordination freeze. Any descendant that actually needs provider-specific transport or credentials must wait for the required accepted W08 provider surface; an open W08 PR is not dependency truth.

## Mission

Freeze the Revenue/CRM domain boundary before runtime work begins: lead/customer/conversation/opportunity lifecycle, qualification/scoring, CRM persistence/read models, nurture/sales/customer-success flows, next-best-action planning and bounded deterministic/cache/template fast paths.

The wave must maximize useful automation without allowing domain scores, AI reasoning, UI state, CRM state, cached facts or workflow state to become authority.

## Canonical DAG

`W10-00 -> W10-A`

`W10-A -> (W10-B || W10-C)`

`W10-B + W10-C -> (W10-D || W10-E || W10-F)`

`W10-D + W10-E + W10-F -> W10-G`

No descendant is released by this candidate PR. W10-00 must first be independently accepted and merged.

## Cross-wave boundaries

- W01 owns canonical identity/tenant/correlation/classification primitives. W10 must not create parallel identity or tenant truth.
- W02 owns policy, consent/purpose/jurisdiction and current authority evaluation. CRM state or score never grants permission.
- W03 owns durable events, idempotency, replay and generic workflow/persistence foundations. W10 may own domain persistence/read models, not a second durability framework.
- W04 owns Objective/Goal/Task lifecycle, Capability Registry, CapabilityPlan, lanes, budgets and curated templates.
- W05 owns intelligence classification, reasoning, confidence, strategy and routing. W10 may consume them for domain decisions but cannot reinterpret confidence as authority.
- W06 owns context retrieval/trust/freshness/cache/snapshot semantics. Any W10 node depending on a W06 surface must require that exact surface to be accepted first.
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

Acceptance requires same-exact-HEAD Quality, Test Build and Security; cleanup/source-of-truth/scope audit; Risk Gates A-D; independent Program Control acceptance; live-main revalidation immediately before merge; controlled merge; and post-merge exact-main verification.
