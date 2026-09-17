# W17-00 Observability / Evidence / Telemetry Freeze — Readiness Artifact v2

Status: `PREBUILD_READINESS_ONLY / NON_AUTHORITATIVE`
Live reconciliation date: 2026-09-17
Reconciled live `main`: `77f0f8532197025ee913dd02fcb56878d9d667a9`
Original readiness lineage: `56bd6167be6a7c3dc1141f55fc76ceadcecb44ce`
Canonical task: `W17-00` / issue `#117`
Dependency frontier: `W16-G` is not accepted because W16 BUILD remains gated by W15-J / physical DP5.

This document exercises only the W17-00 `GOVERNANCE_ARTIFACT` prebuild allowance. It is a future-wave readiness specification, not runtime implementation, not acceptance evidence, and not authority to start W17 BUILD. It does not alter W15-J, does not infer DP5 success, does not accept W16-G, and does not release W17-A..G.

## 1. Non-negotiable invariants

- Telemetry and Evidence observe; they do not authorize, approve, execute, reconcile or grant retry permission.
- `INTELLIGENCE != AUTHORITY != EXECUTION` and `CONTEXT != AUTHORITY` remain visible in telemetry schemas and runbooks.
- ACK, network success, provider acceptance, device presence, session trust, Android permission, wake/STT confidence and model confidence are not verified side-effect outcomes.
- `EXECUTION_UNCERTAIN` is a first-class observed state and always requires canonical W07 reconciliation before any retry eligibility decision.
- Canonical Evidence remains durable truth; logs, metrics and traces are derivative observability surfaces.
- No raw secrets, credentials, private chain-of-thought, unrestricted prompts/responses or raw device audio enter telemetry.
- Correlation identifiers are opaque lookup references, never authorization credentials.
- SLO pressure may trigger degradation or escalation, but may never relax Policy/Authority/Executor/Evidence requirements.

## 2. Entry gate for W17 BUILD

W17-00 may be promoted from readiness to BUILD only after all live dependencies are accepted and reconciled against the then-current main. Minimum entry conditions:

1. W11-H, W12-H and W13-H remain accepted on canonical main.
2. W15-J / DP5 is genuinely accepted wherever the shipped Device Plane contributes telemetry.
3. W16-G is accepted and its workspace/human-control/evidence handoff is bound to exact accepted SHAs.
4. Current W03/W04/W05/W06/W07/W08/W09/W10/W14/W15/W16 public contracts are inventoried for telemetry/evidence compatibility.
5. No open ownership conflict exists over shared contracts, root exports or production deployment surfaces.
6. Program Control revalidates this readiness artifact against the live task graph before BUILD.

## 3. Target observability architecture

The W17 target architecture is a non-authoritative observation plane layered on top of accepted runtime truth:

`RUNTIME SOURCES -> CORRELATION/CAUSATION ADAPTER -> OTEL SIGNALS -> BOUNDED EXPORT -> METRICS/TRACES/LOGS`

and independently:

`CANONICAL RECEIPT/READBACK/EVIDENCE -> DURABLE EVIDENCE INDEX -> RECONSTRUCTION QUERY`

The two paths are linked by stable references, but telemetry outage must not erase canonical execution/evidence state and must not permit blind replay.

### Runtime source inventory to freeze at promotion

Inventory intake/gateway, objective/task/DAG/lane, context/retrieval/cache, router/model/worker, capability/planner/budget/template, policy/authority, executor/reconciliation, providers/workflows, CRM/domain projections, device/gateway/session, workspace/human control and business outcomes.

For every source record:

- owning wave/component;
- canonical tenant/correlation/causation identifiers;
- source timestamp and ingestion timestamp semantics;
- event/span/metric family;
- evidence/receipt references;
- classification and retention class;
- bounded metric dimensions;
- missing-link behavior;
- downstream reconstruction consumer.

## 4. Proposed contract shapes — planning only

The following names are readiness vocabulary only until W17 BUILD reconciles accepted equivalents. They must not be imported by runtime before owner-wave promotion.

### `TelemetryEnvelope`

Minimum planning fields: schema version, tenant-safe scope reference, correlation ID, optional causation ID, component, signal kind, event name, source timestamp, observed timestamp, bounded attributes, classification, redaction state and evidence references.

Rules: immutable observation; no `authorizesExecution`; no raw secret/CoT fields; attributes are allowlisted and size/cardinality bounded.

### `EvidenceLink`

Planning fields: evidence ID/ref, relation kind, correlation ID, source owner, observed outcome class, integrity/provenance reference and timestamp. It links records; it does not verify outcome by itself.

### `StrategyExecutionRecord`

Planned W17-C observation record: task class, route, strategy/model/profile refs, context/tool summary, budget refs, confidence class, policy/executor outcome refs, fallback/degraded/escalation path, latency/cost summaries, evidence refs and delayed business-outcome refs. Private chain-of-thought is forbidden.

### `SLODefinition` / `ErrorBudgetPolicy`

