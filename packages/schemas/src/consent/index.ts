import type { ConsentRecord } from '@aurora/contracts/consent';
import type { Rfc3339Timestamp, SubjectRef } from '@aurora/contracts/context';
import type { TenantId } from '@aurora/contracts/ids';
import type { ContractVersion } from '@aurora/contracts/versioning';
import {
  asRecord,
  assertExactKeys,
  createRuntimeSchema,
  parseNonEmptyString,
} from '../context/internal.js';

function parseConsentRecord(value: unknown): ConsentRecord {
  const record = asRecord(value, 'ConsentRecord');
  assertExactKeys(
    record,
    [
      'kind',
      'schemaVersion',
      'reference',
      'tenantId',
      'subject',
      'status',
      'grantedAt',
      'expiresAt',
      'revokedAt',
      'scope',
      'provenance',
      'classification',
    ],
    [
      'kind',
      'schemaVersion',
      'reference',
      'tenantId',
      'subject',
      'status',
      'grantedAt',
      'scope',
      'provenance',
    ],
    'ConsentRecord',
  );
  if (record.kind !== 'ConsentRecord') {
    throw new TypeError('ConsentRecord.kind is invalid');
  }
  if (
    record.status !== 'ACTIVE' &&
    record.status !== 'EXPIRED' &&
    record.status !== 'REVOKED'
  ) {
    throw new TypeError('ConsentRecord.status is invalid');
  }

  const reference = asRecord(record.reference, 'ConsentRecord.reference');
  const scope = asRecord(record.scope, 'ConsentRecord.scope');
  const provenance = asRecord(record.provenance, 'ConsentRecord.provenance');

  if (reference.kind !== 'CONSENT_RECORD') {
    throw new TypeError('ConsentRecord.reference.kind is invalid');
  }
  if (
    !Array.isArray(scope.purposeIds) ||
    scope.purposeIds.length === 0 ||
    !scope.purposeIds.every((value) => typeof value === 'string' && value.length > 0)
  ) {
    throw new TypeError('ConsentRecord.scope.purposeIds is invalid');
  }
  if (!provenance.source || !provenance.reference || !provenance.capturedAt) {
    throw new TypeError('ConsentRecord.provenance is required');
  }

  return {
    kind: 'ConsentRecord',
    schemaVersion: parseNonEmptyString(record.schemaVersion, 'schemaVersion') as ContractVersion,
    reference: {
      kind: 'CONSENT_RECORD',
      reference: parseNonEmptyString(reference.reference, 'reference.reference'),
      version: parseNonEmptyString(reference.version, 'reference.version') as ContractVersion,
    },
    tenantId: parseNonEmptyString(record.tenantId, 'tenantId') as TenantId,
    subject: record.subject as SubjectRef,
    status: record.status,
    grantedAt: parseNonEmptyString(record.grantedAt, 'grantedAt') as Rfc3339Timestamp,
    ...(record.expiresAt === undefined
      ? {}
      : {
          expiresAt: parseNonEmptyString(record.expiresAt, 'expiresAt') as Rfc3339Timestamp,
        }),
    ...(record.revokedAt === undefined
      ? {}
      : {
          revokedAt: parseNonEmptyString(record.revokedAt, 'revokedAt') as Rfc3339Timestamp,
        }),
    scope: {
      purposeIds: scope.purposeIds as readonly string[],
      ...(scope.jurisdictions === undefined
        ? {}
        : { jurisdictions: scope.jurisdictions as readonly string[] }),
      ...(scope.dataCategories === undefined
        ? {}
        : { dataCategories: scope.dataCategories as readonly string[] }),
    },
    provenance: {
      source: parseNonEmptyString(provenance.source, 'provenance.source'),
      reference: parseNonEmptyString(provenance.reference, 'provenance.reference'),
      capturedAt: parseNonEmptyString(
        provenance.capturedAt,
        'provenance.capturedAt',
      ) as Rfc3339Timestamp,
    },
    ...(record.classification === undefined
      ? {}
      : { classification: record.classification as ConsentRecord['classification'] }),
  };
}

export const ConsentRecordSchema = createRuntimeSchema(parseConsentRecord);
