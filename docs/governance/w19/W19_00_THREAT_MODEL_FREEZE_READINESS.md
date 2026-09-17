# W19-00 Security Coordination & Threat Model Freeze — Readiness Artifact v2

Status: `PREBUILD_READINESS_ONLY / NON_AUTHORITATIVE`
Live reconciliation date: 2026-09-17
Reconciled live `main`: `77f0f8532197025ee913dd02fcb56878d9d667a9`
Original readiness lineage: `c4538e55316c95525e06d758733befbbfe83ef47`
Canonical task: `W19-00` / issue `#168`
Dependency frontier: `W18-I` is not accepted.

This document uses only the W19-00 `GOVERNANCE_ARTIFACT` prebuild allowance. It does not start red-team BUILD, does not remediate gated runtime speculatively, does not accept W18, and does not waive any future P0/P1 finding.

## 1. Security invariants

- `INTELLIGENCE != AUTHORITY != EXECUTION` is a security boundary.
- Untrusted user/content/model/tool/provider output, confidence, capability discovery, device/session trust, local permission, biometric success, ACK or Receipt transport success cannot become business authority through type confusion.
- W02/W07 retain authority/execution ownership; W03 retains idempotency/replay truth; W04 retains capability truth; W14 retains device identity/session/trust; W15 owns Android/native execution; W17 observes; W18 evaluates/adapts under governance.
- `EXECUTION_UNCERTAIN` always requires reconcile-before-retry.
- Cross-tenant exposure, authority bypass, uncontrolled irreversible duplicate side effect, material secret exposure, kill-switch bypass or evidence forgery producing false verified outcome are release blockers.
- Availability pressure never justifies fail-open authority, tenant or secret controls.

## 2. Entry gate for W19 BUILD

W19-00 becomes BUILD-eligible only when:

1. W18-I is canonically accepted.
2. The converged runtime through W18 is frozen enough to enumerate real attack surfaces.
3. W17 evidence/telemetry and W18 promotion/configuration records are available for forensic reconstruction.
4. Device Plane inclusion/exclusion for the target release is explicit; if included, accepted W15/DP5 and applicable DP6 evidence are available.
5. No concurrent owner is changing the same source-wave security surface without coordination.
6. Program Control revalidates all release blockers and source ownership on live main.

## 3. Converged threat-model architecture

Final W19 threat modeling must inventory assets, actors, trust boundaries, entry points, data flows, side-effect boundaries and recovery boundaries across:

- identity/policy/authority;
- event/outbox/inbox/replay/DLQ/workflow durability;
- capabilities/planning/templates/budgets;
- intelligence/router/model/worker loops;
- context/retrieval/cache/memory/snapshots;
- executor/readback/reconciliation;
- provider adapters/credentials/webhooks;
- workflow fabric;
- CRM/social/ads domain layers;
- gateway/device registration/session/trust;
- Android/native/device execution if shipped;
- Cortex/workspace/human-control surfaces when accepted;
- W17 telemetry/evidence/DR;
- W18 datasets/evals/registry/promotion/canary;
- CI/CD, artifacts, migrations, configuration and rollback surfaces.

For each boundary record owner, trust level, tenant/classification scope, validation, authority owner, secret exposure, replay/idempotency controls, kill/revoke behavior, evidence requirements and recovery path.

## 4. Threat taxonomy and adversarial matrix

### A. Prompt, content and tool injection

Test direct/indirect prompt injection, malicious retrieved content, hostile tool/provider output and instruction/data confusion. Prove untrusted content cannot select privileged execution, disable policy, mint authority, alter promotion gates or mutate canonical execution state.

### B. Tenant, privacy and secret isolation

Test cross-tenant identifiers, cache keys, queues, evidence, telemetry, workspace projections, provider/account/device bindings and evaluation datasets. Scan logs/evidence/cache/templates/telemetry/artifacts for secrets or restricted data.

### C. Context/cache/snapshot poisoning and staleness

Inject stale/conflicting/poisoned context, cache-key collisions, invalidation lag and manipulated provenance. Stale precheck/context may affect intelligence only and must fail closed before authority/execution.

### D. Event, queue, replay and ordering abuse

Replay, duplicate, reorder and forge events/correlation/causation; poison queues; force retry storms; attempt duplicate irreversible side effects; validate inbox/outbox/idempotency/DLQ/replay permissions and reconstruction.

### E. Router, confidence and economic manipulation

Spoof confidence/risk/complexity/modality signals and manipulate route/model selection toward cheaper or less-safe paths. Mandatory policy/authority/executor/evidence stages must remain.

### F. Template, speculation and agent privilege drift

Poison templates/bindings, stale profiles/capabilities, speculative preparation and agent handoffs. No template/agent/speculation may convert stale privilege or prediction into authority.

### G. Provider, workflow and credential threats

Test wrong provider account, credential swap/revocation, forged external IDs/webhooks, workflow hash/version tampering, confused deputy, timeout/rate-limit ambiguity and secret leakage. Credential possession is not authority.

