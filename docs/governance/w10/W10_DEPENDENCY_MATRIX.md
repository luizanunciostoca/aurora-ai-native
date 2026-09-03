# W10 — Dependency Matrix

Status: `RECONCILED_CANDIDATE_FREEZE_W10_00`
Reconciled exact main: `76aaa67a1f4f8f74b53c3340638c3b579a6c86e3`
Historical candidate origin: `5715ffa4e9d4cd628c1f6d4d6e7a3410ea3d5324`

## Internal DAG

| Node | Hard predecessors | Primary output | Additional release conditions |
| --- | --- | --- | --- |
| W10-00 | W05-H, W07-H | domain/ownership/risk freeze | governed exact-head + post-merge acceptance |
| W10-A | W10-00 | lead/customer/conversation lifecycle | accepted canonical identity/tenant primitives |
| W10-B | W10-A | qualification/scoring | no score-to-authority coupling |
| W10-C | W10-A | CRM persistence/read models | reuse W03 durability; replay/rebuild proof |
| W10-D | W10-B, W10-C | nurture/sales/customer-success flows | current consent/policy; W07; accepted applicable W08 adapter for any provider write |
| W10-E | W10-B, W10-C | next-best-action planning | W04/W05 accepted; consume accepted W06 context surfaces only |
| W10-F | W10-B, W10-C | deterministic/cache/template fast paths | accepted W04-W06 surfaces; no W07 bypass |
| W10-G | W10-D, W10-E, W10-F | integration/business outcome evals | all exact-head gates + Risk A-D + W11 publication barrier |

## Cross-wave dependency rules

### W03

W10-C and durable domain flows must use W03 event/idempotency/replay foundations. A domain projection may be rebuilt, but W10 must not create a competing generic outbox/inbox/workflow engine.

### W04

CapabilityPlan, ExecutionBudget, lanes and curated templates remain W04 truth. W10 may bind domain use cases to accepted capabilities; it must not create a second capability registry.

### W05

Reasoning, confidence and route selection remain W05 truth. W10-B/E may consume these outputs only as information/strategy inputs; they never release execution authority.

### W06

W06 is complete and accepted through W06-H on live main. W10 descendants may consume only the exact accepted public W06 surfaces they actually require and must preserve W06 trust/freshness/cache/snapshot semantics. W10 must not recreate them locally.

### W07

W07 is accepted and is the mandatory generic side-effect boundary. Any W10 external action must preserve W07 current-authority, safeguards, uncertainty, receipt/readback/reconciliation and failure-containment semantics.

### W08

W08-A provider binding and W08-B credential boundary are accepted on the reconciled main. They do not by themselves authorize provider-specific writes. A W10 provider-specific read/write path remains blocked until the exact applicable downstream W08 adapter/transport surface is accepted. Provider health/account/credential state is precondition metadata, never authority.

### W09

If a W10 domain flow later delegates orchestration to n8n, accepted W09 bindings are required. n8n workflow/run/credential state does not become CRM truth or action authority.

### W11

W11 may consume W10 public domain/read-model/handoff surfaces only after W10-G acceptance and controlled publication. No W11 dependency is released by W10-00 alone.

## Stale evidence rule

Every integration decision must use current live main plus exact candidate HEAD evidence. If main or candidate moves, previous CI/review evidence is stale and must be rerun on the reconciled exact HEAD before acceptance or descendant release.
