'use strict';
Object.defineProperty(exports, '__esModule', { value: true });
exports.EventEnvelopeSchema = void 0;
exports.createEventEnvelopeSchema = createEventEnvelopeSchema;
const envelopes_1 = require('@aurora/contracts/envelopes');
const envelope_common_1 = require('./envelope-common');
const runtime_schema_1 = require('./runtime-schema');
const EVENT_KEYS = new Set([
  'kind',
  'schemaVersion',
  'eventId',
  'eventType',
  'occurredAt',
  'producer',
  'source',
  'correlation',
  'tenant',
  'subject',
  'dataClassification',
  'payload',
  'metadata',
]);
function createEventEnvelopeSchema(dependencies) {
  const parse = (input) => {
    const record = (0, envelope_common_1.asRecord)(input, '$event');
    (0, envelope_common_1.assertExactKeys)(record, EVENT_KEYS, '$event');
    const subjectInput = (0, envelope_common_1.optionalOwn)(record, 'subject');
    const classificationInput = (0, envelope_common_1.optionalOwn)(record, 'dataClassification');
    const metadataInput = (0, envelope_common_1.optionalOwn)(record, 'metadata');
    return {
      kind: (0, envelope_common_1.parseFixedLiteral)(
        (0, envelope_common_1.requireOwn)(record, 'kind', '$event'),
        envelopes_1.EVENT_ENVELOPE_KIND,
        '$event.kind',
      ),
      schemaVersion: dependencies.contractVersion.parse(
        (0, envelope_common_1.requireOwn)(record, 'schemaVersion', '$event'),
      ),
      eventId: dependencies.eventId.parse(
        (0, envelope_common_1.requireOwn)(record, 'eventId', '$event'),
      ),
      eventType: (0, envelope_common_1.parseNamespacedType)(
        (0, envelope_common_1.requireOwn)(record, 'eventType', '$event'),
        '$event.eventType',
      ),
      occurredAt: (0, envelope_common_1.parseRfc3339Timestamp)(
        (0, envelope_common_1.requireOwn)(record, 'occurredAt', '$event'),
        '$event.occurredAt',
      ),
      producer: dependencies.actorRef.parse(
        (0, envelope_common_1.requireOwn)(record, 'producer', '$event'),
      ),
      source: (0, envelope_common_1.parseEnvelopeSource)(
        (0, envelope_common_1.requireOwn)(record, 'source', '$event'),
        '$event.source',
      ),
      correlation: dependencies.correlation.parse(
        (0, envelope_common_1.requireOwn)(record, 'correlation', '$event'),
      ),
      tenant: dependencies.tenant.parse(
        (0, envelope_common_1.requireOwn)(record, 'tenant', '$event'),
      ),
      ...(subjectInput === undefined
        ? {}
        : { subject: (0, envelope_common_1.parseOptionalSubject)(subjectInput, '$event.subject') }),
      ...(classificationInput === undefined
        ? {}
        : { dataClassification: dependencies.dataClassification.parse(classificationInput) }),
      payload: (0, envelope_common_1.normalizeJsonValue)(
        (0, envelope_common_1.requireOwn)(record, 'payload', '$event'),
        '$event.payload',
      ),
      ...(metadataInput === undefined
        ? {}
        : {
            metadata: (0, envelope_common_1.parseEnvelopeMetadata)(
              metadataInput,
              '$event.metadata',
            ),
          }),
    };
  };
  return {
    parse,
    safeParse: (input) => (0, runtime_schema_1.safeParseWith)(parse, input),
    serialize: (input) =>
      (0, envelope_common_1.stableStringify)(
        (0, envelope_common_1.normalizeJsonValue)(parse(input), '$event'),
      ),
  };
}
/**
 * Canonical W01-A schema constructor. W01-G composes it with the accepted W01-D/F
 * validators; W01-A deliberately does not duplicate those primitive validators.
 */
exports.EventEnvelopeSchema = Object.freeze({
  create: createEventEnvelopeSchema,
});
