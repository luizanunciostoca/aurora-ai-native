# W19-00 Security Coordination & Threat Model Freeze — Readiness Artifact

Status: `PREBUILD_READINESS_ONLY`
Base main: `d84ca8c83a24d89aafe7fe4efbb12f0302587f18`
Dependency state at preparation: W18-I not accepted.
Issue: `#168`

This artifact uses only W19-00's `GOVERNANCE_ARTIFACT` prebuild allowance. It cannot satisfy W19-00, cannot authorize W19-A..J BUILD/security validation and must not merge to main before the converged runtime through W18 is accepted and reconciled.

## Security invariants

- `INTELLIGENCE != AUTHORITY != EXECUTION` is a security boundary, not a UI convention.
- Untrusted input, model/tool/provider output, confidence, capability discovery, device/session trust, permission, biometric success, ACK and Receipt transport success cannot become business authority by type confusion.
- W02/W07 remain authority/execution owners; W03 remains idempotency/replay owner; W04 remains capability truth; W14 remains device registration/session/trust owner; W15-F remains Android native side-effect boundary.
- `EXECUTION_UNCERTAIN` always means reconcile-before-retry.
- P0/P1 unresolved findings block release; documentation cannot waive an exploit.

## Converged attack-surface inventory readiness

Final W19-00 must map trust boundaries and assets across intake/content, Context Broker/cache/snapshots, events/queues/inbox/outbox/DLQ, router/planner/agent/tool loops, templates/speculation, policy/authority, executors, providers/workflows/credentials, evidence/receipts, W14 gateway/session, W15 Android/device plane, W16 workspace/human control and W17/W18 telemetry/eval/promotion.

For each boundary record source trust, tenant/classification scope, validation, authority owner, side-effect boundary, replay/idempotency controls, secret exposure risk, evidence requirements and kill/revoke behavior.

## Threat classes / test matrix

### Input, prompt and tool injection

Attempt direct/indirect prompt injection, malicious retrieved content, hostile tool/provider output and instruction/data confusion. Verify untrusted content cannot directly select privileged tools, disable policy, mint authority or mutate execution state.

### Tenant, privacy and secrets

Exercise cross-tenant IDs, cache keys, queues, provider/account/device bindings, evidence, telemetry and workspace projections. Scan logs/evidence/cache/templates/telemetry for secrets and restricted data. Any cross-tenant exposure is release-blocking.

### Context/cache/snapshot poisoning

Inject stale/conflicting/poisoned context, key collisions and invalidation lag. Stale prechecks may influence intelligence only and must fail closed before authority/execution.

### Event/queue/replay abuse

Replay/duplicate/reorder events, forge correlation/causation, poison queues, stress retry storms and attempt duplicate irreversible side effects. Verify W03/W07 reconciliation and replay permission remain canonical.

### Router/confidence/economic manipulation

Spoof confidence, risk, complexity, modality and strategy/model selection. A cheap/fast route may never skip mandatory policy/authority/executor/evidence gates.

### Template/speculation/agent privilege drift

Poison templates/bindings, stale profile/capability references, speculative prep and agent handoffs. Speculation must remain side-effect-free until current deterministic authority validation.

### Provider/workflow/credential threats

Exercise wrong account, credential swap/revocation, forged external IDs/webhooks, workflow hash/version tampering, timeout/rate-limit ambiguity and secret leakage. Credential possession/verification is not authority.

### Device / Android plane

Test session hijack/replay, stolen/revoked/reinstalled/compromised devices, malicious deep links, package/signature confusion, permission drift, stale capability discovery, Keystore misuse, overlay/UI spoofing, Accessibility abuse, wake/audio adversarial inputs and reconnect duplicate dispatch. Presence/permission/assistant role/wake confidence never grants action authority.

### Kill switch / evidence forgery / recovery

Attack kill/revoke propagation and cancellation races. Forge/alter/replay Receipt/Evidence/correlation links. Verify recovery and late evidence cannot trigger blind retry or duplicate side effects.

## Finding severity readiness

P0: demonstrable cross-tenant/secret compromise, authority bypass, uncontrolled irreversible duplicate side effect, kill-switch bypass, evidence forgery enabling false verified outcome, or production-wide credential compromise.

P1: exploitable privilege escalation, unsafe replay/retry, durable evidence loss preventing reconstruction, provider/device confused deputy, or material policy/tenant isolation weakness.

P2: bounded hardening gap without authority/data-integrity compromise; must have owner, rationale and release disposition.

Final severity criteria should be reconciled with the live Risk Framework rather than treated as new policy.

## Adversarial harness rules

- Synthetic/isolated targets by default; no destructive production tests.
- Tests must preserve exact candidate/config identity and evidence.
- Do not enable prohibited shell/SSH/accessibility privileges merely to make a test convenient.
- Reproduce exploits with minimum secret exposure and redact evidence safely.
- Security test code cannot create parallel policy/executor/capability architectures.

## Remediation ownership

W19 validates and reports across the converged system. Remediation should return to the source owner wave/component unless W19 explicitly owns the shared hardening surface. Cross-wave changes require ownership reconciliation before BUILD.

## Release-blocking evidence

Final W19-00 must bind accepted W18-I, exact converged attack-surface inventory, test harness, severity/risk criteria, remediation ownership, Device Plane inclusion decision/DP6 inputs, secret handling and acceptance matrix. W19-J must close P0/P1 findings with exact remediation evidence before W20-00 can advance.

Until then:

`W19-00 = READINESS PREPARED / BUILD BLOCKED BY W18-I`