Planning fields: service/lane, SLI query identity, window, objective/target placeholder, burn windows, alert/degrade action references, owner and baseline evidence. Numeric production targets remain `TBD_FROM_ACCEPTED_BASELINE` during PREBUILD.

### `RestoreRehearsalReceipt`

Planning fields: rehearsal ID, dataset/store scope, backup/restore points, start/end timestamps, observed RPO/RTO, consistency checks, replay/reconciliation outcome, unresolved external-state uncertainty, operator and evidence refs. A successful backup job alone never constitutes a successful restore rehearsal.

## 5. Telemetry semantic freeze

Final W17-00 should freeze bounded names for:

- request/intake lifecycle;
- objective/task/job/DAG/lane lifecycle;
- context/retrieval/cache/template summaries;
- model/tool/worker/router observations;
- policy and authority evaluation summaries without decision-sensitive payload leakage;
- execution attempt, cancellation and reconciliation state;
- provider/workflow/device transport state;
- receipt/readback/evidence lifecycle and completeness;
- cost/latency/concurrency/queue/fan-out summaries;
- human-control request/decision latency;
- workspace/client product-experience signals;
- backup/restore/replay/self-healing rehearsals;
- business outcome linkage and correction events.

Every metric label must be classified as `BOUNDED_DIMENSION`, `TRACE_ONLY`, `EVIDENCE_REFERENCE_ONLY`, `REDACTED` or `FORBIDDEN`. Unbounded IDs belong in trace/evidence lookup fields, never metric labels.

## 6. SLI catalog readiness

Candidate SLIs to formalize only after accepted runtime baselines exist:

- request acceptance availability;
- end-to-end request latency p50/p95/p99;
- policy/authority evaluation latency;
- dispatch latency;
- verified-outcome latency;
- `EXECUTION_UNCERTAIN` rate;
- reconciliation latency and unresolved-uncertainty age;
- evidence-chain completeness and broken-link rate;
- missing-correlation rate;
- durable queue/outbox/inbox lag;
- provider/workflow timeout and rate-limit rates;
- gateway reconnect/session churn;
- device command/voice lifecycle observations where accepted;
- workspace materialization and approval-request latency;
- cache/retrieval hit/miss/freshness summaries;
- model/tool/context fan-out and cost;
- restore success, observed RPO and observed RTO;
- error-budget burn by Fast/Governed lane.

PREBUILD intentionally defines no production SLO numbers. Thresholds must be calibrated from accepted Aurora telemetry, not copied from TOCA or synthetic benchmarks.

## 7. Dashboard readiness

Prepare dashboard specifications, not live production dashboards, for:

1. Executive service health: availability, latency, error budget and degraded states.
2. Execution safety: uncertain executions, reconciliation backlog, duplicate-prevention signals and kill/cancel observations.
3. Evidence integrity: completeness, broken links, delayed evidence and reconstruction failures.
4. Economic health: model/tool/retrieval cost, coordination overhead, queueing and fan-out.
5. Provider/workflow health: timeout, rate-limit, quota and readback latency.
6. Device plane health when included: session/reconnect/capability/permission drift and resource observations without raw audio.
7. DR readiness: backup freshness, restore drills, RPO/RTO observations and unresolved restore consistency findings.

Each panel must identify source SLI, owner, tenant-safe scope, freshness and whether it is diagnostic or release-gating.

## 8. Alert and incident-response readiness

Alert classes should be symptom-oriented and bounded to avoid cardinality/pager storms. Proposed severity families:

- SEV0/P0: cross-tenant evidence contamination, uncontrolled duplicate irreversible side effect, authority-bypass symptom, canonical evidence loss preventing reconstruction.
- SEV1: sustained uncertain-execution/reconciliation backlog, restore consistency failure, major service unavailability or evidence-chain breakage.
- SEV2: SLO burn, telemetry partial loss, elevated latency/cost, provider degradation or non-critical backlog.

Runbooks to materialize in W17 BUILD:

- missing/broken evidence chain;
- `EXECUTION_UNCERTAIN` spike;
- reconciliation backlog;
- queue/outbox/inbox lag;
- correlation propagation gap;
- telemetry exporter/backend loss;
- metric-cardinality runaway;
- provider timeout/rate-limit cascade;
- backup/PITR failure;
- restore consistency failure;
- kill/cancel propagation anomaly.

Runbooks must state detection, immediate containment, authority boundary, diagnostic queries, safe recovery, reconciliation requirements, rollback/kill criteria, evidence capture and closure conditions.

## 9. Data retention, redaction and privacy readiness

Field classes:

- `SAFE_DIMENSION`: bounded, non-secret operational labels.
- `TRACE_ONLY`: high-cardinality opaque identifiers.
- `EVIDENCE_REFERENCE_ONLY`: pointer to canonical evidence, not payload copy.
- `REDACTED`: value must be transformed or omitted before export.
- `FORBIDDEN`: secrets, raw credentials, private CoT, unrestricted prompts/responses, sensitive raw audio and unnecessary personal data.

Retention must follow classification and audit need. Telemetry deletion must not delete canonical evidence required for reconstruction, and canonical evidence retention must not be expanded merely for analytics convenience without privacy review.

