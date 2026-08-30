# W01-G Package Export Audit

## Integrated packages

All three W01 shared packages are versioned `0.1.0` and participate in the canonical npm workspace.

### `@aurora/contracts`

Public root plus governed subpaths:
- `./actions`
- `./context`
- `./envelopes`
- `./evidence`
- `./ids`
- `./policy`
- `./receipts`
- `./results`
- `./versioning`

The package is the dependency floor. Boundary tests reject imports from schemas, registries, apps, services or protected reference material.

### `@aurora/registries`

Public root plus:
- `./ids`
- `./versioning`

The ID barrel exports the canonical namespace registry, provider identifier policy, deprecation registry and associated registry types. Registry builds resolve `@aurora/contracts` through the real package export map using Node16 module resolution.

### `@aurora/schemas`

Public root plus governed subpaths corresponding to W01 contract domains:
- `./actions`
- `./context`
- `./envelopes`
- `./evidence`
- `./ids`
- `./policy`
- `./receipts`
- `./results`
- `./versioning`

Schema builds resolve `@aurora/contracts` and `@aurora/registries` through their actual export maps using Node16 module resolution.

## Dependency direction

Canonical direction is:

`@aurora/schemas -> @aurora/registries -> @aurora/contracts`

and, where registry data is not required:

`@aurora/schemas -> @aurora/contracts`

Forbidden direction:

`@aurora/contracts -> schemas | registries | apps | services | protected reference trees`

## Barrel/cycle controls

- Root/domain barrels are owned by W01-G.
- IDs and versioning received explicit canonical barrels instead of parallel definitions.
- Cross-package imports were migrated away from `../../../contracts/src/...` and `../../../registries/src/...` to governed public subpaths.
- Relative source graph cycle detection is enforced by `packages/contracts/test/package-boundaries.test.mjs`.
- Duplicate source definitions for `TenantId`, `IdentityId`, `CorrelationId` and `ContractVersion` are rejected by the same integration test.

## Shipping controls

For each package:
- `npm pack --dry-run --json --ignore-scripts` must succeed.
- every target in `package.json#exports` must exist in `dist` after build.
- `src/`, tests, `dist-test/` and protected reference material must not ship.
- consumer fixture imports root packages and governed subpaths from workspace package resolution, not source-relative paths.

## Legacy/runtime dependency audit

No canonical package is permitted to import protected reference material. Contracts additionally cannot import app/service runtime. The root cleanup smoke and package-boundary test both enforce this condition.
