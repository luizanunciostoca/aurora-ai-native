import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import { validateW15JPreflight } from './w15j-preflight.mjs';
import { buildTrustedW15JPreflight } from './w15j-trusted-preflight-from-collector.mjs';
import {
  canonicalDossier,
  createFinalizedEvidenceFixture,
  evidence,
  rewriteManifest,
  TUPLE,
} from './w15j-test-fixture.mjs';

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function withFixture(run) {
  const fixture = createFinalizedEvidenceFixture();
  try {
    const preflight = buildTrustedW15JPreflight(fixture.directory, fixture.controlTower);
    return run({ ...fixture, preflight, dossier: canonicalDossier(preflight) });
  } finally {
    rmSync(fixture.directory, { recursive: true, force: true });
  }
}

test('lints the immutable canonical W15-J tuple without auto-accepting DP5', () =>
  withFixture(({ dossier, preflight }) => {
    const result = validateW15JPreflight(dossier, preflight);
    assert.equal(result.readyForIndependentReview, true);
    assert.equal(result.physicallyAccepted, false);
    assert.equal(result.requiredScenarioCount, 48);
    assert.deepEqual(result.requiredReverseMappings, [8080, 8081]);
  }));

test('fails closed on wrong host, main, packaging head, or artifact identity', () =>
  withFixture(({ dossier, preflight }) => {
    for (const mutate of [
      (value) => {
        value.provenance.hostCandidateSha = '1'.repeat(40);
      },
      (value) => {
        value.provenance.reconciledMainSha = '1'.repeat(40);
      },
      (value) => {
        value.provenance.packagingHeadSha = '1'.repeat(40);
      },
      (value) => {
        value.provenance.artifact.id = '123';
      },
      (value) => {
        value.provenance.artifact.zipSha256 = '1'.repeat(64);
      },
    ]) {
      const changed = clone(dossier);
      mutate(changed);
      assert.throws(
        () => validateW15JPreflight(changed, preflight),
        /does not match trusted preflight/,
      );
    }
  }));

test('fails closed when a mandatory DP5 scenario is missing or unobserved', () =>
  withFixture(({ dossier, preflight }) => {
    delete dossier.scenarios.voiceAndPresence.confidenceNeverBecomesAuthority;
    assert.throws(
      () => validateW15JPreflight(dossier, preflight),
      /confidenceNeverBecomesAuthority is required/,
    );

    const blocked = canonicalDossier(preflight);
    blocked.scenarios.lifecycleAndProcessRestart.coldLaunchFromStoppedProcess = evidence('BLOCKED');
    assert.throws(() => validateW15JPreflight(blocked, preflight), /must not be BLOCKED/);
  }));

test('rejects arbitrary or unmanifested evidence references and missing cleanup', () =>
  withFixture(({ dossier, preflight }) => {
    dossier.scenarios.voiceAndPresence.falseWakeDoesNotDispatch.evidenceReferences = [
      'invented.txt',
    ];
    assert.throws(
      () => validateW15JPreflight(dossier, preflight),
      /not bound by the final evidence manifest/,
    );

    const missingCleanup = canonicalDossier(preflight);
    missingCleanup.collectorEvidence.adbReverseCleanup = 'evidence.txt';
    assert.throws(
      () => validateW15JPreflight(missingCleanup, preflight),
      /does not match trusted collector source/,
    );
  }));

test('rejects manifest/self, empty, or non-specific resource references', () =>
  withFixture(({ dossier, preflight }) => {
    const self = clone(dossier);
    self.evidenceReferences = ['evidence-manifest.sha256'];
    assert.throws(() => validateW15JPreflight(self, preflight), /non-manifest/);
    const wakeSelf = clone(dossier);
    wakeSelf.scenarios.voiceAndPresence.falseWakeDoesNotDispatch.evidenceReferences = [
      'wake-evidence.json',
    ];
    assert.throws(() => validateW15JPreflight(wakeSelf, preflight), /non-self/);

    const fixture = createFinalizedEvidenceFixture();
    try {
      writeFileSync(join(fixture.directory, 'empty-evidence.txt'), '');
      rewriteManifest(fixture.directory);
      const trusted = buildTrustedW15JPreflight(fixture.directory, fixture.controlTower);
      const empty = canonicalDossier(trusted);
      empty.evidenceReferences = ['empty-evidence.txt'];
      assert.throws(() => validateW15JPreflight(empty, trusted), /empty evidence/);

      const nonspecific = canonicalDossier(trusted);
      nonspecific.resourceObservations.cpu.evidenceReferences = ['evidence.txt'];
      assert.throws(
        () => validateW15JPreflight(nonspecific, trusted),
        /must reference cpuinfo-after-restart.txt/,
      );
    } finally {
      rmSync(fixture.directory, { recursive: true, force: true });
    }
  }));

