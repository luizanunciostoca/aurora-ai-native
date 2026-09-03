# W11 Domain Contract and Social Write Freeze

## Domain outputs

W11 may emit domain intents and evidence for publication scheduling, community routing, verified-fact responses, moderation/escalation, lead handoff and analytics. Every output carries tenant/account/provider references, correlation/evidence identity and idempotency information appropriate to the child lane.

## Absolute write boundary

W11 domain logic does not call Instagram/Meta providers directly and does not mint execution authority. Publication, comment reply, DM send, hide/delete, cancellation or other provider mutation must flow through accepted W07 execution governance and accepted W08 provider bindings/readback.

The following are never sufficient to authorize a write: model confidence, FAQ/template match, analytics score, campaign/business priority, provider observation, cached state, agent recommendation, or a W11 domain plan alone.

## Safe staging

Acceptance tests use mocks/staging and deterministic fixtures. Real production side effects are prohibited unless a later, explicit production-stage governance artifact authorizes them.

## Ambiguous outcome rule

Timeout or unknown provider outcome is `EXECUTION_UNCERTAIN`. The system reconciles provider state through W07/W08 before any retry; it must not blindly repeat the external write.

## Sensitive response rule

Safety/legal/refund/complaint or otherwise sensitive paths produce candidates/escalations only. Confidence cannot bypass policy, consent, approval, human escalation requirements or account/tenant binding.
