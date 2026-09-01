# Aurora Puzzle — Massively Parallel Program Execution Standard

Status: `CANDIDATE_FOR_ACCEPTANCE`  
Applies after acceptance to remaining W03 work and W04-W20  
Optimization target: `MINIMUM_SAFE_CRITICAL_PATH`

## 1. Purpose

Aurora development is treated as a governed puzzle: many pieces may be prepared in parallel before their final neighbors are available, but a piece becomes canonical only when its real dependencies exist, its contracts fit, its ownership is valid and the normal acceptance pipeline succeeds.

This standard separates **work capacity** from **canonical authority**.

A dependency that is not yet accepted blocks canonical BUILD and integration. It does not necessarily block every useful preparatory activity.

## 2. Authority

This is operational execution governance. It never overrides:

1. live accepted `main`;
2. exact-SHA / PR / merge / CI evidence;
3. `CURRENT_PROGRAM_STATUS.md`;
4. Developer Manual and accepted ADRs;
5. owning Wave Charter / Dependency Matrix / Ownership Matrix / Acceptance Matrix / Risk Register;
6. Drive acceptance/change/evidence/task registries.

Any disagreement fails closed.

`Intelligence != Authority != Execution` remains invariant.

PREBUILD is intelligence/preparation. It is never authority.

## 3. Two independent concurrency dimensions

### 3.1 Physical BUILD slots

Physical BUILD slots execute canonical implementation candidates whose dependencies are accepted.

Current `FREE_ACTIONS_CLI` capacity is two physical BUILD slots.

Physical capacity may increase under a future execution mode, but dependency, ownership, exact-head, security, Risk Gate and acceptance rules do not change.

### 3.2 Logical Puzzle lanes

Logical lanes are PREBUILD or READINESS contexts distributed across the full program. Their count may be much larger than physical BUILD capacity.

A typical Free-mode state may therefore be:

- 2 canonical BUILD workers;
- multiple PREBUILD governance/artifact lanes;
- multiple READINESS/test/risk/contract lanes;
- an integration/reconciliation queue;
- accepted and blocked nodes.

Logical lane existence does not consume or create canonical execution authority.

## 4. Puzzle lifecycle

Aurora recognizes these operational states:

`BLOCKED -> READINESS -> PREBUILD -> BUILD_READY -> INTEGRATION_READY -> VALIDATION -> ACCEPTED`

A task need not visit every state.

- `BLOCKED`: no canonical build; preparatory policy also does not currently permit work.
- `READINESS`: reconnaissance, contract/test/risk/ownership/integration preparation only.
- `PREBUILD`: a non-authoritative governance artifact or explicitly fenced isolated patch artifact may be prepared.
- `BUILD_READY`: every graph dependency is accepted. The node may compete for a physical BUILD slot.
- `INTEGRATION_READY`: a prepared piece has been reconciled against accepted upstream reality and can enter canonical candidate validation.
- `VALIDATION`: exact-head CI, Risk Gates, review and merge pipeline.
- `ACCEPTED`: merge/post-merge/Drive convergence complete; the task may satisfy downstream dependencies.

A green PREBUILD artifact is not BUILD_READY. A merge without complete acceptance is not ACCEPTED.

## 5. PREBUILD policies

Every task has one explicit machine-readable prebuild policy.

### `NONE`

No blocked-node preparation is authorized.

### `READINESS_ONLY`

May prepare:

- dependency/interface maps;
- expected contracts and compatibility questions;
- test matrices and fixtures design;
- risk/failure/abuse cases;
- ownership and shared-surface analysis;
- integration checklists;
- reference/source mining.

It may not claim runtime file changes.

### `GOVERNANCE_ARTIFACT`

May prepare candidate governance structures such as dependency, ownership, acceptance, contract and risk matrices.

Future `WNN-00` coordination nodes default to this policy so every future wave can be studied early.

A governance artifact cannot freeze or release the future wave. The canonical coordination freeze still waits for its real predecessor authority.

### `ISOLATED_PATCH`

Exceptional speculative implementation. It is permitted only when `prebuildAllowedPaths` is explicitly defined in machine-readable governance.

No path fence may be guessed from prose ownership.

The patch remains a PREBUILD artifact, not a PR or accepted implementation. It must later be reconciled/rebased/regenerated against accepted upstream contracts.

## 6. Prebuild artifact envelope

All PREBUILD output must declare:

- `schemaVersion`;
- `taskId` and `wave`;
- `baseSha`;
- `artifactKind`;
- `canonicalAuthority: false`;
- `requiresReconciliation: true`;
- missing dependencies;
- assumptions;
- expected and observed input contracts;
- proposed output contracts;
- integration points;
- changed paths, when explicitly authorized;
- planned tests;
- risks and blockers.

The validator rejects any PREBUILD artifact that attempts to declare canonical authority.

READINESS/GOVERNANCE artifacts must report no changed runtime paths.

