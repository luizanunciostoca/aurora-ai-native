import {
  ActionIntentIdSchema,
  CausationIdSchema,
  CommandIdSchema,
  CorrelationIdSchema,
  DecisionIdSchema,
  EventIdSchema,
  EvidenceIdSchema,
  ExecutionIdSchema,
  IdentityIdSchema,
  PolicyTokenIdSchema,
  ProviderExternalIdSchema,
  ReceiptIdSchema,
  TenantIdSchema,
} from './id.schemas';
import {
  ID_NAMESPACE_REGISTRY,
  PROVIDER_IDENTIFIER_POLICY,
} from '../../../registries/src/ids/id-namespace.registry';

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function assertThrows(fn: () => unknown, message: string): void {
  let threw = false;
  try {
    fn();
  } catch {
    threw = true;
  }
  assert(threw, message);
}

const ulid = '01ARZ3NDEKTSV4RRFFQ69G5FAV';

const cases = [
  [TenantIdSchema, `ten_${ulid}`],
  [IdentityIdSchema, `idn_${ulid}`],
  [CorrelationIdSchema, `cor_${ulid}`],
  [CausationIdSchema, `cau_${ulid}`],
  [CommandIdSchema, `cmd_${ulid}`],
  [EventIdSchema, `evt_${ulid}`],
  [ActionIntentIdSchema, `act_${ulid}`],
  [ReceiptIdSchema, `rcp_${ulid}`],
  [EvidenceIdSchema, `evd_${ulid}`],
  [DecisionIdSchema, `odc_${ulid}`],
  [PolicyTokenIdSchema, `ptk_${ulid}`],
  [ExecutionIdSchema, `exe_${ulid}`],
] as const;

for (const [schema, value] of cases) {
  assert(schema.is(value), `valid canonical ID rejected for ${value}`);
  assert(!schema.is(''), `empty ID accepted for ${value}`);
  assert(!schema.is(value.toLowerCase()), `non-canonical lowercase ULID accepted for ${value}`);
}

const commandRoundTrip = CommandIdSchema.parse(`cmd_${ulid}`);
assert(
  CommandIdSchema.serialize(commandRoundTrip) === `cmd_${ulid}`,
  'canonical ID serialization round-trip failed',
);

assertThrows(() => CommandIdSchema.parse(`evt_${ulid}`), 'wrong branded prefix was accepted');
assertThrows(() => CommandIdSchema.parse(''), 'empty canonical ID was accepted');
assertThrows(
  () => CommandIdSchema.parse('cmd_01ARZ3NDEKTSV4RRFFQ69G5FAI'),
  'invalid Crockford ULID character was accepted',
);

const external = ProviderExternalIdSchema.parse('meta-object:987654321');
assert(
  ProviderExternalIdSchema.serialize(external) === 'meta-object:987654321',
  'provider external ID did not preserve exact provider value',
);
assert(!CommandIdSchema.is(external), 'provider external ID crossed into internal ID namespace');
assertThrows(() => ProviderExternalIdSchema.parse('   '), 'blank provider external ID was accepted');

const prefixes = Object.values(ID_NAMESPACE_REGISTRY).map((entry) => entry.prefix);
assert(new Set(prefixes).size === prefixes.length, 'duplicate ID namespace prefix detected');
for (const prefix of prefixes) {
  assert(/^[a-z]{3}$/.test(prefix), `invalid namespace prefix: ${prefix}`);
}

assert(
  PROVIDER_IDENTIFIER_POLICY.internalFuturePrefix === ID_NAMESPACE_REGISTRY.ProviderId.prefix,
  'provider namespace policy drifted from registry',
);
