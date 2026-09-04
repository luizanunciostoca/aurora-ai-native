# W12 — Meta Ads Acceptance Handoff

Status: `CANDIDATE_W12_H`
Task: `W12-H`
Issue: `#322`

This handoff is an integration/acceptance artifact. It does not grant provider, financial, retry, activation or execution authority. It becomes canonical W12 acceptance evidence only after the W12-H exact-head gates, governed merge, post-merge gates and `#322` acceptance are complete.

## Accepted owner boundaries exercised by W12-H

W12-H composes existing accepted owners rather than creating a new executor or provider stack:

- **W12-B** — Meta business/ad-account binding and read-only preconditions.
- **W12-D** — paused/non-serving create/update composition over current W07 execution proof and W08 write transport.
- **W12-E** — current authority, approval, financial ceiling, budget and mutation-bound composition for financial actions.
- **W12-F** — normalized provider observations, attribution freshness, provenance and telemetry eligibility.
- **W12-G** — optimization candidates as decision support only.
- **W07** — generic execution eligibility, uncertainty, reconciliation and retry eligibility owner.
- **W08** — provider binding, credentials, transport, health and readback owner.

No W12-H artifact evaluates policy, grants authority, retries a mutation, activates a serving campaign or treats provider acknowledgement as verified external state.

## Integration scenarios

The W12-H harness proves the following composition path:

1. W12-B prepares a tenant/business/ad-account-bound Meta Ads read plan through the W08 read-only path.
2. W12-D performs at most one governed `CREATE_PAUSED` mutation attempt through a W08-compatible write port.
3. Provider acknowledgement remains pending readback and does not become canonical external truth.
4. A structurally compatible W08 readback projection confirms the effect while keeping `retryAuthorized=false` and `authorizesExecution=false`.
5. W12-D performs a paused-state metadata update only when current W08 precheck evidence proves the resource remains paused.
6. A second W08 readback projection confirms the updated paused state and carries an explicit evidence reference.
7. W12-F normalizes readback-derived metrics as provider observations and W12-G may produce optimization candidates only as non-authoritative decision support.

## Negative and uncertainty matrix

The harness also proves fail-closed behavior for:

- wrong ad-account scope on read and write preconditions;
- stale/unverified account verification and provider identity evidence;
- provider authentication failure, rate-limit and duplicate-style conflict with exactly one write attempt and retry decision ownership remaining W07;
- partial or ambiguous provider mutation outcomes remaining `EXECUTION_UNCERTAIN`;
- indeterminate readback requiring further W08/W07 reconciliation while retry remains unauthorized;
- stale current W02 authority blocking financial mutation planning before provider transport;
- budget/financial ceiling violations blocking before transport;
- activation remaining outside the paused-first acceptance lane;
- analytics and optimization outputs remaining decision-support only with no action intent or authority elevation.

## TOCA source patterns promoted or re-specified

TOCA Meta Ads and paid-media references are treated as semantic source patterns, not inherited authority.

Promoted/re-specified patterns:

- Meta Business/ad-account verification is represented as a W08 binding/read precondition and never as permission to mutate;
- business and ad-account identifiers are explicit routing/scope facts and fail closed on mismatch;
- provider writes are one-attempt governed mutations behind W07 execution proof and W08 transport;
- create/update uses paused/non-serving posture before any separately governed activation step;
- provider acknowledgement requires readback; ambiguous or partial outcomes preserve uncertainty;
- provider references remain external references and do not replace Aurora canonical identity/evidence;
- rate-limit and conflict hints are advisory only and cannot authorize a retry;
- financial mutation requires current W02 authority plus W04 budget/mutation bounds and W08 provider precheck;
- analytics/recommendations are evidence and decision support only.

## n8n coverage gap

The audited n8n corpus provides only a **limited Meta Lead Ads-specific reference**. W12-H explicitly treats that observation as a coverage gap and does **not** infer full Meta Ads campaign/ad-set/ad write, financial-governance, readback, retry or production capability from it.

No n8n Lead Ads reference can substitute for the accepted W12 domain contracts or bypass W02/W04/W07/W08 controls. Any future broader n8n Meta Ads workflow must enter through accepted migration/governance boundaries and prove its own exact capability and authority mapping.

## Production and safety boundary

W12-H acceptance does **not** authorize:

- live campaign/ad-set/ad activation;
- serving-state promotion;
- unbounded spend, bid, budget or targeting widening;
- direct credential handling in W12;
- blind provider retry;
- bypass of current authority, approval or provider precheck;
- provider side effects outside W07/W08;
- treating analytics, optimization confidence or n8n workflow presence as authority.

No unsafe real production activation is exercised by the acceptance harness.

## Risk Gates A-D

### A — Authority and financial safety

Pass condition: no W12-H artifact grants permission, widens budget, activates serving state, performs an implicit retry or bypasses current W02/W04/W07/W08 evidence. Stale authority and financial-ceiling violations fail before provider transport.

### B — Tenant, business/ad-account and provider identity

Pass condition: tenant, binding reference, Meta Business ID and ad-account ID remain explicit; wrong account or unverified identity fails closed; provider references remain external references; no secrets enter the handoff or test evidence.

### C — Execution, uncertainty and provider correctness

Pass condition: paused-first mutation is one attempt maximum; duplicate/conflict and rate-limit paths do not retry implicitly; ambiguous/partial outcomes remain uncertain; readback remains W08-owned; retry eligibility remains W07-owned.

### D — Provenance, observability and downstream containment

Pass condition: W12-F/W12-G telemetry, analytics and optimization surfaces remain non-authoritative; TOCA patterns are documented as re-specified semantics; the limited n8n Lead Ads coverage gap is explicit; downstream W17/W18 receive only accepted evidence/decision-support surfaces.

## Acceptance publication barrier

Before `#322` may receive `aurora:accepted`, Program Control must verify on the same exact final W12-H candidate HEAD:

1. Quality — SUCCESS.
2. Test Build — SUCCESS.
3. Security — SUCCESS.
4. Exactly the W12-H-owned test/handoff surface and no temporary diagnostic files.
5. Zero unresolved blocking review threads.
6. Risk Gates A-D — PASS.
7. Immediate live-main race check before merge.
8. Guarded merge using the accepted exact head.
9. Post-merge Quality, Test Build and Security — SUCCESS on the exact resulting `main`.

Only then is W12 accepted as an integrated Meta Ads domain wave and eligible to satisfy downstream dependencies such as W17 observability/evidence coordination.