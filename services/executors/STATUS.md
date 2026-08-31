# Status: SCAFFOLD / PLANNED_DEPENDENCY_GATED

Canonical Executor Plane target. Primary ownership belongs to W07 — Executor Plane & Side-Effect Safety.

The executor must consume governed `ActionIntent` inputs, perform current authority/policy validation where required, enforce idempotency/preconditions/quotas, and emit receipts/readback/reconciliation evidence. `EXECUTION_UNCERTAIN` remains reconcile-before-retry.

ADR-002 extends future execution targets beyond providers: W07 will own generic target resolution for PROVIDER, DEVICE, WORKFLOW and LOCAL_SERVICE through compatibility-safe contracts. This scaffold does not currently implement those execution targets.
