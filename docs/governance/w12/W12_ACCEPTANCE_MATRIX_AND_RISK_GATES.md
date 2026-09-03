# W12 — Acceptance Matrix and Risk Gates

Status: `CANDIDATE_COORDINATION_FREEZE_W12_00`
Task: `W12-00`
Issue: `#112`

## Candidate scope

W12-00 acceptance covers exactly the governance freeze under `docs/governance/w12/**`. It does not accept any W12 runtime implementation, Meta provider write, financial mutation, campaign activation or descendant task.

## Entry evidence

Before acceptance, Program Control must confirm on live sources that:

- W05-H `#138` is `aurora:accepted`;
- W06-H `#245` is `aurora:accepted`;
- W08-G `#259` is `aurora:accepted`;
- the candidate base is reconciled with current `main`;
- no competing canonical W12-00 PR or active worker owns the same surface.

## Exact-head technical gates

The same exact final candidate HEAD must satisfy:

1. Quality: success.
2. Test Build: success.
3. Security: success, including secret/sensitive-file/dependency checks provided by canonical CI.
4. Cleanup/source-of-truth audit: no broken canonical references, zero temporary diagnostics and no duplicate governance truth.
5. Scope audit: only W12-00-owned governance files.
6. Review-thread audit: zero unresolved blocking threads.
7. Immediate live-main reconciliation before merge.

Any candidate-head change invalidates prior exact-head acceptance evidence and requires the applicable gates to rerun.

## Risk Gate A — Authority and financial safety

Pass only if:

- provider/account verification, credentials, analytics, optimization and UI state remain non-authoritative;
- activation/unpause and spend/budget widening require separate current authority;
- no W12 governance artifact mints a parallel PolicyToken, approval or financial token;
- no optimization/confidence path can increase financial scope.

## Risk Gate B — Identity, tenant and provider binding

Pass only if:

- tenant and Meta account/business bindings are explicit;
- provider IDs remain provider references, not Aurora canonical IDs;
- wrong-account, cross-tenant and ambiguous-binding behavior is fail closed;
- secrets are excluded from governance evidence and intended contracts.

## Risk Gate C — Execution, uncertainty and replay

Pass only if:

- W07 remains the generic execution boundary and W08 remains Meta transport/readback owner;
- paused-first/non-serving staging is explicit where provider-supported;
- ambiguous writes preserve `EXECUTION_UNCERTAIN` and reconcile-before-retry;
- blind retry, implicit activation and direct planner/provider mutation are prohibited.

## Risk Gate D — Publication and downstream containment

Pass only if:

- W12-00 acceptance releases W12-A only;
- all other descendants remain governed by their live task graph;
- no production/billable capability is published by this governance candidate;
- W17/W18 consumers receive only accepted evidence/recommendation surfaces and no authority elevation.

## Merge and post-merge acceptance

After all exact-head gates and Risk Gates A-D pass, merge must be guarded by the exact accepted head and current base. If `main` moves first, reconcile and rerun required evidence.

After merge, Quality, Test Build and Security must all succeed on the resulting exact `main`. Only then may `#112` be labeled `aurora:accepted`, closed completed and release W12-A.

## Failure disposition

Any stale SHA, failing CI job, ownership conflict, provider-side effect, authority ambiguity, secret leak, unresolved review blocker or publication-barrier violation is a fail-closed acceptance blocker. PREBUILD/readiness evidence cannot override it.