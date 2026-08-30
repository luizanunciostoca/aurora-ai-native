# W01-G Contract Test Matrix

Status: implementation matrix complete; final acceptance is gated by exact-HEAD CI.

## Canonical contract coverage

| Contract / primitive | Runtime/type coverage | Serialization / compatibility evidence |
| --- | --- | --- |
| CommandEnvelope | `packages/schemas/src/envelopes/envelope.contract-test.ts` | deterministic serialize/parse/serialize; unsupported `2.0.0`; invalid kind/ID/timestamp/metadata/top-level fields |
| EventEnvelope | `packages/schemas/src/envelopes/envelope.contract-test.ts` | deterministic serialize/parse/serialize; unsupported `2.0.0`; invalid kind/type/source/timestamp/ID |
| ActionIntent | `packages/schemas/src/actions/action-intent.schema.test.ts` | JSON round-trip; invalid resolved parameters, idempotency, authority, version, correlation, deadline and unknown fields |
| Receipt | `packages/schemas/src/receipts/receipt.schema.test.ts` | JSON round-trip; canonical W01-E outcome vocabulary; invalid outcome/attempt/timestamps/correlation/forbidden verification claim |
| Evidence | `packages/schemas/src/evidence/evidence.schema.test.ts` | JSON round-trip; invalid subject/type/provenance/verification/order/version |
| OwnerDecision | `packages/schemas/src/policy/policy.contract.test.ts` | serialize/deserialize round-trip; state/scope/expiry validation |
| PolicyToken | `packages/schemas/src/policy/policy.contract.test.ts` | serialize/deserialize round-trip; expiry/version/authority/credential/confidence/execution-state rejection |
| CanonicalError | `packages/schemas/src/results/runtime-schema.contract-test.ts` | JSON serialization; code/category/retry/correlation/safe-details validation |
| Outcome | `packages/schemas/src/results/runtime-schema.contract-test.ts` | all canonical W01-E outcomes plus invalid outcome and EXECUTION_UNCERTAIN semantics |
| Canonical IDs | `packages/schemas/src/ids/id.schemas.test.ts` | prefix/ULID validation and serialization; registry/prefix uniqueness; provider external ID separation |
| tenant | `packages/schemas/src/context/context.schema.test.ts` | canonical and invalid tenant validation; propagation checks |
| identity | `packages/schemas/src/context/context.schema.test.ts` | actor/external identity validation and forbidden identity material |
| correlation | `packages/schemas/src/context/context.schema.test.ts` | JSON serialization and invalid correlation validation |
| version | `packages/schemas/src/versioning/version.schemas.test.ts` | stable semantic version round-trip; supported current version; unsupported version rejection |

## Integration-level tests

- `packages/schemas/test/contract-matrix.test.mjs` proves all fourteen required public validation surfaces are present and usable, including factory-backed schemas.
- `packages/schemas/test/consumer-fixture.test.mjs` resolves root packages and governed public subpaths as an external consumer would.
- `packages/contracts/test/package-boundaries.test.mjs` proves canonical primitive uniqueness, dependency direction and absence of relative source cycles.
- shipping tests in all three packages verify every export target exists in built output and that source/tests/reference material are excluded from the npm shipping set.
- `packages/schemas/test/run-compiled-tests.mjs` fails closed when no compiled contract tests are discovered and executes every compiled `*.test.js` / `*.contract-test.js` file.

## Current matrix execution evidence

During W01-G reconciliation, Test Build run `33284446287` on semantic HEAD `1810715e315085e5f293f83b293f008a86263c63` passed and executed nine compiled contract-test files plus public matrix, consumer and shipping tests. Final acceptance must use the later frozen exact HEAD after this documentation commit.
