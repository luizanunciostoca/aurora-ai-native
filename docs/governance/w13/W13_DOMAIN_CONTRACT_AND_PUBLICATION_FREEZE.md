# W13 — Domain Contract and Publication Freeze

Status: `CANDIDATE_COORDINATION_FREEZE_W13_00`
Task: `W13-00`
Issue: `#113`

## Domain scope

W13 may define Google Ads business-domain contracts for Search campaigns, Performance Max, Display, YouTube assets, keywords/negatives, bids/targets, conversion prerequisites, budgets, schedules, provider observations and optimization candidates.

Domain contracts are provider-aware but authority-neutral. They must not contain credentials or executable permission.

## Required account and financial binding

Any W13 operation that can influence an external resource must preserve an explicit binding to:

- Aurora tenant;
- accepted W08 Google Ads provider binding;
- target customer CID;
- manager/MCC context when applicable;
- provider resource references separately from Aurora IDs;
- correlation and idempotency context;
- account currency and timezone when relevant;
- budget/spend/bid scope and time horizon for financial actions;
- current approval/authority requirements;
- expected provider state and required conversion/resource prerequisites.

Wrong customer, wrong manager hierarchy, ambiguous binding, stale account verification, missing financial scope or incompatible provider state fails closed.

## Read/write separation

Account verification, credential availability, quota status, provider health and successful reads do not imply write authority. W13-B owns account/read composition but performs no business mutation.

W13-E may compose governed writes only after W13-B, W13-C, W13-D and W13-F are accepted, and only through W07 plus the exact accepted W08 Google Ads transport.

## Paused-first and activation freeze

Where Google Ads resource semantics permit it, creation uses paused/non-serving state before any activation-sensitive action. Activation/enabling is a separate action requiring fresh current authority and exact financial/account scope.

The following are prohibited:

- implicit create-and-enable operations;
- treating account verification or successful paused creation as activation permission;
- allowing optimization confidence to widen bids, budgets, targets or serving state;
- retrying ambiguous/partial provider mutations without reconciliation;
- using staging/test bindings that can silently create billable resources.

## Channel-specific safety

- Search/keywords: match types, negatives, bid/target strategy and conversion prerequisites must be explicit before financial execution.
- PMax: asset-group/resource partial success must be represented rather than flattened to success.
- Display/YouTube: channel asset requirements and serving constraints must be validated before mutation.
- Conversions: stale or missing conversion configuration blocks plans that depend on it; a conversion ID alone is not proof of suitability.

## Uncertainty, partial mutation and readback

Provider timeout, connection loss, quota interruption or partial resource creation after mutation begins must preserve `EXECUTION_UNCERTAIN` or an explicit partial state from the owning executor/provider semantics. Readback/reconciliation determines external truth before retry eligibility. W13 cannot grant retry from local failure alone.

## Measurement boundary

Performance/conversion data carries account scope, freshness and provenance. W13-G may generate recommendations, but metrics or recommendations cannot authorize bid/budget/target/activation changes.

## Publication barriers

- W13-00 acceptance releases W13-A only.
- W13-A acceptance may release W13-B, W13-C, W13-D and W13-F according to live graph state.
- W13-E remains blocked until W13-B, W13-C, W13-D and W13-F are accepted.
- W13-G remains blocked until W13-B and W13-F are accepted.
- No external Google Ads mutation is production-publishable merely because W13-00 is accepted.
- Downstream consumers must bind to exact accepted W13 task outputs, not PREBUILD notes or open PRs.

## Provenance and secret boundary

TOCA Google Ads references require semantic re-specification with provenance/source SHA. Governance evidence may carry opaque account/resource references but must exclude developer tokens, OAuth secrets, refresh tokens, raw credentials, private provider payloads and hidden model reasoning.