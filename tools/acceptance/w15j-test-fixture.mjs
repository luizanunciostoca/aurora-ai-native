import { Buffer } from 'node:buffer';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { REQUIRED_DP5_SCENARIO_PATHS, REQUIRED_THREAT_REVIEW_KEYS } from './w15j-preflight.mjs';
import { REQUIRED_WAKE_SCENARIO_IDS } from './w15j-wake-evidence.mjs';

export const PREFLIGHT_AT = '2026-09-05T17:00:00Z';
export const HOST_READY_AT = '2026-09-05T16:59:00Z';
export const HOST_INSTANCE_ID = `whi_${'9'.repeat(64)}`;
export const WAKE_STARTED_AT = '2026-09-05T17:01:00Z';
export const OBSERVED_AT = '2026-09-05T17:30:00Z';
export const WAKE_FINISHED_AT = '2026-09-05T17:59:00Z';
export const FINALIZED_AT = '2026-09-05T18:00:00Z';
export const TUPLE = Object.freeze({
  androidCandidateSha: 'a'.repeat(40),
  hostCandidateSha: 'b'.repeat(40),
  reconciledMainSha: 'c'.repeat(40),
  packagingHeadSha: 'd'.repeat(40),
  packagingRunId: '34058522663',
  artifactId: '9996740380',
  artifactName: 'aurora-w15j-physical-apk-test',
  apkVariant: 'localDebug',
  applicationId: 'ai.aurora.device.local',
  versionCode: '1',
  versionName: '0.15.0-alpha.1-local',
  serialSha256: 'e'.repeat(64),
});

export const evidence = (status = 'PASS', reference = 'evidence.txt') => ({
  status,
  observedAtUtc: OBSERVED_AT,
  evidenceReferences: [reference],
});

export function controlTowerTuple(zipSha256, apkSha256) {
  const runId = TUPLE.packagingRunId;
  const url = `https://github.com/luizanunciostoca/aurora-ai-native/actions/runs/${runId}`;
  return {
    schemaVersion: 'w15j-control-tower-tuple-v1',
    repository: 'luizanunciostoca/aurora-ai-native',
    workflowRun: {
      id: runId,
      url,
      status: 'SUCCESS',
      headSha: TUPLE.packagingHeadSha,
      headBranch: 'prototype/w15j-physical-apk-artifact',
      eventName: 'push',
      sourceRef: `${url}#exact-head-and-status`,
    },
    androidCandidateSha: TUPLE.androidCandidateSha,
    hostCandidateSha: TUPLE.hostCandidateSha,
    reconciledMainSha: TUPLE.reconciledMainSha,
    packagingHeadSha: TUPLE.packagingHeadSha,
    artifact: {
      id: TUPLE.artifactId,
      name: TUPLE.artifactName,
      zipSha256,
      digestSourceRef: `${url}#artifact-${TUPLE.artifactId}-digest`,
    },
    apk: {
      applicationId: TUPLE.applicationId,
      variant: TUPLE.apkVariant,
      versionCode: TUPLE.versionCode,
      versionName: TUPLE.versionName,
      sha256: apkSha256,
    },
  };
}

