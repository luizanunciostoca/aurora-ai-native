import type { CausationRef, CorrelationContext } from '@aurora/contracts/context';
import { CausationIdSchema, CorrelationIdSchema } from '../ids/id.schemas';
import { asRecord, assertExactKeys, createRuntimeSchema } from './internal';

export const CausationRefSchema = createRuntimeSchema<CausationRef>((value: unknown) => {
  const record = asRecord(value, 'CausationRef');
  assertExactKeys(record, ['causationId'], ['causationId'], 'CausationRef');
  return { causationId: CausationIdSchema.parse(record.causationId) };
});

export const CorrelationContextSchema = createRuntimeSchema<CorrelationContext>(
  (value: unknown) => {
    const record = asRecord(value, 'CorrelationContext');
    assertExactKeys(
      record,
      ['correlationId', 'causation'],
      ['correlationId'],
      'CorrelationContext',
    );

    return {
      correlationId: CorrelationIdSchema.parse(record.correlationId),
      ...(record.causation === undefined
        ? {}
        : { causation: CausationRefSchema.parse(record.causation) }),
    };
  },
);
