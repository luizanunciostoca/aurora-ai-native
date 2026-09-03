# W11 Risk Register and Premortem

| Risk | Failure mode | Required control |
| --- | --- | --- |
| Duplicate publication/reply | timeout or replay causes a second side effect | stable idempotency + W07/W08 reconciliation before retry |
| Wrong account / tenant | valid content sent through wrong binding | explicit tenant/account/provider binding; fail closed on mismatch |
| Harmful or sensitive reply | confidence-driven automation bypasses escalation | governed candidate only; policy/approval/human escalation preserved |
| Consent / lead leakage | social identity becomes CRM lead outside purpose | provenance, consent/purpose propagation, W10 idempotent handoff |
| Stale FAQ | cached/template answer contradicts current source | freshness/provenance checks and escalation on conflict/staleness |
| Ambiguous provider state | system cannot know whether mutation committed | `EXECUTION_UNCERTAIN`, readback and reconciliation; no blind retry |
| Prompt injection from inbound content | message attempts to execute tools or alter policy | treat inbound content as data; no direct side effect or authority |
| Analytics becomes authority | KPI/recommendation triggers mutation directly | analytics remain read-only decision support |

## Premortem acceptance

Acceptance must include adverse-path evidence for replay, wrong binding, stale/partial state, provider failure/rate-limit, sensitive content and no-real-side-effect staging. Any unresolved authority or provider ambiguity fails closed.
