import type {
  PropagationContext,
  PropagationMetadata,
} from '../../../contracts/src/context/propagation.js';
import { ContractVersionSchema } from '../versioning/version.schemas.js';
import {
  asRecord,
  assertExactKeys,
  createRuntimeSchema,
} from './internal.js';
import { CorrelationContextSchema } from './correlation.schema.js';
import { DataClassificationSchema } from './data-classification.schema.js';
import { DeadlineSchema, ExpirySchema } from './deadline.schema.js';
import { ActorRefSchema } from './identity.schema.js';
import { TenantContextSchema } from './tenant.schema.js';

export const PropagationMetadataSchema =
  createRuntimeSchema<PropagationMetadata>((value: unknown) => {
    const record = asRecord(value, 'PropagationMetadata');
    assertExactKeys(
      record,
      ['dataClassification', 'deadline', 'expiry'],
      ['dataClassification'],
      'PropagationMetadata',
    );

    return {
      dataClassification: DataClassificationSchema.parse(
        record.dataClassification,
      ),
      ...(record.deadline === undefined
        ? {}
        : { deadline: DeadlineSchema.parse(record.deadline) }),
      ...(record.expiry === undefined
        ? {}
        : { expiry: ExpirySchema.parse(record.expiry) }),
    };
  });

export const PropagationContextSchema =
  createRuntimeSchema<PropagationContext>((value: unknown) => {
    const record = asRecord(value, 'PropagationContext');
    assertExactKeys(
      record,
      ['kind', 'schemaVersion', 'tenant', 'actor', 'correlation', 'metadata'],
      ['kind', 'schemaVersion', 'tenant', 'actor', 'correlation', 'metadata'],
      'PropagationContext',
    );

    if (record.kind !== 'PROPAGATION_CONTEXT') {
      throw new TypeError('PropagationContext.kind is invalid');
    }

    return {
      kind: 'PROPAGATION_CONTEXT',
      schemaVersion: ContractVersionSchema.parse(record.schemaVersion),
      tenant: TenantContextSchema.parse(record.tenant),
      actor: ActorRefSchema.parse(record.actor),
      correlation: CorrelationContextSchema.parse(record.correlation),
      metadata: PropagationMetadataSchema.parse(record.metadata),
    };
  });
