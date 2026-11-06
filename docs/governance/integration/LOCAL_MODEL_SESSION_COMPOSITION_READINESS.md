# Local-model session composition — private readiness

## Scope and verdict boundary

This candidate composes the existing W14 authenticated-session and device-trust
managers with the existing W05/W06 local-model preparation and bounded keyed HTTP
client. It is **private software readiness**, not a running gateway route, a JNI
integration, an activated Android feature or physical acceptance.

The new leaves are not exported from public barrels. Main, the canonical Android
candidate and the disabled native APK are not changed by this work. There is no
installation, merge to main, model download/import, feature activation or boot
change. The model response has no execution, tool or permission-granting authority.

The W14 admission leaf is composed unchanged from its existing readiness candidate.
Admission alone is insufficient: the older admission checks a session snapshot,
but does not resolve the device's current registration or finalize the request.
The new operation owns those missing lifecycle checks by calling the existing
canonical managers; it does not introduce another identity or policy registry.

## Implemented private composition

| Boundary | Responsibility | Failure behavior |
| --- | --- | --- |
| `LocalModelSessionOperation.run` | Accept only request metadata and an authenticated socket binding; admit through existing W14 ownership | Malformed, unauthenticated, replayed or stale requests do not reach the core |
| W14 current checks | Resolve current device registration, evaluate current trust/attestation, bind generation and connection | Revocation, rotation, reconnection and expiry suppress inference or output |
| `SessionBoundLocalModel` | Snapshot the exact eleven-field identity, obtain a current W05/W06 preparation, preserve the PUBLIC-only bridge | Missing producers, identity mismatch and stale purpose/consent/source observations abstain |
| `createSessionBoundKeyedLocalModel` | Reuse one existing bounded keyed client; check the request's live guard after credential acquisition and immediately before transport | Revocation while credentials are awaited must result in zero transport calls |
| Final release guard | Recheck the captured preparation synchronously after W14's last asynchronous attestation check | No stale prepared text is released; absent, duplicate or invalid guards cannot approve output |
| Lifecycle closure | Cancel/complete using the originally admitted session, connection and request | Uncertain finalization returns `RECONCILIATION_REQUIRED` and quarantines that operation; no automatic retry under another identity |

The W14 wrapper supplies a private guards object with asynchronous revalidation,
a synchronous current-state lookup and one-time registration of the final source
guard. These callbacks are injected by the trusted composition, never deserialized
from Android, a request body, prompt text or model output.

The source port must invoke the existing W05 routing and W06 retrieval/minimization
producers using the bound identity. Its asynchronous revalidation and synchronous
`isCurrent` must consult current canonical purpose, consent and provenance state.
The synchronous check is side-effect-free and fail-closed, not an optimistic cached
approval. A type, reference, timestamp, boolean or Android OS permission is not proof
that these producers have been connected to a real host.

Two asynchronous checks cannot make each other atomic. Therefore the composition
rechecks both sides synchronously at dispatch and release boundaries, including
after the keyed client's asynchronous credential lookup. No `await` separates the
last transport guard from the injected transport call. This protects the observed
in-process boundary; it does not undo a request already sent or claim instantaneous
observation of an external revocation that its authoritative provider has not delivered.

## Bounds and non-authority

- The request horizon is at most 30 seconds; a prepared projection lives at most
  10 seconds and never beyond its request deadline.
- The exact tenant, actor, correlation, gateway session, connection, generation,
  device session, device, registration version, request ID and deadline are bound.
- Captures reject accessors, hostile proxies, cycles, sparse arrays and added
  authority fields. They do not retain mutable input aliases.
- The existing client still enforces its model identity, prompt/output budgets,
  information-only response schema, timeout and single-flight rules.
- Logical cancellation or timeout does not prove transport/model quiescence.
  Unsettled work remains busy; the persistent underlying client retains its own
  busy guard after a logical response. Never replace it to bypass that state.
- Invalid synchronous verdicts are denied. A mistakenly returned native rejected
  Promise is contained, not awaited as approval; arbitrary thenables are not assimilated.
- Callback implementations must not synchronously block the JavaScript thread.
  Timers bound asynchronous waits, not arbitrary blocking trusted code.

## Reproducible offline evidence

Use the repository-pinned Node 22.16.0 and npm 10.9.2. On a clean checkout of the
candidate, the existing Test Build workflow runs the normal tests and build, then:

```sh
node node_modules/typescript/bin/tsc -p services/mobile-gateway/tsconfig.test.json --pretty false
node tools/test/local-model-session-composition.mjs
```

The mobile-gateway test configuration transpiles with `noCheck`; this command is
not evidence of strict type safety. The separate existing Quality typecheck covers
the gateway-auth leaf, and the normal test runner performs its canonical checks.

The one-tree composition proof loads actual compiled W14 managers and W05/W06
producers/consumers, including the session-bound keyed factory. All authentication,
attestation observations, source permissions, runtime health, manifest, credentials
and model responses are **explicit synthetic fixtures**. No real model, tablet,
backend or network endpoint is exercised. Global fetch is forbidden in the proof;
the only transport is the counted synthetic transport.

The script binds source/artifact digests to the current checkout, rejects a dirty
tracked source tree in normal mode and reports scenario/assertion counts. The explicit
`--allow-dirty-preparation` development mode is forbidden in CI and cannot be used as
exact-HEAD acceptance. Only untracked outputs in `services/mobile-gateway/dist-test/`,
`services/agent-runtime/dist-test/` and the existing schemas test compiler's
`packages/schemas/dist-test/` are excluded and reported; tracked changes and other
untracked files still fail. Generated outputs are not reformatted as source.

`EXACT_HEAD_SINGLE_TREE` identifies the actual checked-out commit. The existing PR
workflow may check out GitHub's merge-preview commit; this is not a repository merge
or the candidate's own SHA. Its event head and tested tree must additionally be read
back and compared with the candidate. A different tree is not acceptable as evidence
for unchanged candidate source; do not silently call distinct commit IDs identical.

Regression coverage includes current registration, identity/generation isolation,
stale/revoked source and consent, the asynchronous revalidation/credential gaps,
deadlines, cancellation, late results, retained busy state, replay, sanitization and
uncertain canonical finalization. Test results, exact candidate identity and CI
receipts belong in the existing readiness PR/coordination issue, not a fabricated
runtime or physical-acceptance status.

## Remaining gates — not implemented or proven here

1. Bind the actual host authentication, attestation, current purpose/consent/source
   producers and launcher-owned ephemeral credential provider. Absence must remain
   unavailable; a permissive fixture must never be promoted as an implementation.
2. Implement and prove the chosen native host-to-core boundary. The existing keyed
   HTTP client and this TypeScript proof are not equivalent to the disabled Android
   JNI path and do not establish a persistent tablet session.
3. Obtain the distinct authorization required for installation, model import and
   activation, then prove the installed APK/digest, device/session, current permissions,
   real inference and observable behavior. None of these actions is included here.
4. Reconcile applicable W15-J and later integration/reliability gates from live
   authority before changing their state. CI success does not certify Android.

Verdict: the candidate can prove a bounded **offline software composition**.
`RUNTIME_BOUND`, `PHYSICALLY_PROVEN` and final certification remain **NOT_PROVEN**.
