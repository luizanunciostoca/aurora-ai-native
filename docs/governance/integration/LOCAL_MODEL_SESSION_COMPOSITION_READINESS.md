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
| `CurrentLocalModelPreparationSource` | Compose the owning W05 router and its current strategy port with the private current W06 context producer | Missing current records, changed routing/manifest or a stale context handle cannot become a preparation |
| `CurrentPublicModelContext` | Call the existing W02 policy/consent and W06 acquisition/retrieval/minimization implementations on current read-only owner records | Invalid policy/consent denies before data acquisition; source drift, truncation and unsafe context deny prompt release |
| Private institutional Memory Fabric projection | Select the chosen original PUBLIC text from an eligible existing COMPANY projection; preserve its complete record identity privately | Missing current owner, unsuitable lifecycle, metadata drift, revocation, expiry or changed bytes cannot become text |
| `createSessionBoundKeyedLocalModel` | Reuse one existing bounded keyed client; check the request's live guard after credential acquisition and immediately before transport | Revocation while credentials are awaited must result in zero transport calls |
| Final release guard | Recheck the captured preparation synchronously after W14's last asynchronous attestation check | No stale prepared text is released; absent, duplicate or invalid guards cannot approve output |
| Lifecycle closure | Cancel/complete using the originally admitted session, connection and request | Uncertain finalization returns `RECONCILIATION_REQUIRED` and quarantines that operation; no automatic retry under another identity |

The W14 wrapper supplies a private guards object with asynchronous revalidation,
a synchronous current-state lookup and one-time registration of the final source
guard. These callbacks are injected by the trusted composition, never deserialized
from Android, a request body, prompt text or model output.

The private source implementation composes the existing producers using the bound
identity. It does not create a policy, consent ledger, strategy registry or current
source of truth. Host-owned data adapters remain explicit dependencies: they must
read current records, not accept approval fields from Android or model output.
Neither source class is installed in a running Host or exported from a public barrel.

The W06 producer directly uses `lookupCurrentPolicy`, `precheckPolicy`,
`evaluateConsent`, `validateContextQuery`, `acquireContextCandidates`,
`evaluateContextRetrieval`, `compileMinimalContext` and
`compilePublicLocalModelPrompt`. An ACTIVE exact-version policy and its applicable
informational precheck are required; a present consent reference, PUBLIC label or
`requiresConsent: false` alone is not permission. Applicable consent must be current
and bound to the same subject, tenant, purpose and jurisdiction. Executable authority
tokens and approvals do not belong in this read-only preparation.

The W05 source invokes the owning router function with current routing data and the
existing strategy-selection port; it does not accept a preselected route as proof.
The narrow injected router/context ports avoid publishing private W06 APIs or
introducing cross-package source/deep-artifact imports. The offline composition binds
these ports to the actual canonical implementations, not an approving router stub.

Revalidation re-reads captured dependencies: current owner records, policy,
consent/purpose, source contents/revision/provenance, routing and model manifest.
Asynchronous acquisition checks both sides of a read; truncated or partly rejected
context cannot silently become READY. The synchronous current check is fail-closed,
not an optimistic cached approval. A type, reference, timestamp, boolean or Android
OS permission is not proof that a real host has supplied authentic current records.
Once a captured preparation loses observed currentness, that capture is retired;
restoring earlier owner bytes does not resurrect its handle. Recovery requires a
new preparation. Consent data-category restrictions without a canonical W06 mapping
are refused rather than silently treated as unrestricted consent.

Two asynchronous checks cannot make each other atomic. Therefore the composition
rechecks both sides synchronously at dispatch and release boundaries, including
after the keyed client's asynchronous credential lookup. No `await` separates the
last transport guard from the injected transport call. This protects the observed
in-process boundary; it does not undo a request already sent or claim instantaneous
observation of an external revocation that its authoritative provider has not delivered.

## Owner-delegated institutional data — not operational authority