test('requires exact authority/status/publication, collector operator, and timestamps', () =>
  withFixture(({ dossier, preflight }) => {
    for (const mutate of [
      (value) => {
        value.authorityInvariant = 'INTELLIGENCE = AUTHORITY';
      },
      (value) => {
        value.dp4Status = 'CLOSED';
      },
      (value) => {
        value.dp4PublicationReference = 'issue:115';
      },
      (value) => {
        value.dp5Status = 'PASS';
      },
      (value) => {
        value.environment.operator = 'different-operator';
      },
      (value) => {
        value.environment.hostInstanceId = `whi_${'8'.repeat(64)}`;
      },
      (value) => {
        value.environment.finalizedAtUtc = '2026-09-05T18:00:01Z';
      },
      (value) => {
        value.environment.preflightObservedAtUtc = '2026-02-30T00:00:00Z';
      },
    ]) {
      const changed = clone(dossier);
      mutate(changed);
      assert.throws(() => validateW15JPreflight(changed, preflight));
    }
  }));

test('rejects every W15-J observed record outside the collector window or with reused primary proof', () =>
  withFixture(({ dossier, preflight }) => {
    dossier.scenarios.voiceAndPresence.falseWakeDoesNotDispatch.observedAtUtc =
      '2026-09-05T18:00:01Z';
    assert.throws(() => validateW15JPreflight(dossier, preflight), /outside the collector/);

    const reused = canonicalDossier(preflight);
    reused.threatReview.secretOrKeystoreLeakage.evidenceReferences = [
      reused.threatReview.packageImpersonationOrConfusion.evidenceReferences[0],
    ];
    assert.throws(() => validateW15JPreflight(reused, preflight), /reuses another/);
  }));

test('requires distinct evidence-bound attestations and evidence-bound handoffs', () =>
  withFixture(({ dossier, preflight }) => {
    dossier.finalization.independentReviewReference =
      dossier.finalization.operatorAttestationReference;
    assert.throws(
      () => validateW15JPreflight(dossier, preflight),
      /must be distinct|do not match parsed trusted attestations/,
    );

    const handoff = canonicalDossier(preflight);
    handoff.handoffs.w17Telemetry.push({
      downstreamOwner: 'W17',
      evidenceReferences: ['invented.txt'],
    });
    assert.throws(
      () => validateW15JPreflight(handoff, preflight),
      /not bound by the final evidence manifest/,
    );
  }));

test('requires the separately manifested wake matrix and at least 100 attempts', () =>
  withFixture(({ dossier, preflight }) => {
    delete dossier.wakeEvidence;
    assert.throws(() => validateW15JPreflight(dossier, preflight), /wake evidence is required/);

    const under = canonicalDossier(preflight);
    under.wakeEvidence.deliberateAttempts = 99;
    assert.throws(() => validateW15JPreflight(under, preflight), />= 100/);
  }));

test('requires threat review, resource observations, gates, and manifested attestations', () =>
  withFixture(({ dossier, preflight }) => {
    delete dossier.threatReview.packageImpersonationOrConfusion;
    assert.throws(
      () => validateW15JPreflight(dossier, preflight),
      /packageImpersonationOrConfusion is required/,
    );

    const missingResource = canonicalDossier(preflight);
    delete missingResource.resourceObservations.cpu;
    assert.throws(
      () => validateW15JPreflight(missingResource, preflight),
      /resourceObservations.cpu is required/,
    );

    const fakeAttestation = canonicalDossier(preflight);
    fakeAttestation.finalization.independentReviewReference = 'fake-review.txt';
    assert.throws(
      () => validateW15JPreflight(fakeAttestation, preflight),
      /do not match parsed trusted attestations/,
    );
  }));

test('CLI rebuilds trust from evidence plus independent tuple and never auto-accepts', () =>
  withFixture(({ directory, dossier, controlTower }) => {
    const inputDirectory = mkdtempSync(join(tmpdir(), 'w15j-cli-input-'));
    const dossierPath = join(inputDirectory, 'dossier.json');
    const controlTowerPath = join(inputDirectory, 'control-tower.json');
    writeFileSync(dossierPath, JSON.stringify(dossier));
    writeFileSync(controlTowerPath, JSON.stringify(controlTower));
    const modulePath = fileURLToPath(import.meta.resolve('./w15j-preflight.mjs'));
    const missing = spawnSync(process.execPath, [modulePath, dossierPath], { encoding: 'utf8' });
    assert.equal(missing.status, 2);
    try {
      const output = execFileSync(
        process.execPath,
        [modulePath, dossierPath, directory, controlTowerPath],
        { encoding: 'utf8' },
      );
      assert.match(output, /W15J_PREFLIGHT_LINT_READY_NOT_ACCEPTED/);
      assert.doesNotMatch(output, /DP5_PASS|PHYSICALLY_ACCEPTED/u);
    } finally {
      rmSync(inputDirectory, { recursive: true, force: true });
    }
  }));

test('does not mutate the canonical evidence record', () =>
  withFixture(({ dossier, preflight }) => {
    const before = JSON.stringify(dossier);
    validateW15JPreflight(dossier, preflight);
    assert.equal(JSON.stringify(dossier), before);
    assert.equal(dossier.candidateSha, TUPLE.androidCandidateSha);
  }));
