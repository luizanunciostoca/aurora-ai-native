import {
  asRecord,
  assertExactKeys,
  createRuntimeSchema,
  parseNonEmptyString,
} from '../context/internal';

export const JurisdictionContextSchema = createRuntimeSchema<Record<string, unknown>>(
  (value: unknown) => {
    const record = asRecord(value, 'JurisdictionContext');
    assertExactKeys(
      record,
      ['kind', 'jurisdiction', 'version'],
      ['kind', 'jurisdiction', 'version'],
      'JurisdictionContext',
    );

    if (record.kind !== 'JurisdictionContext') {
      throw new TypeError('JurisdictionContext.kind is invalid');
    }
    parseNonEmptyString(record.jurisdiction, 'jurisdiction');
    parseNonEmptyString(record.version, 'version');

    return record;
  },
);

export const JurisdictionRestrictionSchema = createRuntimeSchema<Record<string, unknown>>(
  (value: unknown) => {
    const record = asRecord(value, 'JurisdictionRestriction');
    assertExactKeys(
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
    parseNonEmptyString(record.jurisdiction, 'jurisdiction');
    parseNonEmptyString(record.reasonReference, 'reasonReference');
    parseNonEmptyString(record.version, 'version');

    return record;
  },
);
