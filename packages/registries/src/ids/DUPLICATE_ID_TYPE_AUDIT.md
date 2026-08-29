# W01-F duplicate ID type audit

Baseline: `b1fc994334cff583f86937e80c812085127a67f7`

## Result

No implemented canonical TypeScript W01 ID types existed on the accepted baseline. `packages/contracts` contained only its scaffold `STATUS.md`; `packages/schemas` and `packages/registries` had not yet been implemented. The coordinator W01 initial audit also classified existing material duplicate implementations as `NONE`.

The live-repository exact search for `id: string` returned no current canonical match. Legacy/reference trees remain non-canonical and are not promoted into W01 contracts.

## Names reconciled

- `OwnerDecisionId` in the pre-implementation coordinator namespace policy is reconciled to canonical `DecisionId`. It remains a deprecated source alias only; there is one brand and one `odc` namespace.
- `CausationId` is added as a single canonical W01-F brand with `cau`.
- `ProviderExternalId` is deliberately outside the internal canonical-ID union so a provider's opaque identifier cannot satisfy an internal branded ID type.
- Future Capability/Profile/Workflow/Executor/Provider namespaces are reservations only, not duplicate domain implementations.

## Ongoing gate

The registry test asserts namespace-prefix uniqueness and format. Type-level tests assert that unrelated brands cannot be assigned to each other and that internal/provider external identities remain separated.