## 10. Capacity and performance readiness

Before W17-D/E acceptance, establish measured budgets for:

- telemetry export CPU/memory overhead;
- span/event rate and sampling policy;
- metric series cardinality;
- durable evidence index write/read throughput;
- reconstruction query latency;
- queue depth/lag;
- storage growth and retention cost;
- alert/query fan-out.

Required design principle: observability failure must degrade observability, not business authority semantics. Backpressure must be bounded and must not cause unrestricted memory growth or runtime deadlock.

## 11. DR / backup / PITR / restore architecture readiness

W17-G BUILD should freeze store-by-store recovery ownership for durable program state, including W03 event/outbox/inbox/idempotency/workflow state and W17 evidence index/read models. Recovery sequence must preserve causal ordering and reconciliation requirements.

Required rehearsal sequence:

1. select exact backup/PITR point and environment;
2. restore isolated data plane;
3. validate schemas/migrations and tenant boundaries;
4. verify outbox/inbox/idempotency/evidence/read-model consistency;
5. quarantine ambiguous post-backup external executions;
6. perform canonical readback/reconciliation before retry/replay;
7. replay only eligible deterministic work;
8. measure observed RPO/RTO;
9. capture immutable rehearsal evidence;
10. document manual/degraded recovery if any invariant cannot be automated safely.

No recovery procedure may blindly resend an uncertain provider/device/workflow action.

## 12. Feature flags and rollout readiness

W17 instrumentation rollout should use bounded feature/configuration flags for exporters, sampling, new metrics, expensive reconstruction checks and alert policies. Flags may alter observation intensity only; they may not disable authority, evidence creation or required reconciliation.

Recommended stages after BUILD eligibility: `OFF -> SHADOW_OBSERVE -> CANARY -> LIMITED -> GENERAL`, with rollback to previous observation configuration independent of business execution state.

## 13. Test strategy readiness

W17 BUILD test plan must include:

- schema/privacy tests for all observation contracts;
- secret/CoT negative tests;
- cross-service correlation/causation propagation tests;
- missing/broken evidence-link tests;
- partial telemetry/backend outage tests;
- high-cardinality rejection/budget tests;
- trace sampling vs canonical reconstruction tests;
- late/corrected business outcome tests;
- SLI/error-budget calculation tests;
- burn-rate simulation tests;
- backup/restore/PITR/replay consistency drills;
- uncertain execution + reconcile-before-retry recovery tests;
- tenant isolation and malformed-input tests;
- load tests for evidence indexing and observability overhead.

## 14. W17 release / rollback gates

Entry gate: W16-G accepted and live dependencies reconciled.

Exit gate candidate for W17-G: exact-head Quality/Test Build/Security; Risk Gates A-D; complete correlation/evidence reconstruction; privacy/secret scan; bounded cardinality; measured telemetry overhead; accepted SLO dimensions with baseline-derived thresholds; successful restore/replay rehearsal; no unsafe retry; DP6 contribution if Device Plane ships.

Rollback gate: rollback of telemetry configuration is allowed when it does not remove canonical Evidence or required reconciliation. Any migration affecting evidence durability must have tested backward/forward compatibility or an explicit restore-first plan.

## 15. Gap register after 2026-09-17 reconciliation

- `BLOCKED`: W17 BUILD cannot start until W16-G is accepted.
- `BLOCKED`: device/DP6 production telemetry cannot be frozen until W15-J/DP5 and relevant W16 handoffs are accepted.
- `PENDING_BUILD`: OpenTelemetry runtime instrumentation W17-A.
- `PENDING_BUILD`: durable evidence chain/index W17-B.
- `PENDING_BUILD`: StrategyExecutionRecord runtime W17-C.
- `PENDING_BUILD`: measured SLO/error budgets W17-D.
- `PENDING_BUILD`: production cost/latency/tool/model/context metrics W17-E.
- `PENDING_BUILD`: human correction/business outcome linkage W17-F.
- `PENDING_BUILD`: actual backup/PITR/restore/replay/self-healing rehearsal W17-G.
- `READINESS_PREPARED`: architecture, proposed contracts, SLI taxonomy, dashboard/alert/runbook plan, DR sequence, rollout, capacity and test strategy.

## 16. Immediate sequence once W16-G is accepted

1. Revalidate live main and exact accepted W16-G handoff.
2. Promote/reconcile W17-00 governance freeze against actual accepted contracts.
3. Build W17-A and W17-B in parallel where ownership remains disjoint.
4. Build W17-C after A+B.
5. Build W17-E and W17-F after A+B.
6. Build W17-D after C+E+F using measured baselines.
7. Build and rehearse W17-G after D.
8. Run exact-head CI, Risk Gates A-D, privacy/security, DR and DP6 evidence as applicable.
9. Accept W17-G only after successful restore/replay/reconciliation evidence.
10. Release W18-00 dependency only through canonical acceptance; never by inference.

Until dependency release:

`W17-00 = READINESS PREPARED / BUILD BLOCKED BY W16-G`
