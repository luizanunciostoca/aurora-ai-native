# W11 Acceptance Matrix and Risk Gates

## W11-00 acceptance

- [ ] exact branch base and candidate HEAD recorded
- [ ] changed paths limited to `docs/governance/w11/**`
- [ ] ownership matrix names W07/W08/W10/W11 boundaries
- [ ] child dependency graph is explicit and matches live issues
- [ ] direct provider/social writes are frozen
- [ ] no credentials, tokens, provider SDK calls or real side effects
- [ ] Quality, Test Build and Security succeed on the same exact candidate HEAD
- [ ] immediate main/head and ownership revalidation before merge
- [ ] post-merge exact-main Quality, Test Build and Security succeed before `aurora:accepted`

## Risk Gate A — authority

PASS only if W11 plans/candidates cannot grant execution permission and every social mutation remains downstream of W07 authority/policy/approval.

## Risk Gate B — provider validity

PASS only if W08 owns provider account binding, credential references, provider health/readback and transport semantics; W11 does not invent a second adapter.

## Risk Gate C — idempotency / uncertainty

PASS only if child contracts require replay-safe identity and ambiguous writes reconcile before retry; duplicate publication/reply is fail-closed.

## Risk Gate D — rollout / observability

PASS only if staging has no real side effects, evidence/correlation survives across W11→W07/W08/W10 boundaries, and rollback/kill-switch semantics remain available through owning control planes.

W11-00 is governance-only: these gates freeze the constraints that child lanes must satisfy; they do not pre-accept child implementations.
