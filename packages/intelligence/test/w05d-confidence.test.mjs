import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import test from 'node:test';

const require = createRequire(import.meta.url);
const confidence = require('../dist/confidence/index.js');

const tenant = { tenantId: 'ten_01K0M0M0M0M0M0M0M0M0M0M0M0M0' };
const correlation = { correlationId: 'cor_01K0M0M0M0M0M0M0M0M0M0M0M1' };

function request(overrides = {}) {
  return {
    tenant,
    correlation,
    signals: {
      evidenceQualityBps: 9000,
      consistencyBps: 9000,
      coverageBps: 8500,
      freshnessBps: 9000,
      ambiguityBps: 1000,
    },
    ...overrides,
  };
}

test('W05-D confidence is deterministic and decomposed', () => {
  const first = confidence.evaluateConfidence(request());
  const second = confidence.evaluateConfidence(request());
  assert.deepEqual(first, second);
  assert.equal(first.band, 'HIGH');
  assert.equal(first.disposition, 'PROCEED_WITH_EVIDENCE');
  assert.equal(first.scoreBps, 8900);
  assert.deepEqual(first.decomposition, request().signals);
  assert.deepEqual(first.uncertaintyReasons, []);
  assert.equal(first.authorizesExecution, false);
  assert.equal(first.canGrantPermission, false);
});

test('missing evidence produces explicit UNKNOWN and abstention', () => {
  const result = confidence.evaluateConfidence(
    request({
      signals: {
        evidenceQualityBps: null,
        consistencyBps: 8000,
        coverageBps: 7000,
        freshnessBps: 7000,
        ambiguityBps: 2000,
      },
    }),
  );
  assert.equal(result.scoreBps, null);
  assert.equal(result.band, 'UNKNOWN');
  assert.equal(result.disposition, 'ABSTAIN');
  assert.ok(result.uncertaintyReasons.includes('EVIDENCE_QUALITY_UNKNOWN'));
  assert.equal(result.authorizesExecution, false);
});

test('high ambiguity or conflicting signals escalates instead of granting confidence authority', () => {
  const result = confidence.evaluateConfidence(
    request({
      signals: {
        evidenceQualityBps: 9000,
        consistencyBps: 3000,
        coverageBps: 8000,
        freshnessBps: 8000,
        ambiguityBps: 7500,
      },
    }),
  );
  assert.equal(result.band, 'LOW');
  assert.ok(['ESCALATE', 'ABSTAIN'].includes(result.disposition));
  assert.ok(result.uncertaintyReasons.includes('HIGH_AMBIGUITY'));
  assert.ok(result.uncertaintyReasons.includes('SIGNAL_CONFLICT'));
  assert.equal(result.authorizesExecution, false);
  assert.equal(result.canGrantPermission, false);
});

test('basis-point inputs are bounded and malformed signals fail closed', () => {
  assert.throws(
    () =>
      confidence.evaluateConfidence(
        request({ signals: { ...request().signals, evidenceQualityBps: 10001 } }),
      ),
    /between 0 and 10000 basis points/,
  );
  assert.throws(
    () =>
      confidence.evaluateConfidence(
        request({ signals: { ...request().signals, ambiguityBps: 3.14 } }),
      ),
    /between 0 and 10000 basis points/,
  );
});

test('calibration interface is data-only and cannot self-promote runtime behavior', () => {
  const evaluation = confidence.evaluateConfidence(request());
  const sample = confidence.createCalibrationSample(evaluation, 'CORRECT', '2026-09-01T21:30:00Z');
  assert.equal(sample.predictedScoreBps, evaluation.scoreBps);
  assert.equal(sample.predictedBand, evaluation.band);
  assert.equal(sample.observedOutcome, 'CORRECT');
  assert.equal(sample.promotesRuntimeBehavior, false);
  assert.equal(sample.authorizesExecution, false);
  assert.deepEqual(sample.tenant, tenant);
  assert.deepEqual(sample.correlation, correlation);
});

test('calibration timestamps fail closed when malformed', () => {
  const evaluation = confidence.evaluateConfidence(request());
  assert.throws(
    () => confidence.createCalibrationSample(evaluation, 'INDETERMINATE', 'not-a-time'),
    /valid RFC3339 timestamp/,
  );
});
