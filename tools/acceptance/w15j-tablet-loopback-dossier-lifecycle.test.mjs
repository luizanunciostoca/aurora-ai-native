import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import test from 'node:test';

import {
  createBoundW15JTabletLoopbackDossier,
  finalizeBoundW15JTabletLoopbackDossier,
} from './w15j-tablet-loopback-dossier-lifecycle.mjs';
import {
  FINALIZED_AT,
  HOST_INSTANCE_ID,
  OBSERVED_AT,
  PREFLIGHT_AT,
  TUPLE,
  controlTowerTuple,
} from './w15j-test-fixture.mjs';

const template = JSON.parse(
  readFileSync(
    resolve('apps/aurora-android/physical/W15J_EVIDENCE_TEMPLATE.json'),
    'utf8',
  ),
);
const apkSha = '2'.repeat(64);
const zipSha = '1'.repeat(64);

function tuple() {
  return controlTowerTuple(zipSha, apkSha);
}

function preflight() {
  return {
    collected_at_utc: PREFLIGHT_AT,
    candidate_sha: TUPLE.androidCandidateSha,
    host_candidate_sha: TUPLE.hostCandidateSha,
    reconciled_main_sha: TUPLE.reconciledMainSha,
    packaging_head_sha: TUPLE.packagingHeadSha,
    packaging_run_id: TUPLE.packagingRunId,
    artifact_id: TUPLE.artifactId,
    artifact_name: TUPLE.artifactName,
    artifact_zip_sha256: zipSha,
    apk_path_sha256: apkSha,
    apk_variant: TUPLE.apkVariant,
    serial_sha256: TUPLE.serialSha256,
    manufacturer: 'Samsung',
    model: 'Tablet',
    product: 'tablet',
    api_level: '36',
    build_fingerprint: 'samsung/tablet/build',
    'ro.kernel.qemu': '0',
    package_id: TUPLE.applicationId,
    gateway_identity: 'aurora-w15j-local-host',
    gateway_version: `git:${TUPLE.hostCandidateSha}`,
    host_instance_id: HOST_INSTANCE_ID,
    transport_scope: 'LOCAL_TABLET_LOOPBACK',
    control_plane: 'SELF_ADB_WIRELESS_DEBUGGING',
    operator: 'operator-1',
  };
}

function apkIdentity() {
  return {
    candidate_sha: TUPLE.androidCandidateSha,
    application_id: TUPLE.applicationId,
    variant: TUPLE.apkVariant,
    version_code: TUPLE.versionCode,
    version_name: TUPLE.versionName,
    apk_sha256: apkSha,
  };
}

function finalize() {
  return {
    finalized_at_utc: FINALIZED_AT,
    candidate_sha: TUPLE.androidCandidateSha,
    host_candidate_sha: TUPLE.hostCandidateSha,
    reconciled_main_sha: TUPLE.reconciledMainSha,
    packaging_head_sha: TUPLE.packagingHeadSha,
    packaging_run_id: TUPLE.packagingRunId,
    artifact_id: TUPLE.artifactId,
    artifact_name: TUPLE.artifactName,
    artifact_zip_sha256: zipSha,
    apk_sha256: apkSha,
    apk_variant: TUPLE.apkVariant,
    package_id: TUPLE.applicationId,
    serial_sha256: TUPLE.serialSha256,
    manufacturer: 'Samsung',
    model: 'Tablet',
    product: 'tablet',
    api_level: '36',
    build_fingerprint: 'samsung/tablet/build',
    gateway_identity: 'aurora-w15j-local-host',
    gateway_version: `git:${TUPLE.hostCandidateSha}`,
    host_instance_id: HOST_INSTANCE_ID,
    transport_scope: 'LOCAL_TABLET_LOOPBACK',
    control_plane: 'SELF_ADB_WIRELESS_DEBUGGING',
    operator: 'operator-1',
    adb_reverse_8080_8081: 'ABSENT_VERIFIED',
  };
}

test('preflight creates tablet-loopback dossier from legacy-neutral canonical template', () => {
  const dossier = createBoundW15JTabletLoopbackDossier(
    template,
    tuple(),
    preflight(),
    apkIdentity(),
  );
  assert.equal(dossier.candidateSha, TUPLE.androidCandidateSha);
  assert.equal(dossier.environment.gatewayTransport, 'LOCAL_TABLET_LOOPBACK');
  assert.equal(dossier.environment.adbReversePort, null);
  assert.equal(dossier.environment.controlPlane, 'SELF_ADB_WIRELESS_DEBUGGING');
  assert.equal(dossier.environment.preflightObservedAtUtc, PREFLIGHT_AT);
  assert.equal(dossier.environment.finalizedAtUtc, 'REQUIRED');
  assert.equal(dossier.device.physicalDeviceVerified, true);
  assert.equal(dossier.dp5Status, 'CLOSED_PHYSICAL_EVIDENCE_INCOMPLETE');
  assert.equal(
    dossier.scenarios.governedNativeExecution.currentDeviceAuthorizationDispatchesExactlyOnce.status,
    'NOT_RUN',
  );
});

test('finalize injects exact collector timestamp while preserving operator scenario evidence', () => {
  const dossier = createBoundW15JTabletLoopbackDossier(
    template,
    tuple(),
    preflight(),
    apkIdentity(),
  );
  dossier.scenarios.governedNativeExecution.currentDeviceAuthorizationDispatchesExactlyOnce = {
    status: 'PASS',
    observedAtUtc: OBSERVED_AT,
    evidenceReferences: ['bounded-native-effect.json'],
  };
  const finalized = finalizeBoundW15JTabletLoopbackDossier(
    dossier,
    tuple(),
    preflight(),
    finalize(),
    apkIdentity(),
  );
  assert.equal(finalized.environment.finalizedAtUtc, FINALIZED_AT);
  assert.deepEqual(
    finalized.scenarios.governedNativeExecution.currentDeviceAuthorizationDispatchesExactlyOnce,
    dossier.scenarios.governedNativeExecution.currentDeviceAuthorizationDispatchesExactlyOnce,
  );
  assert.equal(finalized.dp5Status, 'CLOSED_PHYSICAL_EVIDENCE_INCOMPLETE');
});

test('finalize fails closed on operator drift of machine-owned tuple fields', () => {
  const dossier = createBoundW15JTabletLoopbackDossier(
    template,
    tuple(),
    preflight(),
    apkIdentity(),
  );
  dossier.environment.gatewayTransport = 'LOCAL_ADB_REVERSE_ONLY';
  assert.throws(
    () =>
      finalizeBoundW15JTabletLoopbackDossier(
        dossier,
        tuple(),
        preflight(),
        finalize(),
        apkIdentity(),
      ),
    /dossier environment drift/,
  );
});

test('prepare fails closed on transport or Control Tower tuple mismatch', () => {
  const wrongTransport = preflight();
  wrongTransport.transport_scope = 'LOCAL_ADB_REVERSE_ONLY';
  assert.throws(
    () => createBoundW15JTabletLoopbackDossier(template, tuple(), wrongTransport, apkIdentity()),
    /transport_scope drift/,
  );

  const wrongTuple = tuple();
  wrongTuple.androidCandidateSha = 'f'.repeat(40);
  assert.throws(
    () => createBoundW15JTabletLoopbackDossier(template, wrongTuple, preflight(), apkIdentity()),
    /candidate_sha drift/,
  );
});
