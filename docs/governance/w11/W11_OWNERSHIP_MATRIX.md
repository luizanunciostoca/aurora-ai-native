# W11 Ownership Matrix

| Surface | Canonical owner | W11 authority |
| --- | --- | --- |
| Publication/comment/DM domain intent | W11 | Define and validate domain plans only |
| Sensitive moderation / response planning | W11 | Produce governed candidates; never self-send |
| Verified FAQ fast path | W11 + W06 context | Return facts/candidates with freshness/provenance; no write authority |
| Lead handoff | W11 → W10 | Create idempotent handoff; W10 owns CRM lifecycle |
| Generic execution, approval, retry/reconciliation semantics | W07 | None; consume accepted contracts only |
| Instagram/Meta transport, credentials, account binding, provider readback | W08 | None; compose through W07/W08 only |
| CRM/customer/conversation canonical state | W10 | None; reference/handoff only |
| Social/community analytics | W11 | Read-model/decision support only |

## Single-owner rule

Each W11 child lane has one isolated branch and one canonical PR. Shared/root/provider/executor surfaces are frozen unless Program Control explicitly grants them after dependency reconciliation. A competing owner or PR blocks BUILD until reconciled.
