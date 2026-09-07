import assert from 'node:assert/strict';
import test from 'node:test';

import { validateW15JTabletLoopbackPreflight } from './w15j-tablet-loopback-preflight.mjs';
import {
  FINALIZED_AT,
  HOST_INSTANCE_ID,
  PREFLIGHT_AT,
  TUPLE,
  canonicalDossier,
} from './w15j-test-fixture.mjs';

function trustedTabletPreflight() {
  const expected = {
    repository: 'luizanunciostoca/aurora-ai-native',
    workflowRun: {
      id: TUPLE.packagingRunId,
      url: `https://github.com/luizanunciostoca/aurora-ai-native/actions/runs/${TUPLE.packagingRunId}`,
      status: 'SUCCESS',
      headSha: TUPLE.packagingHeadSha,
      sourceRef: `https://github.com/luizanunciostoca/aurora-ai-native/actions/runs/${TUPLE.packagingRunId}#exact-head`,
    },
    androidCandidateSha: TUPLE.androidCandidateSha,
    hostCandidateSha: TUPLE.hostCandidateSha,
    reconciledMainSha: TUPLE.reconciledMainSha,
    packagingHeadSha: TUPLE.packagingHeadSha,
    artifact: {
      id: TUPLE.artifactId,
      name: TUPLE.artifactName,
      zipSha256: '1'.repeat(64),
      digestSourceRef: 'artifact-digest-ref',
    },
    apk: {
      applicationId: TUPLE.applicationId,
      variant: TUPLE.apkVariant,
      versionCode: TUPLE.versionCode,
      versionName: TUPLE.versionName,
      sha256: '2'.repeat(64),
    },
    device: {
      serialSha256: TUPLE.serialSha256,
      manufacturer: 'Samsung',
      model: 'Tablet',
      product: 'tablet',
      apiLevel: '36',
      buildFingerprint: 'samsung/tablet/build',
      physicalDeviceVerified: true,
    },
    environment: {
      gatewayIdentity: 'aurora-w15j-local-host',
      gatewayVersion: `git:${TUPLE.hostCandidateSha}`,
      hostInstanceId: HOST_INSTANCE_ID,
      gatewayTransport: 'LOCAL_TABLET_LOOPBACK',
      adbReversePort: null,
      controlPlane: 'SELF_ADB_WIRELESS_DEBUGGING',
    },
    operator: 'operator-1',
    attestations: {
      operator: { reference: 'operator-attestation.json' },
      reviewer: { reference: 'reviewer-attestation.json' },
    },
    preflightObservedAtUtc: PREFLIGHT_AT,
    finalizedAtUtc: FINALIZED_AT,
  };

  const trusted = {
    schemaVersion: 'w15j-tablet-loopback-trusted-preflight-v1',
    expected,
    transportBindings: {
      gatewayTransport: 'LOCAL_TABLET_LOOPBACK',
      controlPlane: 'SELF_ADB_WIRELESS_DEBUGGING',
      deviceGatewayPort: 8080,
      bootstrapPort: 8081,
      adbReverse8080And8081: 'ABSENT_THROUGHOUT_WINDOW',
    },
    evidenceManifest: {
      fileName: 'evidence-manifest.sha256',
      sha256: '3'.repeat(64),
      files: {},
    },
    wakeEvidence: {
      reference: 'wake-evidence.json',
      sha256: '4'.repeat(64),
      schemaVersion: '1.1.0',
      deliberateAttempts: 100,
      scenarioCount: 26,
      lintReadyForIndependentReview: true,
      physicallyAccepted: false,
    },
    sourceEvidence: {
      rawDirectory: '.',
      preflightMetadata: 'preflight-metadata.txt',
      finalizeMetadata: 'finalize-metadata.txt',
      sha256Manifest: 'evidence-manifest.sha256',
      adbReverseCleanup: 'adb-reverse-list-after-finalize.txt',
    },
    trustRoot: {
      liveGitHubRevalidation: 'EXTERNAL_REQUIRED_IMMEDIATELY_BEFORE_ACCEPTANCE',
    },
    physicallyAccepted: false,
  };

  const dossier = canonicalDossier(trusted);
  dossier.environment = {
    ...dossier.environment,
    gatewayTransport: 'LOCAL_TABLET_LOOPBACK',
    adbReversePort: null,
    controlPlane: 'SELF_ADB_WIRELESS_DEBUGGING',
  };
  dossier.apk.sha256 = expected.apk.sha256;
  dossier.provenance.artifact.zipSha256 = expected.artifact.zipSha256;
  dossier.wakeEvidence = {
    reference: trusted.wakeEvidence.reference,
    sha256: trusted.wakeEvidence.sha256,
    schemaVersion: trusted.wakeEvidence.schemaVersion,
    deliberateAttempts: trusted.wakeEvidence.deliberateAttempts,
    scenarioCount: trusted.wakeEvidence.scenarioCount,
  };

  const references = new Set([
    'operator-attestation.json',
    'preflight-metadata.txt',
    'finalize-metadata.txt',
    'adb-reverse-list-after-finalize.txt',
    'evidence.txt',
    'wake-evidence.json',
  ]);
  const visit = (value) => {
    if (!value || typeof value !== 'object') return;
    if (Array.isArray(value.evidenceReferences)) {
      for (const reference of value.evidenceReferences) references.add(reference);
    }
    if (Array.isArray(value)) {
      value.forEach(visit);
    } else {
      Object.values(value).forEach(visit);
    }
  };
  visit(dossier);
  for (const reference of references) {
    if (reference === 'evidence-manifest.sha256') continue;
    trusted.evidenceManifest.files[reference] = { sha256: '5'.repeat(64), sizeBytes: 1 };
  }

  return { dossier, trusted };
}

