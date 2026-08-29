import type {
  CausationRef,
  CorrelationContext,
} from '../../../contracts/src/context/correlation.js';
import {
  CausationIdSchema,
  CorrelationIdSchema,
} from '../ids/index.js';
import {
  asRecord,
  assertExactKeys,
  createRuntimeSchema,
} from './internal.js';

export const CausationRefSchema = createRuntimeSchema<CausationRef>(
  (value: unknown) => {
    const record = asRecord(value, 'CausationRef');
    assertExactKeys(record, ['causationId'], ['causationId'], 'CausationRef');
    return { causationId: CausationIdSchema.parse(record.causationId) };
  },
);

export const CorrelationContextSchema =
  createRuntimeSchema<CorrelationContext>((value: unknown) => {
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
  });
