---
applyTo: "**/*.{test,spec}.ts"
---

# Test rules

- Tests must be deterministic and reproducible; avoid time/random/network dependence unless explicitly controlled.
- Include positive, negative and boundary cases for the changed behavior.
- Authority/safety tests must prove fail-closed behavior, tenant/subject/scope/time/current-policy boundaries and confidence neutrality where applicable.
- Event/execution tests must cover duplicate/replay/idempotency and uncertain/failure recovery where applicable.
- Never weaken assertions merely to make CI green.
- Preserve historical regression cases unless an accepted architectural change supersedes them with explicit evidence.
- Tests must not perform real external provider/device side effects unless the owning wave's acceptance explicitly requires a governed staging/physical test.
