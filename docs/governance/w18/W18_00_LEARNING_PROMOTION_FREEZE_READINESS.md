# W18-00 Evals / Learning / Promotion Governance Freeze — Readiness Artifact v2

Status: `PREBUILD_READINESS_ONLY / NON_AUTHORITATIVE`
Live reconciliation date: 2026-09-17
Reconciled live `main`: `77f0f8532197025ee913dd02fcb56878d9d667a9`
Original readiness lineage: `2c9fa373f2abf59a0ddd244d253c5ac9fd46c8c9`
Canonical task: `W18-00` / issue `#127`
Dependency frontier: `W17-G` is not accepted; W17 itself remains downstream of W16-G and therefore indirectly of W15-J / physical DP5.

This document uses only the W18-00 `GOVERNANCE_ARTIFACT` prebuild allowance. It does not start W18 BUILD, does not accept W17, does not promote any model/prompt/profile/template/router, and does not create online self-learning authority.

## 1. Core invariants

- Learning optimizes intelligence and strategy only; it never changes Policy/Authority/Executor ownership.
- `INTELLIGENCE != AUTHORITY != EXECUTION`.
- Model, prompt, agent profile, router score, evaluation score, confidence, reward, business outcome and economic preference cannot mint `OwnerDecision`, `PolicyToken`, verified execution outcome or retry permission.
- W04 Capability Registry remains capability truth; W18 must not duplicate it.
- W17 telemetry/evidence is input evidence, not proof of causality and not promotion authority.
- Production observations may generate candidates; they may never directly rewrite active production configuration.
- SHADOW is side-effect free. CANARY requires bounded governed rollout and rollback identity.
- Safety/authority/evidence completeness are hard constraints, not optimization terms that may be traded for latency or cost.

## 2. Entry gate for W18 BUILD

W18-00 becomes BUILD-eligible only when:

1. W17-G is canonically accepted on exact evidence.
2. W17 telemetry/evidence quality, freshness, correlation completeness and reconstruction are sufficient for evaluation use.
3. StrategyExecutionRecord or its accepted equivalent is versioned and privacy-reviewed.
4. Required business-outcome/correction linkages have provenance and uncertainty semantics.
5. No unresolved P0/P1 issue exists in W17 evidence integrity that could corrupt evaluation.
6. Live main, task graph and accepted schemas are revalidated before any runtime contract is created.

## 3. Governed adaptation architecture

Target lifecycle:

`OBSERVATION -> DATASET MANIFEST -> EVALUATION -> CANDIDATE -> SHADOW -> CANARY -> GOVERNED PROMOTION RECORD -> LIMITED/GENERAL -> SUPERSEDE/ROLLBACK/RETIRE`

Promotion is a control-plane lifecycle for strategy configuration; it is never action authority.

Separation of concerns:

- W17 supplies trustworthy observations and outcome/evidence references.
- W18 owns evaluation, calibration, candidate comparison, bounded optimizer decisions and promotion governance.
- W04 retains capability/template runtime truth where applicable; W18 may propose compatible candidates but cannot directly overwrite accepted W04 state.
- W05 remains intelligence runtime owner; W18 may produce governed strategy/model configuration consumed through accepted W05 interfaces.
- W19 later validates converged adversarial security; W18 must prepare security-relevant evidence for that gate.

## 4. Proposed registry model — planning only

The following are readiness names until BUILD reconciles accepted equivalents.

### `StrategyConfigurationRecord`

Planning fields:

- immutable configuration ID/version;
- kind: model/prompt/agent-profile/strategy/router-policy reference;
- content digest and provenance;
- compatibility constraints;
- required capability references without re-owning W04;
- tenant/scope restrictions where applicable;
- status and rollout phase;
- parent/superseded/rollback references;
- dataset/evaluation references;
- creation/promotion governance references;
- no embedded secrets.

### Compatibility matrix

Every configuration should declare compatibility against:

- model/provider family/version constraints;
- prompt/profile/schema version;
- task/risk/modality class;
- required tools/capabilities;
- context contract/version;
- minimum telemetry/evidence schema;
- known excluded environments;
- rollout phase and deprecation date where applicable.

An unavailable/incompatible configuration must fail closed to a known safe route or explicit abstention; it must not silently widen capabilities.

## 5. Dataset governance readiness

Proposed `EvaluationDatasetManifest` planning fields:

- dataset ID/version/content digest;
- source classes: synthetic, historical, evidence-derived;
- source provenance and collection window;
- tenant/data classification;
- consent/purpose constraints where applicable;
- redaction/anonymization state;
- train/eval/holdout split identities;
- task/risk/modality coverage;
- known limitations/biases;
- fixture generation version;
- integrity checksum;
- retention/deletion requirements.

