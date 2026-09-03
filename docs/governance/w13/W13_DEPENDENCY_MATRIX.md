# W13 — Dependency Matrix

Status: `CANDIDATE_COORDINATION_FREEZE_W13_00`
Task: `W13-00`
Issue: `#113`

## Accepted wave-entry prerequisites

On the exact candidate base, W05-H `#138`, W06-H `#245` and W08-G `#259` are closed `aurora:accepted`. PREBUILD output, open PR state, provider account verification or provider connectivity cannot substitute for accepted dependency evidence.

## Canonical descendant graph

The current task graph is frozen as follows:

- W13-A depends on W13-00.
- W13-B depends on W13-A.
- W13-C depends on W13-A.
- W13-D depends on W13-A.
- W13-F depends on W13-A.
- W13-E depends on W13-B, W13-C, W13-D and W13-F.
- W13-G depends on W13-B and W13-F.

Equivalent compact form:

`W13-00 -> W13-A`

`W13-A -> (W13-B || W13-C || W13-D || W13-F)`

`W13-B + W13-C + W13-D + W13-F -> W13-E`

`W13-B + W13-F -> W13-G`

W13-00 acceptance releases W13-A only. Parallelism after W13-A is allowed only when live ownership and file surfaces remain disjoint.

## Dependency semantics

### W13-A — Domain contracts and capability plans

Defines provider-aware, authority-neutral domain plans for Search, PMax, Display, YouTube, keywords and conversions using accepted W04/W08 surfaces.

### W13-B — Account verifier, binding and reads

Re-specifies accepted TOCA verifier/client concepts behind W08. Customer CID/MCC/account verification is a precondition only and never action authority.

### W13-C — Search, keyword and conversion planning

Consumes W13-A plus verified provider/context facts. Recommendations and confidence remain separate from financial execution.

### W13-D — PMax, Display and YouTube asset planning

Consumes W13-A and validates channel-specific asset requirements without direct provider writes.

### W13-F — Financial budget, approval and policy enforcement

Consumes W13-A while delegating current authority to W02/W07 and target-neutral budget/capability truth to W04.

### W13-E — Governed paused-first operations

Consumes W13-B, W13-C, W13-D and W13-F. It may compose writes only through accepted W07/W08 Google Ads transport and must preserve idempotency, readback and uncertainty semantics.

### W13-G — Analytics and optimization decision support

Consumes W13-B and W13-F. It normalizes measurement observations and produces recommendations without self-authorizing writes.

## Cross-wave fences

- W13 cannot infer Google Ads capability from n8n corpus coverage; the audit records no real Google Ads/AdWords workflow corpus.
- TOCA reusable references require semantic re-specification with provenance and current Aurora ownership boundaries.
- Provider account verification and credential possession do not satisfy W02/W07 authority requirements.
- W13 external writes require the exact accepted Google Ads W08 adapter plus W07 execution semantics.

## Drift handling

Any change to live `main`, accepted upstream contracts, task graph or ownership before merge makes the candidate stale. Reconcile first and rerun exact-head technical and Risk Gate evidence. Stale evidence cannot release descendants.