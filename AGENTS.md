# Aurora AI-Native — Shared Agent Rules

These rules apply to AI agents working in this repository.

1. Revalidate live repository state before work. Never trust a stale handoff.
2. Respect the active wave DAG, publication barriers and one-owner-per-path rule.
3. If a dependency is not accepted/published, do not implement through it; report `BLOCKED` or perform readiness-only work when allowed.
4. Never widen scope because a nearby change looks convenient.
5. Never create a second canonical primitive, registry, policy engine, executor boundary or source of truth.
6. Shared/root/publication surfaces are coordinator-owned unless the task explicitly transfers them.
7. Keep intelligence, policy/authority and execution separated. Information or confidence never becomes permission.
8. Side-effect safety requires current applicable authority, idempotency/preconditions where applicable, receipt/readback/evidence and reconcile-before-retry for uncertain outcomes.
9. Work in an isolated branch/PR. Do not merge your own work or self-accept it.
10. Required CI/evidence must refer to the same exact final HEAD; reconcile against a changed `main` and rerun stale gates.
11. Treat legacy/Nova/n8n/TOCA material as reference-only unless explicit promotion is authorized.
12. Do not expose secrets, credentials, private reasoning or personal data.
13. Before claiming completion, run cleanup/duplication/scope-leak checks and produce the standard Aurora handoff.

When instructions conflict, use this precedence: live `main` + accepted exact-SHA/PR evidence -> `CURRENT_PROGRAM_STATUS.md` -> Developer Manual v0.5 -> accepted ADRs -> owning wave documents -> Drive registries -> historical/reference material.
