# W01-G Schema / Type Parity Report

## Result

W01-G reconciled the material runtime-schema / TypeScript drift discovered only after the separately developed W01 leaf contracts were compiled as real shared packages.

## Reconciliations

### Exact optional property semantics

`exactOptionalPropertyTypes` exposed runtime schemas that materialized optional properties as `undefined` even though the canonical TS contracts model absence by property omission.

Reconciled schemas:
- `ActionIntent`: provider target references, idempotency reference, expected state, execution classification and metadata.
- `Receipt`: execution ID, executor/provider references, acknowledgement/return timestamps, provider reference, execution outcome, raw provider data reference and metadata.
- `Evidence`: source, verification, readback, integrity, provenance and metadata optionals.

The schemas now conditionally include optional properties only when values exist.

### Outcome vocabulary

The W01-B Receipt test retained pre-integration outcome names such as `SUCCEEDED`. W01-G aligned Receipt with the W01-E canonical vocabulary:

- `NOT_ATTEMPTED`
- `REJECTED`
- `EXECUTED_ACKNOWLEDGED`
- `EXECUTION_UNCERTAIN`
- `VERIFIED`
- `FAILED`

A provider receipt uses `EXECUTED_ACKNOWLEDGED`; it does not imply verified external state.

### Wire envelope kinds

The consumer fixture initially expected `COMMAND_ENVELOPE` / `EVENT_ENVELOPE`. The canonical W01-A wire discriminators are `COMMAND` / `EVENT`, and the consumer fixture was corrected to those values.

### Public registry surface

`@aurora/schemas/ids` consumes provider identifier policy and ID namespace policy from the registry package. The W01-G registry barrel was expanded to export the already-canonical `PROVIDER_IDENTIFIER_POLICY`, `ID_TYPE_DEPRECATIONS` and associated types instead of bypassing the package boundary.

### Declaration generation

Context validators infer a shared `RuntimeSchema<T>` return type. Declaration emission initially failed because that type was private to `context/internal.ts`. It is now exported from the internal source module so generated declarations can name it, while it remains outside the package export map and therefore is not promoted as a supported public subpath.

### Parametrized schema factories

Command/Event envelope schemas require canonical dependency validators and therefore expose `.create()` factories rather than direct `.parse()` at the unbound root object. The integration matrix now recognizes factory-backed validators as valid runtime entrypoints and separately executes bound envelope contract tests.

## Parity enforcement

Parity is protected by:
- strict TypeScript with `exactOptionalPropertyTypes`.
- source typecheck for all packages.
- declaration-producing package builds using actual public export maps.
- compiled contract tests with type assignments to canonical interfaces.
- invalid-payload tests.
- deterministic serialization / JSON round-trip tests.
- supported/unsupported contract-version tests.
- public consumer fixture.
- package-boundary, duplicate primitive and cycle tests.

No parallel TenantId, IdentityId, CorrelationId, ContractVersion or execution-outcome vocabulary is intentionally retained by W01-G.