export function canonicalWake(zipSha256, apkSha256) {
  return {
    schemaVersion: '1.1.0',
    status: 'READY_FOR_INDEPENDENT_REVIEW',
    authorityInvariant: 'INTELLIGENCE != AUTHORITY != EXECUTION',
    candidate: {
      gitSha: TUPLE.androidCandidateSha,
      hostGitSha: TUPLE.hostCandidateSha,
      hostInstanceId: HOST_INSTANCE_ID,
      mainGitSha: TUPLE.reconciledMainSha,
      packagingGitSha: TUPLE.packagingHeadSha,
      artifactId: TUPLE.artifactId,
      artifactName: TUPLE.artifactName,
      artifactZipSha256: zipSha256,
      apkSha256,
      apkVariant: TUPLE.apkVariant,
      applicationId: TUPLE.applicationId,
      versionCode: TUPLE.versionCode,
      versionName: TUPLE.versionName,
    },
    device: {
      manufacturer: 'Samsung',
      model: 'Tablet',
      product: 'tablet',
      serialSha256: TUPLE.serialSha256,
      buildFingerprint: 'samsung/tablet/build',
      apiLevel: '36',
      physicalDeviceVerified: true,
    },
    runtime: {
      assistantRoleHolder: TUPLE.applicationId,
      recordAudioPermission: 'GRANTED',
      wakeModelVersion: '1',
      sensitivity: 'bounded-default',
      privacyMode: 'OFF',
      foregroundServiceState: 'RUNNING',
      audioRoute: 'built-in',
      batteryOptimizationState: 'EXEMPT_FOR_WINDOW',
    },
    governedProjection: {
      w04RegistryVersion: '1',
      w04SourceRef: 'evidence.txt',
      w04ContentSha256: 'f'.repeat(64),
      w15gVocabularyVersion: '1',
      w15gSourceRef: 'evidence.txt',
      w15gContentSha256: '1'.repeat(64),
      w07IngressReference: 'evidence.txt',
    },
    operator: {
      operatorId: 'operator-1',
      startedAtUtc: WAKE_STARTED_AT,
      finishedAtUtc: WAKE_FINISHED_AT,
      attestationReference: 'operator-attestation.json',
      independentReviewReference: 'reviewer-attestation.json',
    },
    accuracy: {
      deliberateAttempts: 100,
      confirmedWakes: 96,
      rejectedWakes: 4,
      passiveObservationMinutes: 60,
      passiveFalseWakes: 0,
      passiveEvidenceReference: 'wake-passive.txt',
      speakerIds: ['speaker-hash-1', 'speaker-hash-2'],
      distancesMeters: [0.5, 1, 2, 3],
      volumes: ['low', 'normal', 'loud'],
      backgrounds: ['quiet', 'tv', 'music', 'conversation', 'fan', 'air-conditioning'],
    },
    attempts: Array.from({ length: 100 }, (_, index) => ({
      id: `WAKE-ATTEMPT-${String(index + 1).padStart(3, '0')}`,
      speakerId: index % 2 === 0 ? 'speaker-hash-1' : 'speaker-hash-2',
      distanceMeters: [0.5, 1, 2, 3][index % 4],
      volume: ['low', 'normal', 'loud'][index % 3],
      background: ['quiet', 'tv', 'music', 'conversation', 'fan', 'air-conditioning'][index % 6],
      result: index < 96 ? 'CONFIRMED' : 'REJECTED',
      latencyMs: 100 + index,
      observedAtUtc: OBSERVED_AT,
      evidenceReference: 'wake-attempts.txt',
    })),
    scenarios: REQUIRED_WAKE_SCENARIO_IDS.map((id) => ({
      id,
      name: id,
      mandatory: true,
      ...evidence('PASS', `wake-scenario-${id}.txt`),
    })),
    mandatoryObservations: {
      ttsSelfWake: evidence('PASS', 'wake-observation-tts-self-wake.txt'),
      bargeIn: evidence('PASS', 'wake-observation-barge-in.txt'),
      audioRoutes: {
        ...evidence('PASS', 'wake-observation-audio-routes.txt'),
        routes: ['built-in', 'bluetooth'],
      },
      permissionRevocation: evidence('PASS', 'wake-observation-permission-revocation.txt'),
      privacyMode: evidence('PASS', 'wake-observation-privacy-mode.txt'),
      rawPcmPersistence: {
        ...evidence('PASS', 'wake-observation-privacy-storage.txt'),
        persisted: false,
      },
      cpu: evidence('OBSERVED', 'wake-observation-cpu.txt'),
      pss: evidence('OBSERVED', 'wake-observation-pss.txt'),
      battery: evidence('OBSERVED', 'wake-observation-battery.txt'),
      thermal: evidence('OBSERVED', 'wake-observation-thermal.txt'),
    },
    riskGates: Object.fromEntries(
      ['A', 'B', 'C', 'D'].map((key) => [key, evidence('PASS', `wake-risk-gate-${key}.txt`)]),
    ),
    rawEvidence: { directory: '.', sha256Manifest: 'evidence-manifest.sha256' },
  };
}