ISOLATED_PATCH artifacts must pass the declared `prebuildAllowedPaths` fence.

## 7. Global Puzzle frontier

After every accepted transition, Program Control reconstructs the full W02-W20 DAG and computes two frontiers.

### Canonical BUILD frontier

Contains only nodes whose graph dependencies are all accepted.

Selection when BUILD_READY nodes exceed physical slots:

1. explicit dispatch priority;
2. longest remaining DAG path;
3. deterministic wave/task ordering.

Shared semantic writes or path overlaps fail closed.

### Logical PREBUILD/READINESS frontier

May contain blocked downstream tasks across many waves.

Selection prioritizes:

1. one future-wave coordination seed (`WNN-00`) per wave where useful;
2. lower speculation depth;
3. PREBUILD over pure readiness when equally valuable;
4. explicit priority;
5. remaining critical-path value;
6. deterministic task ordering.

The goal is not maximum agent count. Every logical lane must reduce likely future critical-path work.

## 8. Wave-wide puzzle preparation

The program no longer waits for an entire wave to finish before studying all future waves.

While canonical W03 BUILD occurs, logical lanes may prepare W04-W20 coordination artifacts, contracts, tests, risks and integration questions.

When a future coordination freeze becomes canonical, it should replace generic READINESS policies with exact task ownership, expected/output contracts, integration points and — only where safe — explicit `ISOLATED_PATCH` fences.

This progressively converts distant puzzle pieces from reconnaissance into increasingly reusable preparation without creating false authority.

## 9. Shared surfaces

The following remain Program Control surfaces unless authority is explicitly transferred:

- root workspace configuration;
- lockfiles;
- root build/TypeScript configuration;
- CI/workflows;
- CODEOWNERS;
- migration allocation/publication;
- cross-package public barrels/exports;
- other wave-defined shared publication surfaces.

One semantic surface has one canonical writer at a time.

PREBUILD does not bypass shared-surface locks.

## 10. Promotion: fitting the puzzle piece

When a missing dependency becomes accepted, Program Control does not blindly merge the prepared piece.

Promotion requires:

1. load actual accepted upstream contracts;
2. compare them to PREBUILD expected inputs;
3. classify assumptions as satisfied, changed or invalid;
4. discard or rework incompatible speculative implementation;
5. preserve reusable tests/harnesses/contracts where compatible;
6. reconcile on current accepted `main`;
7. verify ownership/path/shared-surface boundaries;
8. rerun targeted tests;
9. only then classify `BUILD_READY` or `INTEGRATION_READY`.

A speculative artifact that no longer fits is disposable. Canonical architecture is not.

## 11. Canonical candidate pipeline

Canonical implementation remains:

`DEPENDENCIES ACCEPTED -> BUILD_READY -> CLAIM -> IMPLEMENT/RECONCILE -> TARGETED TEST -> ISOLATED CANDIDATE -> PR -> EXACT-HEAD FABRIC + QUALITY + TEST BUILD + SECURITY -> RISK GATES -> INDEPENDENT REVIEW -> MERGE -> POST-MERGE VALIDATION -> DRIVE CONVERGENCE -> ACCEPTED -> RELEASE SUCCESSORS`

No PREBUILD evidence replaces this pipeline.

## 12. Free execution mode

`FREE_ACTIONS_CLI` retains two physical BUILD slots.

`maxLogicalLanes` is independent and may be much larger because logical lanes are orchestration contexts, not automatic canonical Copilot sessions.

The Free worker may claim only issues carrying canonical `PUZZLE BUILD_READY` state. It must ignore PREBUILD and READINESS lanes.

If Copilot quota is unavailable, the Control Tower may still maintain/advance logical puzzle artifacts and Program Control may execute canonical work through other authorized engineering paths. Quota never changes acceptance semantics.

## 13. Future higher-capacity modes

A paid/cloud execution mode may increase physical BUILD slots without redesigning the program.

Already prepared logical pieces can be reconciled and promoted into the additional slots immediately.

This is the main scalability property of the Puzzle architecture: **logical preparation is decoupled from current physical worker count**.

## 14. Machine-readable defaults

Task graph schema v3 adds:

- `prebuildPolicy`;
- `prebuildAllowedPaths`;
- `expectedInputContracts`;
- `outputContracts`;
- `integrationPoints`;
- `speculationBudget`.

Safe defaults:

- future `-00` coordination nodes -> `GOVERNANCE_ARTIFACT`;
- other nodes -> `READINESS_ONLY`;
- no task defaults to `ISOLATED_PATCH`;
- path-based speculative implementation requires explicit machine metadata.

This prevents false parallelism created by guessed ownership.

## 15. Success metric

Aurora optimizes:

`minimum safe end-to-end program critical-path duration`

not:

`maximum simultaneous agents`

and not:

`maximum speculative code volume`.

The winning state is many useful puzzle pieces prepared early, the smallest possible reconciliation cost, and canonical integration only when every piece actually fits.
