import {
  lstatSync,
  readFileSync,
  renameSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { dirname, join } from 'node:path';

const SHA256 = /^[a-f0-9]{64}$/u;
const GIT_SHA = /^[a-f0-9]{40}$/u;
const HOST_INSTANCE = /^whi_[a-f0-9]{64}$/u;
const ISO_UTC = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/u;
const CANONICAL_REPOSITORY = 'luizanunciostoca/aurora-ai-native';
const TRANSPORT = 'LOCAL_TABLET_LOOPBACK';
const CONTROL_PLANE = 'SELF_ADB_WIRELESS_DEBUGGING';

function requiredString(value, label) {
  if (typeof value !== 'string' || value.trim() === '' || value === 'REQUIRED') {
    throw new Error(`${label} is required`);
  }
  return value;
}

function exact(value, pattern, label) {
  const normalized = requiredString(value, label).toLowerCase();
  if (!pattern.test(normalized)) throw new Error(`${label} has invalid format`);
  return normalized;
}

function canonicalUtc(value, label) {
  const text = requiredString(value, label);
  if (!ISO_UTC.test(text)) throw new Error(`${label} must be canonical UTC`);
  const time = Date.parse(text);
  if (!Number.isFinite(time)) throw new Error(`${label} is not a real UTC instant`);
  const normalizedInput = text.replace(/\.000Z$/u, 'Z');
  const normalizedDate = new Date(time).toISOString().replace(/\.000Z$/u, 'Z');
  if (normalizedInput !== normalizedDate) throw new Error(`${label} is not a real UTC instant`);
  return text;
}

function exactKeys(value, keys, label) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error(`${label} must be an object`);
  }
  if (Object.keys(value).sort().join(',') !== keys.slice().sort().join(',')) {
    throw new Error(`${label} must contain exactly the canonical keys`);
  }
}

function parseKvText(text, label) {
  const result = Object.create(null);
  for (const line of text.split(/\r?\n/u)) {
    if (line === '') continue;
    const separator = line.indexOf('=');
    if (separator <= 0) throw new Error(`invalid metadata line in ${label}`);
    const key = line.slice(0, separator);
    const value = line.slice(separator + 1);
    if (!/^[A-Za-z0-9._-]+$/u.test(key)) throw new Error(`unsafe metadata key in ${label}`);
    if (Object.hasOwn(result, key)) throw new Error(`duplicate metadata key ${key} in ${label}`);
    result[key] = value;
  }
  return result;
}

function required(record, key, label) {
  return requiredString(record?.[key], `${label}.${key}`);
}

function validateControlTowerTuple(input) {
  exactKeys(
    input,
    [
      'schemaVersion',
      'repository',
      'workflowRun',
      'androidCandidateSha',
      'hostCandidateSha',
      'reconciledMainSha',
      'packagingHeadSha',
      'artifact',
      'apk',
    ],
    'Control Tower tuple',
  );
  exactKeys(
    input.workflowRun,
    ['id', 'url', 'status', 'headSha', 'headBranch', 'eventName', 'sourceRef'],
    'Control Tower workflowRun',
  );
  exactKeys(
    input.artifact,
    ['id', 'name', 'zipSha256', 'digestSourceRef'],
    'Control Tower artifact',
  );
  exactKeys(
    input.apk,
    ['applicationId', 'variant', 'versionCode', 'versionName', 'sha256'],
    'Control Tower apk',
  );
  if (input.schemaVersion !== 'w15j-control-tower-tuple-v1') {
    throw new Error('Control Tower schema invalid');
  }
  if (input.repository !== CANONICAL_REPOSITORY) throw new Error('Control Tower repository invalid');
  if (input.workflowRun.status !== 'SUCCESS') throw new Error('packaging workflow must be SUCCESS');
  if (input.workflowRun.headBranch !== 'prototype/w15j-physical-apk-artifact') {
    throw new Error('packaging branch invalid');
  }
  if (input.workflowRun.eventName !== 'push') throw new Error('packaging event must be push');
  const tuple = {
    repository: input.repository,
    workflowRun: { ...input.workflowRun },
    androidCandidateSha: exact(input.androidCandidateSha, GIT_SHA, 'Android candidate SHA'),
    hostCandidateSha: exact(input.hostCandidateSha, GIT_SHA, 'host candidate SHA'),
    reconciledMainSha: exact(input.reconciledMainSha, GIT_SHA, 'main SHA'),
    packagingHeadSha: exact(input.packagingHeadSha, GIT_SHA, 'packaging SHA'),
    artifact: {
      ...input.artifact,
      zipSha256: exact(input.artifact.zipSha256, SHA256, 'artifact ZIP SHA'),
    },
    apk: { ...input.apk, sha256: exact(input.apk.sha256, SHA256, 'APK SHA') },
  };
  if (exact(input.workflowRun.headSha, GIT_SHA, 'workflow head SHA') !== tuple.packagingHeadSha) {
    throw new Error('workflow head differs from packaging SHA');
  }
  return tuple;
}

