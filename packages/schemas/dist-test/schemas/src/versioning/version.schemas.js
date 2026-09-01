'use strict';
Object.defineProperty(exports, '__esModule', { value: true });
exports.SupportedContractVersionSchema =
  exports.ContractVersionSchema =
  exports.VersionSchema =
    void 0;
const versioning_1 = require('@aurora/registries/versioning');
const STABLE_SEMVER_CORE_PATTERN = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/;
function parseParts(value) {
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
function makeVersionSchema() {
  const is = (value) => {
    return typeof value === 'string' && STABLE_SEMVER_CORE_PATTERN.test(value);
  };
  return Object.freeze({
    is,
    parse(value) {
      if (!is(value)) {
        throw new TypeError('Expected stable semantic version in MAJOR.MINOR.PATCH form');
      }
      return value;
    },
    serialize(value) {
      if (!is(value)) {
        throw new TypeError('Cannot serialize invalid semantic version');
      }
      return value;
    },
    parts(value) {
      return parseParts(value);
    },
  });
}
function isSupported(value) {
  return versioning_1.CONTRACT_VERSION_REGISTRY.supportedRead.includes(value);
}
exports.VersionSchema = makeVersionSchema();
exports.ContractVersionSchema = makeVersionSchema();
exports.SupportedContractVersionSchema = Object.freeze({
  ...exports.ContractVersionSchema,
  is(value) {
    return exports.ContractVersionSchema.is(value) && isSupported(value);
  },
  parse(value) {
    const parsed = exports.ContractVersionSchema.parse(value);
    if (!isSupported(parsed)) {
      throw new TypeError(`Unsupported contract version: ${parsed}`);
    }
    return parsed;
  },
});
