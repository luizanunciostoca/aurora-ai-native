# W10 — Dependency Matrix

Status: `CANDIDATE_FREEZE_W10_00`
Exact base: `5715ffa4e9d4cd628c1f6d4d6e7a3410ea3d5324`

## Internal DAG

| Node | Hard predecessors | Primary output | Additional release conditions |
| --- | --- | --- | --- |
| W10-00 | W05-H, W07-H | domain/ownership/risk freeze | independent acceptance + exact-head/post-merge gates |
| W10-A | W10-00 | lead/customer/conversation lifecycle | accepted canonical identity/tenant primitives |
| W10-B | W10-A | qualification/scoring | no score-to-authority coupling |
| W10-C | W10-A | CRM persistence/read models | reuse W03 durability; replay/rebuild proof |
| W10-D | W10-B, W10-C | nurture/sales/customer-success flows | current consent/policy; W07; accepted W08 adapter for any provider write |
| W10-E | W10-B, W10-C | next-best-action planning | W04/W05 accepted; any referenced W06 context surface accepted |
| W10-F | W10-B, W10-C | deterministic/cache/template fast paths | required W04-W06 surfaces accepted; no W07 bypass |
| W10-G | W10-D, W10-E, W10-F | integration/business outcome evals | all exact-head gates + Risk A-D + W11 publication barrier |

## Cross-wave dependency rules

### W03

W10-C and durable domain flows must use W03 event/idempotency/replay foundations. A domain projection may be rebuilt, but W10 must not create a competing generic outbox/inbox/workflow engine.

### W04

CapabilityPlan, ExecutionBudget, lanes and curated templates remain W04 truth. W10 may bind domain use cases to accepted capabilities; it must not create a second capability registry.

### W05

Reasoning, confidence and route selection remain W05 truth. W10-B/E may consume these outputs only as information/strategy inputs; they never release execution authority.

### W06

W06 is currently progressing independently. W10-00 does not require W06 completion. Any descendant whose implementation directly imports or semantically depends on a W06 retrieval/minimal-package/cache/snapshot API is blocked until that exact W06 node is accepted on live main. Open PRs and PREBUILD artifacts do not satisfy this condition.

### W07

W07 is accepted and is the mandatory generic side-effect boundary. Any W10 external action must preserve W07 current-authority, safeguards, uncertainty, receipt/readback/reconciliation and failure-containment semantics.

### W08

W08 is a conditional provider dependency. Pure domain lifecycle/scoring/read-model work does not require provider runtime. The first provider-specific write path is blocked until the exact required W08 provider family is independently accepted. Provider health/account state is precondition metadata, never authority.

### W09

If a W10 domain flow later delegates orchestration to n8n, accepted W09 bindings are required. n8n workflow/run/credential state does not become CRM truth or action authority.

### W11

W11 may consume W10 public domain/read-model/handoff surfaces only after W10-G acceptance and controlled publication. No W11 dependency is released by W10-00 alone.

## Stale evidence rule

Every integration decision must use current live main plus exact candidate HEAD evidence. If main moves and a candidate is no longer based on or cleanly reconciled with current accepted dependencies, previous CI/review evidence is stale and must be rerun on the reconciled exact HEAD.
