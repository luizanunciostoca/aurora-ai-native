declare const auroraVersionBrand: unique symbol;
declare const auroraContractVersionBrand: unique symbol;

/**
 * Canonical semantic-version-shaped value primitive.
 *
 * Runtime validation is owned by @aurora/schemas. W01 wire versions use the
 * stable `MAJOR.MINOR.PATCH` core form without prerelease/build suffixes.
 */
export type Version = string & {
  readonly [auroraVersionBrand]: 'Version';
};

/**
 * Wire-contract/schema version. This is intentionally more specific than a
 * generic Version so package SemVer cannot be assigned accidentally.
 */
export type ContractVersion = Version & {
  readonly [auroraContractVersionBrand]: 'ContractVersion';
};

export interface VersionParts {
  readonly major: number;
  readonly minor: number;
  readonly patch: number;
}
