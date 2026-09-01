import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import test from 'node:test';

const require = createRequire(import.meta.url);
const intelligence = require('../dist/index.js');

const tenant = { tenantId: 'ten_01K0M0M0M0M0M0M0M0M0M0M0M0' };
const correlation = { correlationId: 'cor_01K0M0M0M0M0M0M0M0M0M0M0M1' };

function baseInput(overrides = {}) {
  return {
    tenant,
    correlation,
    operation: 'ANALYZE',
    modalities: ['TEXT'],
    sideEffectProfile: 'NONE',
    riskFacts: [],
    evidenceCompleteness: 'COMPLETE',
    ambiguity: 'NONE',
    complexityDrivers: {
      estimatedSteps: 3,
      dependencyCount: 1,
      externalInteractionCount: 0,
      requiresSpecializedTool: false,
    },
    ...overrides,
  };
}

test('W05-A classification is deterministic and propagates tenant/correlation', () => {
  const input = baseInput();
  const first = intelligence.classifyTask(input);
  const second = intelligence.classifyTask(structuredClone(input));
  assert.deepEqual(first, second);
  assert.deepEqual(first.tenant, tenant);
  assert.deepEqual(first.correlation, correlation);
  assert.equal(first.taskClass, 'ANALYTICAL');
  assert.equal(first.modality, 'TEXT');
  assert.equal(first.complexity, 'MEDIUM');
  assert.equal(first.reversibility, 'NOT_APPLICABLE');
  assert.equal(first.classificationConfidence, 'HIGH');
  assert.equal(first.authoritySemantics, 'CLASSIFIER_ONLY_NO_AUTHORITY');
});

test('equivalent modality sets produce the same deterministic MULTIMODAL classification', () => {
  const left = intelligence.classifyTask(baseInput({ modalities: ['IMAGE', 'TEXT', 'IMAGE'] }));
  const right = intelligence.classifyTask(baseInput({ modalities: ['TEXT', 'IMAGE'] }));
  assert.equal(left.modality, 'MULTIMODAL');
  assert.equal(right.modality, 'MULTIMODAL');
  assert.equal(left.complexity, right.complexity);
});

test('insufficient evidence and unknown requirements are explicit rather than guessed', () => {
  const result = intelligence.classifyTask(baseInput({ operation: 'UNKNOWN', modalities: [], sideEffectProfile: 'UNKNOWN', evidenceCompleteness: 'INSUFFICIENT', ambiguity: 'UNKNOWN', complexityDrivers: {} }));
  assert.equal(result.taskClass, 'UNKNOWN');
  assert.equal(result.modality, 'UNKNOWN');
  assert.equal(result.complexity, 'UNKNOWN');
  assert.equal(result.reversibility, 'UNKNOWN');
  assert.equal(result.classificationConfidence, 'UNKNOWN');
  assert.deepEqual(result.riskSignals, ['AMBIGUOUS_REQUIREMENTS', 'INSUFFICIENT_EVIDENCE']);
});

test('irreversible high-risk execution remains classifier-only and cannot become permission', () => {
  const result = intelligence.classifyTask(baseInput({
    operation: 'EXECUTE',
    sideEffectProfile: 'IRREVERSIBLE',
    riskFacts: ['EXTERNAL_SIDE_EFFECT', 'FINANCIAL_IMPACT', 'DESTRUCTIVE_CHANGE'],
    complexityDrivers: { estimatedSteps: 20, dependencyCount: 7, externalInteractionCount: 5, requiresSpecializedTool: true },
  }));
  assert.equal(result.taskClass, 'EXECUTION_REQUEST');
  assert.equal(result.reversibility, 'IRREVERSIBLE');
  assert.equal(result.complexity, 'VERY_HIGH');
  assert.equal(result.authoritySemantics, 'CLASSIFIER_ONLY_NO_AUTHORITY');
  assert.ok(result.riskSignals.includes('IRREVERSIBLE_SIDE_EFFECT'));
  assert.ok(result.riskSignals.includes('FINANCIAL_IMPACT'));
  assert.equal('allowed' in result, false);
  assert.equal('authorized' in result, false);
  assert.equal('policyToken' in result, false);
});

test('risk signals are canonical, deduplicated and order-stable', () => {
  const result = intelligence.classifyTask(baseInput({ riskFacts: ['SENSITIVE_DATA', 'FINANCIAL_IMPACT', 'SENSITIVE_DATA'], ambiguity: 'HIGH' }));
  assert.deepEqual(result.riskSignals, ['AMBIGUOUS_REQUIREMENTS', 'FINANCIAL_IMPACT', 'SENSITIVE_DATA']);
  assert.equal(result.classificationConfidence, 'LOW');
});

test('complexity driver bounds fail deterministically instead of overflowing routing inputs', () => {
  assert.throws(() => intelligence.classifyTask(baseInput({ complexityDrivers: { estimatedSteps: -1 } })), /expected safe integer between 0 and 100000/);
  assert.throws(() => intelligence.classifyTask(baseInput({ complexityDrivers: { dependencyCount: Number.MAX_SAFE_INTEGER } })), /expected safe integer between 0 and 100000/);
});

test('task classes do not reinterpret decision support as authority', () => {
  const decision = intelligence.classifyTask(baseInput({ operation: 'DECIDE' }));
  assert.equal(decision.taskClass, 'DECISION_SUPPORT');
  assert.equal(decision.authoritySemantics, 'CLASSIFIER_ONLY_NO_AUTHORITY');
});
