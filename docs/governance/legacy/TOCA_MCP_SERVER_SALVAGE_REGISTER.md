# TOCA MCP SERVER → AURORA SALVAGE REGISTER

Status: `ACTIVE_CANONICAL_PLANNING_INPUT_CANDIDATE`
Audit date: 2026-08-31
Source repository: `luizanunciostoca/toca-mcp-server`
Audited exact `main`: `8a6cfe055be9b34e498cfbdb481e8232dc51df05`
Audited root tree: `8a6cfe055be9b34e498cfbdb481e8232dc51df05`
Scope: architecture/design/test/provider/operations reference only; never Aurora runtime authority.

## 1. Decision

`toca-mcp-server` is a **mature live implementation reference**, not a source tree to merge into Aurora.

Unlike the historical ZIPs, its immutable Git commit and blob/tree SHAs already provide exact byte-level provenance. Therefore the canonical preservation model is **Git-provenance-first**: do not duplicate the full source into Drive. Drive/GitHub Aurora store derived indexes, classifications, wave handoffs and risk decisions; any future promotion cites the exact TOCA source path + blob SHA + audited commit.

Default decision for every source is `NO_DIRECT_RUNTIME_IMPORT`.

## 2. Why this source is strategically valuable

The repository contains mature patterns for:
- deterministic autonomy/policy gating and formal approval;
- atomic approval reservation → execution → provider readback → consumption;
- transactional outbox, consumer receipts, idempotency and `FOR UPDATE SKIP LOCKED` claims;
- durable scheduler, reconciler and watchdog;
- capability catalog/lifecycle/resolution/validation evidence;
- tenant boundaries, privacy governance and secret references;
- provider read/write/readback boundaries for Instagram/Meta/Google Ads/GCP;
- audit ledger, SLO/error budgets, outbox-lag, backup/PITR/restore-drill evidence;
- experimentation/learning governance and staged rollout;
- CI architecture checks, autonomy safety, staging and operational evidence.

These patterns are substantially more reusable than legacy Aurora code, but they remain **reference implementations from a different authority/domain model**.

## 3. Critical architectural separation

Aurora remains authoritative for:
- `PolicyToken`, `OwnerDecision`, canonical Policy Engine/current-policy validation;
- canonical IDs/tenant/identity/correlation/error/outcome contracts;
- W03 EventEnvelope and durable-event semantics;
- W04 target-neutral capability planning/registry;
- W07 ActionIntent/ExecutionTarget/Executor/Receipt/Evidence boundary;
- W17 evidence/telemetry schemas;
- W18 LearningPromotionRecord/shadow-canary promotion;
- W19 trust/security;
- W20 release acceptance.

TOCA's `ApprovalRecord`, `AutonomyAuthorityLevel`, route IDs, business account bindings or MCP surfaces **must not become parallel Aurora authority**.

## 4. Highest-value source decisions

### W03 — event/persistence
Use `src/events/**`, selected `migrations/007/009/011`, durable scheduler/workflow and Postgres stores as strong implementation references. Preserve transactional semantics, idempotency, claim ownership, delivery attempts, replay/reconciliation and evidence. Re-specify against Aurora EventEnvelope/canonical IDs.

### W04 — capability registry
Use `capability-catalog`, `capability-ids`, lifecycle, resolution, validation-evidence and runtime-capability-resolver. All TOCA capability/route vocabulary is seed-only; W04 must accept/reject/rename/decompose and remain target-neutral.

### W07 — executor safety
`src/core/executor.ts` and approval atomicity are among the strongest salvage sources. Preserve reserve→execute→readback→consume and automatic-retry blocking when provider state is ambiguous.

**Do not copy one TOCA default:** the generic executor currently calls the autonomy gate with `enforceOperationalReadiness ?? false`. In Aurora, current policy/authority and required operational readiness for external side effects must remain fail-closed and non-optional.

### W08/W11-W13 — providers
Provider adapters are high-value vertical references, especially Google Ads and Instagram. Reuse request/response/readback/account verification/rate-limit/health test semantics. Provider credential, provider health or account verification never equals executable authority.

### W17/W20 — reliability/release
Reuse SLO dimensions, error-budget mechanics, verified-write checks, outbox lag, audit integrity, backup/PITR/restore-drill and CI acceptance patterns. Recalibrate numeric thresholds for Aurora rather than inheriting TOCA defaults.

### W18 — learning/evals
Use experimentation and learning-governance mechanics as reference. The closed-loop marketing runner is a stress/eval source, not permission for online self-promotion. Aurora remains Observation → Eval → candidate → SHADOW/CANARY → LearningPromotionRecord → rollbackable activation.

## 5. Risk findings

- `TMR-001 HIGH`: TOCA executor can default operational-readiness enforcement off; negative requirement for Aurora.
- `TMR-002 HIGH`: parallel authority model risk if TOCA Approval/Autonomy types are transplanted.
- `TMR-003 HIGH`: production `src` contains local `child_process` usage in creative/local provider tooling; preserve only behind governed LOCAL_SERVICE executor binding.
- `TMR-004 MEDIUM`: capability/route catalog is TOCA-domain coupled.
- `TMR-005 HIGH`: provider/account/credential bindings are tenant/domain specific.
- `TMR-006 MEDIUM`: SLO and budget thresholds are not portable defaults.
- `TMR-007 HIGH`: closed-loop learning can become unsafe if promoted without eval/promotion gates.
- `TMR-008 MEDIUM`: no root LICENSE was found at the audited commit and package is `private: true`; default to semantic re-specification and require explicit provenance/license review before verbatim code promotion.
- `TMR-010 HIGH`: MCP/tool exposure or UI control is not authority.
- `TMR-012 CRITICAL`: timeout/replay around external writes requires reconcile-before-retry to prevent duplicate posts/messages/spend changes.

## 6. Static security observations

Repository search at the audited snapshot found:
- `eval(`: 0 matches;
- `Math.random` in `src`: 0 matches;
- `child_process` in `src`: 10 matches, concentrated in local creative/tooling paths;
- `.env.example`: fail-closed provider defaults and secret-key references, without plaintext secret values in the reviewed file;
- `.gitleaks.toml`: default Gitleaks rules with a narrow explicitly-public allowlist.

These observations are not a substitute for W19 security acceptance.

## 7. Preservation / promotion protocol

1. Always pin `luizanunciostoca/toca-mcp-server@8a6cfe055be9b34e498cfbdb481e8232dc51df05` (or later explicitly re-audited commit).
2. Locate the source by path and blob SHA in the salvage catalog.
3. Owner wave promotes the smallest semantic unit, never an entire TOCA directory.
4. Re-specify with Aurora canonical contracts and authority boundaries.
5. Remove TOCA business constants/account IDs/tenant assumptions/deployment coupling.
6. Add the four Risk Validation gates.
7. Record source path, source blob SHA, transformation decision, tests and canonical successor.
8. For verbatim code reuse, additionally record provenance/license approval.
9. Never use this register as execution permission.

## 8. Artifacts

- Drive `TOCA_MCP_SERVER_SALVAGE_CATALOG_2026-08-31.xlsx`
  - Snapshot
  - Source Areas
  - Platform Patterns (full curated file-level pattern catalog)
  - Wave Handoff
  - Risk Register
- `TOCA_MCP_SERVER_SALVAGE_AUDIT_SUMMARY.json`
- Git machine-readable CSV mirrors for source areas, wave handoff and risk register. The full curated platform-pattern catalog remains in the Drive workbook to avoid duplicating a large derived table in Git.

The immutable TOCA Git repository at the exact audited commit is the byte-level source archive; Drive should not become a second source tree.