### H. Device / Android threats when included

Test session hijack/replay, stolen/revoked/reinstalled/compromised devices, package/deep-link impersonation, permission drift, stale capability discovery, offline replay, Keystore misuse, overlay/UI spoofing, Accessibility abuse, malicious wake/audio inputs, reconnect duplicates and kill/revoke propagation. Presence/permission/assistant role/wake confidence never grants action authority.

### I. Evidence, kill-switch and recovery forgery

Forge/alter/replay Receipt/Evidence/correlation references; race cancellation/kill against dispatch; test late evidence; verify recovery cannot be tricked into duplicate side effects or false verified state.

### J. W17/W18 observability and learning threats

Test telemetry poisoning, cardinality/resource exhaustion, evidence-link corruption, manipulated business outcomes, dataset poisoning, holdout leakage, reward hacking, unauthorized shadow side effects, canary bypass, promotion-record forgery, rollback-target tampering and economic-governor manipulation.

### K. CI/CD and supply-chain threats

Test dependency compromise indicators, untrusted build inputs, artifact substitution, stale CI reuse, branch/commit confusion, unsigned/untraceable release artifacts, secret leakage in workflows/logs and unauthorized deployment/migration paths.

## 5. Severity and release-blocker model

Final criteria must be reconciled with the canonical Risk Framework. Readiness baseline:

- `P0`: cross-tenant compromise; material secret compromise; direct authority bypass; uncontrolled irreversible duplicate side effect; kill-switch bypass with unsafe execution; evidence forgery yielding false verified outcome; production-wide credential compromise.
- `P1`: exploitable privilege escalation; unsafe replay/retry; durable evidence loss preventing reconstruction; provider/device confused deputy; material policy/tenant isolation weakness; promotion/canary bypass that can change production strategy outside governance.
- `P2`: bounded hardening weakness without authority/data-integrity compromise; requires owner, rationale and release disposition.

P0/P1 remain hard blockers. Schedule pressure or documentation cannot accept them away.

## 6. Proposed finding record — planning only

`SecurityFindingRecord` readiness fields:

- finding ID/version;
- exact affected commit/config/artifact;
- source wave/component owner;
- threat class;
- severity and exploit preconditions;
- tenant/data/authority impact;
- reproduction steps using safe/synthetic targets;
- evidence refs;
- remediation owner;
- patch/PR/commit refs when available;
- regression test refs;
- status: OPEN / MITIGATED_PENDING_VERIFY / VERIFIED_FIXED / RELEASE_BLOCKING;
- residual risk and explicit prohibition on silently downgrading invariant breaches.

## 7. Adversarial harness readiness

Harness rules:

- isolated/synthetic/sandbox targets by default;
- no destructive production testing;
- exact candidate/config identity captured;
- deterministic fixtures where possible;
- timeouts, cleanup and kill controls mandatory;
- secret exposure minimized/redacted;
- no temporary shell/SSH/Accessibility bypass introduced merely to ease testing;
- attack payloads cannot escape the harness into real provider/device writes;
- every exploit reproduction emits evidence sufficient for remediation and regression.

The harness should support tenant confusion, replay/duplication, stale state, malformed payloads, injected tool output, simulated provider ambiguity, forged callback/evidence, resource pressure and promotion tampering without creating a parallel authority implementation.

## 8. Security observability readiness

W19 should consume W17 signals rather than create a second telemetry platform. Security dashboards/specifications:

1. authority/policy validation failures and anomalous bypass attempts;
2. cross-tenant rejection events;
3. secret/redaction scanner findings;
4. replay/duplicate/idempotency violations;
5. kill/revoke propagation anomalies;
6. evidence-integrity and reconstruction failures;
7. provider/account/device binding mismatches;
8. injection/taint/trust-firewall findings;
9. shadow/canary/promotion governance violations;
10. CI/artifact provenance anomalies.

Security telemetry itself must avoid secrets and attacker-controlled unbounded labels.

## 9. Incident-response readiness

Runbook families to prepare for W19/W20:

- suspected cross-tenant exposure;
- secret/credential exposure;
- authority bypass or confused deputy;
- uncontrolled duplicate side effect;
- compromised provider/workflow binding;
- compromised/revoked device session;
- evidence forgery or reconstruction failure;
- prompt/tool injection leading to unsafe intent;
- malicious/stale template or promoted strategy;
- supply-chain/artifact provenance compromise.

Each runbook must define detection, containment, kill/revoke path, credential/session rotation where relevant, evidence preservation, tenant impact assessment, safe service degradation, recovery/reconciliation, communication owner and closure criteria.

## 10. Privacy readiness

Privacy review must map data classes and purposes across context/memory, telemetry/evidence, datasets/evals, workspace and device signals. Controls:

- purpose limitation and least-data collection;
- tenant isolation throughout storage/cache/queues;
- retention/deletion semantics consistent with required audit evidence;
- no raw secret/CoT export;
- no sensitive device/audio data in ordinary telemetry;
- explicit provenance for evidence-derived eval data;
- deletion/suppression behavior must not leave misleading derived records;
- jurisdiction/consent constraints honored where applicable.

## 11. Permission and authority-boundary readiness

The final threat model must explicitly prove:

- session authentication != action authority;
- device trust != action authority;
- local permission/biometric/assistant default != action authority;
- provider credential possession != action authority;
- capability availability != action authority;
- model/confidence/evaluation/promotion != action authority;
- UI approval request != OwnerDecision issuance unless canonical authority service processes it;
- evidence/receipt presence != verified external state without canonical verification semantics.

## 12. Remediation ownership model

W19 validates across the converged system but should send fixes back to the source owner unless W19 explicitly owns the shared hardening layer. Examples:

- W03 replay/idempotency flaw -> W03-owned patch;
- W06 context isolation flaw -> W06-owned patch;
- W07 authority/reconciliation flaw -> W07-owned patch;
- W08 provider credential/binding flaw -> W08-owned patch;
- W14 session/trust flaw -> W14-owned patch;
- W15 Android/native flaw -> W15-owned patch, coordinated with Android/Voice stream;
- W17 evidence/telemetry flaw -> W17-owned patch;
- W18 eval/promotion flaw -> W18-owned patch.

W19-J verifies remediation and regression across the converged system.

## 13. Test strategy readiness

W19 BUILD test matrix must include:

- prompt/tool/provider-output injection;
- taint/trust boundary tests;
- tenant/cache/queue/evidence isolation;
- secret scans and negative logging tests;
- stale/conflicting context and cache poisoning;
- event duplication/replay/reorder/forgery;
- retry/resource storms;
- Fast Lane/risk/confidence spoofing;
- template/profile/speculation privilege drift;
- provider account/credential/webhook/workflow tampering;
- evidence/receipt/correlation forgery;
- kill/cancel/revoke race conditions;
- device attack matrix when included;
- telemetry/evaluation/dataset/promotion poisoning;
- SHADOW side-effect leakage;
- canary/promotion/rollback tampering;
- CI/artifact provenance and stale-evidence tests;
- recovery after attack without duplicate external side effects.

## 14. W19 release gates

Entry: accepted W18-I and converged-runtime inventory.

Exit candidate at W19-J:

- exact-head Security plus Quality/Test Build;
- full threat matrix executed for shipped scope;
- all P0/P1 fixed and regression-tested;
- no cross-tenant or secret exposure;
- no authority bypass;
- no uncontrolled duplicate irreversible effect;
- kill/revoke/cancel containment verified;
- evidence reconstruction survives failure/attack;
- remediation ownership/evidence complete;
- Device Plane DP6 security contribution complete if shipped;
- residual P2 risks documented with owner/disposition;
- handoff sufficient for W20 release freeze.

Rollback gate: a security remediation rollback is prohibited if it reintroduces a P0/P1. If rollback is required for operational reasons, affected capability must remain disabled/contained until a safe version exists.

## 15. Gap register after 2026-09-17 reconciliation

- `BLOCKED`: W19 BUILD waits for accepted W18-I.
- `PENDING_BUILD`: converged attack-surface freeze W19-00.
- `PENDING_BUILD`: W19-A trust firewall/injection/taint.
- `PENDING_BUILD`: W19-B tenant/data/privacy/secret isolation.
- `PENDING_BUILD`: W19-C context/cache/snapshot poisoning.
- `PENDING_BUILD`: W19-D event/queue/replay/ordering abuse.
- `PENDING_BUILD`: W19-E Fast Lane/router/confidence manipulation.
- `PENDING_BUILD`: W19-F template/speculation/agent privilege drift.
- `PENDING_BUILD`: W19-G provider/workflow/credential threats.
- `PENDING_BUILD`: W19-H device threat model if Device Plane ships.
- `PENDING_BUILD`: W19-I kill switch/evidence forgery/recovery security.
- `PENDING_BUILD`: W19-J integrated red team/remediation verification.
- `READINESS_PREPARED`: threat taxonomy, severity/blockers, harness rules, security observability, privacy, incident response, remediation ownership, test and release gates.

## 16. Immediate sequence once W18-I is accepted

1. Revalidate live main, release scope and accepted W18 handoff.
2. Promote/reconcile W19-00 threat-model freeze.
3. Execute W19-A..I in parallel only where ownership/test surfaces are disjoint.
4. Route remediation to canonical source owners; preserve one source of truth.
5. Re-run relevant source-wave regression and exact-head gates for each fix.
6. Run W19-J converged attack chains after all leaf suites.
7. Keep release blocked until every P0/P1 is verified fixed.
8. Publish W19 handoff/DP6 security contribution for shipped Device Plane.
9. Release W20-00 only via canonical acceptance.

Until dependency release:

`W19-00 = READINESS PREPARED / BUILD BLOCKED BY W18-I`
