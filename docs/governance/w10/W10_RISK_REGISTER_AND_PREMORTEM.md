# W10 — Risk Register & Pre-Mortem

Status: `CANDIDATE_FREEZE_W10_00`

## Premortem

Assume W10 failed in production. The most plausible causes are not that CRM logic could not compute a score, but that stale or duplicated business state triggered the wrong action, domain facts crossed a tenant boundary, a score silently became permission, provider uncertainty caused duplicate outreach, or W10 recreated upstream sources of truth and drifted away from accepted semantics.

## Formal risk register

| ID | Risk | Severity | Early signal | Required control / acceptance evidence |
| --- | --- | --- | --- | --- |
| W10-R01 | stale CRM/read-model state drives wrong decision | P0 | material source version/currentness lag | explicit version/currentness; stale material facts verify/escalate; replay/rebuild tests |
| W10-R02 | duplicate event/contact produces duplicate outreach | P0 | same business/correlation key yields multiple sends/tasks | domain dedupe + W03/W07 idempotency; concurrency/race tests |
| W10-R03 | cross-tenant/customer data leakage | P0 | tenant mismatch accepted in read/write/query | fail-closed tenant/subject binding; negative isolation tests |
| W10-R04 | qualification score/confidence becomes authority | P0 | score threshold directly dispatches side effect | invariant `score != authority`; current W02/W07 validation mandatory |
| W10-R05 | consent/opt-out changes after planning | P0 | pending outreach uses historical consent | invalidate/revalidate before execution; cancellation/late-change tests |
| W10-R06 | ambiguous provider outcome blindly retried | P0 | timeout after dispatch followed by immediate resend | preserve `EXECUTION_UNCERTAIN`; readback/reconcile-before-retry |
| W10-R07 | provider credentials/secrets enter CRM/evidence/cache | P0 | secret-shaped values in logs/contracts/fixtures | opaque refs only; security scans; no secret persistence |
| W10-R08 | W10 duplicates W03 durability/workflow truth | P1 | second outbox/inbox/lease/replay framework | ownership audit; reuse W03 ports/primitives |
| W10-R09 | W10 duplicates W04 capability/template registry | P1 | domain registry claims canonical capability availability | consume W04; Program Control publication review |
| W10-R10 | W10 duplicates W05 routing/confidence truth | P1 | local model route/confidence semantics diverge | consume W05 outputs; no local authority/routing taxonomy |
| W10-R11 | W10 consumes stale/unaccepted W06 cache/context surface | P1 | import from open PR/PREBUILD or missing accepted dependency | exact accepted-node dependency check before BUILD |
| W10-R12 | n8n workflow state becomes CRM/action authority | P1 | workflow/run success interpreted as business approval | W09 boundary; Aurora CRM/policy/executor remain truth |
| W10-R13 | high-value case forced through fast path | P1 | conflict/staleness/value/risk ignored by deterministic/cache route | explicit eligibility + escalation; boundary tests |
| W10-R14 | unbounded nurture cadence/retries creates spam/cost runaway | P1 | repeated task generation/send attempts | finite cadence/retry/budget bounds; cancellation/opt-out |
| W10-R15 | merge/dedup loses provenance or identity linkage | P1 | source references disappear after merge | immutable provenance links; merge/reopen tests |
| W10-R16 | read-model lag is hidden | P1 | projection appears current without source/version watermark | explicit lag/currentness metadata where material |
| W10-R17 | NBA rationale is insufficient to audit | P1 | candidate has opaque score only | reasons/provenance/evidence refs, no private chain-of-thought |
| W10-R18 | business-result metric causes online self-promotion | P1 | W10 behavior changes directly from outcome metric | W18 owns learned promotion; W10 emits evidence only |
| W10-R19 | W11 binds to intermediate W10 contract | P1 | consumer imports open/unaccepted W10 surface | W10-G publication barrier + Program Control shared-surface review |
| W10-R20 | stale exact-head CI/review accepted after main/candidate movement | P0 | gate SHA differs from final HEAD | exact-SHA discipline; rerun all required gates after reconciliation |

## Required fault scenarios before W10-G acceptance

At minimum, integration must cover: duplicate source events, concurrent lead merge/update, stale qualification features, stale CRM projection, consent withdrawal between plan and dispatch, provider timeout after dispatch, provider readback mismatch, W07 denial, tenant mismatch, context conflict, cancellation during pending outreach, human correction/reopen and replay/rebuild from durable events.

No real external side effect is required to prove these W10 semantics; mocks/fakes are preferred until the owning provider/staging waves explicitly authorize a reality gate.
