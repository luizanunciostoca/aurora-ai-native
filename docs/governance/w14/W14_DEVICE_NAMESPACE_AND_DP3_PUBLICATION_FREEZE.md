# W14 — Device Namespace & DP3 Publication Freeze

Status: `CANDIDATE_FREEZE_W14_00_RECONCILED`
Reconciled main snapshot: `76aaa67a1f4f8f74b53c3340638c3b579a6c86e3`

This document freezes gateway/device-session semantics only. It does not publish runtime contracts or implement device execution.

## Canonical device namespace

W14 owns exactly one Aurora device-registration namespace:

- **DeviceId** — opaque canonical identifier for an Aurora-registered device record.
- **DeviceRef** — transport/domain-safe reference to that registered device carrying only the minimum tenant/version/context metadata required by the accepted contract.

W14-D is the only W14 node allowed to propose implementation/publication of these primitives. Shared/public publication remains subject to Program Control compatibility review.

The following are not canonical substitutes: `TabletId`, `MobileId`, `PhoneId`, Android advertising ID, app install ID, hardware serial, provider account ID, package name, session ID, attestation ID or user identity. External/device-platform identifiers may be stored only as scoped external references with provenance where justified.

## Registration boundary

A registered device must be explicitly tenant-bound and may reference canonical W01 actor/subject identities without replacing them. Registration lifecycle must model at least the states needed to distinguish usable, revoked/compromised and retired records. Wrong-tenant lookup, conflicting re-registration and revoked-device use must fail closed.

Device registration proves only that Aurora has a governed record for a device. Registration is not policy authority, consent to an action or proof that a capability is currently available.

## Gateway authentication and session boundary

W14-A authenticates gateway transport/session context and propagates tenant/actor/correlation/deadline/cancellation metadata. Authentication failure, malformed context, expired credentials and ambiguous identity/session binding fail closed.

A transport-authenticated session is not permission to execute a device action.

## Session trust / attestation boundary

W14-E may model trust/attestation references with explicit provenance, freshness, expiry, revocation and device binding. Trust is execution-precondition metadata only. It cannot mint, widen, refresh or replace `OwnerDecision`, `PolicyToken` or current W02 authority.

Raw attestation secrets, private keys, local tokens and Android Keystore material are never persisted in W14 public contracts, governance, logs, fixtures, semantic cache or evidence payloads.

## Command / progress / cancellation boundary

W14-B transports command/job references compatible with accepted W07 `ExecutionTargetReference(kind=DEVICE)`. W14-C transports safe progress, lane/DAG status and cancellation state without exposing private chain-of-thought or allowing UI state to alter authority.

Command transport does not execute the command. Native capability execution remains W15/W07 target execution.

Cancellation is idempotent and race-aware; late completion/receipt after a cancellation request must remain representable instead of being silently rewritten.

## Reconnect, replay and delivery boundary

W14-F must reuse W03 durable/idempotency/replay semantics for reconnect/offline-safe command-delivery coordination. Delivery attempts and outstanding commands must be bounded.

An `EXECUTION_UNCERTAIN` command/effect must never be blindly redelivered after reconnect. Reconcile/readback according to W07 semantics before any retry that could duplicate an irreversible effect.

Transport ordering/deduplication guarantees must be explicit and tested for duplicate, reorder, disconnect, reconnect and late-ack cases.

## Revoke / kill boundary

W14-G owns session revoke/kill transport semantics. Revocation must prevent new governed command delivery for the affected session/device according to the accepted state model. Revoke/kill does not retroactively fabricate the outcome of already-dispatched effects; late evidence must be classified explicitly.

## Receipt / evidence ingress boundary

Device receipt/evidence ingress must validate authentication, tenant, device binding, correlation, provenance, freshness/version and replay/idempotency constraints. Forged, stale, wrong-device, wrong-tenant and malformed evidence is rejected or quarantined according to the owning error semantics.

Receipt or acknowledgement presence is not verified external state. W07 readback/reconciliation remains authoritative for execution outcome semantics where verification is required.

## DP3 publication barrier

`DP3 — W14 Device Gateway/session contracts accepted` remains CLOSED until W14-H satisfies Single-Owner Governed Acceptance, merges under protected exact-head conditions, and passes post-merge exact-main verification.

DP3 opens only after all of the following are proven on the final W14-H exact HEAD and then post-merge exact main:

1. W14-A/D/B/C/E/F/G are accepted dependencies.
2. Gateway/client/device mocks cover authentication expiry, wrong tenant/device, duplicate/reordered commands, reconnect, stale/revoked trust, cancellation races, revoke/kill and receipt/evidence forgery.
3. `EXECUTION_UNCERTAIN` reconnect/retry behavior preserves reconcile-before-retry.
4. Exactly one accepted DeviceId/DeviceRef public namespace exists and remains compatible with W07 DEVICE target semantics.
5. Quality, Test Build and Security are green on the same final HEAD.
6. Risk Gates A-D pass with no release blocker.
7. Live-main and exact-head revalidation complete immediately before protected merge.
8. Post-merge exact-main verification is green and the explicit W15 handoff/publication surface is recorded.

Until DP3 opens, W15 implementation remains dependency-gated even if Android/mobile scaffolds exist.