test('tablet-loopback dossier accepts exact loopback transport with self-ADB control plane', () => {
  const { dossier, trusted } = trustedTabletPreflight();
  const result = validateW15JTabletLoopbackPreflight(dossier, trusted);
  assert.equal(result.gatewayTransport, 'LOCAL_TABLET_LOOPBACK');
  assert.equal(result.controlPlane, 'SELF_ADB_WIRELESS_DEBUGGING');
  assert.equal(result.requiredScenarioCount, 48);
  assert.equal(result.readyForIndependentReview, true);
  assert.equal(result.physicallyAccepted, false);
});

test('tablet-loopback dossier rejects legacy adb-reverse transport mode confusion', () => {
  const { dossier, trusted } = trustedTabletPreflight();
  dossier.environment.gatewayTransport = 'LOCAL_ADB_REVERSE_ONLY';
  dossier.environment.adbReversePort = 8080;
  assert.throws(
    () => validateW15JTabletLoopbackPreflight(dossier, trusted),
    /gatewayTransport must be LOCAL_TABLET_LOOPBACK/,
  );
});

test('tablet-loopback dossier rejects missing self-ADB control-plane proof', () => {
  const { dossier, trusted } = trustedTabletPreflight();
  dossier.environment.controlPlane = 'NONE';
  assert.throws(
    () => validateW15JTabletLoopbackPreflight(dossier, trusted),
    /controlPlane must be SELF_ADB_WIRELESS_DEBUGGING/,
  );
});

test('tablet-loopback dossier rejects incomplete scenario matrix', () => {
  const { dossier, trusted } = trustedTabletPreflight();
  dossier.scenarios.voiceAndPresence.validDeterministicCommonCommand.status = 'NOT_RUN';
  assert.throws(
    () => validateW15JTabletLoopbackPreflight(dossier, trusted),
    /must not be NOT_RUN/,
  );
});

test('tablet-loopback dossier rejects wake evidence below 100 deliberate attempts', () => {
  const { dossier, trusted } = trustedTabletPreflight();
  dossier.wakeEvidence.deliberateAttempts = 99;
  assert.throws(
    () => validateW15JTabletLoopbackPreflight(dossier, trusted),
    /wake deliberate attempts must be >=100/,
  );
});
