# W18-00 Evals / Learning / Promotion Governance Freeze — Readiness Artifact

Status: `PREBUILD_READINESS_ONLY`
Base main: `d84ca8c83a24d89aafe7fe4efbb12f0302587f18`
Dependency state at preparation: W17-G not accepted.
Issue: `#127`

This artifact uses only W18-00's `GOVERNANCE_ARTIFACT` prebuild allowance. It cannot satisfy W18-00, cannot authorize W18-A..I BUILD and must not merge to main before trustworthy W17 telemetry/evidence is accepted and the freeze is reconciled against live contracts.

## Core invariants

- Learning optimizes intelligence/strategy only; it never changes policy/authority/executor ownership.
- `INTELLIGENCE != AUTHORITY != EXECUTION`.
- Model, prompt, profile, router score, evaluation score, confidence, reward and economic preference cannot mint `OwnerDecision`, `PolicyToken`, verified outcome or retry permission.
- No production configuration self-promotes directly from online observations.
- Promotion requires immutable provenance, reproducible evaluation, explicit stage transition and rollback identity.
- W04 Capability Registry remains capability truth; W18 must not duplicate it.

## Proposed lifecycle

`OBSERVATION -> DATASET/EVAL INPUT -> EVALUATION -> CANDIDATE -> SHADOW -> CANARY -> GOVERNED PROMOTION RECORD -> BOUNDED ROLLOUT -> GENERAL or ROLLBACK`

Every transition must preserve source configuration/version, dataset/eval version, metrics, safety checks, cost/latency impact, approver/governance reference where required, rollout population, timestamps and rollback target. A stage transition is not business execution authority.

## Registry readiness

Final W18-00 should freeze one versioned registry family for model/prompt/agent-profile/strategy configurations with:

- stable immutable configuration/version identity;
- provenance and content digest;
- compatibility constraints;
- status/rollout phase;
- referenced capability requirements without re-owning W04 capability truth;
- evaluation and dataset references;
- supersession/rollback links;
- tenant/scope restrictions where applicable;
- no secrets embedded in registry entries.

## Dataset and evaluation readiness

Datasets may be synthetic, historical or evidence-derived only with explicit provenance/privacy controls. Define train/eval/holdout separation where applicable, fixture redaction, reproducibility and version integrity. Test classes must cover correctness, safety, abstention/degraded behavior, cost, latency, uncertainty, provider/device failures, stale context, injection and authority-separation cases.

Do not use raw production secrets, private chain-of-thought or unrestricted personal data as fixtures.

## Confidence calibration readiness

Calibration can affect routing/escalation thresholds but never policy authority. Evaluate calibration by task/risk/modality segments, with abstention and unknown classes. Voice/wake confidence remains an input to intelligence routing only; it cannot authorize a W15 action.

## Shadow / canary governance

Shadow candidates may observe identical bounded inputs and produce non-side-effecting outputs/evaluations only. They must not race or mutate canonical execution state. Canary rollout requires an explicit governed rollout record, bounded population, safety/economic stop conditions, monitoring and immediate rollback target.

No candidate may create provider/device side effects merely because it performed better in evaluation.

## Economic Governor readiness

Optimize quality × latency × cost subject to hard safety/governance constraints. Cost optimization is subordinate to policy/authority/security and required evidence quality. Any candidate that reduces cost by skipping required gates is invalid regardless of aggregate reward.

## No-online-self-promotion rule

Production observations can propose evaluation candidates but cannot directly rewrite active model/prompt/profile/router/template configuration. Required boundary:

1. immutable observation/evidence reference;
2. offline/bounded evaluation;
3. regression/safety/economic gates;
4. explicit promotion record;
5. staged rollout;
6. rollback monitoring.

## Risk premortem

1. Reward hacking — use multi-dimensional hard safety constraints and holdouts.
2. Biased datasets — provenance, coverage reports and segmented evaluation.
3. Evaluation leakage/overfit — immutable holdouts and versioned splits.
4. Silent regression — golden regression gates and shadow comparison.
5. Economic runaway — hard budget ceilings and rollback triggers.
6. Privilege drift — strategy/profile registry references permissions but never expands authority.
7. Stale evidence learning — require W17 freshness/provenance and reject broken chains.
8. Unsafe template/router promotion — require W19-ready adversarial cases and deterministic guardrails.

## Promotion evidence required

Final W18-00 must bind accepted W17-G evidence quality, registry ownership/equivalence decisions, dataset governance, eval/holdout semantics, promotion lifecycle, rollback criteria, economic constraints, no-self-promotion proof and Risk Gates A-D disposition.

Until then:

`W18-00 = READINESS PREPARED / BUILD BLOCKED BY W17-G`