function assertMetadataBinding(metadata, tuple, label) {
  const expected = {
    candidate_sha: tuple.androidCandidateSha,
    host_candidate_sha: tuple.hostCandidateSha,
    reconciled_main_sha: tuple.reconciledMainSha,
    packaging_head_sha: tuple.packagingHeadSha,
    packaging_run_id: String(tuple.workflowRun.id),
    artifact_id: String(tuple.artifact.id),
    artifact_name: tuple.artifact.name,
    artifact_zip_sha256: tuple.artifact.zipSha256,
    apk_variant: tuple.apk.variant,
    package_id: tuple.apk.applicationId,
    gateway_identity: 'aurora-w15j-local-host',
    gateway_version: `git:${tuple.hostCandidateSha}`,
    host_instance_id: required(metadata, 'host_instance_id', label),
    transport_scope: TRANSPORT,
    control_plane: CONTROL_PLANE,
  };
  for (const [key, expectedValue] of Object.entries(expected)) {
    if (required(metadata, key, label) !== expectedValue) {
      throw new Error(`${label}.${key} drift from Control Tower tuple`);
    }
  }
  exact(expected.host_instance_id, HOST_INSTANCE, `${label}.host_instance_id`);
}

function assertApkIdentity(apkIdentity, tuple) {
  const expected = {
    candidate_sha: tuple.androidCandidateSha,
    application_id: tuple.apk.applicationId,
    variant: tuple.apk.variant,
    version_code: String(tuple.apk.versionCode),
    version_name: tuple.apk.versionName,
    apk_sha256: tuple.apk.sha256,
  };
  for (const [key, value] of Object.entries(expected)) {
    if (required(apkIdentity, key, 'apk identity') !== value) {
      throw new Error(`apk identity.${key} drift from Control Tower tuple`);
    }
  }
}

function boundMachineFields(tuple, preflight, apkIdentity) {
  assertMetadataBinding(preflight, tuple, 'preflight');
  assertApkIdentity(apkIdentity, tuple);
  if (required(preflight, 'apk_path_sha256', 'preflight') !== tuple.apk.sha256) {
    throw new Error('preflight APK SHA drift');
  }
  if (required(preflight, 'ro.kernel.qemu', 'preflight') === '1') {
    throw new Error('emulator preflight cannot initialize physical dossier');
  }
  const preflightObservedAtUtc = canonicalUtc(
    required(preflight, 'collected_at_utc', 'preflight'),
    'preflight.collected_at_utc',
  );
  const serialSha256 = exact(required(preflight, 'serial_sha256', 'preflight'), SHA256, 'serial SHA');
  return {
    candidateSha: tuple.androidCandidateSha,
    provenance: {
      repository: tuple.repository,
      workflowRun: {
        id: String(tuple.workflowRun.id),
        url: tuple.workflowRun.url,
        status: tuple.workflowRun.status,
        headSha: tuple.workflowRun.headSha,
        sourceRef: tuple.workflowRun.sourceRef,
      },
      androidCandidateSha: tuple.androidCandidateSha,
      hostCandidateSha: tuple.hostCandidateSha,
      reconciledMainSha: tuple.reconciledMainSha,
      packagingHeadSha: tuple.packagingHeadSha,
      artifact: {
        id: String(tuple.artifact.id),
        name: tuple.artifact.name,
        zipSha256: tuple.artifact.zipSha256,
        digestSourceRef: tuple.artifact.digestSourceRef,
      },
    },
    apk: {
      applicationId: tuple.apk.applicationId,
      variant: tuple.apk.variant,
      versionCode: String(tuple.apk.versionCode),
      versionName: tuple.apk.versionName,
      sha256: tuple.apk.sha256,
    },
    device: {
      serialSha256,
      manufacturer: required(preflight, 'manufacturer', 'preflight'),
      model: required(preflight, 'model', 'preflight'),
      product: required(preflight, 'product', 'preflight'),
      apiLevel: required(preflight, 'api_level', 'preflight'),
      buildFingerprint: required(preflight, 'build_fingerprint', 'preflight'),
      physicalDeviceVerified: true,
    },
    environment: {
      gatewayIdentity: 'aurora-w15j-local-host',
      gatewayVersion: `git:${tuple.hostCandidateSha}`,
      hostInstanceId: required(preflight, 'host_instance_id', 'preflight'),
      gatewayTransport: TRANSPORT,
      adbReversePort: null,
      controlPlane: CONTROL_PLANE,
      operator: required(preflight, 'operator', 'preflight'),
      preflightObservedAtUtc,
      finalizedAtUtc: 'REQUIRED',
    },
  };
}

