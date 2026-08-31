# W02-A — Handoff to PB1 / W02-D

## Producer

W02-A — Identity Resolution Contracts & Runtime.

## Public consumption boundary

Downstream consumers must use supported package subpaths, especially:

- `@aurora/contracts/identity-resolution`
- `@aurora/schemas/identity-resolution`

Tenant and processing preconditions remain separate concerns published by W02-B/W02-C. Identity resolution is descriptive and never grants authority.

## Consumer invariants

W02-D must preserve:

- tenant-preserving resolution;
- fail-closed unknown/ambiguous/conflicting identity semantics;
- external identity references as bindings only, never canonical identity IDs;
- `authorityGranted: false` as a hard identity-resolution invariant;
- deterministic replay for equivalent resolver inputs and clock snapshots.

W02-D must combine identity, tenant, consent/purpose/jurisdiction and canonical W01 authority primitives without conflating them.

## Gate

This handoff becomes effective only when PB1 is recorded complete by the W02 coordinator after exact PR #38 gates and merged-main revalidation. Until then W02-D remains gated.
