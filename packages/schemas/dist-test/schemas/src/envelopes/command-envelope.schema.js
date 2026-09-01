'use strict';
Object.defineProperty(exports, '__esModule', { value: true });
exports.CommandEnvelopeSchema = void 0;
exports.createCommandEnvelopeSchema = createCommandEnvelopeSchema;
const envelopes_1 = require('@aurora/contracts/envelopes');
const envelope_common_1 = require('./envelope-common');
const runtime_schema_1 = require('./runtime-schema');
const COMMAND_KEYS = new Set([
  'kind',
  'schemaVersion',
  'commandId',
  'commandType',
  'requestedAt',
  'correlation',
  'tenant',
  'actor',
  'deadline',
  'dataClassification',
  'payload',
  'metadata',
]);
function createCommandEnvelopeSchema(dependencies) {
  const parse = (input) => {
    const record = (0, envelope_common_1.asRecord)(input, '$command');
    (0, envelope_common_1.assertExactKeys)(record, COMMAND_KEYS, '$command');
    const deadlineInput = (0, envelope_common_1.optionalOwn)(record, 'deadline');
    const classificationInput = (0, envelope_common_1.optionalOwn)(record, 'dataClassification');
    const metadataInput = (0, envelope_common_1.optionalOwn)(record, 'metadata');
    return {
      kind: (0, envelope_common_1.parseFixedLiteral)(
        (0, envelope_common_1.requireOwn)(record, 'kind', '$command'),
        envelopes_1.COMMAND_ENVELOPE_KIND,
        '$command.kind',
      ),
      schemaVersion: dependencies.contractVersion.parse(
        (0, envelope_common_1.requireOwn)(record, 'schemaVersion', '$command'),
      ),
      commandId: dependencies.commandId.parse(
        (0, envelope_common_1.requireOwn)(record, 'commandId', '$command'),
      ),
      commandType: (0, envelope_common_1.parseNamespacedType)(
        (0, envelope_common_1.requireOwn)(record, 'commandType', '$command'),
        '$command.commandType',
      ),
      requestedAt: (0, envelope_common_1.parseRfc3339Timestamp)(
        (0, envelope_common_1.requireOwn)(record, 'requestedAt', '$command'),
        '$command.requestedAt',
      ),
      correlation: dependencies.correlation.parse(
        (0, envelope_common_1.requireOwn)(record, 'correlation', '$command'),
      ),
      tenant: dependencies.tenant.parse(
        (0, envelope_common_1.requireOwn)(record, 'tenant', '$command'),
      ),
      actor: dependencies.actorRef.parse(
        (0, envelope_common_1.requireOwn)(record, 'actor', '$command'),
      ),
      ...(deadlineInput === undefined
        ? {}
        : { deadline: dependencies.deadline.parse(deadlineInput) }),
      ...(classificationInput === undefined
        ? {}
        : { dataClassification: dependencies.dataClassification.parse(classificationInput) }),
      payload: (0, envelope_common_1.normalizeJsonValue)(
        (0, envelope_common_1.requireOwn)(record, 'payload', '$command'),
        '$command.payload',
      ),
      ...(metadataInput === undefined
        ? {}
        : {
            metadata: (0, envelope_common_1.parseEnvelopeMetadata)(
              metadataInput,
              '$command.metadata',
            ),
          }),
    };
  };
  return {
    parse,
    safeParse: (input) => (0, runtime_schema_1.safeParseWith)(parse, input),
    serialize: (input) =>
      (0, envelope_common_1.stableStringify)(
        (0, envelope_common_1.normalizeJsonValue)(parse(input), '$command'),
      ),
  };
}
/**
 * Canonical W01-A schema constructor. W01-G composes it with the accepted W01-D/F
 * validators; W01-A deliberately does not duplicate those primitive validators.
 */
exports.CommandEnvelopeSchema = Object.freeze({
  create: createCommandEnvelopeSchema,
});
