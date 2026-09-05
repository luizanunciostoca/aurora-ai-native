# W17-00 Observability / Evidence / Telemetry Freeze — Readiness Artifact

Status: `PREBUILD_READINESS_ONLY`
Base main: `d84ca8c83a24d89aafe7fe4efbb12f0302587f18`
Dependency state at preparation: W11-H/W12-H/W13-H accepted as applicable; W16-G not accepted.
Issue: `#117`

This artifact exercises only W17-00's `GOVERNANCE_ARTIFACT` prebuild allowance. It cannot satisfy W17-00, cannot authorize W17-A..G BUILD and must not merge to main before every live dependency is accepted and reconciled.

## Invariants

- Telemetry and Evidence describe observations; they never decide authority, approval, execution outcome or retry eligibility.
- `INTELLIGENCE != AUTHORITY != EXECUTION` remains visible in metric/event naming and schemas.
- ACK, network success, device presence, session trust, voice confidence and model confidence are not verified side-effect outcomes.
- `EXECUTION_UNCERTAIN` is a distinct observable/reconciliation state, never a failed/successful proxy.
- No raw secrets, credentials, private chain-of-thought or unbounded tenant/user content enters telemetry.
- Correlation identifiers are tenant-safe opaque references and are not authorization credentials.

## Promotion-time inventory

Before final freeze, inventory the accepted runtime path from intake through business outcome and map correlation/causation across W03-W16: durable inbox/outbox/idempotency, context/cache, router/planner, policy/authority, executor, providers/workflows, W14 gateway/session, W15 device path, W16 human-control requests and final Receipt/Evidence.

For each stage record owner, canonical identifiers, event/span source, Evidence link, retention/classification, missing-link behavior and downstream reconstruction consumer. Reuse canonical identifiers rather than creating telemetry-only identities.

## Telemetry vocabulary readiness

Final W17-00 should freeze bounded names for these families:

- request/intake lifecycle;
- task/objective/job/DAG/lane lifecycle;
- policy/authority evaluation without leaking decision-sensitive payloads;
- execution attempt and reconciliation state;
- provider/workflow/device transport state;
- receipt/evidence lifecycle and completeness;
- cost/latency/model/tool/context/cache/template/route summaries;
- human-control request/decision latency;
- client/voice/product-experience observations where W15/W16 provide accepted inputs;
- DR/backup/restore/replay rehearsal observations.

Every metric dimension must have a cardinality classification. IDs with effectively unbounded cardinality belong in trace/evidence lookup fields, not metric labels.

## Evidence reconstruction contract

A reviewer must be able to reconstruct a task using canonical references without relying on logs as the source of truth:

`INTAKE -> OBJECTIVE/TASK -> CONTEXT/PLAN -> POLICY/AUTHORITY REFERENCES -> EXECUTION INTENT -> EXECUTION ATTEMPT -> RECEIPT/READBACK -> EVIDENCE -> BUSINESS OUTCOME`

Missing or broken links are observable defects. A telemetry backend outage must not erase canonical execution/evidence state or silently permit retry.

## Redaction / retention readiness

Freeze field classes as `SAFE_DIMENSION`, `TRACE_ONLY`, `EVIDENCE_REFERENCE_ONLY`, `REDACTED`, or `FORBIDDEN`. Tenant IDs may require pseudonymous/bounded representation by backend. Secrets/tokens/keys, raw provider credentials, private reasoning, unrestricted prompts/responses and sensitive raw device/audio data are forbidden.

Retention tiers must be tied to data classification and audit need. Deletion/retention policy cannot destroy required canonical evidence while leaving misleading telemetry summaries.

## SLO dimensions readiness

Define targets only after accepted baselines exist. Candidate dimensions include request acceptance latency, authority evaluation latency, dispatch latency, verified-outcome latency, reconciliation latency, gateway reconnect, device voice wake/listen/first-response, workspace materialization, approval completion, cancellation acknowledgement, evidence-chain completeness, restore objectives and cost-budget adherence.

Do not invent production SLO numbers during PREBUILD. Physical W15 observations are inputs, not production SLO proof.

## DP6 device telemetry readiness

When W15-J/DP5 and W16 are accepted, reconcile DP6 requirements for lifecycle/session reconnect, capability/permission drift, native dispatch, uncertainty, offline queue, voice wake/listen/STT/TTS/barge-in, battery/resource observations and physical evidence references. Device telemetry must not include raw microphone audio or convert device trust into authority.

## Risk premortem

1. Cardinality explosion — bound labels, move IDs to trace/evidence references.
2. Evidence gap hidden by green metrics — measure evidence completeness and broken links independently.
3. Secret/CoT leakage — allowlisted telemetry schemas plus negative scanning/tests.
4. ACK/outcome conflation — separate transport, authorization, dispatch, receipt/readback and verified outcome signals.
5. Sampling destroys incident reconstruction — canonical Evidence remains durable; critical audit events use governed retention independent of ordinary trace sampling.
6. Clock skew/order ambiguity — preserve source timestamp + ingestion timestamp + causation/reference semantics.
7. DR false confidence — require restore/replay rehearsal evidence, not backup-job success alone.

## Promotion evidence required

Final W17-00 must bind exact dependency SHAs, accepted W16-G handoff, final telemetry/evidence ownership, correlation vocabulary, cardinality budget, retention/redaction rules, reconstruction matrix, DP6 inputs, SLO dimensions and Risk Gates A-D disposition.

Until then:

`W17-00 = READINESS PREPARED / BUILD BLOCKED BY W16-G`
