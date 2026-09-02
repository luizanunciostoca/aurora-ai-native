# W10 — Acceptance Matrix & Risk Gates

Status: `CANDIDATE_FREEZE_W10_00`

## Universal acceptance discipline

Every W10 BUILD node must satisfy all of the following on the same exact final candidate HEAD:

- Quality: SUCCESS;
- Test Build: SUCCESS, including the node's intended tests actually discovered/executed;
- Security: SUCCESS;
- cleanup / duplicate-source-of-truth / scope-leak audit;
- deterministic positive, negative and boundary tests proportional to scope;
- Risk Gates A-D;
- independent Program Control review/acceptance;
- current-main revalidation immediately before controlled merge;
- post-merge exact-main verification before releasing descendants.

A moved/rebased/reconciled candidate invalidates earlier exact-head evidence until the required gates are rerun.

## W10-00 acceptance matrix

| Requirement | Evidence required | Blocking |
| --- | --- | --- |
| dependency proof | W05-H + W07-H accepted on live main | yes |
| governance-only scope | diff restricted to `docs/governance/w10/**` | yes |
| domain ownership freeze | W01-W09/W11/W17/W18 boundaries explicit | yes |
| authority invariant | score/CRM/NBA/cache/template != authority | yes |
| provider boundary | provider transport/credentials remain W08 | yes |
| W11 publication barrier | W10-G acceptance required | yes |
| exact-head CI | Q/TB/S all success on final HEAD | yes |
| independent acceptance | connected author identity must not self-accept/self-merge | yes |

Acceptance of W10-00 releases W10-A only. It does not release W10-B..G or W11.

## Descendant acceptance focus

- **W10-A:** lifecycle transition matrix, duplicate/merge/reopen/close, tenant/provenance isolation, W03 event emission.
- **W10-B:** feature/provenance determinism, recalculation, uncertainty/calibration edges, zero authority elevation.
- **W10-C:** idempotent persistence, optimistic/version conflicts, replay/rebuild, read-model lag/currentness, tenant isolation.
- **W10-D:** opt-out/consent changes, cadence bounds, duplicate outreach prevention, cancellation, provider uncertainty/reconciliation.
- **W10-E:** verified facts only, explicit rationale/provenance, abstain/escalate, W04/W05/W06 compatibility, zero executable authority.
- **W10-F:** freshness/invalidation/template versioning, low-risk fast-path eligibility, governed escalation, no W07 bypass, measurable test-scope latency/call savings without invented production claims.
- **W10-G:** integrated lead -> qualify -> persist -> NBA -> governed execution/evidence scenarios, duplicate/stale/consent/provider-failure/human-correction faults, W11 publication readiness.

## Risk Gate A — Correctness

PASS requires deterministic domain transitions for fixed inputs, explicit version/currentness semantics where needed, stable idempotency/deduplication behavior, correct replay/rebuild and no competing source of truth.

## Risk Gate B — Safety / Authority

PASS requires fail-closed tenant/subject/consent/policy boundaries; no score/confidence/state/cache/template/NBA authority elevation; no direct provider writes outside W07/W08; and no release blocker such as cross-tenant leakage, secret exposure or irreversible execution without valid current authority.

## Risk Gate C — Performance / Economics

PASS requires bounded work: finite batch sizes, query/page limits, retries, cadence, concurrency and model/tool calls as applicable. Test-scope latency/call/cost proxies may be measured, but production SLO or provider-cost claims remain W17/current-provider evidence only.

## Risk Gate D — Failure / Recoverability

PASS requires explicit behavior for stale CRM/read models, duplicate events/outreach, optimistic conflicts, cancellation races, consent changes, provider timeouts/ambiguous writes, dependency outages and replay/rebuild. `EXECUTION_UNCERTAIN` must preserve reconcile-before-retry.

## Independent blockers

The following fail acceptance regardless of aggregate score:

- cross-tenant data acceptance/disclosure;
- score/confidence/CRM state interpreted as action authority;
- provider secret/credential value committed or logged;
- uncontrolled duplicate irreversible outreach/write;
- blind retry after ambiguous external dispatch;
- bypass of current W02/W07 validation;
- silent creation of a second W03/W04/W05/W06/W07/W08/W09 source of truth.
