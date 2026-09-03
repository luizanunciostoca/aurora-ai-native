# W09 — Risk Register & Premortem

Status: `W09_00_BUILD_CANDIDATE / RISK_FREEZE`
Date: 2026-09-02
Base exact main at branch creation: `5715ffa4e9d4cd628c1f6d4d6e7a3410ea3d5324`

## Premortem

Assume the n8n fabric caused a serious production incident. The most plausible failures are boundary failures rather than node syntax: a duplicate webhook caused duplicate outreach/spend, a restarted workflow blindly repeated an uncertain external write, a stale workflow version executed after supersession, credentials leaked through templates/logs/evidence, the wrong tenant's credential/binding was selected, n8n workflow/run status was mistaken for Aurora authority or verified business outcome, or shell/SSH reference patterns were promoted into an uncontrolled execution path.

W09 treats replay safety, source-of-truth separation, opaque credentials, exact binding/versioning and W07-only side effects as release-critical controls.

## Risk register

| ID | Severity | Failure mode | Required control / evidence |
| --- | --- | --- | --- |
| W09-R01 | CRITICAL | Duplicate webhook/event/schedule triggers duplicate irreversible external action | W03 durable idempotency/replay integration; duplicate/out-of-order tests; W07 execution identity |
| W09-R02 | CRITICAL | Workflow restart/rerun repeats an externally ambiguous write | preserve uncertainty; target readback; reconcile-before-retry; no blind node/workflow rerun |
| W09-R03 | CRITICAL | Plaintext credential leaks through binding, workflow JSON, template, log, fixture or evidence | opaque references; redaction; secret-leak scan; sanitized fixtures |
| W09-R04 | CRITICAL | Wrong tenant/workflow/provider credential or binding selected | exact tenant/workflow/provider binding; fail closed; cross-tenant adversarial tests |
| W09-R05 | CRITICAL | n8n node directly writes provider/device around W07 | architecture/reachability tests; target-specific execution only below W07 |
| W09-R06 | HIGH | n8n workflow/run/credential/webhook state interpreted as Aurora authority | explicit semantic/type separation; negative authority tests |
| W09-R07 | HIGH | n8n becomes durable/source-of-truth rival to W03 | consume W03 event/replay/workflow state; no parallel ledger/checkpoint authority |
| W09-R08 | HIGH | Stale/superseded workflow version executes after canonical binding changed | immutable version/hash binding; lifecycle/revocation checks before run/resume |
| W09-R09 | HIGH | Workflow completion recorded as verified external business outcome despite provider uncertainty | separate workflow observation from W07/target receipt/readback evidence |
| W09-R10 | HIGH | Shell/SSH/Execute Command reference pattern creates uncontrolled local execution | remain `HIGH_RISK_INDEX_ONLY`; later explicit LOCAL_SERVICE governance required |
| W09-R11 | HIGH | Bulk migration imports embedded IDs/secrets/unsafe assumptions from corpus | curated re-specification; no bulk import; provenance/security/license gate |
| W09-R12 | HIGH | Retry storm/fan-out causes cost amplification or provider throttling | bounded retries/concurrency/fan-out; backpressure; quota/rate-limit propagation |
| W09-R13 | HIGH | Webhook authenticity treated as business permission | transport-authenticity-only rule; current authority remains W02/W07 concern |
| W09-R14 | HIGH | Cancellation races with completion and causes duplicate compensation/retry | idempotent cancellation state; explicit late completion; no implicit rerun |
| W09-R15 | HIGH | Forged/mismatched target receipt is accepted because workflow says completed | receipt/correlation/target validation remains W07/owner truth; reject synthesis |
| W09-R16 | MEDIUM | Out-of-order workflow events corrupt read model/status | causation/correlation/version sequencing; explicit order-independent reducers where possible |
| W09-R17 | MEDIUM | Reference workflow licensing/provenance is unclear but topology copied verbatim | provenance/license hold; re-specify semantics where safe instead of copying |
| W09-R18 | HIGH | Domain decisions leak into generic workflow bridge and become hidden business policy | W10-W13 domain ownership; W09 exposes orchestration primitives only |
| W09-R19 | HIGH | Provider/device prerequisite missing, workflow substitutes unsafe direct connector | fail/block; no owner-wave bypass |
| W09-R20 | MEDIUM | Sensitive workflow payload forwarded into W17/evidence surfaces | data minimization/redaction/classification; evidence references over raw payload where possible |

## Required adversarial scenarios across descendants

1. Same webhook delivered twice with identical and different transport IDs.
2. Same event arrives out of order after a later state change.
3. Schedule fires again while previous run is still active.
4. Workflow crashes after external provider accepted a write but before result acknowledgement.
5. Workflow resumes from stale/superseded binding version.
6. Correct workflow reference under wrong tenant.
7. Correct tenant but wrong credential/provider account reference.
8. Revoked credential during an in-flight workflow.
9. Webhook is authentic but current Aurora authority is absent/expired.
10. n8n run succeeds while target readback shows mismatch or eventual consistency.
11. Caller attempts direct provider/device node execution outside W07.
12. Corpus candidate contains embedded credential/private account ID.
13. Shell/SSH/Execute Command candidate is proposed for active migration.
14. Cancellation races with late target receipt.
15. Provider outage causes repeated retries/fan-out.
16. Evidence payload contains restricted/private workflow data.

## Residual risk rules

- n8n and downstream providers may each have independent retry/replay behavior. W09 acceptance requires Aurora-side duplicate safety; vendor defaults are not trusted as sufficient.
- n8n run history is useful operational evidence but does not become the only durable truth.
- Provider eventual consistency remains explicit and is handled through W07/target reconciliation rather than workflow optimism.
- Sanitization of the reference corpus reduces but does not eliminate provenance/security risk; migrated topology is still reviewed as new Aurora implementation.

## Evidence expectations

Each W09 descendant handoff records exact base, branch, PR, final HEAD, changed paths, targeted/full tests, exact Quality/Test Build/Security runs, Risk Gates A-D, binding/workflow provenance where relevant, supported/unsupported integration semantics, residual risks, blockers and downstream consumers.

Evidence attached to an intermediate or stale HEAD is historical only and cannot satisfy final acceptance.