Rules:

- no secrets, raw credentials, private chain-of-thought or unrestricted personal runtime data;
- evidence-derived cases retain references/provenance without copying sensitive payload unnecessarily;
- holdouts are immutable for a declared evaluation cycle;
- synthetic data must be labeled synthetic and cannot masquerade as production outcome evidence;
- dataset drift and schema incompatibility must invalidate stale evaluation claims.

## 6. Evaluation record readiness

Proposed `EvaluationRunRecord`:

- run ID and exact candidate configuration refs;
- dataset/holdout versions;
- harness version and environment;
- task/risk/modality segments;
- correctness/safety/abstention metrics;
- latency/cost/tool/model/context metrics;
- confidence calibration metrics;
- failure/degraded-path observations;
- side-effect prohibition status for SHADOW;
- statistical support/minimum evidence;
- regressions/findings;
- result classification: `INCONCLUSIVE`, `REJECT`, `ELIGIBLE_FOR_SHADOW`, `ELIGIBLE_FOR_CANARY` as planning vocabulary only;
- immutable evidence refs.

A higher aggregate score cannot override a hard safety failure.

## 7. Confidence calibration readiness

Calibration may adjust routing, verification, abstention and escalation only.

Required segmentation:

- task class;
- risk class;
- modality;
- language/locale where material;
- model/strategy version;
- in-distribution vs drifted inputs;
- provider/device failure state where relevant.

Candidate metrics: reliability curve, calibration error, overconfidence rate, abstention precision/recall and unknown/conflict rates. Final thresholds must be measured, versioned and rollback-safe.

Proof obligation: no calibrated confidence value can elevate authority, bypass policy validation or create execution permission.

## 8. SHADOW readiness

SHADOW candidates may consume copied/bounded observations and produce evaluation outputs only.

Required controls:

- no provider/device/workflow external writes;
- no mutation of canonical objective/task/execution state;
- no queue insertion that reaches executors;
- no production approval/authority side effects;
- deterministic linkage to the canonical observation being compared;
- bounded compute/tool/model budgets;
- explicit timeout/cancellation;
- secret and tenant isolation;
- side-effect tripwire tests.

Shadow comparison should evaluate quality, latency, cost, tool/model calls, abstention and safety against the active reference configuration.

## 9. CANARY and feature-flag readiness

A canary needs a governed rollout record containing:

- candidate and rollback configuration refs;
- exact eligible population/scope;
- start/end or review conditions;
- minimum sample/evidence criteria;
- hard safety stop conditions;
- quality regression stop conditions;
- latency/cost/error-budget stop conditions;
- observability requirements;
- owner/governance reference;
- rollback verification plan.

Feature flags select an already-governed strategy/configuration; they do not create authority. Rollout stages may use `OFF -> SHADOW -> CANARY -> LIMITED -> GENERAL -> RETIRED` after canonical semantics are frozen.

## 10. Proposed promotion record — planning only

`LearningPromotionRecord` / `TemplatePromotionRecord` readiness fields:

- promotion ID/version;
- candidate configuration/template ref;
- previous active ref and rollback target;
- evaluation run refs;
- dataset/holdout refs;
- required thresholds and observed metrics;
- safety/Risk Gate evidence;
- scope/population;
- rollout phase;
- effective/expiry timestamps;
- supersession status;
- approval/governance reference as required;
- explicit `authorizesBusinessExecution=false`.

Production usage signal alone can never create this record in an active state.

## 11. Economic Governor readiness

The Economic Governor optimizes quality × latency × cost subject to hard constraints.

Inputs should include:

- W17 measured model/tool/retrieval/context cost;
- end-to-end and stage latency;
- task/risk/complexity class;
- confidence/calibration state;
- business-value context with provenance;
- bounded execution/reasoning/tool budgets;
- coordination overhead and fan-out;
- minimum quality/safety floor.

Invalid optimization patterns:

- skipping Policy/Authority/Evidence to save latency;
- selecting a cheaper route that lacks required capability/safety compatibility;
- unbounded agent/tool fan-out;
- sacrificing tenant/privacy constraints for evaluation coverage;
- using estimated business value as execution authority.

Required degrade modes: cheaper compatible strategy, reduced optional enrichment, abstain, escalate to human/governed route. Mandatory safety stages remain non-skippable.

## 12. Drift and rollback readiness

Monitor:

- input/distribution drift;
- outcome drift;
- calibration drift;
- dataset/version drift;
- cost/latency drift;
- provider/model behavior changes;
- compatibility changes;
- reward-hacking indicators;
- unexplained shadow/canary divergence.

