'use strict';
Object.defineProperty(exports, '__esModule', { value: true });
const version_schemas_1 = require('./version.schemas');
const version_schemas_2 = require('./version.schemas');
const version_schemas_3 = require('./version.schemas');
const versioning_1 = require('@aurora/registries/versioning');
function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}
function assertThrows(fn, message) {
  let threw = false;
  try {
    fn();
  } catch {
    threw = true;
  }
  assert(threw, message);
}
const version = version_schemas_1.ContractVersionSchema.parse('1.0.0');
assert(
  version_schemas_1.ContractVersionSchema.serialize(version) === '1.0.0',
  'contract version round-trip failed',
);
const parsedParts = version_schemas_3.VersionSchema.parts(
  version_schemas_3.VersionSchema.parse('12.34.56'),
);
assert(parsedParts.major === 12, 'major parsing failed');
const invalidVersions = [
  '',
  '1',
  '1.0',
  '01.0.0',
  '1.00.0',
  'v1.0.0',
  '1.0.0-beta.1',
  '1.0.0+build',
];
for (const invalid of invalidVersions) {
  assert(
    !version_schemas_1.ContractVersionSchema.is(invalid),
    `invalid version accepted: ${invalid}`,
  );
}
const current = version_schemas_2.SupportedContractVersionSchema.parse(
  versioning_1.CONTRACT_VERSION_REGISTRY.current,
);
assert(current === '1.0.0', 'current contract version was not accepted');
assertThrows(
  () => version_schemas_2.SupportedContractVersionSchema.parse('2.0.0'),
  'unsupported major contract version was accepted',
);
