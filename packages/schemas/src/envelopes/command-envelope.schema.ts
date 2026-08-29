import type {
  CorrelationContext,
  DataClassification,
  Deadline,
  ActorRef,
  TenantContext,
} from '@aurora/contracts/context';
import type { CommandEnvelope, CommandType } from '@aurora/contracts/envelopes';
import { COMMAND_ENVELOPE_KIND } from '@aurora/contracts/envelopes';
import type { CommandId } from '@aurora/contracts/ids';
import type { ContractVersion } from '@aurora/contracts/versioning';
import {
  asRecord,
  assertExactKeys,
  normalizeJsonValue,
  optionalOwn,
  parseEnvelopeMetadata,
  parseFixedLiteral,
  parseNamespacedType,
  parseRfc3339Timestamp,
  requireOwn,
  stableStringify,
} from './envelope-common.js';
import type { RuntimeSchema, RuntimeValidator } from './runtime-schema.js';
import { safeParseWith } from './runtime-schema.js';

export interface CommandEnvelopeSchemaDependencies {
  readonly contractVersion: RuntimeValidator<ContractVersion>;
  readonly commandId: RuntimeValidator<CommandId>;
  readonly correlation: RuntimeValidator<CorrelationContext>;
  readonly tenant: RuntimeValidator<TenantContext>;
  readonly actorRef: RuntimeValidator<ActorRef>;
  readonly deadline: RuntimeValidator<Deadline>;
  readonly dataClassification: RuntimeValidator<DataClassification>;
}

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

export function createCommandEnvelopeSchema(
  dependencies: CommandEnvelopeSchemaDependencies,
): RuntimeSchema<CommandEnvelope> {
  const parse = (input: unknown): CommandEnvelope => {
    const record = asRecord(input, '$command');
    assertExactKeys(record, COMMAND_KEYS, '$command');

    const deadlineInput = optionalOwn(record, 'deadline');
    const classificationInput = optionalOwn(record, 'dataClassification');
    const metadataInput = optionalOwn(record, 'metadata');

    return {
      kind: parseFixedLiteral(
        requireOwn(record, 'kind', '$command'),
        COMMAND_ENVELOPE_KIND,
        '$command.kind',
      ),
      schemaVersion: dependencies.contractVersion.parse(
        requireOwn(record, 'schemaVersion', '$command'),
      ),
      commandId: dependencies.commandId.parse(requireOwn(record, 'commandId', '$command')),
      commandType: parseNamespacedType(
        requireOwn(record, 'commandType', '$command'),
        '$command.commandType',
      ) as CommandType,
      requestedAt: parseRfc3339Timestamp(
        requireOwn(record, 'requestedAt', '$command'),
        '$command.requestedAt',
      ),
      correlation: dependencies.correlation.parse(requireOwn(record, 'correlation', '$command')),
      tenant: dependencies.tenant.parse(requireOwn(record, 'tenant', '$command')),
      actor: dependencies.actorRef.parse(requireOwn(record, 'actor', '$command')),
      ...(deadlineInput === undefined
        ? {}
        : { deadline: dependencies.deadline.parse(deadlineInput) }),
      ...(classificationInput === undefined
        ? {}
        : { dataClassification: dependencies.dataClassification.parse(classificationInput) }),
      payload: normalizeJsonValue(requireOwn(record, 'payload', '$command'), '$command.payload'),
      ...(metadataInput === undefined
        ? {}
        : { metadata: parseEnvelopeMetadata(metadataInput, '$command.metadata') }),
    };
  };

  return {
    parse,
    safeParse: (input) => safeParseWith(parse, input),
    serialize: (input) => stableStringify(normalizeJsonValue(parse(input), '$command')),
  };
}

/**
 * Canonical W01-A schema constructor. W01-G composes it with the accepted W01-D/F
 * validators; W01-A deliberately does not duplicate those primitive validators.
 */
export const CommandEnvelopeSchema = Object.freeze({
  create: createCommandEnvelopeSchema,
});
