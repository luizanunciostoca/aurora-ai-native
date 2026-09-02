# W10 — Domain Contract & Publication Freeze

Status: `CANDIDATE_FREEZE_W10_00`

This document freezes semantics only. It does not publish runtime contracts or schemas.

## Domain concepts

W10 may model four primary business aggregates/concepts after W10-00 acceptance:

- **Lead** — a prospect state derived from attributable source facts and interactions.
- **Customer** — a domain relationship/state; never a replacement for canonical identity/subject primitives.
- **Conversation** — a domain interaction thread/read model with channel/provider references and provenance.
- **Opportunity** — an optional sales-domain aggregate for qualification/stage/value hypotheses where required by W10 consumers.

Any new domain identifier must be introduced only by the owning implementation node, remain tenant-scoped and provenance-linked, and must not duplicate W01 identity/tenant or W08 provider identifiers.

## Lifecycle freeze

W10-A must define explicit, deterministic, testable transitions. Silent stage inference is prohibited for state changes that have business consequences. Merge/reopen/close/deduplicate operations must preserve provenance and correlation.

Material lifecycle changes must emit W03-compatible domain events. Event presence is evidence of a transition attempt/result, not authority for external action.

## Qualification/scoring freeze

W10-B scores are informational domain outputs with explicit feature/source provenance and recalculation semantics. Score, confidence, customer tier, opportunity value and predicted conversion probability cannot authorize outreach, spend, data disclosure or destructive mutation.

Model-assisted scoring must preserve deterministic input boundaries and explicit uncertainty. Low confidence, conflicting evidence or stale material facts must produce verify/escalate/abstain behavior rather than fabricated certainty.

## Persistence/read-model freeze

W10-C owns domain persistence/read models only. It must consume W03 durability/idempotency/replay foundations and support optimistic/version checks, rebuild/replay and tenant isolation. Read-model lag/currentness must be explicit when material to decisions.

A CRM read model may summarize accepted domain state; it must not freeze current policy/consent/authority into reusable executable permission.

## Nurture/sales/customer-success freeze

W10-D owns business flow state machines and domain task generation. Known-safe planning steps may use deterministic templates/workflows. Any external message/action remains a governed execution request requiring current W02/W07 validation and, when provider-specific, an accepted W08 adapter.

Cadence, retries and contact deduplication must be bounded. Opt-out/consent changes must invalidate pending outreach as appropriate. Ambiguous dispatch outcomes preserve `EXECUTION_UNCERTAIN` and require reconciliation before retry.

## Next-best-action freeze

W10-E may produce ranked/categorized candidate actions from verified CRM/context facts using accepted W04/W05 and, where required, accepted W06 surfaces. Every result must carry enough provenance/reasons to audit why it was proposed and must remain non-authoritative.

An NBA candidate is not an `ActionIntent`, not an approval, and not permission. Insufficient/conflicting/stale evidence must permit abstain/escalate.

## Fast-path freeze

W10-F may compose deterministic/cache/template fast paths only over accepted upstream semantics. Cache/template hits cannot bypass current policy/authority or W07 execution. Freshness, template version and invalidation must be explicit. High-value, conflict-heavy, stale or uncertain cases must escalate rather than force a fast path.

## W11 publication barrier

No W11 consumer may treat W10 governance, open PRs, PREBUILD artifacts or intermediate W10 nodes as a stable public domain surface.

The W10 -> W11 barrier opens only after W10-G is independently accepted and merged with:

1. lifecycle + persistence/read-model compatibility evidence;
2. qualification/NBA invariants proving zero authority elevation;
3. governed-execution integration scenarios including consent changes, duplicates and provider uncertainty;
4. business-outcome evidence definitions suitable for W17/W18 without claiming production SLOs or adaptive promotion;
5. exact-head Quality/Test Build/Security and Risk Gates A-D;
6. controlled publication of any shared contracts required by W11.
