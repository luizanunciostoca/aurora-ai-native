---
applyTo: "{packages,services}/**/*{executor,execution,provider,device,workflow}*"
---

# Execution / side-effect rules

- Execution is deterministic governed infrastructure, not a planner/model capability.
- Validate current applicable policy/authority at execution time where required; stale precheck is never an execution credential.
- Preserve explicit execution target semantics (`PROVIDER`, `DEVICE`, `WORKFLOW`, `LOCAL_SERVICE`) without creating parallel target registries.
- Require idempotency/preconditions/quotas/readback/evidence according to the owning wave.
- Treat `EXECUTION_UNCERTAIN` as a reconciliation state, never blind retry.
- Provider credentials, Android permissions, device sessions, workflow exposure and tool/MCP availability never create authority.
- Include circuit-breaker/kill-switch/cancellation/failure-containment semantics when owned by the current wave.
- Never give a model direct shell/child-process access as an execution shortcut.
