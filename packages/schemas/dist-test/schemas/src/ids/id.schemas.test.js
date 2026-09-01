'use strict';
Object.defineProperty(exports, '__esModule', { value: true });
const id_schemas_1 = require('./id.schemas');
const id_schemas_2 = require('./id.schemas');
const id_schemas_3 = require('./id.schemas');
const id_schemas_4 = require('./id.schemas');
const id_schemas_5 = require('./id.schemas');
const id_schemas_6 = require('./id.schemas');
const id_schemas_7 = require('./id.schemas');
const id_schemas_8 = require('./id.schemas');
const id_schemas_9 = require('./id.schemas');
const id_schemas_10 = require('./id.schemas');
const id_schemas_11 = require('./id.schemas');
const id_schemas_12 = require('./id.schemas');
const id_schemas_13 = require('./id.schemas');
const ids_1 = require('@aurora/registries/ids');
const ids_2 = require('@aurora/registries/ids');
function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}
function assertThrows(fn, message) {
  let threw = false;
  try {
    fn();
  } catch {
    threw = true;
  }
  assert(threw, message);
}
function verifyCanonical(schema, value) {
  assert(schema.is(value), `valid canonical ID rejected for ${value}`);
  assert(!schema.is(''), `empty ID accepted for ${value}`);
  assert(!schema.is(value.toLowerCase()), `lowercase ULID accepted for ${value}`);
}
const ulid = '01ARZ3NDEKTSV4RRFFQ69G5FAV';
verifyCanonical(id_schemas_13.TenantIdSchema, `ten_${ulid}`);
verifyCanonical(id_schemas_9.IdentityIdSchema, `idn_${ulid}`);
verifyCanonical(id_schemas_4.CorrelationIdSchema, `cor_${ulid}`);
verifyCanonical(id_schemas_2.CausationIdSchema, `cau_${ulid}`);
verifyCanonical(id_schemas_3.CommandIdSchema, `cmd_${ulid}`);
verifyCanonical(id_schemas_6.EventIdSchema, `evt_${ulid}`);
verifyCanonical(id_schemas_1.ActionIntentIdSchema, `act_${ulid}`);
verifyCanonical(id_schemas_12.ReceiptIdSchema, `rcp_${ulid}`);
verifyCanonical(id_schemas_7.EvidenceIdSchema, `evd_${ulid}`);
verifyCanonical(id_schemas_5.DecisionIdSchema, `odc_${ulid}`);
verifyCanonical(id_schemas_10.PolicyTokenIdSchema, `ptk_${ulid}`);
verifyCanonical(id_schemas_8.ExecutionIdSchema, `exe_${ulid}`);
const commandRoundTrip = id_schemas_3.CommandIdSchema.parse(`cmd_${ulid}`);
assert(
  id_schemas_3.CommandIdSchema.serialize(commandRoundTrip) === `cmd_${ulid}`,
  'canonical ID serialization round-trip failed',
);
assertThrows(
  () => id_schemas_3.CommandIdSchema.parse(`evt_${ulid}`),
  'wrong branded prefix was accepted',
);
assertThrows(() => id_schemas_3.CommandIdSchema.parse(''), 'empty canonical ID was accepted');
assertThrows(
  () => id_schemas_3.CommandIdSchema.parse('cmd_01ARZ3NDEKTSV4RRFFQ69G5FAI'),
  'invalid Crockford ULID character was accepted',
);
const external = id_schemas_11.ProviderExternalIdSchema.parse('meta-object:987654321');
assert(
  id_schemas_11.ProviderExternalIdSchema.serialize(external) === 'meta-object:987654321',
  'provider external ID did not preserve exact provider value',
);
assert(
  !id_schemas_3.CommandIdSchema.is(external),
  'provider external ID crossed into internal namespace',
);
assertThrows(
  () => id_schemas_11.ProviderExternalIdSchema.parse('   '),
  'blank provider external ID was accepted',
);
const prefixes = Object.values(ids_1.ID_NAMESPACE_REGISTRY).map((entry) => entry.prefix);
assert(new Set(prefixes).size === prefixes.length, 'duplicate ID namespace prefix detected');
for (const prefix of prefixes) {
  assert(/^[a-z]{3}$/.test(prefix), `invalid namespace prefix: ${prefix}`);
}
assert(
  ids_2.PROVIDER_IDENTIFIER_POLICY.internalFuturePrefix ===
    ids_1.ID_NAMESPACE_REGISTRY.ProviderId.prefix,
  'provider namespace policy drifted from registry',
);
