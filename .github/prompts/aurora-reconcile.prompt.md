---
description: 'Reconcile a prepared Aurora Puzzle piece against newly accepted live contracts'
---

Prepared task/artifact: ${input:task:Enter the Aurora task or prepared artifact}

A dependency has become accepted. Do NOT promote or merge the old PREBUILD piece by assumption.

Revalidate current `main`, the accepted producer exact SHA, published contracts and current ownership.

Compare every prepared expectation against actual accepted inputs and classify each assumption:

- `SATISFIED` — compatible and reusable;
- `CHANGED` — requires bounded reconciliation;
- `INVALID` — discard the speculative implementation/assumption.

Preserve compatible tests, harnesses, threat models and plans. Discard incompatible speculation rather than forcing it into canonical architecture.

Then rebuild/reconcile useful work onto current `main`, reacquire exact path/shared-surface locks, rerun targeted tests and confirm all dependencies are live accepted.

Only Program Control may promote the result to `BUILD_READY` or `INTEGRATION_READY`. PREBUILD evidence never substitutes for exact-head BUILD/validation/acceptance gates.