export function createBoundW15JTabletLoopbackDossier(template, controlTowerInput, preflight, apk) {
  if (template?.schemaVersion !== '1.2.0' || template?.wave !== 'W15-J') {
    throw new Error('canonical W15-J dossier template 1.2.0 is required');
  }
  if (template.authorityInvariant !== 'INTELLIGENCE != AUTHORITY != EXECUTION') {
    throw new Error('authority invariant drift in dossier template');
  }
  if (template.dp5Status !== 'CLOSED_PHYSICAL_EVIDENCE_INCOMPLETE') {
    throw new Error('dossier template must remain physically incomplete');
  }
  const tuple = validateControlTowerTuple(controlTowerInput);
  const machine = boundMachineFields(tuple, preflight, apk);
  return {
    ...structuredClone(template),
    candidateSha: machine.candidateSha,
    provenance: machine.provenance,
    apk: machine.apk,
    device: machine.device,
    environment: machine.environment,
  };
}

function assertSameJson(actual, expected, label) {
  if (JSON.stringify(actual) !== JSON.stringify(expected)) throw new Error(`${label} drift`);
}

export function finalizeBoundW15JTabletLoopbackDossier(
  dossier,
  controlTowerInput,
  preflight,
  finalize,
  apk,
) {
  if (dossier?.schemaVersion !== '1.2.0' || dossier?.wave !== 'W15-J') {
    throw new Error('canonical W15-J dossier 1.2.0 is required');
  }
  if (dossier.authorityInvariant !== 'INTELLIGENCE != AUTHORITY != EXECUTION') {
    throw new Error('authority invariant drift in dossier');
  }
  if (dossier.dp5Status !== 'CLOSED_PHYSICAL_EVIDENCE_INCOMPLETE') {
    throw new Error('dossier must remain physically incomplete before external acceptance');
  }
  const tuple = validateControlTowerTuple(controlTowerInput);
  const machine = boundMachineFields(tuple, preflight, apk);
  assertMetadataBinding(finalize, tuple, 'finalize');
  if (required(finalize, 'apk_sha256', 'finalize') !== tuple.apk.sha256) {
    throw new Error('finalize APK SHA drift');
  }
  if (required(finalize, 'serial_sha256', 'finalize') !== machine.device.serialSha256) {
    throw new Error('finalize device serial drift');
  }
  if (required(finalize, 'adb_reverse_8080_8081', 'finalize') !== 'ABSENT_VERIFIED') {
    throw new Error('finalize must prove adb reverse absence');
  }
  for (const [key, expected] of [
    ['manufacturer', machine.device.manufacturer],
    ['model', machine.device.model],
    ['product', machine.device.product],
    ['api_level', machine.device.apiLevel],
    ['build_fingerprint', machine.device.buildFingerprint],
    ['operator', machine.environment.operator],
  ]) {
    if (required(finalize, key, 'finalize') !== expected) {
      throw new Error(`finalize.${key} drift from physical preflight`);
    }
  }
  const finalizedAtUtc = canonicalUtc(
    required(finalize, 'finalized_at_utc', 'finalize'),
    'finalize.finalized_at_utc',
  );
  if (Date.parse(finalizedAtUtc) < Date.parse(machine.environment.preflightObservedAtUtc)) {
    throw new Error('finalize timestamp precedes preflight');
  }
  assertSameJson(dossier.provenance, machine.provenance, 'dossier provenance');
  assertSameJson(dossier.apk, machine.apk, 'dossier APK');
  assertSameJson(dossier.device, machine.device, 'dossier device');
  assertSameJson(
    { ...dossier.environment, finalizedAtUtc: 'REQUIRED' },
    machine.environment,
    'dossier environment',
  );
  if (dossier.candidateSha !== machine.candidateSha) throw new Error('dossier candidate SHA drift');
  if (
    dossier.environment.finalizedAtUtc !== 'REQUIRED' &&
    !ISO_UTC.test(dossier.environment.finalizedAtUtc)
  ) {
    throw new Error('dossier finalizedAtUtc must be REQUIRED or canonical UTC before finalization');
  }
  return {
    ...structuredClone(dossier),
    environment: { ...dossier.environment, finalizedAtUtc },
  };
}

