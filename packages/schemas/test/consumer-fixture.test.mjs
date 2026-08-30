import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import test from 'node:test';

const require = createRequire(import.meta.url);

test('consumer can resolve root packages and governed subpaths', () => {
  const contracts = require('@aurora/contracts');
  const contractIds = require('@aurora/contracts/ids');
  const contractResults = require('@aurora/contracts/results');
  const schemas = require('@aurora/schemas');
  const schemaIds = require('@aurora/schemas/ids');
  const registries = require('@aurora/registries');
  const registryIds = require('@aurora/registries/ids');
  const registryVersions = require('@aurora/registries/versioning');

  assert.equal(contracts.COMMAND_ENVELOPE_KIND, 'COMMAND_ENVELOPE');
  assert.equal(contracts.EVENT_ENVELOPE_KIND, 'EVENT_ENVELOPE');
  assert.equal(contractIds.CANONICAL_ID_GENERATION_RESPONSIBILITY, 'PRODUCER');
  assert.ok(Array.isArray(contractResults.EXECUTION_OUTCOMES));
  assert.equal(typeof schemas.TenantIdSchema.parse, 'function');
  assert.equal(typeof schemaIds.CorrelationIdSchema.parse, 'function');
  assert.equal(registries.ID_NAMESPACE_REGISTRY, registryIds.ID_NAMESPACE_REGISTRY);
  assert.equal(registries.CONTRACT_VERSION_REGISTRY, registryVersions.CONTRACT_VERSION_REGISTRY);
});
