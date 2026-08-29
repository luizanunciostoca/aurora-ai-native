# Canonical ID migration path

1. **Introduce** the successor branded type and namespace rule before changing consumers.
2. **Dual-read only when explicitly required** by a documented compatibility adapter; never silently reinterpret an unknown prefix.
3. **Preserve identity** during migration. Adapters map the same logical identity; retries do not mint replacements merely to satisfy a new representation.
4. **Separate storage migration from wire migration.** Database surrogate keys may remain implementation details while canonical IDs are backfilled/indexed.
5. **Version breaking wire changes.** Prefix/algorithm/serialized-representation changes require a major `ContractVersion` decision plus fixtures proving supported readers and writers.
6. **Deprecate with successor/removal condition** in governance and registries.
7. **Remove legacy forms only after all governed consumers are migrated** and acceptance evidence proves no active reference remains.

Current migration note: coordinator-era `OwnerDecisionId` becomes canonical `DecisionId` without a wire migration. Both source names refer to the same brand during the migration window and the existing `odc_<ULID>` representation remains unchanged.
