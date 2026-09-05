# W20-00 Release Coordination, Reality & Acceptance Freeze — Readiness Artifact

Status: `PREBUILD_READINESS_ONLY`
Base main: `d84ca8c83a24d89aafe7fe4efbb12f0302587f18`
Dependency state at preparation: W19-J not accepted.
Issue: `#219`

This artifact uses only W20-00's `GOVERNANCE_ARTIFACT` prebuild allowance. It cannot satisfy W20-00, cannot authorize W20-A.. downstream release BUILD and must not merge to main before all required W00-W19 acceptances are revalidated and W19-J is accepted.

## Release invariants

- Release documents cannot waive missing exact-SHA acceptance, physical evidence, unresolved P0/P1 security findings or failed Risk Gates.
- `INTELLIGENCE != AUTHORITY != EXECUTION` remains mandatory in the released architecture.
- Presence, permission, biometrics, device trust, wake/STT confidence, provider verification and ACK are never business authority or verified outcome.
- `EXECUTION_UNCERTAIN` remains reconcile-before-retry through staging, failure tests, rollback and recovery.
- Release 1.0 scope is defined by accepted canonical runtime and evidence, not by prototypes/readiness branches.

## Final acceptance index readiness

Before W20-00 can freeze Release 1.0, build an exact acceptance inventory for every required W00-W19 node containing:

- task/wave identity;
- accepted issue/PR and exact candidate SHA;
- exact resulting main SHA / merge evidence;
- Quality, Test Build and Security evidence on the required exact candidate;
- Risk Gates A-D disposition;
- physical/external evidence references where required;
- unresolved deprecation/migration/feature-flag dependencies;
- downstream handoff reference;
- superseded/noncanonical artifacts explicitly excluded.

No missing entry may be inferred from a closed issue or green branch alone.

## Device Plane release profile

If the Device Plane ships in Release 1.0, DP5 and DP6 must be genuinely accepted and the final W20 physical Android E2E must use a candidate traceable to canonical main. Prototype wake evidence is useful readiness input only and cannot substitute canonical W15-J/DP5 evidence.

Freeze the shipped device profile explicitly: supported Android/API range, standard-app vs Device Owner/Launcher posture, assistant/wake support, gateway environments, capability set, permission model, offline behavior, known platform limitations and rollback/kill strategy.

## Staging reality gate

Production-like staging must exercise the real composed path rather than isolated mocks for claims of system readiness:

`INTAKE -> CONTEXT/PLANNING -> POLICY/AUTHORITY -> EXECUTOR -> PROVIDER/WORKFLOW/DEVICE -> RECEIPT/READBACK -> EVIDENCE -> WORKSPACE/OBSERVABILITY`

Required scenarios include success, denial, stale authority, cancellation race, provider timeout/ambiguity, `EXECUTION_UNCERTAIN`, reconnect, duplicate/replay, kill switch, credential/session revocation, evidence reconstruction and degraded dependencies.

## Performance and economics readiness

Use accepted W17 telemetry and W18 governed evaluation to establish measured baselines before final targets. Evaluate end-to-end latency, throughput, cost, queue pressure, provider/device reconnect, evidence completeness, resource use and user-experience paths. Performance wins that skip policy/authority/evidence requirements are invalid.

## Failure, stress and DR readiness

Final release evidence should include controlled service/provider outages, event/queue pressure, network partitions, retries/reconciliation, process restart, database/cache failures, backup/PITR restore, replay and kill-switch/rollback exercises. A successful backup job is not DR proof; restored system consistency and execution-safety must be observed.

## Cleanup / deprecation readiness

Before release:

- identify duplicate/stale runtime paths and compatibility shims;
- reconcile public exports/schema versions/IDs;
- close or explicitly retain feature flags with owner/rationale;
- verify migrations are complete, reversible or have documented rollback constraints;
- exclude prototype/readiness branches from production artifacts;
- verify documentation/status/evidence reflect live main rather than stale snapshots.

## Rollback manifest readiness

The final release candidate needs one recovery manifest covering:

- release/version/main SHA;
- service/package/container/app artifact digests;
- schema/database migration state and rollback compatibility;
- configuration/feature-flag versions;
- model/prompt/profile/strategy rollout versions;
- provider/workflow versions;
- Android/device profile and app artifact;
- kill-switch locations and operator paths;
- restore points and evidence references;
- explicit conditions under which rollback is unsafe and reconciliation is required first.

Rollback must not blindly replay uncertain side effects.

## Release premortem

1. Acceptance drift — exact-SHA acceptance index + live-main reconciliation.
2. Prototype accidentally ships — build/release source allowlist and artifact provenance.
3. Physical evidence missing — DP5/DP6/W20 hardware gates remain hard blockers.
4. Security P0/P1 waived — W19-J acceptance required; no documentation override.
5. Rollback duplicates side effects — preserve W03/W07 reconciliation semantics.
6. Migration rollback mismatch — test restore/migration compatibility before sign-off.
7. Staging differs materially from production — enumerate differences and block unsupported claims.
8. Governance/status docs stale — final reality audit against GitHub live state and accepted evidence.

## Release decision states

Final W20 should use explicit decision vocabulary such as `RELEASE_READY`, `RELEASE_BLOCKED`, or `LIMITED_PROFILE_READY` only after the canonical program defines the exact semantics. PREBUILD must not assign a release-ready state.

## Promotion evidence required

Final W20-00 must bind accepted W19-J, complete W00-W19 acceptance/evidence index, exact release scope, Device Plane profile/DP6 status, production-like staging identity, unresolved deprecations/migrations/flags, performance/economic baseline, DR/rollback plan, release blockers and Risk Gates A-D disposition.

Until then:

`W20-00 = READINESS PREPARED / BUILD BLOCKED BY W19-J`
