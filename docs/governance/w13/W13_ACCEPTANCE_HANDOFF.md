# W13 — Google Ads Acceptance Handoff

Status: `CANDIDATE_W13_H`
Task: `W13-H`
Issue: `#326`

This handoff is an integration/acceptance artifact. It does not grant provider, financial, retry, activation or execution authority. It becomes canonical W13 acceptance evidence only after the W13-H exact-head gates, governed merge, post-merge gates and `#326` acceptance are complete.

## Accepted owner boundaries exercised by W13-H

W13-H composes existing accepted owners rather than creating a new executor or provider stack:

- **W13-B** — Google Ads account/CID/MCC binding and read-only preconditions.
- **W13-E** — paused/non-serving create/update composition over current W07 execution proof and W08 write transport.
- **W13-F** — current authority, approval, budget and mutation-bound composition for financial actions.
- **W13-G** — measurement, attribution, telemetry and optimization recommendations as decision support only.
- **W07** — generic execution eligibility, uncertainty, reconciliation and retry eligibility owner.
- **W08** — provider binding, credentials, transport, health and readback owner.

No W13-H artifact evaluates policy, grants authority, retries a mutation, activates a serving campaign or treats provider acknowledgement as verified external state.

## Integration scenarios

The W13-H harness proves the following composition path:

1. W13-B prepares a tenant/CID/MCC-bound Google Ads read plan through the W08 read-only path.
2. W13-E performs at most one governed `CREATE_PAUSED` mutation attempt through a W08-compatible write port.
3. Provider acknowledgement remains pending readback and does not become canonical external truth.
4. A structurally compatible W08 readback projection confirms the effect while keeping `retryAuthorized=false` and `authorizesExecution=false`.
5. W13-E performs a paused-state update only when current W08 precheck evidence proves the resource remains paused.
6. A second W08 readback projection confirms the updated paused state.
7. W13-G can consume fresh measurement evidence only as non-authoritative decision support.

## Negative and uncertainty matrix

The harness also proves fail-closed behavior for:

- wrong customer CID on read and write preconditions;
- rate-limit and quota failures, with retry decision ownership remaining W07 and no implicit retry loop;
- partial or ambiguous provider mutation outcomes remaining `EXECUTION_UNCERTAIN`;
- indeterminate readback requiring further W08/W07 reconciliation while retry remains unauthorized;
- stale current W02 authority blocking financial mutation planning before provider transport;
- activation remaining outside the paused-first acceptance lane;
- measurement and optimization outputs remaining `REVIEW_ONLY`/non-authoritative.

## TOCA source patterns promoted or re-specified

TOCA provider references are treated as semantic source patterns, not inherited authority.

Promoted/re-specified patterns:

- account/client verification is represented as a W08 binding/read precondition and never as permission to mutate;
- customer CID and applicable manager/MCC are explicit routing/scope facts and fail closed on mismatch;
- provider writes are one-attempt governed mutations behind W07 execution proof and W08 transport;
- create/update uses paused/non-serving posture before any separately governed activation step;
- provider acknowledgement requires readback; ambiguous or partial outcomes preserve uncertainty;
- provider references remain external references and do not replace Aurora canonical identity/evidence;
- quota/rate-limit hints are advisory only and cannot authorize a retry;
- analytics/recommendations are evidence and decision support only.

## n8n coverage gap

The audited n8n corpus contains **zero real Google Ads/AdWords workflows**. W13 therefore does not infer any Google Ads capability, authority, retry behavior or production readiness from n8n.

The absence of n8n Google Ads workflows is a documented coverage gap, not a runtime blocker for the governed Aurora domain contracts already implemented through W07/W08. Any future n8n workflow must enter through the accepted W09 migration/governance process and cannot bypass W02/W04/W07/W08 controls.

## Production and safety boundary

W13-H acceptance does **not** authorize:

- live campaign activation;
- serving-state promotion;
- unbounded spend/bid/budget mutation;
- direct credential handling in W13;
- blind provider retry;
- bypass of current authority/approval/precheck;
- provider side effects outside W07/W08;
- treating analytics confidence as authority.

No unsafe real production activation is exercised by the acceptance harness.

## Risk Gates A-D

### A — Authority and financial safety

Pass condition: no W13-H artifact grants permission, widens budget, activates serving state, performs an implicit retry or bypasses current W02/W04/W07/W08 evidence.

### B — Tenant, CID/MCC and provider identity

Pass condition: tenant, binding reference, customer CID and applicable manager/MCC remain explicit; wrong account/hierarchy fails closed; provider references remain external references.

### C — Execution, uncertainty and provider correctness

Pass condition: paused-first mutation is one attempt maximum; ambiguous/partial outcomes remain uncertain; readback remains W08-owned; retry eligibility remains W07-owned; quota/rate-limit cannot duplicate writes.

### D — Provenance, observability and downstream containment

Pass condition: W13-G telemetry/evaluation surfaces remain non-authoritative; TOCA patterns are documented with re-specification provenance; n8n gap is explicit; downstream W17/W18 receive only accepted evidence/decision-support surfaces.

## Acceptance publication barrier

Before `#326` may receive `aurora:accepted`, Program Control must verify on the same exact final W13-H candidate HEAD:

1. Quality — SUCCESS.
2. Test Build — SUCCESS.
3. Security — SUCCESS.
4. Exactly the W13-H-owned test/handoff surface and no temporary diagnostic files.
5. Zero unresolved blocking review threads.
6. Risk Gates A-D — PASS.
7. Immediate live-main race check before merge.
8. Guarded merge using the accepted exact head.
9. Post-merge Quality, Test Build and Security — SUCCESS on the exact resulting `main`.

Only then is W13 accepted as an integrated Google Ads domain wave and eligible to satisfy downstream dependencies such as W17 observability/evidence coordination.
