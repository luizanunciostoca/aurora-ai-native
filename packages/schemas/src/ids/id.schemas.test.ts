import type { StringSchema } from './id.schemas';
import { ActionIntentIdSchema } from './id.schemas';
import { CausationIdSchema } from './id.schemas';
import { CommandIdSchema } from './id.schemas';
import { CorrelationIdSchema } from './id.schemas';
import { DecisionIdSchema } from './id.schemas';
import { EventIdSchema } from './id.schemas';
import { EvidenceIdSchema } from './id.schemas';
import { ExecutionIdSchema } from './id.schemas';
import { IdentityIdSchema } from './id.schemas';
import { PolicyTokenIdSchema } from './id.schemas';
import { ProviderExternalIdSchema } from './id.schemas';
import { ReceiptIdSchema } from './id.schemas';
import { TenantIdSchema } from './id.schemas';
import { ID_NAMESPACE_REGISTRY } from '../../../registries/src/ids/id-namespace.registry';
import { PROVIDER_IDENTIFIER_POLICY } from '../../../registries/src/ids/id-namespace.registry';

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) {
    throw new Error(message);
  }
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

function verifyCanonical(schema: Pick<StringSchema<string>, 'is'>, value: string): void {
  assert(schema.is(value), `valid canonical ID rejected for ${value}`);
  assert(!schema.is(''), `empty ID accepted for ${value}`);
  assert(!schema.is(value.toLowerCase()), `lowercase ULID accepted for ${value}`);
}

const ulid = '01ARZ3NDEKTSV4RRFFQ69G5FAV';

verifyCanonical(TenantIdSchema, `ten_${ulid}`);
verifyCanonical(IdentityIdSchema, `idn_${ulid}`);
verifyCanonical(CorrelationIdSchema, `cor_${ulid}`);
verifyCanonical(CausationIdSchema, `cau_${ulid}`);
verifyCanonical(CommandIdSchema, `cmd_${ulid}`);
verifyCanonical(EventIdSchema, `evt_${ulid}`);
verifyCanonical(ActionIntentIdSchema, `act_${ulid}`);
verifyCanonical(ReceiptIdSchema, `rcp_${ulid}`);
verifyCanonical(EvidenceIdSchema, `evd_${ulid}`);
verifyCanonical(DecisionIdSchema, `odc_${ulid}`);
verifyCanonical(PolicyTokenIdSchema, `ptk_${ulid}`);
verifyCanonical(ExecutionIdSchema, `exe_${ulid}`);

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
assert(!CommandIdSchema.is(external), 'provider external ID crossed into internal namespace');
assertThrows(
  () => ProviderExternalIdSchema.parse('   '),
  'blank provider external ID was accepted',
);

const prefixes = Object.values(ID_NAMESPACE_REGISTRY).map((entry) => entry.prefix);
assert(new Set(prefixes).size === prefixes.length, 'duplicate ID namespace prefix detected');
for (const prefix of prefixes) {
  assert(/^[a-z]{3}$/.test(prefix), `invalid namespace prefix: ${prefix}`);
}
assert(
  PROVIDER_IDENTIFIER_POLICY.internalFuturePrefix === ID_NAMESPACE_REGISTRY.ProviderId.prefix,
  'provider namespace policy drifted from registry',
);