export function canonicalDossier(preflight) {
  const scenarios = {};
  for (const path of REQUIRED_DP5_SCENARIO_PATHS) {
    const [group, scenario] = path.split('.');
    scenarios[group] ??= {};
    scenarios[group][scenario] = evidence('PASS', `w15j-scenario-${group}-${scenario}.txt`);
  }
  return {
    schemaVersion: '1.2.0',
    wave: 'W15-J',
    authorityInvariant: 'INTELLIGENCE != AUTHORITY != EXECUTION',
    dp4Status: 'OPEN',
    dp4PublicationReference: 'issue:115#issuecomment-5547053471',
    dp5Status: 'CLOSED_PHYSICAL_EVIDENCE_INCOMPLETE',
    candidateSha: TUPLE.androidCandidateSha,
    provenance: {
      repository: preflight.expected.repository,
      workflowRun: { ...preflight.expected.workflowRun },
      androidCandidateSha: TUPLE.androidCandidateSha,
      hostCandidateSha: TUPLE.hostCandidateSha,
      reconciledMainSha: TUPLE.reconciledMainSha,
      packagingHeadSha: TUPLE.packagingHeadSha,
      artifact: {
        id: TUPLE.artifactId,
        name: TUPLE.artifactName,
        zipSha256: preflight.expected.artifact.zipSha256,
        digestSourceRef: preflight.expected.artifact.digestSourceRef,
      },
    },
    apk: { ...preflight.expected.apk },
    device: { ...preflight.expected.device, physicalDeviceVerified: true },
    environment: {
      ...preflight.expected.environment,
      operator: 'operator-1',
      adbReversePort: 8080,
      preflightObservedAtUtc: PREFLIGHT_AT,
      finalizedAtUtc: FINALIZED_AT,
    },
    scenarios,
    threatReview: Object.fromEntries(
      REQUIRED_THREAT_REVIEW_KEYS.map((key) => [key, evidence('PASS', `w15j-threat-${key}.txt`)]),
    ),
    resourceObservations: {
      coldStartup: {
        ...evidence('OBSERVED'),
        evidenceReferences: ['cold-start.txt', 'cold-start.txt.exit-code'],
      },
      warmStartup: {
        ...evidence('OBSERVED'),
        evidenceReferences: ['warm-start.txt', 'warm-start.txt.exit-code'],
      },
      gatewayReconnect: {
        ...evidence('OBSERVED'),
        evidenceReferences: ['gateway-reconnect.txt', 'gateway-reconnect.txt.exit-code'],
      },
      batteryWindow: {
        ...evidence('OBSERVED'),
        evidenceReferences: [
          'battery-before.txt',
          'battery-before.txt.exit-code',
          'battery-after.txt',
          'battery-after.txt.exit-code',
        ],
      },
      cpu: {
        ...evidence('OBSERVED'),
        evidenceReferences: [
          'cpuinfo-after-restart.txt',
          'cpuinfo-after-restart.txt.exit-code',
          'cpuinfo-after.txt',
          'cpuinfo-after.txt.exit-code',
        ],
      },
      memory: {
        ...evidence('OBSERVED'),
        evidenceReferences: [
          'meminfo-after-warm-start.txt',
          'meminfo-after-warm-start.txt.exit-code',
          'meminfo-after.txt',
          'meminfo-after.txt.exit-code',
        ],
      },
      storage: {
        ...evidence('OBSERVED'),
        evidenceReferences: [
          'storage-after-restart.txt',
          'storage-after-restart.txt.exit-code',
          'storage-after.txt',
          'storage-after.txt.exit-code',
        ],
      },
      foregroundService: {
        ...evidence('OBSERVED'),
        evidenceReferences: [
          'services-after-restart.txt',
          'services-after-restart.txt.exit-code',
          'services-after.txt',
          'services-after.txt.exit-code',
        ],
      },
    },
    riskGates: Object.fromEntries(
      [
        'A_AUTHORITY',
        'B_RUNTIME_RECONCILIATION',
        'C_REPLAY_IDEMPOTENCY',
        'D_EVIDENCE_OBSERVABILITY',
      ].map((key) => [key, evidence('PASS', `w15j-risk-gate-${key}.txt`)]),
    ),
    collectorEvidence: { ...preflight.sourceEvidence },
    wakeEvidence: {
      reference: preflight.wakeEvidence.reference,
      sha256: preflight.wakeEvidence.sha256,
      schemaVersion: preflight.wakeEvidence.schemaVersion,
      deliberateAttempts: preflight.wakeEvidence.deliberateAttempts,
      scenarioCount: preflight.wakeEvidence.scenarioCount,
    },
    finalization: {
      mandatoryScenarioMatrixComplete: true,
      resourceObservationsComplete: true,
      riskGatesComplete: true,
      operatorAttestationReference: 'operator-attestation.json',
      independentReviewReference: 'reviewer-attestation.json',
    },
    evidenceReferences: ['evidence.txt'],
    handoffs: { w17Telemetry: [], w19SecurityHardening: [], w20ReleaseRollout: [] },
  };
}

