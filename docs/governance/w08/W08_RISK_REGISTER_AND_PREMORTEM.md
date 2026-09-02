# W08 — Risk Register & Premortem

Status: `W08_00_BUILD_CANDIDATE / RISK_FREEZE`
Date: 2026-09-02
Base exact main at branch creation: `5715ffa4e9d4cd628c1f6d4d6e7a3410ea3d5324`

## Premortem

Assume W08 failed in production. The most likely causes are not provider SDK syntax errors; they are boundary failures: the wrong tenant/account was targeted, a credential leaked, a timeout caused a duplicate mutation, a provider health/account check was mistaken for authority, a planner found a direct transport bypass, rate limits created an unsafe retry storm, external IDs contaminated canonical identity, or provider-specific behavior silently forked W04/W07 truth.

W08 therefore treats tenant/account binding, opaque credentials, W07-only writes and reconcile-before-retry as release-critical invariants.

## Risk register

| ID | Severity | Failure mode | Required control / evidence |
| --- | --- | --- | --- |
| W08-R01 | CRITICAL | Cross-tenant or wrong-account external operation | explicit tenant/provider/account/target binding; fail closed; negative isolation matrix |
| W08-R02 | CRITICAL | Planner/router/model bypasses W07 and calls provider write directly | internal write transport below W07; public API reachability audit; negative architecture tests |
| W08-R03 | CRITICAL | Timeout/connection loss followed by blind retry duplicates post/message/campaign/spend mutation | `AMBIGUOUS_WRITE`; durable idempotency context; mandatory readback/reconcile-before-retry |
| W08-R04 | CRITICAL | Plaintext credential leaks into source, logs, fixtures, context/cache or evidence | opaque SecretReference resolver; leak scans; redacted fixtures; minimum transient exposure |
| W08-R05 | HIGH | Provider account/credential/health verification is treated as Aurora authority | explicit type/API separation; W02/W07 current validation remains mandatory; negative tests |
| W08-R06 | HIGH | Provider IDs become canonical Aurora entity IDs | external-reference types/bindings; identity review; no new provider-derived canonical ID primitive |
| W08-R07 | HIGH | Provider is treated as device and steals W14/W15 semantics | W07 target kind check; device-plane ownership lock; no DeviceId/runtime in W08 |
| W08-R08 | HIGH | W08 creates a second generic executor or target taxonomy | consume W07 `PROVIDER`; architecture/source-of-truth gate |
| W08-R09 | HIGH | Provider-specific capability metadata becomes a second Capability Registry | W04 remains capability source of truth; W08-G publishes bindings only |
| W08-R10 | HIGH | Credential rotation/revocation leaves stale privileged client usable | resolver revocation/expiry state; short-lived resolution where possible; negative rotation tests |
| W08-R11 | HIGH | Rate-limit/quota failure triggers retry storm or cost amplification | normalized rate/quota metadata; bounded backoff; no retry on ambiguity without reconcile |
| W08-R12 | HIGH | Transport 2xx/accepted response is recorded as verified business success before provider state exists | separate transport result from readback/verified outcome; eventual-consistency states |
| W08-R13 | HIGH | Partial provider mutation is flattened into success/failure and loses uncertainty | normalized partial/ambiguous state; readback details; evidence retains provider provenance |
| W08-R14 | HIGH | Production side effects occur during tests/acceptance | mocks/sandbox/no-op/paused-first; explicit production-release prohibition |
| W08-R15 | HIGH | TOCA provider implementation is copied with parallel authority/business assumptions | exact source provenance; semantic re-specification; default `NO_DIRECT_RUNTIME_IMPORT`; license/provenance review for verbatim reuse |
| W08-R16 | MEDIUM | Provider raw error mapping hides actionable retry/auth/account detail | preserve normalized category plus safe raw/provider reference metadata |
| W08-R17 | MEDIUM | Stale pagination/cursor/resource version causes inconsistent reads or writes | provenance/freshness/revision metadata; provider preconditions where supported |
| W08-R18 | HIGH | Domain W11/W12/W13 decisions leak into W08 transport, creating hidden business policy | ownership/path review; provider foundation exposes primitives/observations only |
| W08-R19 | HIGH | Secret-like values appear in CI artifacts or debugging diagnostics | security scan + cleanup audit on exact final HEAD; no temporary diagnostic publication |
| W08-R20 | MEDIUM | Shared GCP/provider reference is prematurely promoted without an explicit consumer | keep GCP as reference/candidate until owner/downstream requirement is accepted |

## Adversarial scenarios required across W08 descendants

1. Same provider resource reference under two tenants.
2. Correct tenant with wrong provider account/business/customer ID.
3. Valid provider account but missing Aurora authority.
4. Valid Aurora authority but revoked provider credential.
5. Provider write times out after remote acceptance and before local response.
6. Retry attempted while readback is still eventually consistent.
7. Provider returns success but readback shows different resource/state.
8. Rate limit with and without retry-after metadata.
9. Quota exhaustion during a multi-step operation.
10. Partial mutation where one provider child resource succeeded and another failed.
11. Provider external ID crafted to collide with or resemble an Aurora ID.
12. Caller attempts to use provider health/verification as permission to execute.
13. Planner/router/model imports or reaches a W08 write transport directly.
14. Test fixture/log serialization attempts to include a secret value.
15. Provider implementation attempts to register a new capability instead of binding an existing W04 capability.
16. Provider target is incorrectly translated into a device target.

## Residual risk rules

- Provider APIs can remain eventually consistent or ambiguous even after correct local design. Residual uncertainty must remain explicit; it may not be normalized away for convenience.
- Some providers do not support idempotency keys or strong conditional writes. Those operations require stronger W03/W07 local execution identity, readback and duplicate-detection controls before release.
- Provider sandboxes may differ from production. Acceptance proves architectural safety and provider-contract behavior, not universal production equivalence.
- Financial/business risk remains owner-wave responsibility even when W08 transport is correct.

## Acceptance evidence expectations

For each W08 descendant, the handoff must include exact base, branch, PR, exact final HEAD, changed paths, targeted/full tests, exact Quality/Test Build/Security runs, Risk Gates A-D, provider/source provenance where reused, known unsupported semantics, residual risks, blockers and downstream consumers.

Any evidence attached to an intermediate/stale HEAD is historical only and cannot satisfy final acceptance.