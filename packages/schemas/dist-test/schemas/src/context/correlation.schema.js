'use strict';
Object.defineProperty(exports, '__esModule', { value: true });
exports.CorrelationContextSchema = exports.CausationRefSchema = void 0;
const id_schemas_1 = require('../ids/id.schemas');
const internal_1 = require('./internal');
exports.CausationRefSchema = (0, internal_1.createRuntimeSchema)((value) => {
  const record = (0, internal_1.asRecord)(value, 'CausationRef');
  (0, internal_1.assertExactKeys)(record, ['causationId'], ['causationId'], 'CausationRef');
  return { causationId: id_schemas_1.CausationIdSchema.parse(record.causationId) };
});
exports.CorrelationContextSchema = (0, internal_1.createRuntimeSchema)((value) => {
  const record = (0, internal_1.asRecord)(value, 'CorrelationContext');
  (0, internal_1.assertExactKeys)(
    record,
    ['correlationId', 'causation'],
    ['correlationId'],
    'CorrelationContext',
  );
  return {
    correlationId: id_schemas_1.CorrelationIdSchema.parse(record.correlationId),
    ...(record.causation === undefined
      ? {}
      : { causation: exports.CausationRefSchema.parse(record.causation) }),
  };
});
