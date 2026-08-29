import type {
  PropagationContext,
  PropagationMetadata,
} from '../../../contracts/src/context/propagation';
import { ContractVersionSchema } from '../versioning/version.schemas';
import { asRecord, assertExactKeys, createRuntimeSchema } from './internal';
import { CorrelationContextSchema } from './correlation.schema';
import { DataClassificationSchema } from './data-classification.schema';
import { DeadlineSchema, ExpirySchema } from './deadline.schema';
import { ActorRefSchema } from './identity.schema';
import { TenantContextSchema } from './tenant.schema';

export const PropagationMetadataSchema = createRuntimeSchema<PropagationMetadata>(
  (value: unknown) => {
    const record = asRecord(value, 'PropagationMetadata');
    assertExactKeys(
      record,
      ['dataClassification', 'deadline', 'expiry'],
      ['dataClassification'],
      'PropagationMetadata',
    );

    return {
      dataClassification: DataClassificationSchema.parse(record.dataClassification),
      ...(record.deadline === undefined ? {} : { deadline: DeadlineSchema.parse(record.deadline) }),
      ...(record.expiry === undefined ? {} : { expiry: ExpirySchema.parse(record.expiry) }),
    };
  },
);

export const PropagationContextSchema = createRuntimeSchema<PropagationContext>(
  (value: unknown) => {
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
  },
);