On 2026-11-06 the owner explicitly delegated the choice of content for this first
information-only preparation. The exact decision, selected text and bounded source
allocation are recorded in [#575/6691169203](https://github.com/luizanunciostoca/aurora-ai-native/issues/575#issuecomment-6691169203).
The original assistant-authored text is versioned once in
`packages/context/src/sources/aurora-institutional-content.ts`. It describes the
Aurora project's goals and distinguishes an informational response from an action.
It is not a transcript of private conversations, a third-party excerpt or a claim
that the product is already active.

The selected content is **353 UTF-8 bytes**, without a trailing newline; SHA-256
`4ec28cf000232d5ecaac43dd28e0d760b020116b5b014455239ade7c3c3b2280`.
The file is a content/provenance candidate only. It contains no tenant, actor,
session, current observation, active consent, policy ALLOW or fabricated validation
and promotion receipt. Neither importing the module nor approving its prose writes
to W03 or promotes it to a current production Memory Fabric record.

The private source adapter consumes the existing `readMemoryProjection` operation
and exact `ContextSourceItem` contract. It does not create another registry, store
or policy engine. Only the chosen exact text may pass, from one eligible COMPANY /
COMPANY_KNOWLEDGE / PUBLIC / TEXT projection with matching digest, revision and
provenance, no conflict and appropriate existing lifecycle evidence. A CANDIDATE
does not become VALIDATED or CANONICAL merely because the adapter needs a result.

The facade keeps one bounded comparison capture, not a source of truth. It binds
the original eleven identity fields, snapshot revision and complete source record;
the same text with a changed owner, lifecycle revision, validation/promotion
reference or source-commit identity is not the same capture. Every current-source
read consults the synchronous, non-blocking owning snapshot provider again.
Missing, asynchronous, revoked or changed source state invalidates that capture;
restoring old bytes cannot revive it. A new preparation requires a new instance.

Capture expiry is bounded by the request deadline and ten seconds. The original
`observedAt` is preserved, never renewed just because the source was read. The
existing retrieval policy still owns the admissible age of COMPANY knowledge.
An asynchronous W03 load or an old in-memory snapshot is not, by itself, a truthful
synchronous current owner; this work does not install that operational provider.

W02 policy/purpose and any required consent remain independent. PUBLIC is neither
an automatic consent exemption nor an obligation to invent a ConsentRecord. An
absent or denying current policy still blocks the real selected content. No
`requiresConsent: false` fallback is introduced by this data adapter.

The software proof uses the real selected text and actual Memory Fabric selection,
projection and W02/W05/W06/W14 code. Any identity, policy, lifecycle promotion,
attestation or model result supplied by its harness remains explicitly synthetic.
Passing that proof is not a production source promotion or native inference.

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

The normal test runner builds the already-published W02 policy package after
contracts, before dependent tests. Quality's no-emit context project resolves that
same public query API to its source. Emitted build/test configurations retain their
normal package resolution. No public export, package manifest or lockfile change is
needed, and a successful run must not rely on stale local declaration artifacts.

The mobile-gateway test configuration transpiles with `noCheck`; this command is
not evidence of strict type safety. The separate existing Quality typecheck covers
the gateway-auth leaf, and the normal test runner performs its canonical checks.

The one-tree composition proof loads actual compiled W14 managers and W02/W05/W06
producers/consumers, including the current-record source classes and the session-bound
keyed factory. The earlier injected-preparation boundary regressions remain explicitly
distinguished from the new concrete-producer scenarios. The institutional scenarios
also use the actual Memory Fabric reducers and private text projection, with the
real selected original text. Authentication, attestation, current owner records,
lifecycle evidence, other source data, runtime health, manifest, credentials and
model responses remain **explicit synthetic fixtures**. The canonical evaluators and
new producer implementations are actual code; the fixtures are not real consent or
an authenticated data-owner service. No real model, tablet, backend or network
endpoint is exercised. Global fetch is forbidden; the only model transport is counted
and synthetic.

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

1. Bind the actual host authentication, attestation and current purpose/consent/source
   owners. The institutional content and text projection are prepared, but they do
   not supply those operational owners or create persistent records. Absence must
   remain unavailable; a permissive fixture must never be promoted as an
   implementation. Launcher-owned ephemeral credentials apply only if the keyed
   HTTP transport is chosen; they are not an inherent prerequisite for JNI.
2. Implement and prove the chosen native host-to-core boundary. The existing keyed
   HTTP client and this TypeScript proof are not equivalent to the disabled Android
   JNI path and do not establish a persistent tablet session. Before native activation,
   current source/session checks must be bound to the chosen native candidate after
   model-file verification/loading and before generation and final result release.
   Native Draft #589 separately supplies cooperative internal checkpoints; it is
   not imported or activated by this core candidate. A cached Android connection
   snapshot or one initial prompt resolution is insufficient. The existing Android
   HTTP channel has a finite request budget and synchronizes network post/close;
   do not map every decode checkpoint to an unbudgeted request or make local
   cancellation wait on that monitor. A revised authenticated lifecycle must
   preserve the original W14 request until genuine finalization, without creating
   a second server, identity or approval cache.
3. Obtain the distinct authorization required for installation, model import and
   activation, then prove the installed APK/digest, device/session, current permissions,
   real inference and observable behavior. None of these actions is included here.
4. Reconcile applicable W15-J and later integration/reliability gates from live
   authority before changing their state. CI success does not certify Android.

Verdict: the candidate can prove a bounded **offline software composition**.
`RUNTIME_BOUND`, `PHYSICALLY_PROVEN` and final certification remain **NOT_PROVEN**.
