import { IDENTITY_KINDS, type IdentityKind } from '@aurora/contracts/context';
import type { CorrelationId, TenantId } from '@aurora/contracts/ids';
import type { ContractVersion } from '@aurora/contracts/versioning';
import { SubjectRefSchema } from '../context/identity.schema';
import { asRecord, assertExactKeys, createRuntimeSchema } from '../context/internal';
import { CorrelationIdSchema, TenantIdSchema } from '../ids/id.schemas';
import { ContractVersionSchema } from '../versioning/version.schemas';

const IDENTITY_KIND_SET = new Set<string>(IDENTITY_KINDS);

export interface ParsedIdentityResolutionRequest {
  readonly schemaVersion: ContractVersion;
  readonly tenantId: TenantId;
  readonly correlationId: CorrelationId;
  readonly subject: ReturnType<typeof SubjectRefSchema.parse>;
  readonly expectedKind?: IdentityKind;
}

export const IdentityResolutionRequestSchema = createRuntimeSchema<ParsedIdentityResolutionRequest>(
  (value: unknown) => {
    const record = asRecord(value, 'IdentityResolutionRequest');
    assertExactKeys(
      record,
      ['schemaVersion', 'tenantId', 'correlationId', 'subject', 'expectedKind'],
      ['schemaVersion', 'tenantId', 'correlationId', 'subject'],
      'IdentityResolutionRequest',
    );

    let expectedKind: IdentityKind | undefined;
    if (record.expectedKind !== undefined) {
      if (typeof record.expectedKind !== 'string' || !IDENTITY_KIND_SET.has(record.expectedKind)) {
        throw new TypeError('IdentityResolutionRequest.expectedKind is invalid');
      }
      expectedKind = record.expectedKind as IdentityKind;
    }

    return {
      schemaVersion: ContractVersionSchema.parse(record.schemaVersion),
      tenantId: TenantIdSchema.parse(record.tenantId),
      correlationId: CorrelationIdSchema.parse(record.correlationId),
      subject: SubjectRefSchema.parse(record.subject),
      ...(expectedKind === undefined ? {} : { expectedKind }),
    };
  },
);