function sha256(bytes) {
  return createHash('sha256').update(bytes).digest('hex');
}

function metadata(values) {
  return `${Object.entries(values)
    .map(([key, value]) => `${key}=${value}`)
    .join('\n')}\n`;
}

export function createFinalizedEvidenceFixture() {
  const directory = mkdtempSync(join(tmpdir(), 'w15j-finalized-'));
  const apkName = 'Aurora-W15J-Physical-localDebug.apk';
  const apkBytes = Buffer.from('physical-apk-fixture');
  const apkSha256 = sha256(apkBytes);
  const buildIdentity = metadata({
    artifact_purpose: 'W15-J-DP5-physical-evidence-input',
    source_candidate_sha: TUPLE.androidCandidateSha,
    source_branch: 'wave/15j-physical-device-integration-acceptance',
    paired_local_host_candidate_sha: TUPLE.hostCandidateSha,
    reconciled_main_parent_sha: TUPLE.reconciledMainSha,
    packaging_head_sha: TUPLE.packagingHeadSha,
    packaging_branch: 'prototype/w15j-physical-apk-artifact',
    packaging_run_id: TUPLE.packagingRunId,
    gateway_environment: 'LOCAL',
    device_gateway_port: '8080',
    bootstrap_port: '8081',
    gateway_transport_scope: 'LOCAL_ADB_REVERSE_ONLY',
    apk_variant: TUPLE.apkVariant,
    package_id: TUPLE.applicationId,
    version_code: TUPLE.versionCode,
    version_name: TUPLE.versionName,
    canonical_acceptance: 'false',
    physical_evidence_required: 'true',
    dp5_status: 'INCOMPLETE',
  });
  writeFileSync(join(directory, apkName), apkBytes);
  writeFileSync(join(directory, 'BUILD_IDENTITY.txt'), buildIdentity);
  writeFileSync(join(directory, 'SHA256SUMS.txt'), `${apkSha256}  ${apkName}\n`);
  execFileSync('zip', ['-q', 'artifact.zip', apkName, 'BUILD_IDENTITY.txt', 'SHA256SUMS.txt'], {
    cwd: directory,
  });
  const zipSha256 = sha256(readFileSync(join(directory, 'artifact.zip')));
  writeFileSync(join(directory, 'candidate.apk'), apkBytes);
  // The original APK is only staging input; finalized evidence uses candidate.apk plus the immutable ZIP.
  rmSync(join(directory, apkName));
  writeFileSync(
    join(directory, 'artifact-metadata.txt'),
    metadata({
      packaging_head_sha: TUPLE.packagingHeadSha,
      packaging_run_id: TUPLE.packagingRunId,
      artifact_id: TUPLE.artifactId,
      artifact_name: TUPLE.artifactName,
      artifact_zip_sha256: zipSha256,
    }),
  );
  const common = {
    candidate_sha: TUPLE.androidCandidateSha,
    host_candidate_sha: TUPLE.hostCandidateSha,
    reconciled_main_sha: TUPLE.reconciledMainSha,
    packaging_head_sha: TUPLE.packagingHeadSha,
    packaging_run_id: TUPLE.packagingRunId,
    artifact_id: TUPLE.artifactId,
    artifact_name: TUPLE.artifactName,
    artifact_zip_sha256: zipSha256,
    apk_variant: TUPLE.apkVariant,
    package_id: TUPLE.applicationId,
  };
  writeFileSync(
    join(directory, 'preflight-metadata.txt'),
    metadata({
      collected_at_utc: PREFLIGHT_AT,
      ...common,
      apk_path_sha256: apkSha256,
      serial_sha256: TUPLE.serialSha256,
      manufacturer: 'Samsung',
      model: 'Tablet',
      product: 'tablet',
      api_level: '36',
      build_fingerprint: 'samsung/tablet/build',
      'ro.kernel.qemu': '0',
      activity_class: 'ai.aurora.device.MainActivity',
      gateway_identity: 'aurora-w15j-local-host',
      gateway_version: `git:${TUPLE.hostCandidateSha}`,
      host_instance_id: HOST_INSTANCE_ID,
      gateway_port: '8080',
      operator: 'operator-1',
    }),
  );
  writeFileSync(
    join(directory, 'finalize-metadata.txt'),
    metadata({
      finalized_at_utc: FINALIZED_AT,
      ...common,
      apk_sha256: apkSha256,
      serial_sha256: TUPLE.serialSha256,
      manufacturer: 'Samsung',
      model: 'Tablet',
      product: 'tablet',
      api_level: '36',
      build_fingerprint: 'samsung/tablet/build',
      gateway_identity: 'aurora-w15j-local-host',
      gateway_version: `git:${TUPLE.hostCandidateSha}`,
      host_instance_id: HOST_INSTANCE_ID,
      gateway_port: '8080',
      operator: 'operator-1',
      adb_reverse_status: 'REMOVED',
      device_gateway_port: '8080',
      bootstrap_port: '8081',
      dual_port_cleanup: 'REMOVED',
    }),
  );
  const apkIdentity = metadata({
    candidate_sha: TUPLE.androidCandidateSha,
    application_id: TUPLE.applicationId,
    variant: TUPLE.apkVariant,
    version_code: TUPLE.versionCode,
    version_name: TUPLE.versionName,
    apk_sha256: apkSha256,
  });
  writeFileSync(join(directory, 'apk-identity.txt'), apkIdentity);
  writeFileSync(join(directory, 'apk-identity-finalize.txt'), apkIdentity);
  writeFileSync(join(directory, 'installed-base-preflight.apk'), apkBytes);
  writeFileSync(join(directory, 'installed-base-finalize.apk'), apkBytes);
  for (const phase of ['preflight', 'finalize']) {
    writeFileSync(join(directory, `installed-base-${phase}-pull.txt`), `pulled ${phase}\n`);
    writeFileSync(join(directory, `installed-base-${phase}-pull.txt.exit-code`), '0\n');
  }
  writeFileSync(join(directory, 'package-path.txt'), 'package:/data/app/aurora/base.apk\n');
  writeFileSync(join(directory, 'package-path.txt.exit-code'), '0\n');
  writeFileSync(
    join(directory, 'package-path-finalize.txt'),
    'package:/data/app/aurora/base.apk\n',
  );
  writeFileSync(join(directory, 'package-path-finalize.txt.exit-code'), '0\n');
  writeFileSync(
    join(directory, 'dual-port-metadata.txt'),
    'device_gateway_port=8080\nbootstrap_port=8081\ntransport_scope=LOCAL_ADB_REVERSE_ONLY\n',
  );
  writeFileSync(
    join(directory, 'adb-reverse-dual-port-preflight.txt'),
    'UsbFfs tcp:8080 tcp:8080\nUsbFfs tcp:8081 tcp:8081\n',
  );
  writeFileSync(join(directory, 'adb-reverse-list-after-finalize.txt'), 'no mappings\n');
  writeFileSync(join(directory, 'adb-reverse-dual-port-after-finalize.txt'), 'no mappings\n');
  writeFileSync(join(directory, 'adb-reverse-remove.txt.exit-code'), '0\n');
  writeFileSync(join(directory, 'evidence.txt'), 'physical observation\n');
  writeFileSync(join(directory, 'wake-attempts.txt'), '100 bounded attempt records\n');
  writeFileSync(join(directory, 'wake-passive.txt'), 'bounded passive observation\n');
  for (const [name, role, identity, statement] of [
    ['operator-attestation.json', 'OPERATOR', 'operator-1', 'Physical observations attested.'],
    [
      'reviewer-attestation.json',
      'INDEPENDENT_REVIEWER',
      'reviewer-1',
      'Independent evidence review attested.',
    ],
  ]) {
    writeFileSync(
      join(directory, name),
      `${JSON.stringify(
        {
          schemaVersion: 'w15j-attestation-v1',
          role,
          identity,
          observedAtUtc: FINALIZED_AT,
          androidCandidateSha: TUPLE.androidCandidateSha,
          hostCandidateSha: TUPLE.hostCandidateSha,
          reconciledMainSha: TUPLE.reconciledMainSha,
          packagingHeadSha: TUPLE.packagingHeadSha,
          artifactId: TUPLE.artifactId,
          apkSha256,
          hostInstanceId: HOST_INSTANCE_ID,
          statement,
        },
        null,
        2,
      )}\n`,
    );
  }
  for (const path of REQUIRED_DP5_SCENARIO_PATHS) {
    const [group, scenario] = path.split('.');
    writeFileSync(join(directory, `w15j-scenario-${group}-${scenario}.txt`), `${path}=observed\n`);
  }
  for (const key of REQUIRED_THREAT_REVIEW_KEYS) {
    writeFileSync(join(directory, `w15j-threat-${key}.txt`), `${key}=reviewed\n`);
  }
  for (const key of [
    'A_AUTHORITY',
    'B_RUNTIME_RECONCILIATION',
    'C_REPLAY_IDEMPOTENCY',
    'D_EVIDENCE_OBSERVABILITY',
  ]) {
    writeFileSync(join(directory, `w15j-risk-gate-${key}.txt`), `${key}=observed\n`);
  }
  for (const id of REQUIRED_WAKE_SCENARIO_IDS) {
    writeFileSync(join(directory, `wake-scenario-${id}.txt`), `${id}=observed\n`);
  }
  for (const name of [
    'tts-self-wake',
    'barge-in',
    'audio-routes',
    'permission-revocation',
    'privacy-mode',
    'privacy-storage',
    'cpu',
    'pss',
    'battery',
    'thermal',
  ]) {
    writeFileSync(join(directory, `wake-observation-${name}.txt`), `${name}=observed\n`);
  }
  for (const key of ['A', 'B', 'C', 'D']) {
    writeFileSync(join(directory, `wake-risk-gate-${key}.txt`), `${key}=observed\n`);
  }
  writeFileSync(
    join(directory, 'host-ready-announcement.txt'),
    metadata({
      host_candidate_sha: TUPLE.hostCandidateSha,
      gateway_identity: 'aurora-w15j-local-host',
      gateway_version: `git:${TUPLE.hostCandidateSha}`,
      device_gateway_port: '8080',
      bootstrap_port: '8081',
      physical_evidence_status: 'NOT_RUN',
      started_at_utc: HOST_READY_AT,
      process_id: '4242',
      host_instance_id: HOST_INSTANCE_ID,
    }),
  );
  for (const [name, probe, port, path, httpStatus, resultCode, listenerRole] of [
    [
      'host-listener-8080.txt',
      'HTTP_LISTENER_INSTANCE_RESPONSE',
      8080,
      '/v1/local-host/instance',
      200,
      'LOCAL_HOST_INSTANCE',
      'DEVICE_GATEWAY',
    ],
    [
      'host-listener-8081.txt',
      'HTTP_LISTENER_INSTANCE_RESPONSE',
      8081,
      '/v1/local-host/instance',
      200,
      'LOCAL_HOST_INSTANCE',
      'BOOTSTRAP_EXCHANGE',
    ],
    [
      'host-health-8080.txt',
      'HTTP_ROUTE_HEALTH_RESPONSE',
      8080,
      '/v1/gateway/sessions/open',
      405,
      'METHOD_NOT_ALLOWED',
      undefined,
    ],
    [
      'host-health-8081.txt',
      'HTTP_ROUTE_HEALTH_RESPONSE',
      8081,
      '/v1/gateway/bootstrap/exchange',
      405,
      'METHOD_NOT_ALLOWED',
      undefined,
    ],
  ]) {
    const record = {
      probe,
      observed_at_utc: HOST_READY_AT,
      process_id: '4242',
      host: '127.0.0.1',
      port,
      method: 'GET',
      path,
      http_status: httpStatus,
      ...(listenerRole
        ? {
            server_result_code: resultCode,
            host_instance_id: HOST_INSTANCE_ID,
            listener_role: listenerRole,
            cache_control: 'no-store',
            pragma: 'no-cache',
          }
        : { server_error_code: resultCode }),
      response_bytes: '42',
      authorizes_execution: 'false',
      physical_evidence_status: 'NOT_RUN',
    };
    writeFileSync(join(directory, name), metadata(record));
    writeFileSync(join(directory, `${name}.exit-code`), '0\n');
  }
  for (const [phase, observedAt] of [
    ['preflight', PREFLIGHT_AT],
    ['finalize', FINALIZED_AT],
  ]) {
    for (const [port, listenerRole] of [
      [8080, 'DEVICE_GATEWAY'],
      [8081, 'BOOTSTRAP_EXCHANGE'],
    ]) {
      const name = `collector-probe-${phase}-${port}.txt`;
      writeFileSync(
        join(directory, name),
        metadata({
          probe: 'COLLECTOR_HTTP_LISTENER_INSTANCE_RESPONSE',
          phase,
          observed_at_utc: observedAt,
          host: '127.0.0.1',
          port,
          method: 'GET',
          path: '/v1/local-host/instance',
          http_status: '200',
          server_result_code: 'LOCAL_HOST_INSTANCE',
          host_instance_id: HOST_INSTANCE_ID,
          listener_role: listenerRole,
          response_bytes: '42',
          cache_control: 'no-store',
          pragma: 'no-cache',
          authorizes_execution: 'false',
          proves_execution_success: 'false',
          retry_authorized: 'false',
          physical_evidence_status: 'NOT_RUN',
        }),
      );
      writeFileSync(join(directory, `${name}.exit-code`), '0\n');
    }
  }
  for (const name of [
    'cold-start.txt',
    'warm-start.txt',
    'battery-before.txt',
    'battery-after.txt',
    'meminfo-before.txt',
    'meminfo-after-warm-start.txt',
    'meminfo-after-restart.txt',
    'meminfo-after.txt',
    'cpuinfo-before.txt',
    'cpuinfo-after-restart.txt',
    'cpuinfo-after.txt',
    'storage-before.txt',
    'storage-after-restart.txt',
    'storage-after.txt',
    'services-before.txt',
    'services-after-restart.txt',
    'services-after.txt',
    'gateway-reconnect.txt',
  ]) {
    writeFileSync(join(directory, name), `${name}=observed\n`);
    writeFileSync(join(directory, `${name}.exit-code`), '0\n');
  }
  writeFileSync(
    join(directory, 'wake-evidence.json'),
    `${JSON.stringify(canonicalWake(zipSha256, apkSha256), null, 2)}\n`,
  );
  writeFileSync(
    join(directory, 'evidence-manifest.sha256'),
    readdirSync(directory)
      .filter((name) => name !== 'evidence-manifest.sha256' && name !== 'reviewer-attestation.json')
      .sort()
      .map((name) => `${sha256(readFileSync(join(directory, name)))}  ${name}`)
      .join('\n') + '\n',
  );
  const reviewerPath = join(directory, 'reviewer-attestation.json');
  const reviewer = JSON.parse(readFileSync(reviewerPath, 'utf8'));
  reviewer.evidenceManifestSha256 = sha256(
    readFileSync(join(directory, 'evidence-manifest.sha256')),
  );
  writeFileSync(reviewerPath, `${JSON.stringify(reviewer, null, 2)}\n`);
  return { directory, apkSha256, zipSha256, controlTower: controlTowerTuple(zipSha256, apkSha256) };
}

export function rewriteManifest(directory) {
  writeFileSync(
    join(directory, 'evidence-manifest.sha256'),
    readdirSync(directory)
      .filter((name) => name !== 'evidence-manifest.sha256' && name !== 'reviewer-attestation.json')
      .sort()
      .map((name) => `${sha256(readFileSync(join(directory, name)))}  ${name}`)
      .join('\n') + '\n',
  );
  const reviewerPath = join(directory, 'reviewer-attestation.json');
  if (readdirSync(directory).includes('reviewer-attestation.json')) {
    const reviewer = JSON.parse(readFileSync(reviewerPath, 'utf8'));
    reviewer.evidenceManifestSha256 = sha256(
      readFileSync(join(directory, 'evidence-manifest.sha256')),
    );
    writeFileSync(reviewerPath, `${JSON.stringify(reviewer, null, 2)}\n`);
  }
}