Rollback must be deterministic to an immutable known-good configuration. If schema/runtime compatibility moved forward, rollback requires explicit compatibility proof or a coordinated software rollback; never point a runtime at an incompatible old config silently.

## 13. Privacy and security readiness

- Registry stores references/digests, not provider secrets.
- Evaluation datasets follow least-data and explicit provenance.
- Telemetry/evidence references are tenant-scoped.
- No private CoT used as a training/evaluation artifact.
- Prompt/tool injection cases are included as negative/adversarial datasets but remain inert fixtures.
- Candidate strategies cannot invoke privileged tools in SHADOW.
- Promotion records are integrity-protected and audit-reconstructable.
- Cross-tenant evaluation leakage is release-blocking.

## 14. Observability readiness for W18

Dashboards/specifications to prepare in BUILD:

1. Evaluation quality by task/risk/modality/config version.
2. Confidence/calibration and abstention.
3. Shadow divergence and side-effect tripwire status.
4. Canary health: safety, quality, latency, cost, error budget and rollback readiness.
5. Dataset coverage/drift/integrity.
6. Economic Governor decisions and coordination overhead.
7. Promotion lifecycle and supersession/rollback events.

Alerts must prioritize safety regression, unauthorized side-effect attempt in SHADOW, cross-tenant leakage, canary hard-stop breach, severe calibration drift, economic runaway and registry integrity failure.

## 15. Test strategy readiness

W18 BUILD must cover:

- registry immutability/version/compatibility;
- dataset provenance/redaction/integrity;
- train/eval/holdout separation;
- golden-regression cases;
- confidence over/under-calibration and abstention;
- distribution drift;
- SHADOW side-effect prohibition;
- candidate leakage into canonical runtime state;
- matched shadow comparison;
- promotion threshold enforcement;
- failed-canary automatic stop request/rollback workflow without authority bypass;
- rollback/supersession;
- stale W17 telemetry/evidence rejection;
- reward-hacking adversarial cases;
- economic budget exhaustion and fan-out;
- cross-tenant/privacy negative cases;
- proof that confidence/eval/economic outputs cannot mint authority.

## 16. Release gates for W18

Entry: accepted W17-G and trustworthy telemetry/evidence.

Exit candidate at W18-I:

- exact-head Quality/Test Build/Security;
- Risk Gates A-D;
- versioned registry and compatibility proof;
- versioned datasets/holdouts with privacy/provenance;
- calibration evidence;
- SHADOW side-effect tripwire proof;
- governed canary + rollback rehearsal;
- economic runaway and reward-hacking tests;
- no online self-promotion;
- no authority/policy mutation;
- handoff sufficient for W19 converged threat model.

Rollback gate: every promoted configuration has immutable rollback identity and compatibility evidence. If rollback cannot be proven safe, stop rollout and require coordinated remediation rather than improvising live changes.

## 17. Gap register after 2026-09-17 reconciliation

- `BLOCKED`: W18 BUILD waits for accepted W17-G.
- `PENDING_BUILD`: versioned model/prompt/profile/strategy registry W18-A.
- `PENDING_BUILD`: golden datasets/regression harness W18-B.
- `PENDING_BUILD`: confidence calibration W18-C.
- `PENDING_BUILD`: SHADOW comparison runtime W18-D.
- `PENDING_BUILD`: PlanTemplate candidate generation W18-E.
- `PENDING_BUILD`: governed promotion/rollback W18-F.
- `PENDING_BUILD`: adaptive strategy router optimizer W18-G.
- `PENDING_BUILD`: Economic Governor W18-H.
- `PENDING_BUILD`: integrated canary/promotion acceptance W18-I.
- `READINESS_PREPARED`: registry/data/eval/promotion contracts, compatibility, rollout/canary, feature-flag boundaries, privacy/security, drift, rollback, observability and test/release gates.

## 18. Immediate sequence once W17-G is accepted

1. Revalidate live main and accepted W17 telemetry/evidence contracts.
2. Promote/reconcile W18-00 governance freeze.
3. Build W18-A and W18-B in parallel where ownership remains disjoint.
4. Build W18-C and W18-D after A+B.
5. Build W18-E after C+D, then W18-F.
6. Build W18-G and W18-H after C+D.
7. Integrate W18-I after F+G+H.
8. Run canary and rollback drills, adversarial/economic tests and exact-head gates.
9. Accept W18-I only after no-self-promotion and authority-separation proofs hold.
10. Release W19-00 only through canonical dependency acceptance.

Until dependency release:

`W18-00 = READINESS PREPARED / BUILD BLOCKED BY W17-G`
