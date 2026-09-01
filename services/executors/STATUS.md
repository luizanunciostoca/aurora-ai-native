# Status: SHARED_BUILD_TEST_BOOTSTRAP_ACCEPTED / W07_D_ACCEPTED_PUBLISHED

Canonical Executor Plane target. Primary ownership belongs to W07 — Executor Plane & Side-Effect Safety.

Program Control owns the shared TypeScript build/test bootstrap for `services/executors/**`: canonical quality typecheck discovers `services/executors/tsconfig.json`, root build compiles executor source through `tsconfig.build.json`, and the root test harness compiles/executes `services/executors/test/**/*.test.ts` through `tsconfig.test.json` when tests exist.

Accepted published leaf:
- W07-D `src/target-resolution/**` — deterministic target-neutral ExecutionTargetResolver for PROVIDER, DEVICE, WORKFLOW and LOCAL_SERVICE.

W07-D acceptance boundary:
- target resolution is availability/compatibility evidence only;
- every result fixes `authorizesExecution: false`;
- tenant mismatch, missing/ambiguous target, non-available state, stale/invalid time, schema incompatibility and unmet preconditions fail closed;
- no provider credential, PolicyToken/OwnerDecision issuance or widening, concrete provider/device/workflow runtime, or external side effect is introduced.

`services/executors/src/index.ts` is the Program Control-owned publication root and currently exports only the independently accepted W07-D target-resolution surface. W07-B/C/E/F/G/H remain independently governed and are not implied by this publication.

The executor must consume governed `ActionIntent` inputs, perform current authority/policy validation where required, enforce idempotency/preconditions/quotas, and emit receipts/readback/reconciliation evidence. `EXECUTION_UNCERTAIN` remains reconcile-before-retry.

Concrete provider/device/workflow runtimes remain owned by their consumer waves. A package manifest, lockfile registration and deployment configuration remain Program Control-owned shared publication surfaces and are still deferred until the Executor API surface is stable enough to publish without repeated workspace/lockfile churn.
