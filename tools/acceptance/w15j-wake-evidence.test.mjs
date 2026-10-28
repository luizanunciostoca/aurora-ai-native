import assert from 'node:assert/strict';
import { readFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import test from 'node:test';

import {
  buildTrustedW15JPreflight,
  verifyEvidenceManifest,
} from './w15j-trusted-preflight-from-collector.mjs';
import { createFinalizedEvidenceFixture } from './w15j-test-fixture.mjs';
import { validateW15JWakeEvidence } from './w15j-wake-evidence.mjs';

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function withWake(run) {
  const fixture = createFinalizedEvidenceFixture();
  try {
    const trusted = buildTrustedW15JPreflight(fixture.directory, fixture.controlTower);
    const wake = JSON.parse(readFileSync(join(fixture.directory, 'wake-evidence.json'), 'utf8'));
    const manifest = verifyEvidenceManifest(fixture.directory);
    return run({ wake, expected: trusted.expected, files: manifest.files });
  } finally {
    rmSync(fixture.directory, { recursive: true, force: true });
  }
}

test('validates required deliberate matrix, false-wake window, audio/privacy, and resources as lint only', () =>
  withWake(({ wake, expected, files }) => {
    const result = validateW15JWakeEvidence(wake, expected, files);
    assert.equal(result.deliberateAttempts, 100);
    assert.equal(result.scenarioCount, 26);
    assert.equal(result.lintReadyForIndependentReview, true);
    assert.equal(result.physicallyAccepted, false);
  }));

test('rejects missing noise, distance, voices, TTS, barge-in, route, privacy, and resource fields', () =>
  withWake(({ wake, expected, files }) => {
    const mutations = [
      (value) => {
        value.accuracy.backgrounds = ['quiet'];
      },
      (value) => {
        value.accuracy.distancesMeters = [1];
      },
      (value) => {
        value.accuracy.speakerIds = ['one'];
      },
      (value) => {
        delete value.mandatoryObservations.ttsSelfWake;
      },
      (value) => {
        delete value.mandatoryObservations.bargeIn;
      },
      (value) => {
        value.mandatoryObservations.audioRoutes.routes = ['built-in'];
      },
      (value) => {
        delete value.mandatoryObservations.privacyMode;
      },
      (value) => {
        value.mandatoryObservations.rawPcmPersistence.persisted = true;
      },
      (value) => {
        delete value.mandatoryObservations.cpu;
      },
      (value) => {
        delete value.mandatoryObservations.pss;
      },
      (value) => {
        delete value.mandatoryObservations.battery;
      },
      (value) => {
        delete value.mandatoryObservations.thermal;
      },
    ];
    for (const mutate of mutations) {
      const changed = clone(wake);
      mutate(changed);
      assert.throws(() => validateW15JWakeEvidence(changed, expected, files));
    }
  }));

test('rejects candidate/device provenance drift and arbitrary references', () =>
  withWake(({ wake, expected, files }) => {
    const wrongHost = clone(wake);
    wrongHost.candidate.hostGitSha = '1'.repeat(40);
    assert.throws(
      () => validateW15JWakeEvidence(wrongHost, expected, files),
      /does not match trusted provenance/,
    );

    const wrongHostInstance = clone(wake);
    wrongHostInstance.candidate.hostInstanceId = `whi_${'8'.repeat(64)}`;
    assert.throws(
      () => validateW15JWakeEvidence(wrongHostInstance, expected, files),
      /does not match trusted provenance/,
    );

    const invented = clone(wake);
    invented.scenarios[0].evidenceReferences = ['invented.txt'];
    assert.throws(
      () => validateW15JWakeEvidence(invented, expected, files),
      /not bound by the final evidence manifest/,
    );

    const self = clone(wake);
    self.attempts[0].evidenceReference = 'wake-evidence.json';
    assert.throws(() => validateW15JWakeEvidence(self, expected, files), /non-self evidence file/);
  }));

test('requires 100 unique, reconciled, canonical per-attempt records with full coverage', () =>
  withWake(({ wake, expected, files }) => {
    const mutations = [
      (value) => {
        value.attempts.pop();
      },
      (value) => {
        value.attempts[1].id = value.attempts[0].id;
      },
      (value) => {
        value.attempts[0].background = 'street';
      },
      (value) => {
        value.attempts[0].unexpected = true;
      },
      (value) => {
        value.accuracy.confirmedWakes = 95;
        value.accuracy.rejectedWakes = 5;
      },
      (value) => {
        value.attempts.forEach((attempt) => {
          attempt.speakerId = 'speaker-hash-1';
        });
      },
      (value) => {
        delete value.accuracy.passiveEvidenceReference;
      },
    ];
    for (const mutate of mutations) {
      const changed = clone(wake);
      mutate(changed);
      assert.throws(() => validateW15JWakeEvidence(changed, expected, files));
    }
  }));

test('rejects noncanonical matrix values and operator/reviewer identity collapse', () =>
  withWake(({ wake, expected, files }) => {
    const extraBackground = clone(wake);
    extraBackground.accuracy.backgrounds.push('street');
    assert.throws(
      () => validateW15JWakeEvidence(extraBackground, expected, files),
      /exactly once and no extras/,
    );

    const sameReviewer = clone(wake);
    sameReviewer.operator.independentReviewReference = sameReviewer.operator.attestationReference;
    assert.throws(
      () => validateW15JWakeEvidence(sameReviewer, expected, files),
      /must be distinct/,
    );
  }));

test('rejects attempt/scenario timestamps outside wake window and reused primary proof', () =>
  withWake(({ wake, expected, files }) => {
    const lateAttempt = clone(wake);
    lateAttempt.attempts[0].observedAtUtc = '2026-09-05T18:00:00Z';
    assert.throws(
      () => validateW15JWakeEvidence(lateAttempt, expected, files),
      /outside the wake physical window/,
    );

    const earlyScenario = clone(wake);
    earlyScenario.scenarios[0].observedAtUtc = '2026-09-05T17:00:00Z';
    assert.throws(
      () => validateW15JWakeEvidence(earlyScenario, expected, files),
      /outside the wake physical window/,
    );

    const reused = clone(wake);
    reused.scenarios[1].evidenceReferences = [...reused.scenarios[0].evidenceReferences];
    assert.throws(
      () => validateW15JWakeEvidence(reused, expected, files),
      /reuses another wake record/,
    );
  }));
