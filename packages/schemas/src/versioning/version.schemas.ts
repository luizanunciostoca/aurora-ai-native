import type {
  ContractVersion,
  Version,
  VersionParts,
} from '../../../contracts/src/versioning/types';
import { CONTRACT_VERSION_REGISTRY } from '../../../registries/src/versioning/contract-version.registry';

export interface VersionStringSchema<T extends string> {
  is(value: unknown): value is T;
  parse(value: unknown): T;
  serialize(value: T): string;
  parts(value: T): VersionParts;
}

const STABLE_SEMVER_CORE_PATTERN = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/;

function parseParts(value: string): VersionParts {
  const match = STABLE_SEMVER_CORE_PATTERN.exec(value);
  if (!match) {
    throw new TypeError('Expected stable semantic version in MAJOR.MINOR.PATCH form');
  }
  return Object.freeze({
    major: Number(match[1]),
    minor: Number(match[2]),
    patch: Number(match[3]),
  });
}

function makeVersionSchema<T extends string>(): VersionStringSchema<T> {
  const is = (value: unknown): value is T =>
    typeof value === 'string' && STABLE_SEMVER_CORE_PATTERN.test(value);

  return Object.freeze({
    is,
    parse(value: unknown): T {
      if (!is(value)) {
        throw new TypeError('Expected stable semantic version in MAJOR.MINOR.PATCH form');
      }
      return value;
    },
    serialize(value: T): string {
      if (!is(value)) {
        throw new TypeError('Cannot serialize invalid semantic version');
      }
      return value;
    },
    parts(value: T): VersionParts {
      return parseParts(value);
    },
  });
}

export const VersionSchema = makeVersionSchema<Version>();
export const ContractVersionSchema = makeVersionSchema<ContractVersion>();

export const SupportedContractVersionSchema = Object.freeze({
  ...ContractVersionSchema,
  is(value: unknown): value is ContractVersion {
    if (!ContractVersionSchema.is(value)) return false;
    return CONTRACT_VERSION_REGISTRY.supportedRead.some(
      (supported) => String(supported) === value,
    );
  },
  parse(value: unknown): ContractVersion {
    const parsed = ContractVersionSchema.parse(value);
    if (
      !CONTRACT_VERSION_REGISTRY.supportedRead.some(
        (supported) => String(supported) === parsed,
      )
    ) {
      throw new TypeError(`Unsupported contract version: ${parsed}`);
    }
    return parsed;
  },
});
