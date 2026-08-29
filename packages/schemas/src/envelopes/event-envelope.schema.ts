import type {
  CorrelationContext,
  DataClassification,
  IdentityReference,
  TenantContext,
} from "@aurora/contracts/context";
import type { EventEnvelope, EventType } from "@aurora/contracts/envelopes";
import { EVENT_ENVELOPE_KIND } from "@aurora/contracts/envelopes";
import type { EventId } from "@aurora/contracts/ids";
import type { ContractVersion } from "@aurora/contracts/versioning";
import {
  asRecord,
  assertExactKeys,
  normalizeJsonValue,
  optionalOwn,
  parseEnvelopeMetadata,
  parseEnvelopeSource,
  parseFixedLiteral,
  parseNamespacedType,
  parseOptionalSubject,
  parseRfc3339Timestamp,
  requireOwn,
  stableStringify,
} from "./envelope-common.js";
import type { RuntimeSchema, RuntimeValidator } from "./runtime-schema.js";
import { safeParseWith } from "./runtime-schema.js";

export interface EventEnvelopeSchemaDependencies {
  readonly contractVersion: RuntimeValidator<ContractVersion>;
  readonly eventId: RuntimeValidator<EventId>;
  readonly correlation: RuntimeValidator<CorrelationContext>;
  readonly tenant: RuntimeValidator<TenantContext>;
  readonly identityReference: RuntimeValidator<IdentityReference>;
  readonly dataClassification: RuntimeValidator<DataClassification>;
}

const EVENT_KEYS = new Set([
  "kind",
  "schemaVersion",
  "eventId",
  "eventType",
  "occurredAt",
  "producer",
  "source",
  "correlation",
  "tenant",
  "subject",
  "dataClassification",
  "payload",
  "metadata",
]);

export function createEventEnvelopeSchema(
  dependencies: EventEnvelopeSchemaDependencies,
): RuntimeSchema<EventEnvelope> {
  const parse = (input: unknown): EventEnvelope => {
    const record = asRecord(input, "$event");
    assertExactKeys(record, EVENT_KEYS, "$event");

    const subjectInput = optionalOwn(record, "subject");
    const classificationInput = optionalOwn(record, "dataClassification");
    const metadataInput = optionalOwn(record, "metadata");

    return {
      kind: parseFixedLiteral(
        requireOwn(record, "kind", "$event"),
        EVENT_ENVELOPE_KIND,
        "$event.kind",
      ),
      schemaVersion: dependencies.contractVersion.parse(
        requireOwn(record, "schemaVersion", "$event"),
      ),
      eventId: dependencies.eventId.parse(requireOwn(record, "eventId", "$event")),
      eventType: parseNamespacedType(
        requireOwn(record, "eventType", "$event"),
        "$event.eventType",
      ) as EventType,
      occurredAt: parseRfc3339Timestamp(
        requireOwn(record, "occurredAt", "$event"),
        "$event.occurredAt",
      ),
      producer: dependencies.identityReference.parse(
        requireOwn(record, "producer", "$event"),
      ),
      source: parseEnvelopeSource(requireOwn(record, "source", "$event"), "$event.source"),
      correlation: dependencies.correlation.parse(requireOwn(record, "correlation", "$event")),
      tenant: dependencies.tenant.parse(requireOwn(record, "tenant", "$event")),
      ...(subjectInput === undefined
        ? {}
        : { subject: parseOptionalSubject(subjectInput, "$event.subject") }),
      ...(classificationInput === undefined
        ? {}
        : { dataClassification: dependencies.dataClassification.parse(classificationInput) }),
      payload: normalizeJsonValue(requireOwn(record, "payload", "$event"), "$event.payload"),
      ...(metadataInput === undefined
        ? {}
        : { metadata: parseEnvelopeMetadata(metadataInput, "$event.metadata") }),
    };
  };

  return {
    parse,
    safeParse: (input) => safeParseWith(parse, input),
    serialize: (input) => stableStringify(normalizeJsonValue(parse(input), "$event")),
  };
}

/**
 * Canonical W01-A schema constructor. W01-G composes it with the accepted W01-D/F
 * validators; W01-A deliberately does not duplicate those primitive validators.
 */
export const EventEnvelopeSchema = Object.freeze({
  create: createEventEnvelopeSchema,
});
