# W11 — Social / Community Wave Charter

Status: BUILD governance freeze for W11-00 (#111).

Canonical base at build claim: `b00f4818c5750330f5b2f65e9caa2caa632a628e`.
Upstream release gates: W08-G (#259) and W10-G (#263) are accepted.

## Mission

W11 owns social/community domain planning: organic publication intent and scheduling, inbound comment/DM orchestration, verified-fact fast paths, sensitive escalation, lead handoff and analytics. It does not own provider transport, generic execution authority, credentials, or provider-side write semantics.

## Frozen boundaries

- W07 remains the only generic governed execution path for external side effects.
- W08 remains the provider adapter, binding, credential-reference, health, readback and reconciliation owner.
- W10 remains CRM/lead/customer/conversation state owner; W11 may only hand off with provenance, consent and idempotency.
- W11 agents may propose plans and response candidates but cannot self-authorize publication, reply, hide/delete or DM send.
- Provider observations and analytics never grant authority.

## Child-lane release graph

Direct children of W11-00: W11-A (#289), W11-C (#290), W11-D (#291), W11-G (#300). W11-B (#315) follows W11-A. W11-E (#316) follows W11-C + W11-D. W11-F (#317) follows W11-C + accepted W10-G. W11-H (#325) follows W11-B + W11-E + W11-F + W11-G.

A child may enter BUILD only after all live dependencies are `aurora:accepted`, Program Control revalidates current `main`, and no conflicting canonical PR/owner exists.

## Acceptance invariant

No W11-00 artifact performs a real social/provider side effect. Acceptance proves ownership, dependency and safety boundaries only.
