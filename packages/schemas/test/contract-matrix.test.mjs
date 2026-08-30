import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import test from 'node:test';

const require = createRequire(import.meta.url);
const schemas = require('@aurora/schemas');

const matrix = [
  ['CommandEnvelope', 'CommandEnvelopeSchema'],
  ['EventEnvelope', 'EventEnvelopeSchema'],
  ['ActionIntent', 'ActionIntentSchema'],
  ['Receipt', 'ReceiptSchema'],
  ['Evidence', 'EvidenceSchema'],
  ['OwnerDecision', 'OwnerDecisionSchema'],
  ['PolicyToken', 'PolicyTokenSchema'],
  ['CanonicalError', 'validateCanonicalError'],
  ['Outcome', 'validateExecutionResult'],
  ['IDs', 'TenantIdSchema'],
  ['tenant', 'TenantContextSchema'],
  ['identity', 'ActorRefSchema'],
  ['correlation', 'CorrelationContextSchema'],
  ['version', 'ContractVersionSchema'],
];

test('W01-G public schema matrix is complete', () => {
  for (const [contractName, exportName] of matrix) {
    assert.notEqual(schemas[exportName], undefined, `${contractName} missing public ${exportName}`);
  }
});

test('runtime schema and validator entrypoints are callable/parseable', () => {
  for (const [, exportName] of matrix) {
    const entry = schemas[exportName];
    const usable = typeof entry === 'function' || typeof entry?.parse === 'function';
    assert.equal(usable, true, `${exportName} has no runtime validation entrypoint`);
  }
});
