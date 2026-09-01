'use strict';
Object.defineProperty(exports, '__esModule', { value: true });
exports.JurisdictionRestrictionSchema = exports.JurisdictionContextSchema = void 0;
const internal_1 = require('../context/internal');
exports.JurisdictionContextSchema = (0, internal_1.createRuntimeSchema)((value) => {
  const record = (0, internal_1.asRecord)(value, 'JurisdictionContext');
  (0, internal_1.assertExactKeys)(
    record,
    ['kind', 'jurisdiction', 'version'],
    ['kind', 'jurisdiction', 'version'],
    'JurisdictionContext',
  );
  if (record.kind !== 'JurisdictionContext') {
    throw new TypeError('JurisdictionContext.kind is invalid');
  }
  (0, internal_1.parseNonEmptyString)(record.jurisdiction, 'jurisdiction');
  (0, internal_1.parseNonEmptyString)(record.version, 'version');
  return record;
});
exports.JurisdictionRestrictionSchema = (0, internal_1.createRuntimeSchema)((value) => {
  const record = (0, internal_1.asRecord)(value, 'JurisdictionRestriction');
  (0, internal_1.assertExactKeys)(
    record,
    ['kind', 'jurisdiction', 'effect', 'purposeIds', 'reasonReference', 'version'],
    ['kind', 'jurisdiction', 'effect', 'reasonReference', 'version'],
    'JurisdictionRestriction',
  );
  if (record.kind !== 'JurisdictionRestriction') {
    throw new TypeError('JurisdictionRestriction.kind is invalid');
  }
  if (record.effect !== 'ALLOW' && record.effect !== 'DENY') {
    throw new TypeError('JurisdictionRestriction.effect is invalid');
  }
  (0, internal_1.parseNonEmptyString)(record.jurisdiction, 'jurisdiction');
  (0, internal_1.parseNonEmptyString)(record.reasonReference, 'reasonReference');
  (0, internal_1.parseNonEmptyString)(record.version, 'version');
  return record;
});
