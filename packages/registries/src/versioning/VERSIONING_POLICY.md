# W01-F canonical versioning policy

`Version` is the canonical stable semantic-version-shaped primitive. `ContractVersion` is a stricter semantic brand used for serialized wire/schema contracts.

The initial accepted W01 wire version is `1.0.0`.

Package SemVer and wire `ContractVersion` are separate authorities. Package release versions can change without silently changing the wire contract; likewise a wire version change must be deliberate even if package tooling has not yet published a stable package.

W01 wire versions use canonical `MAJOR.MINOR.PATCH` form with non-negative decimal components and no leading zeros. Prerelease/build suffixes are intentionally excluded from the wire identifier to keep one stable serialized identity per accepted schema.

- **Major**: breaking payload/meaning/ID representation/discriminant/required propagation change unless an explicit compatibility adapter preserves the old contract.
- **Minor**: additive change only when reader/writer compatibility is defined and proven. New literal/enum values are not automatically minor.
- **Patch**: no accepted/rejected payload-set or machine-semantics change.

Unknown unsupported contract versions fail explicitly; no best-effort reinterpretation or silent coercion is permitted.

`CONTRACT_VERSION_REGISTRY` distinguishes current, supported-read, and supported-write versions so future compatibility windows are explicit.
