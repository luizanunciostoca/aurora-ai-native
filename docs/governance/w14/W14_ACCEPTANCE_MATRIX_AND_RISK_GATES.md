# W14 — Acceptance Matrix & Risk Gates

Status: `CANDIDATE_FREEZE_W14_00`

## Universal acceptance discipline

Every W14 BUILD node must satisfy on the same exact final candidate HEAD:

- Quality: SUCCESS;
- Test Build: SUCCESS, including intended W14 tests actually discovered/executed;
- Security: SUCCESS;
- cleanup / duplicate-source-of-truth / scope-leak audit;
- deterministic positive, negative and boundary tests proportional to scope;
- Risk Gates A-D;
- independent Program Control review/acceptance;
- live-main revalidation immediately before controlled merge;
- post-merge exact-main verification before releasing descendants.

Any candidate movement, reconciliation or rebase invalidates prior exact-head evidence until the required gates are rerun.

## W14-00 acceptance matrix

| Requirement | Evidence required | Blocking |
| --- | --- | --- |
| dependency proof | W05-H + W07-H accepted on live main | yes |
| governance-only scope | diff restricted to `docs/governance/w14/**` | yes |
| canonical namespace freeze | exactly one DeviceId/DeviceRef owner: W14-D | yes |
| W14/W15 separation | no native capability/device execution in W14 | yes |
| authority invariant | session auth/trust/Android state never action authority | yes |
| W03/W07 reuse | no duplicate durability/executor semantics | yes |
| DP3 barrier | remains closed until W14-H accepted/post-merge verified | yes |
| exact-head CI | Q/TB/S all SUCCESS on final W14-00 HEAD | yes |
| independent acceptance | connected author identity must not self-accept/self-merge | yes |

Acceptance of W14-00 releases only W14-A and W14-D.

## Descendant proof focus

- **W14-A:** malformed/unauthenticated/expired transport context, actor/tenant/session/correlation binding, deadline/cancellation, reconnect/auth expiry.
- **W14-D:** one canonical DeviceId/DeviceRef publication, tenant binding, conflicting re-registration, revoked/compromised/retired device behavior, no parallel identifier taxonomy.
- **W14-B:** finite outstanding commands/backpressure, deterministic command/session states, duplicate/reorder/resume behavior, no direct side effects.
- **W14-C:** safe progress/evidence refs without private reasoning, idempotent/race-safe cancellation, late completion after cancellation, reconnect/progress replay.
- **W14-E:** trust/attestation provenance/freshness/expiry/revocation/device binding; stale/revoked/ambiguous state fails closed; zero authority elevation.
- **W14-F:** W03-compatible dedupe/replay, disconnect/reconnect/duplicate/late ack, bounded delivery attempts, no blind redelivery after `EXECUTION_UNCERTAIN`.
- **W14-G:** revoke/kill enforcement, authenticated receipt/evidence ingress, forged/stale/wrong-tenant/wrong-device rejection, late evidence classification.
- **W14-H:** full client/device-gateway mock matrix, performance bounds, Risk A-D, DP3 publication compatibility with W07 and explicit W15 handoff.

## Risk Gate A — Correctness

PASS requires deterministic state transitions and correlation semantics for fixed inputs, a single canonical device namespace, correct session/device binding, explicit command/cancellation/revoke states and no competing source of truth.

## Risk Gate B — Safety / Authority

PASS requires tenant/device/auth/trust validation to fail closed; no session/auth/trust/receipt/UI/device presence authority elevation; no native side effect in W14; no secret exposure; compatibility with current W02/W07 execution boundaries.

## Risk Gate C — Performance / Economics

PASS requires bounded outstanding commands, fan-out, buffers/queues, retries/delivery attempts, reconnect work and ingress payloads. Test-scope latency/throughput/backpressure can be measured, but production SLO claims remain W17-owned.

## Risk Gate D — Failure / Recoverability

PASS requires explicit behavior for auth expiry, session hijack attempt, stale/revoked trust, disconnect/reconnect, duplicate/reordered delivery, cancellation races, revoke during in-flight work, late acknowledgements, forged/stale receipts and ambiguous execution outcome. Uncertainty must survive transport failure and require W07 reconciliation before retry.

## Independent release blockers

Any of the following blocks acceptance regardless of aggregate score:

- cross-tenant or wrong-device command/evidence acceptance;
- transport/session/trust state interpreted as action authority;
- competing DeviceId/DeviceRef or execution-target taxonomy;
- W14 native app/hardware execution or W15 implementation leakage;
- secret/private-key/token/keystore material persisted or logged;
- uncontrolled duplicate irreversible command/effect through reconnect/replay;
- blind retry/redelivery after ambiguous execution;
- receipt/ack treated as verified external state where readback is required;
- stale exact-head CI/review accepted after main/candidate movement.
