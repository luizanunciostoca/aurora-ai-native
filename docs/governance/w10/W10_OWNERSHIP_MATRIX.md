# W10 — Ownership Matrix

Status: `CANDIDATE_FREEZE_W10_00`

## W10-owned semantic leaves

W10 may own, after W10-00 acceptance releases descendants:

- lead/customer/conversation/opportunity domain lifecycle and transition semantics;
- qualification and scoring domain logic;
- CRM domain persistence models and read-model projections built on W03 foundations;
- nurture/sales/customer-success domain controllers and domain task generation;
- next-best-action candidate generation and domain rationale/provenance;
- W10-specific deterministic/cache/template compositions over accepted W04-W06 surfaces;
- W10 integration/eval fixtures and business-result evidence preparation.

## Not owned by W10

| Concern | Canonical owner |
| --- | --- |
| identity, tenant, correlation, classification primitives | W01 |
| policy, consent/purpose/jurisdiction, current authority | W02 |
| generic event durability, idempotency, replay, outbox/inbox, workflow foundations | W03 |
| Capability Registry, CapabilityPlan, lane/budget/template truth | W04 |
| intelligence classification/reasoning/confidence/strategy/router truth | W05 |
| context retrieval/trust/freshness/minimization/cache/snapshot truth | W06 |
| generic executor/side-effect safety/current-authority integration | W07 |
| provider adapters, credentials, provider-specific transport | W08 |
| n8n workflow binding/bridge truth | W09 |
| social/content/marketing business automation | W11 |
| production observability/SLO/evidence infrastructure | W17 |
| adaptive learned promotion | W18 |

## Shared/publication surface lock

The following remain Program Control-owned unless a later accepted W10 node receives an explicit compatibility-safe publication grant:

- root/package public barrels and manifests;
- `packages/contracts/**` and `packages/schemas/**` shared/public evolution;
- `docs/governance/CURRENT_PROGRAM_STATUS.md`;
- cross-wave dependency/publication registries;
- changes that redefine W01-W09 accepted semantics.

A W10 leaf must not widen scope merely because a shared type is convenient. Prefer an owned internal type/composition when compatible; if a public contract is genuinely required, stop that leaf at the publication barrier for Program Control reconciliation.

## Domain namespace guard

W10 may define domain-specific identifiers only when W10-A proves they are necessary and they must remain domain identifiers, not replacements for canonical `TenantId`, actor/subject refs, correlation IDs or provider IDs. No `UserId`, `IdentityId`, `TenantId`, `AccountId` or execution-target taxonomy may be reinvented under W10.

## Authority guard

No W10-owned object—lead score, opportunity stage, customer tier, conversation state, NBA candidate, template match, cached decision, model confidence or business outcome—may implement or imply `OwnerDecision`, `PolicyToken`, provider credential, current authority or permission to execute.
