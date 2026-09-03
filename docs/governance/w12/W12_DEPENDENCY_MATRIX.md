# W12 — Dependency Matrix

Status: `CANDIDATE_COORDINATION_FREEZE_W12_00`
Task: `W12-00`
Issue: `#112`

## Accepted wave-entry prerequisites

W12-00 requires exact accepted upstream surfaces from W05, W06 and W08. On the candidate base snapshot:

- W05-H `#138`: accepted.
- W06-H `#245`: accepted.
- W08-G `#259`: accepted.

Readiness, PREBUILD output, open PR state, provider connectivity or provider verification cannot substitute for `aurora:accepted` dependency evidence.

## Canonical descendant graph

The current task graph is frozen as follows:

- W12-A depends on W12-00.
- W12-B depends on W12-A.
- W12-C depends on W12-A.
- W12-E depends on W12-A.
- W12-F depends on W12-A.
- W12-D depends on W12-B, W12-C and W12-E.
- W12-G depends on W12-F.

Equivalent compact form:

`W12-00 -> W12-A`

`W12-A -> (W12-B || W12-C || W12-E || W12-F)`

`W12-B + W12-C + W12-E -> W12-D`

`W12-F -> W12-G`

W12-00 acceptance releases W12-A only. Parallelism after W12-A is allowed only where live ownership and file surfaces do not overlap.

## Dependency semantics

### W12-A — Domain contracts and capability plans

Consumes accepted target-neutral control surfaces from W04 plus accepted provider foundations from W08. It defines W12 business-domain contracts but cannot embed credentials or executable permission.

### W12-B — Account binding and reads

Consumes W12-A and W08 provider binding/read surfaces. Account verification is a precondition only. Cross-tenant or wrong-account state fails closed.

### W12-C — Creative and audience planning

Consumes W12-A plus accepted intelligence/context surfaces. Evidence and confidence remain planning inputs, never authority.

### W12-E — Financial budget, approval and current authority

Consumes W12-A while delegating policy/approval/authority truth to W02 and execution-time enforcement to W07. It must not mint a parallel financial token or Policy Engine.

### W12-F — Analytics and measurement

Consumes W12-A and provider readback/measurement observations. Attribution and performance data remain evidence, not authorization.

### W12-D — Paused-first operations

Consumes W12-B, W12-C and W12-E and executes only through accepted W07/W08 paths. It must preserve current authority, idempotency, readback and `EXECUTION_UNCERTAIN` behavior.

### W12-G — Optimization decision support

Consumes W12-F and produces recommendations only. It cannot automatically widen approved spend, target scope or activation state.

## Cross-wave dependency fences

- W12 never depends on n8n state as authority.
- W12 planning may consume W05/W06 outputs but must revalidate current policy and account bindings at execution time.
- W12 external writes require the exact applicable accepted W08 Meta adapter and W07 execution boundary.
- W12 downstream consumers must depend on accepted W12 task outputs, not this governance candidate or a PREBUILD artifact.

## Drift handling

If live `main`, a dependency issue, ownership matrix or accepted contract changes before merge, this candidate becomes stale. Reconcile first, rerun exact-head Quality/Test Build/Security and Risk Gates A-D, then reassess acceptance. Stale evidence cannot release a descendant.