# Single-Owner Governed Acceptance

Status: CANONICAL WHEN MERGED

## Purpose

Aurora is currently maintained through a single repository-owner identity. Requiring a second GitHub identity for every acceptance/merge created a governance deadlock without materially improving the exact-head technical evidence already required by the program.

This policy removes the mandatory second-identity requirement while preserving strict acceptance, auditability and fail-closed dependency release.

## Core rule

A second GitHub identity is **optional, not required**.

An implementation worker or authoring role must not silently mark its own work accepted. However, the repository owner / Program Control may perform acceptance and merge under the same repository identity after explicitly switching to the acceptance function and satisfying every mandatory control below.

## Mandatory controls for same-identity acceptance

1. **Recorded owner authorization** — the owner decision permitting Single-Owner Governed Acceptance must be recorded in canonical GitHub or Drive governance evidence.
2. **Exact candidate identity** — acceptance binds one repository, PR number and exact final candidate HEAD.
3. **Exact canonical main** — the reviewed main SHA is recorded and revalidated immediately before merge.
4. **Required gates** — Quality, Test Build and Security must be SUCCESS on the same exact final HEAD, plus any task-specific gates.
5. **Risk Gates A-D** — Program Control / acceptance review explicitly evaluates:
   - A Correctness;
   - B Safety / Authority;
   - C Performance / Economics;
   - D Failure / Recoverability.
6. **No unresolved release blocker** — unresolved P0/P1, authority elevation, tenant/scope/ownership violation, duplicate source of truth, secret leakage, required recovery failure or failed mandatory gate requires `REWORK_REQUIRED`.
7. **CI is evidence, not authority** — green checks alone never mint acceptance.
8. **No stale evidence** — any candidate HEAD movement or relevant main drift invalidates head/main-bound evidence until reconciled and rerun.
9. **Controlled merge** — merge must specify/verify the expected candidate HEAD and must not use force merge.
10. **Post-merge verification** — required gates must pass against the exact resulting canonical main before the task can be labeled/closed `aurora:accepted` or release successors.
11. **Audit trail** — PR/issue evidence records owner authorization, exact HEAD/main, gate run IDs, Risk Gates A-D, acceptance decision, blockers/residual risks, merge SHA and post-merge verification.

## Role separation

Role separation remains required even when identity separation is not:

- implementation/build role produces the candidate and evidence;
- acceptance role independently revalidates the candidate rather than trusting implementation claims;
- Program Control / owner performs the merge only after an `ACCEPT` decision;
- post-merge lifecycle convergence is a separate verification step.

Where the `aurora-acceptance` custom agent is available, it SHOULD be used. Where the agent cannot be dispatched because of tooling limitations, Program Control MAY perform the acceptance review directly under this policy, provided the review is explicit, evidence-bound and auditable.

## Prohibited shortcuts

Single-owner mode does **not** permit:

- accepting from stale CI;
- treating an implementation-complete comment as acceptance;
- treating generic Copilot review as acceptance automatically;
- using confidence/model output as authority;
- bypassing the wave DAG or publication barriers;
- merging with failed/missing mandatory gates;
- releasing successors before post-merge verification;
- force merging;
- hiding residual risk or unresolved blockers.

## Bootstrap decision

Repository owner authorization recorded on 2026-09-02 in Program Control issue #241 explicitly removes the mandatory second-identity requirement. That owner decision authorizes the governance change that establishes this policy and, after this policy is canonical on `main`, authorizes Program Control to process the existing acceptance-pending queue under Single-Owner Governed Acceptance.

## Reversibility

If the repository later gains multiple trusted maintainers or a machine-enforced independent acceptance/finalization path, Program Control may re-enable mandatory identity separation through a later explicit governance decision. This document does not prevent independent review; it only removes it as a mandatory prerequisite.
