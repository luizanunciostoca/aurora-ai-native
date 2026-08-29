# ID_NAMESPACE_POLICY — W01-F

Status: ACTIVE_W01_F  
Wire identity strategy: `<prefix>_<ULID>`  
Generation responsibility: `PRODUCER`

## Canonical rule

Aurora-internal distributed IDs are opaque branded values. Their serialized form is a three-letter registered namespace prefix, `_`, and a 26-character uppercase Crockford ULID payload. Prefixes communicate object namespace only. They MUST NOT encode tenant data, authority, risk, security claims, provider state, or other mutable business state.

The ULID payload is opaque to consumers. Although ULID embeds time for generation and lexicographic locality, consumers MUST NOT use that timestamp as business chronology, authority, causation proof, or a substitute for an explicit event timestamp.

## Why ULID

ULID is retained because the active W01 coordinator architecture already standardized it before W01-F implementation and because it satisfies the distributed contract needs: 128-bit decentralized generation, compact 26-character representation, collision resistance suitable for independent producers, and useful storage/trace locality without a database sequence. UUIDv7 is a credible alternative, but switching now would create a wire-format/version migration with no demonstrated repository constraint or benefit.

Any future algorithm change that alters serialized canonical IDs is a breaking wire decision and requires ContractVersion/migration governance.

## Producer responsibility

The producer that creates a new domain object creates/obtains the object's canonical ID before publishing or persisting that object. Consumers preserve the ID; they do not silently regenerate it. Retries of the same logical production attempt must obey the object's idempotency contract rather than minting a new identity merely because transport was retried.

W01-F defines `CanonicalIdGenerator<TId>` as an injection boundary only. It does not implement a runtime ID-generation service.

Distributed contracts MUST NOT expose database auto-increment keys as canonical IDs. A local numeric surrogate may exist inside a persistence implementation only if it never escapes as the distributed identity and the canonical ID remains authoritative.

## Active namespaces

| Type | Prefix | Notes |
|---|---|---|
| TenantId | `ten` | tenant identity |
| IdentityId | `idn` | identity reference only; no W02 identity graph |
| CorrelationId | `cor` | cross-boundary correlation |
| CausationId | `cau` | causal reference identity |
| CommandId | `cmd` | command |
| EventId | `evt` | event |
| ActionIntentId | `act` | resolved action intent |
| ReceiptId | `rcp` | receipt |
| EvidenceId | `evd` | evidence |
| DecisionId | `odc` | preserves pre-W01-F OwnerDecision namespace |
| PolicyTokenId | `ptk` | policy token |
| ExecutionId | `exe` | execution |

`OwnerDecisionId` is a deprecated source alias of `DecisionId`; it does not receive a second brand or namespace.

## Future reserved namespaces

These entries reserve names only and do not create their future registries or populate capabilities/profiles/workflows/executors/providers:

- `cap` — future CapabilityId
- `prf` — future ProfileId
- `wfl` — future WorkflowId
- `xtr` — future ExecutorId
- `prv` — future Aurora-internal ProviderId

W01-F does not populate the Capability Registry.

## Provider IDs

`ProviderExternalId` is a distinct opaque brand for identifiers owned by external providers. It is not an Aurora canonical ID, is not required to be ULID, and MUST NOT be parsed, compared, or stored as an internal `ProviderId`/other internal branded ID.

Future `ProviderId` (`prv`) means an Aurora-internal identity for a governed provider entity/configuration; it is semantically distinct from a provider-returned external ID.

## Naming

Type names use PascalCase and a precise domain suffix (`CommandId`, not `Id`). Runtime validators use `<TypeName>Schema`. Registry constants use stable uppercase descriptive names such as `ID_NAMESPACE_REGISTRY`.

No prefix can be reassigned to a second semantic type. Prefix additions/reassignments require registry review, duplicate-prefix tests, compatibility analysis, and governance evidence.