function loadJson(path, label) {
  try {
    return JSON.parse(readFileSync(path, 'utf8'));
  } catch {
    throw new Error(`${label} must be valid JSON`);
  }
}

function safeExistingRegularFile(path, label) {
  const stat = lstatSync(path);
  if (!stat.isFile() || stat.isSymbolicLink() || stat.nlink !== 1) {
    throw new Error(`${label} must be a regular single-link non-symlink file`);
  }
}

function writeNewJson(path, value) {
  writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`, { flag: 'wx', mode: 0o600 });
}

function replaceJson(path, value) {
  safeExistingRegularFile(path, 'dossier');
  const temporary = join(dirname(path), `.w15j-dossier-${process.pid}.tmp`);
  try {
    writeNewJson(temporary, value);
    renameSync(temporary, path);
  } finally {
    rmSync(temporary, { force: true });
  }
}

function parseKvFile(path, label) {
  return parseKvText(readFileSync(path, 'utf8'), label);
}

if (process.argv[1]?.endsWith('w15j-tablet-loopback-dossier-lifecycle.mjs')) {
  const [mode, dossierPath, tuplePath, preflightPath, apkPath, extraPath] = process.argv.slice(2);
  try {
    if (mode === 'prepare') {
      if (!dossierPath || !tuplePath || !preflightPath || !apkPath || !extraPath) {
        throw new Error(
          'Usage prepare: <dossier-output> <control-tower.json> <preflight-metadata.txt> <apk-identity.txt> <template.json>',
        );
      }
      const value = createBoundW15JTabletLoopbackDossier(
        loadJson(extraPath, 'dossier template'),
        loadJson(tuplePath, 'Control Tower tuple'),
        parseKvFile(preflightPath, 'preflight'),
        parseKvFile(apkPath, 'apk identity'),
      );
      writeNewJson(dossierPath, value);
      console.log('W15J_TABLET_LOOPBACK_DOSSIER_PREPARED_NOT_ACCEPTED');
    } else if (mode === 'finalize') {
      if (!dossierPath || !tuplePath || !preflightPath || !apkPath || !extraPath) {
        throw new Error(
          'Usage finalize: <dossier> <control-tower.json> <preflight-metadata.txt> <apk-identity.txt> <finalize-metadata.txt>',
        );
      }
      const value = finalizeBoundW15JTabletLoopbackDossier(
        loadJson(dossierPath, 'dossier'),
        loadJson(tuplePath, 'Control Tower tuple'),
        parseKvFile(preflightPath, 'preflight'),
        parseKvFile(extraPath, 'finalize'),
        parseKvFile(apkPath, 'apk identity'),
      );
      replaceJson(dossierPath, value);
      console.log('W15J_TABLET_LOOPBACK_DOSSIER_FINALIZED_NOT_ACCEPTED');
    } else {
      throw new Error('mode must be prepare or finalize');
    }
  } catch (error) {
    console.error(`W15J_TABLET_LOOPBACK_DOSSIER_BLOCKED: ${error.message}`);
    process.exitCode = 1;
  }
}
