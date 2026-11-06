import assert from 'node:assert/strict';
import test from 'node:test';
import {
  emptyExperienceEvidence,
  EXPERIENCE_SCENARIOS,
  validateExperienceEvidence,
} from './w15j-experience-gate.mjs';

function candidate() {
  const record = emptyExperienceEvidence();
  record.mainSha = 'a'.repeat(40);
  record.candidate.androidSha = 'b'.repeat(40);
  record.candidate.hostSha = 'c'.repeat(40);
  record.candidate.devlabSha = 'd'.repeat(40);
  record.candidate.apkSha256 = 'e'.repeat(64);
  record.device.physicalDeviceVerified = true;
  record.environment.hostInstanceId = 'test-host';
  return record;
}

function passing() {
  const record = candidate();
  for (const id of EXPERIENCE_SCENARIOS) {
    record.scenarios[id] = {
      status: 'PASS',
      physicalObservation: true,
      observedBy: 'operator',
      observedAtUtc: '2026-10-28T04:00:00Z',
      evidenceReferences: [`evidence/${id}.json`],
    };
  }
  record.voice.attempts = Array.from({ length: 5 }, (_, i) => ({ number: i + 1 }));
  record.voice.understoodCommands = 1;
  for (const gate of ['A', 'B', 'C', 'D']) {
    record.riskGates[gate] = { status: 'PASS', evidenceReferences: [`risk/${gate}.md`] };
  }
  record.review = { programControlDecision: 'APPROVED', evidenceReferences: ['review.md'] };
  return record;
}

test('blank evidence starts with exactly 8 NOT_RUN checks and no authority', () => {
  const record = emptyExperienceEvidence();
  assert.equal(Object.keys(record.scenarios).length, 8);
  assert.ok(EXPERIENCE_SCENARIOS.every((id) => record.scenarios[id].status === 'NOT_RUN'));
  assert.equal(record.dp5Certified, false);
  assert.equal(record.releaseAuthorized, false);
});

test('partial physical smoke never opens the experience gate', () => {
  const record = candidate();
  assert.deepEqual(validateExperienceEvidence(record).state, 'NOT_READY');
});

test('complete evidence is still not W15-J accepted or DP5 certified', () => {
  const result = validateExperienceEvidence(passing());
  assert.equal(result.experienceReady, true);
  assert.equal(result.w15jAccepted, false);
  assert.equal(result.w16BuildUnblocked, false);
  assert.equal(result.dp5Certified, false);
  assert.equal(result.releaseAuthorized, false);
});

test('physical PASS requires a witnessed observation', () => {
  const record = passing();
  record.scenarios['EX-04'].physicalObservation = false;
  assert.throws(() => validateExperienceEvidence(record), /lacks human physical observation/);
});

test('five observed wake attempts and an understood command are mandatory', () => {
  const record = passing();
  record.voice.attempts = [];
  assert.throws(() => validateExperienceEvidence(record), /five to ten/);
});

test('missing physical check cannot be omitted or auto-PASSed', () => {
  const record = passing();
  delete record.scenarios['EX-08'];
  assert.throws(() => validateExperienceEvidence(record), /exact EX-01..EX-08/);
});

test('a P0 or P1 blocker prevents experience readiness', () => {
  const record = passing();
  record.blockers.push({ severity: 'P1', state: 'OPEN' });
  assert.equal(validateExperienceEvidence(record).experienceReady, false);
});

test('unreviewed physical evidence remains review-only', () => {
  const record = passing();
  record.review = { programControlDecision: 'PENDING' };
  assert.equal(validateExperienceEvidence(record).state, 'READY_FOR_REVIEW_NOT_ACCEPTED');
});

test('mismatched current exact tuple fails closed', () => {
  const record = passing();
  assert.throws(
    () => validateExperienceEvidence(record, { androidSha: 'f'.repeat(40) }),
    /stale\/mismatched androidSha/,
  );
});

test('a smoke record cannot assert DP5 certification or execution authority', () => {
  const record = passing();
  record.dp5Certified = true;
  assert.throws(() => validateExperienceEvidence(record), /dp5Certified must be explicitly false/);
  record.dp5Certified = false;
  record.authorizesExecution = true;
  assert.throws(
    () => validateExperienceEvidence(record),
    /authorizesExecution must be explicitly false/,
  );
});
