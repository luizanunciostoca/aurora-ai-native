# W04 CAPABILITY SEED ADJUDICATION RULES

Date: 2026-09-01  
Status: `W04_00_COORDINATION_FREEZE_CANDIDATE`

W04-B is the only W04 node authorized to promote capability vocabulary into the canonical Capability Registry. The 69 legacy seeds and all TOCA capability/route vocabulary remain `SEED_ONLY_NOT_CANONICAL` until individually or semantically grouped through this process.

## Required decision

Each candidate receives exactly one semantic disposition:
- `ACCEPT` — canonical target-neutral capability semantics are valid as written after Aurora re-specification.
- `RENAME` — semantic intent is valid but canonical name must change.
- `DECOMPOSE` — one legacy/TOCA verb hides multiple independently governed capabilities.
- `REJECT` — duplicate, unsafe abstraction, implementation detail, authority concept, provider-specific route, stub or non-capability.

## Required canonical metadata before acceptance

- stable capability identity/name/version;
- semantic description and inputs/outputs at the capability level;
- supported target kind(s) without embedding executor implementation;
- risk/side-effect/reversibility classification;
- required current authority/precondition descriptors as informational requirements only;
- compatibility and availability/freshness semantics;
- readback/evidence strategy descriptor;
- idempotency/reconciliation expectation when applicable;
- provenance: source register, source path/identifier and audited commit/blob where available;
- explicit statement that capability metadata is not executable authority.

## Rejection defaults

Reject direct promotion of:
- legacy dynamic plugin wrappers or stub-success behavior;
- TOCA Approval/Autonomy/route/business authority concepts;
- shell/process/browser/device/provider executor implementations;
- hardcoded account/tenant/provider IDs or secrets;
- random validation/selection semantics;
- aliases whose only distinction is provider/UI implementation rather than capability semantics;
- any seed that duplicates an already canonical semantic capability.

## High-risk vocabulary

Seeds such as shell execution, browser console execution, file deletion, deploy operations and device power operations may remain recognized capability vocabulary only if their risk/authority/readback requirements are explicit. Their inclusion never authorizes W04 to implement or execute them.

## Device rule

A canonical capability may declare compatibility with future target kind `DEVICE`, but W04-B must not define DeviceId/DeviceRef, session/trust, Android permission brokerage, installed-app execution mechanics or Device Executor behavior. Those remain W14/W15/W07 ownership.

## Publication

The adjudication result is canonical only after W04-B acceptance. Until then, seed decisions are candidate evidence and cannot be consumed as an executable or authoritative registry by downstream waves.
