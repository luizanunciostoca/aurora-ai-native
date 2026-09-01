# W05 RISK REGISTER & PRE-MORTEM

Date: 2026-09-01  
Status: `W05_00_COORDINATION_FREEZE_CANDIDATE`  
Framework: AURORA Risk & Architecture Validation Framework v1.0  
Base main: `b502bfa7e97291086c09cc85cd71040f96d3b036`

Exposure = likelihood × impact × detectability. 1-20 LOW; 21-40 MODERATE; 41-70 HIGH; 71-125 CRITICAL.

Independent release blockers: authority bypass, cross-tenant breach, hidden/uncontrolled external side effect, secret/private-reasoning exposure or unbounded autonomy that can evade deterministic governance.

## W05-R01 — Confidence becomes authority
L4 I5 D5 = 100 CRITICAL. Confidence/consensus is interpreted as permission. Controls: type/API separation, negative tests, W07 current validation mandatory. Owner: D/B/G/H.

## W05-R02 — Router bypasses Policy/Executor
L3 I5 D5 = 75 CRITICAL. A “fast” strategy directly invokes a tool/provider. Controls: routing emits strategy/planning evidence only; external side effects only via W07. Owner: B/G/H.

## W05-R03 — God-object agent orchestrator replaces W04 control
L3 I5 D4 = 60 HIGH. Agent runtime silently owns GoalGraph/scheduler/lifecycle. Controls: W04 source-of-truth lock; agent runtime receives bounded work only. Owner: F/G/Program Control.

## W05-R04 — Duplicate durable worker/workflow engine
L3 I5 D4 = 60 HIGH. W05 creates its own authoritative leases/timers/replay. Controls: consume W03 durability; no competing persistent truth. Owner: F/G.

## W05-R05 — Second Capability Registry via strategy metadata
L3 I5 D4 = 60 HIGH. Strategy registry copies capability identity/permissions. Controls: separate namespaces/contracts; strategies reference capability requirements, not redefine them. Owner: E/B.

## W05-R06 — Unbounded adaptive loop
L4 I4 D4 = 64 HIGH. Inspect/repair loop consumes unlimited time/cost/tool calls. Controls: hard iteration/time/model/tool/budget bounds, cancellation and abstention. Owner: G/H.

## W05-R07 — Over-agentification cost/latency explosion
L4 I4 D3 = 48 HIGH. Routine deterministic tasks spawn agents/teams. Controls: mandatory over-agentification gate; no-AI first; benchmark compute per quality. Owner: 00/B/F/H.

## W05-R08 — Strategy/model provider hard coupling
L3 I4 D3 = 36 MODERATE. Router embeds one provider/model and prevents fallback. Controls: target/provider-neutral strategy registry and compatibility metadata. Owner: E/B.

## W05-R09 — Stale strategy availability
L3 I4 D4 = 48 HIGH. Router selects unavailable/incompatible model/specialist. Controls: freshness/availability/version, deterministic fallback/abstention. Owner: E/B.

## W05-R10 — Cross-tenant worker/strategy leakage
L2 I5 D5 = 50 HIGH and release-blocking if realized. Controls: canonical tenant identity and explicit scoping for persisted/cached worker state; negative fixtures. Owner: A/B/F/G/H.

## W05-R11 — Context engine ownership leakage
L3 I4 D3 = 36 MODERATE. W05 creates memory/cache/retrieval to “help” router. Controls: W06 owns context runtime; W05 consumes interface only. Owner: B/G/Program Control.

## W05-R12 — Learning/promotion leaks from W18
L3 I5 D4 = 60 HIGH. W05 self-promotes a route/template/model from online outcomes. Controls: W05 observations/evals only; promotion remains W18 shadow/canary governance. Owner: D/E/H.

## W05-R13 — Evidence gap / private chain-of-thought retention
L3 I4 D4 = 48 HIGH. Incident is unreconstructable or sensitive reasoning is persisted. Controls: structured reason codes/provenance/confidence decomposition/outcome references; never require private reasoning traces. Owner: A-H.

## W05-R14 — Router manipulation / prompt/tool-output injection
L3 I5 D4 = 60 HIGH. Untrusted content alters strategy or asks to bypass controls. Controls: structured bounded inputs, W06 trust boundary when available, deterministic invariants and W07 validation. Owner: B/G; later W19 hardening.

## W05-R15 — Benchmark gaming / false efficiency claim
L3 I4 D4 = 48 HIGH. Lower cost is reported by degrading quality or cherry-picking fixtures. Controls: versioned datasets, quality threshold, route coverage, environment disclosure and W18/W17 later production evidence. Owner: H.

## PRE-MORTEM — assume W05 failed in production

1. High confidence was treated as permission. Action: confidence can only request strategy/verification changes; W07 validates authority independently.
2. A router shortcut directly called a provider. Action: remove direct execution APIs from W05 ownership and enforce ActionIntent/Executor boundary.
3. Agent runtime became a second control plane. Action: W04 remains lifecycle/graph/scheduler truth; agents receive bounded tasks only.
4. Worker leases split from W03 and duplicate work ran. Action: consume W03 durability and fencing semantics.
5. Cheap deterministic tasks spawned multi-agent teams. Action: enforce over-agentification gate and no-AI route baseline.
6. One model/provider outage stalled all intelligence. Action: registry compatibility/fallback/abstention.
7. Loop repair never converged and exhausted spend. Action: hard bounds + explicit terminal states.
8. Tenant data crossed through worker state. Action: tenant-keyed state and negative cross-tenant tests.
9. Strategy learned online and silently promoted itself. Action: observations only; W18 governs promotion.
10. Evidence showed outcome but not why route was selected. Action: structured route reason/provenance without private chain-of-thought.

## Stress and failure plan

- deterministic/no-AI fixture pressure;
- ambiguous/conflicting classifier signals;
- strategy outage/staleness/incompatibility;
- model timeout/rate-limit/malformed response;
- worker concurrency/lease loss/reclaim/cancellation;
- adaptive loop at every bound dimension;
- cross-tenant isolation fixtures;
- malicious/untrusted model/tool-output strings;
- ExecutionBudget exhaustion while mandatory governance remains intact;
- route fallback/escalation chains;
- benchmark load with p50/p95/p99 test-scope measurements.

## Architecture kill criteria

Redesign before acceptance if W05 creates authority from intelligence, a direct side-effect path, a second capability/control/durable-workflow source of truth, unbounded agent autonomy, default multi-agent orchestration, cross-tenant state leakage, online self-promotion, provider hard-coupling without fallback or unreconstructable/private-reasoning-dependent evidence.