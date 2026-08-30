import type { CommandEnvelope, EventEnvelope } from '@aurora/contracts/envelopes';
import {
  ActorRefSchema,
  CorrelationContextSchema,
  DataClassificationSchema,
  DeadlineSchema,
  TenantContextSchema,
} from '../context/index';
import { CommandIdSchema, EventIdSchema } from '../ids/index';
import { SupportedContractVersionSchema } from '../versioning/index';
import { CommandEnvelopeSchema, EventEnvelopeSchema } from './index';

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(`W01-G envelope contract test failed: ${message}`);
}

function expectThrows(fn: () => unknown, contains: string): void {
  try {
    fn();
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    assert(
      message.includes(contains),
      `expected error containing "${contains}", got "${message}"`,
    );
    return;
  }
  throw new Error(`expected function to throw: ${contains}`);
}

const commandValidator = CommandEnvelopeSchema.create({
  contractVersion: SupportedContractVersionSchema,
  commandId: CommandIdSchema,
  correlation: CorrelationContextSchema,
  tenant: TenantContextSchema,
  actorRef: ActorRefSchema,
  deadline: DeadlineSchema,
  dataClassification: DataClassificationSchema,
});

const eventValidator = EventEnvelopeSchema.create({
  contractVersion: SupportedContractVersionSchema,
  eventId: EventIdSchema,
  correlation: CorrelationContextSchema,
  tenant: TenantContextSchema,
  actorRef: ActorRefSchema,
  dataClassification: DataClassificationSchema,
});

const ulids = {
  command: '01ARZ3NDEKTSV4RRFFQ69G5FAV',
  event: '01ARZ3NDEKTSV4RRFFQ69G5FAW',
  correlation: '01ARZ3NDEKTSV4RRFFQ69G5FAX',
  tenant: '01ARZ3NDEKTSV4RRFFQ69G5FAY',
  actor: '01ARZ3NDEKTSV4RRFFQ69G5FAZ',
};

const validCommand = {
  kind: 'COMMAND',
  schemaVersion: '1.0.0',
  commandId: `cmd_${ulids.command}`,
  commandType: 'marketing.publish-campaign',
  requestedAt: '2026-08-29T21:00:00-03:00',
  correlation: { correlationId: `cor_${ulids.correlation}` },
  tenant: { tenantId: `ten_${ulids.tenant}` },
  actor: { kind: 'HUMAN', identityId: `idn_${ulids.actor}` },
  deadline: { deadlineAt: '2026-08-29T21:05:00-03:00' },
  dataClassification: 'INTERNAL',
  payload: { z: 2, a: 'canonical', nested: { ok: true } },
  metadata: {
    labels: { origin: 'consumer-fixture' },
    extensions: { 'x-trace': 'trace-001' },
  },
} as const;

const command: CommandEnvelope = commandValidator.parse(validCommand);
assert(command.kind === 'COMMAND', 'CommandEnvelope kind drifted');
assert(
  command.tenant.tenantId === validCommand.tenant.tenantId,
  'CommandEnvelope tenant drifted',
);

const commandWire = commandValidator.serialize(command);
const commandRoundTrip: CommandEnvelope = commandValidator.parse(
  JSON.parse(commandWire) as unknown,
);
assert(
  commandValidator.serialize(commandRoundTrip) === commandWire,
  'CommandEnvelope serialization must be deterministic',
);

expectThrows(
  () => commandValidator.parse({ ...validCommand, schemaVersion: '2.0.0' }),
  'Unsupported contract version',
);
expectThrows(
  () => commandValidator.parse({ ...validCommand, kind: 'EVENT' }),
  'expected COMMAND',
);
expectThrows(
  () => commandValidator.parse({ ...validCommand, commandId: `evt_${ulids.command}` }),
  'Expected canonical cmd_',
);
expectThrows(
  () => commandValidator.parse({ ...validCommand, requestedAt: '2026-08-29 21:00:00' }),
  'valid RFC3339 timestamp',
);
expectThrows(
  () => commandValidator.parse({ ...validCommand, authority: { role: 'ADMIN' } }),
  'unknown field',
);
expectThrows(
  () =>
    commandValidator.parse({
      ...validCommand,
      metadata: { extensions: { 'x-tenant': validCommand.tenant.tenantId } },
    }),
  'reserved envelope semantics',
);

const commandWithoutOptionals = {
  kind: 'COMMAND',
  schemaVersion: '1.0.0',
  commandId: `cmd_${ulids.command}`,
  commandType: 'marketing.validate-request',
  requestedAt: '2026-08-29T21:00:00Z',
  correlation: { correlationId: `cor_${ulids.correlation}` },
  tenant: { tenantId: `ten_${ulids.tenant}` },
  actor: { kind: 'SYSTEM', identityId: `idn_${ulids.actor}` },
  payload: null,
} as const;
assert(
  commandValidator.parse(commandWithoutOptionals).payload === null,
  'optional command fields must remain optional',
);

const validEvent = {
  kind: 'EVENT',
  schemaVersion: '1.0.0',
  eventId: `evt_${ulids.event}`,
  eventType: 'marketing.campaign-published',
  occurredAt: '2026-08-29T21:01:00-03:00',
  producer: { kind: 'SERVICE', identityId: `idn_${ulids.actor}` },
  source: {
    service: 'marketing-executor',
    component: 'publisher',
    instance: 'instance-01',
  },
  correlation: { correlationId: `cor_${ulids.correlation}` },
  tenant: { tenantId: `ten_${ulids.tenant}` },
  subject: 'campaign:42',
  dataClassification: 'INTERNAL',
  payload: { campaignId: '42', published: true },
  metadata: { labels: { provider: 'meta' } },
} as const;

const event: EventEnvelope = eventValidator.parse(validEvent);
assert(event.kind === 'EVENT', 'EventEnvelope kind drifted');
assert(event.source.service === 'marketing-executor', 'EventEnvelope source drifted');

const eventWire = eventValidator.serialize(event);
const eventRoundTrip: EventEnvelope = eventValidator.parse(JSON.parse(eventWire) as unknown);
assert(
  eventValidator.serialize(eventRoundTrip) === eventWire,
  'EventEnvelope serialization must be deterministic',
);

expectThrows(
  () => eventValidator.parse({ ...validEvent, schemaVersion: '2.0.0' }),
  'Unsupported contract version',
);
expectThrows(
  () => eventValidator.parse({ ...validEvent, kind: 'COMMAND' }),
  'expected EVENT',
);
expectThrows(
  () => eventValidator.parse({ ...validEvent, eventType: 'notnamespaced' }),
  'namespaced type string',
);
expectThrows(
  () => eventValidator.parse({ ...validEvent, source: { service: 'INVALID SERVICE' } }),
  'invalid string value',
);
expectThrows(
  () => eventValidator.parse({ ...validEvent, occurredAt: 'tomorrow' }),
  'valid RFC3339 timestamp',
);
expectThrows(
  () => eventValidator.parse({ ...validEvent, tenantId: validEvent.tenant.tenantId }),
  'unknown field',
);

assert(
  commandValidator.safeParse(validCommand).success,
  'CommandEnvelope safeParse must accept canonical payload',
);
assert(
  !eventValidator.safeParse({ ...validEvent, eventId: 'invalid' }).success,
  'EventEnvelope safeParse must fail closed for invalid ID',
);
