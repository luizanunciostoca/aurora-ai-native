# W13 — Acceptance Matrix and Risk Gates

Status: `CANDIDATE_COORDINATION_FREEZE_W13_00`
Task: `W13-00`
Issue: `#113`

## Candidate scope

W13-00 acceptance covers exactly the governance freeze under `docs/governance/w13/**`. It does not accept W13 runtime implementation, Google Ads provider writes, financial mutation, account activation or descendant tasks.

## Entry evidence

Before acceptance, Program Control must confirm live that:

- W05-H `#138` is `aurora:accepted`;
- W06-H `#245` is `aurora:accepted`;
- W08-G `#259` is `aurora:accepted`;
- the candidate is reconciled with current `main`;
- no competing canonical W13-00 PR or active worker owns the same surface.

## Exact-head technical gates

The same exact final candidate HEAD must satisfy:

1. Quality: success.
2. Test Build: success.
3. Security: success, including canonical secret/sensitive-file/dependency checks.
4. Cleanup/source-of-truth audit: no temporary diagnostics, broken references or duplicate governance truth.
5. Scope audit: only W13-00-owned governance files.
6. Review-thread audit: zero unresolved blocking threads.
7. Immediate live-main reconciliation before merge.

A candidate-head change invalidates prior exact-head acceptance evidence.

## Risk Gate A — Authority and financial safety

Pass only if:

- customer verification, credentials, provider health, analytics and recommendations remain non-authoritative;
- enabling/activation and spend/bid/budget widening require separate current authority;
- no W13 artifact creates parallel policy, approval, authority or financial tokens;
- strategy/confidence cannot widen approved financial scope.

## Risk Gate B — Tenant, CID/MCC and provider identity

Pass only if:

- tenant, customer CID and applicable manager/MCC bindings are explicit;
- provider resource IDs remain provider references rather than Aurora canonical IDs;
- wrong hierarchy, wrong customer, cross-tenant and ambiguous binding fail closed;
- secret/developer-token material is excluded from evidence/contracts.

## Risk Gate C — Execution, uncertainty and provider correctness

Pass only if:

- W07 remains generic executor and W08 remains Google Ads transport/verifier/readback owner;
- paused/non-serving-first posture is explicit where provider-supported;
- partial/ambiguous writes preserve uncertainty and reconcile-before-retry;
- quota/rate-limit handling cannot cause duplicate mutations;
- no invented n8n Google Ads capability enters execution planning.

## Risk Gate D — Publication, provenance and downstream containment

Pass only if:

- W13-00 acceptance releases W13-A only;
- TOCA references are semantic re-specifications with provenance, not inherited authority;
- all descendants remain governed by their live issue graph;
- this candidate publishes no billable/production Google Ads capability;
- W17/W18 consumers receive only accepted evidence/recommendation surfaces.

## Merge and post-merge acceptance

After all exact-head gates and Risk Gates A-D pass, merge must be guarded by the exact accepted head and current base. If `main` moves first, reconcile and rerun the required evidence.

After merge, Quality, Test Build and Security must all succeed on the resulting exact `main`. Only then may `#113` be labeled `aurora:accepted`, closed completed and release W13-A.

## Failure disposition

Any stale SHA, failing CI job, ownership conflict, provider-side effect, account/authority ambiguity, secret leak, invented provider coverage, unresolved review blocker or publication-barrier violation is a fail-closed blocker. PREBUILD/readiness evidence cannot override it.