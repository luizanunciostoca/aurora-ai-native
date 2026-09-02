# W08 — Risk Register & Premortem

Status: `W08_00_RECONCILED_BUILD_CANDIDATE / RISK_FREEZE`
Date: 2026-09-02
Base exact main at branch creation: `5d7feaeb095c35c748fe7ec17ae9d1d39b3cfbcc`
Supersedes historical candidate: PR `#236` / HEAD `1fb765cd82a40f3a07522614b9b60c6be846e4b0`

## Premortem

Assume W08 failed in production. The likely causes are boundary failures rather than SDK syntax: the wrong tenant/account was targeted, a credential leaked, an ambiguous timeout was blindly retried, provider health/account verification was mistaken for authority, a planner found a transport bypass, rate limits caused a retry storm, external IDs contaminated canonical identity, provider state polluted context/cache truth, or provider-specific behavior forked W04/W07 ownership.

W08 therefore treats tenant/account binding, opaque credentials, W07-only writes, provider/context separation and reconcile-before-retry as release-critical invariants.

## Risk register

| ID | Severity | Failure mode | Required control / evidence |
| --- | --- | --- | --- |
| W08-R01 | CRITICAL | Cross-tenant or wrong-account external operation | explicit tenant/provider/account/target binding; fail closed; negative isolation matrix |
| W08-R02 | CRITICAL | Planner/router/model bypasses W07 and calls provider write directly | internal write transport below W07; public API reachability audit; negative architecture tests |
| W08-R03 | CRITICAL | Timeout/connection loss followed by blind retry duplicates post/message/campaign/spend mutation | `AMBIGUOUS_WRITE`; durable idempotency context; mandatory readback/reconcile-before-retry |
| W08-R04 | CRITICAL | Plaintext credential leaks into source, logs, fixtures, context/cache or evidence | opaque credential reference; leak scans; redacted fixtures; minimum transient exposure |
| W08-R05 | HIGH | Provider account/credential/health verification is treated as Aurora authority | explicit type/API separation; W02/W07 validation remains mandatory; negative tests |
| W08-R06 | HIGH | Provider IDs become canonical Aurora entity IDs | external-reference bindings; identity review; no provider-derived canonical ID primitive |
| W08-R07 | HIGH | Provider is treated as device and steals W14/W15 semantics | W07 target-kind separation; device-plane ownership lock; no DeviceId/runtime in W08 |
| W08-R08 | HIGH | W08 creates a second generic executor or target taxonomy | consume W07 `PROVIDER`; architecture/source-of-truth gate |
| W08-R09 | HIGH | Provider capability metadata becomes a second Capability Registry | W04 remains capability truth; W08-G publishes bindings only |
| W08-R10 | HIGH | Credential rotation/revocation leaves stale privileged material usable | resolver revocation/expiry state; short-lived resolution where possible; negative rotation tests |
| W08-R11 | HIGH | Rate-limit/quota failure triggers retry storm or cost amplification | normalized rate/quota metadata; bounded backoff; no retry on ambiguity before reconcile |
| W08-R12 | HIGH | Transport 2xx/accepted response is recorded as verified business success | separate transport result from readback/verified outcome; eventual-consistency states |
| W08-R13 | HIGH | Partial provider mutation is flattened into success/failure and loses uncertainty | normalized partial/ambiguous state; readback details; preserve provider provenance |
| W08-R14 | HIGH | Production side effects occur during tests/acceptance | mocks/sandbox/no-op/paused-first; explicit production-release prohibition |
| W08-R15 | HIGH | TOCA implementation copied with parallel authority/business assumptions | exact source provenance; semantic re-specification; `NO_DIRECT_RUNTIME_IMPORT`; license/provenance review for verbatim reuse |
| W08-R16 | MEDIUM | Provider raw error mapping hides actionable retry/auth/account detail | preserve normalized category plus safe raw/provider reference metadata |
| W08-R17 | MEDIUM | Stale pagination/cursor/resource revision causes inconsistent reads/writes | provenance/freshness/revision metadata; provider preconditions where supported |
| W08-R18 | HIGH | W11/W12/W13 decisions leak into W08 transport | ownership/path review; provider foundation exposes primitives/observations only |
| W08-R19 | HIGH | Secret-like values appear in CI artifacts or debugging diagnostics | Security + cleanup audit on exact final HEAD; remove diagnostics before final gates |
| W08-R20 | MEDIUM | GCP reference is prematurely promoted without an explicit consumer | keep GCP reference-only until accepted consumer/owner requirement |
| W08-R21 | HIGH | Provider result or credential state is cached as W06 freshness/trust/authority | W06 remains context/cache owner; credentials non-cacheable; provider facts cannot manufacture trust/authority |
| W08-R22 | HIGH | Stale candidate evidence from historical #236 is reused after 55-commit main drift | reconcile on current main; rerun exact-head gates; historical evidence remains historical only |

## Adversarial scenarios required across descendants

1. Same provider resource reference under two tenants.
2. Correct tenant with wrong provider account/business/customer ID.
3. Valid provider account but missing Aurora authority.
4. Valid Aurora authority but revoked provider credential.
5. Provider write times out after remote acceptance and before local response.
6. Retry attempted while readback remains eventually consistent.
7. Provider returns transport success but readback shows different resource/state.
8. Rate limit with and without retry-after metadata.
9. Quota exhaustion during a multi-step operation.
10. Partial mutation where one provider child resource succeeded and another failed.
11. Provider external ID crafted to collide with or resemble an Aurora ID.
12. Caller attempts to use provider health/verification as permission.
13. Planner/router/model reaches a W08 write transport directly.
14. Fixture/log serialization attempts to include a secret value.
15. Provider implementation attempts to register a new capability instead of binding an existing W04 capability.
16. Provider target is incorrectly translated into a device target.
17. Provider credential or transient token is offered to W06 cache/context as reusable data.
18. Historical #236 exact-head CI/review is presented as current candidate acceptance evidence.

## Residual risk rules

- Provider APIs can remain eventually consistent or ambiguous after correct local design. Residual uncertainty stays explicit.
- Some providers lack strong idempotency keys/conditional writes. Those operations require stronger W03/W07 execution identity, readback and duplicate controls before release.
- Provider sandboxes can differ from production. Acceptance proves architectural safety and contract behavior, not universal production equivalence.
- Financial/business risk remains owner-wave responsibility even when W08 transport is correct.
- Provider and W06 context/cache foundations may be composed downstream, but neither may reinterpret the other's authority boundaries.

## Acceptance evidence expectations

Each W08 descendant handoff includes exact base, branch, PR, exact final HEAD, changed paths, targeted/full tests, exact Quality/Test Build/Security runs, Risk Gates A-D, provider/source provenance, unsupported semantics, residual risks, blockers and downstream consumers.

Risk Gates A-D are technical COMMENT evidence, not a GitHub self-APPROVE event. Final acceptance requires expected-head integration, post-merge exact-main Quality + Test Build + Security, and owning-task convergence to `aurora:accepted`.

Evidence attached to an intermediate/stale HEAD is historical only and cannot satisfy final acceptance.
