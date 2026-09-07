import { Buffer } from 'node:buffer';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import {
  closeSync,
  constants,
  fstatSync,
  lstatSync,
  mkdtempSync,
  openSync,
  readFileSync,
  readdirSync,
  realpathSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, dirname, extname, join } from 'node:path';

import { validateW15JWakeEvidence } from './w15j-wake-evidence.mjs';

const SHA256 = /^[a-f0-9]{64}$/u;
const GIT_SHA = /^[a-f0-9]{40}$/u;
const HOST_INSTANCE = /^whi_[a-f0-9]{64}$/u;
const POSITIVE_INTEGER = /^[1-9][0-9]*$/u;
const ISO_UTC = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/u;
const CANONICAL_REPOSITORY = 'luizanunciostoca/aurora-ai-native';
const TRANSPORT = 'LOCAL_TABLET_LOOPBACK';
const CONTROL_PLANE = 'SELF_ADB_WIRELESS_DEBUGGING';
const MAX_MANIFEST_BYTES = 4 * 1024 * 1024;
const FILE_LIMITS = Object.freeze({
  '.txt': 8 * 1024 * 1024,
  '.json': 8 * 1024 * 1024,
  '.csv': 8 * 1024 * 1024,
  '.sha256': 8 * 1024 * 1024,
  '.png': 25 * 1024 * 1024,
  '.jpg': 25 * 1024 * 1024,
  '.jpeg': 25 * 1024 * 1024,
  '.apk': 512 * 1024 * 1024,
  '.zip': 512 * 1024 * 1024,
});
const RAW_AUDIO_NAME =
  /(?:^|[-_.])(?:raw[-_.]?(?:pcm|audio|voice)|pcm|(?:microphone|mic|audio|voice)[-_.]?(?:capture|recording|raw))(?:$|[-_.])/u;
const HOST_CAPTURES = Object.freeze([
  'host-listener-8080.txt',
  'host-listener-8081.txt',
  'host-health-8080.txt',
  'host-health-8081.txt',
]);
const COLLECTOR_PROBES = Object.freeze(
  ['preflight', 'finalize'].flatMap((phase) =>
    [8080, 8081].map((port) => `collector-probe-${phase}-${port}.txt`),
  ),
);
const RESOURCE_CAPTURES = Object.freeze([
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
]);
const REQUIRED_FILES = Object.freeze([
  'preflight-metadata.txt',
  'finalize-metadata.txt',
  'transport-metadata.txt',
  'artifact-metadata.txt',
  'artifact.zip',
  'candidate.apk',
  'BUILD_IDENTITY.txt',
  'SHA256SUMS.txt',
  'apk-identity.txt',
  'apk-identity-finalize.txt',
  'installed-base-preflight.apk',
  'installed-base-finalize.apk',
  'installed-base-preflight-pull.txt',
  'installed-base-preflight-pull.txt.exit-code',
  'installed-base-finalize-pull.txt',
  'installed-base-finalize-pull.txt.exit-code',
  'package-path.txt',
  'package-path.txt.exit-code',
  'package-path-finalize.txt',
  'package-path-finalize.txt.exit-code',
  'adb-control-preflight.txt',
  'adb-control-preflight.txt.exit-code',
  'adb-control-finalize.txt',
  'adb-control-finalize.txt.exit-code',
  'adb-reverse-list-preflight.txt',
  'adb-reverse-list-preflight.txt.exit-code',
  'adb-reverse-list-before-finalize.txt',
  'adb-reverse-list-before-finalize.txt.exit-code',
  'adb-reverse-list-after-finalize.txt',
  'adb-reverse-list-after-finalize.txt.exit-code',
  'host-ready-announcement.txt',
  'operator-attestation.json',
  'wake-evidence.json',
  ...HOST_CAPTURES.flatMap((name) => [name, `${name}.exit-code`]),
  ...COLLECTOR_PROBES.flatMap((name) => [name, `${name}.exit-code`]),
  ...RESOURCE_CAPTURES.flatMap((name) => [name, `${name}.exit-code`]),
]);

function digest(bytes) {
  return createHash('sha256').update(bytes).digest('hex');
}

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

function exactKeys(value, keys, label) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error(`${label} must be an object`);
  }
  if (Object.keys(value).sort().join(',') !== keys.slice().sort().join(',')) {
    throw new Error(`${label} must contain exactly the canonical keys`);
  }
}

function semanticUtc(value, label) {
  const text = requiredString(value, label);
  if (!ISO_UTC.test(text)) throw new Error(`${label} must be a canonical UTC timestamp`);
  const timestamp = Date.parse(text);
  if (!Number.isFinite(timestamp)) throw new Error(`${label} is not a real UTC instant`);
  const normalizedInput = text.replace(/\.000Z$/u, 'Z');
  const normalizedDate = new Date(timestamp).toISOString().replace(/\.000Z$/u, 'Z');
  if (normalizedInput !== normalizedDate) throw new Error(`${label} is not a real UTC instant`);
  return timestamp;
}

function parseKv(bytes, label) {
  const result = Object.create(null);
  for (const line of bytes.toString('utf8').split(/\r?\n/u)) {
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

function sameFileState(left, right) {
  return ['dev', 'ino', 'size', 'mtimeNs', 'ctimeNs'].every(
    (field) => left[field] === right[field],
  );
}

function evidenceLimit(name) {
  const lower = name.toLowerCase();
  if (RAW_AUDIO_NAME.test(lower)) throw new Error(`raw audio evidence is prohibited: ${name}`);
  if (lower.endsWith('.exit-code')) return 1024;
  const limit = FILE_LIMITS[extname(lower)];
  if (!limit) throw new Error(`evidence type is not allowlisted: ${name}`);
  return limit;
}

function safeName(name) {
  if (!name || name !== basename(name) || name === '.' || name === '..') {
    throw new Error(`unsafe evidence name ${name || '<empty>'}`);
  }
  return name;
}

function secureRead(rootReal, path, label, maxBytes) {
  const entry = lstatSync(path, { bigint: true });
  if (!entry.isFile() || entry.isSymbolicLink() || entry.nlink !== 1n) {
    throw new Error(`${label} must be a regular, single-link, non-symlink file`);
  }
  if (dirname(realpathSync(path)) !== rootReal) throw new Error(`${label} escapes evidence root`);
  let fd;
  try {
    fd = openSync(path, constants.O_RDONLY | constants.O_NOFOLLOW);
    const before = fstatSync(fd, { bigint: true });
    if (!before.isFile() || before.nlink !== 1n || before.size > BigInt(maxBytes)) {
      throw new Error(`${label} violates immutable snapshot bounds`);
    }
    const bytes = readFileSync(fd);
    const after = fstatSync(fd, { bigint: true });
    if (!sameFileState(before, after) || BigInt(bytes.length) !== before.size) {
      throw new Error(`${label} changed while read`);
    }
    return { bytes, state: before };
  } finally {
    if (fd !== undefined) closeSync(fd);
  }
}

function snapshotEvidence(directory) {
  const rootEntry = lstatSync(directory);
  if (!rootEntry.isDirectory() || rootEntry.isSymbolicLink()) {
    throw new Error('evidence directory must be a real non-symlink directory');
  }
  const rootReal = realpathSync(directory);
  const manifestName = 'evidence-manifest.sha256';
  const reviewerName = 'reviewer-attestation.json';
  const manifest = secureRead(
    rootReal,
    join(directory, manifestName),
    manifestName,
    MAX_MANIFEST_BYTES,
  );
  const files = Object.create(null);
  const bytes = Object.create(null);
  const states = Object.create(null);
  for (const line of manifest.bytes.toString('utf8').split(/\r?\n/u)) {
    if (line === '') continue;
    const match = /^([a-f0-9]{64}) {2}(.+)$/u.exec(line);
    if (!match) throw new Error('invalid final evidence manifest line');
    const name = safeName(match[2]);
    if (name === manifestName || name === reviewerName || Object.hasOwn(files, name)) {
      throw new Error(`invalid/duplicate manifest entry ${name}`);
    }
    const file = secureRead(rootReal, join(directory, name), name, evidenceLimit(name));
    const actual = digest(file.bytes);
    if (actual !== match[1]) throw new Error(`manifest digest mismatch for ${name}`);
    files[name] = Object.freeze({ sha256: actual, sizeBytes: file.bytes.length });
    bytes[name] = file.bytes;
    states[name] = file.state;
  }
  const actualNames = readdirSync(directory)
    .filter((name) => name !== manifestName && name !== reviewerName)
    .sort();
  if (JSON.stringify(actualNames) !== JSON.stringify(Object.keys(files).sort())) {
    throw new Error('manifest must cover every finalized top-level evidence file exactly once');
  }
  for (const name of REQUIRED_FILES) {
    if (!Object.hasOwn(files, name)) throw new Error(`final evidence is missing ${name}`);
  }
  const reviewer = secureRead(
    rootReal,
    join(directory, reviewerName),
    reviewerName,
    FILE_LIMITS['.json'],
  );
  bytes[reviewerName] = reviewer.bytes;
  states[reviewerName] = reviewer.state;
  states[manifestName] = manifest.state;
  return Object.freeze({
    directory,
    rootReal,
    bytes: Object.freeze(bytes),
    states: Object.freeze(states),
    manifest: Object.freeze({
      fileName: manifestName,
      sha256: digest(manifest.bytes),
      files: Object.freeze(files),
    }),
  });
}

function assertSnapshotCurrent(snapshot) {
  const names = readdirSync(snapshot.directory).sort();
  const expected = Object.keys(snapshot.states).sort();
  if (JSON.stringify(names) !== JSON.stringify(expected)) {
    throw new Error('evidence inventory changed after immutable snapshot');
  }
  for (const name of expected) {
    const current = lstatSync(join(snapshot.directory, name), { bigint: true });
    if (!current.isFile() || current.isSymbolicLink() || current.nlink !== 1n) {
      throw new Error(`${name} changed type/link state after snapshot`);
    }
    if (!sameFileState(current, snapshot.states[name])) {
      throw new Error(`${name} changed after immutable snapshot`);
    }
  }
}

function text(snapshot, name) {
  return snapshot.bytes[name].toString('utf8');
}

function kv(snapshot, name) {
  return parseKv(snapshot.bytes[name], name);
}

function assertExitZero(snapshot, name) {
  if (snapshot.manifest.files[name]?.sizeBytes <= 0) throw new Error(`${name} is empty`);
  if (text(snapshot, `${name}.exit-code`).trim() !== '0') {
    throw new Error(`${name} did not complete successfully`);
  }
}

function assertNoReverse(textValue, label) {
  for (const port of [8080, 8081]) {
    const pattern = new RegExp(`tcp:${port}\\s+tcp:[0-9]+|tcp:[0-9]+\\s+tcp:${port}`, 'u');
    if (pattern.test(textValue))
      throw new Error(`${label} contains forbidden adb reverse port ${port}`);
  }
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
    'Control Tower APK',
  );
  if (input.schemaVersion !== 'w15j-control-tower-tuple-v1')
    throw new Error('Control Tower schema invalid');
  if (input.repository !== CANONICAL_REPOSITORY)
    throw new Error('Control Tower repository invalid');
  if (input.workflowRun.status !== 'SUCCESS') throw new Error('packaging workflow must be SUCCESS');
  if (input.workflowRun.headBranch !== 'prototype/w15j-physical-apk-artifact') {
    throw new Error('packaging workflow branch is not canonical');
  }
  if (input.workflowRun.eventName !== 'push')
    throw new Error('packaging workflow event must be push');
  const runId = exact(input.workflowRun.id, POSITIVE_INTEGER, 'workflow run id');
  const runUrl = `https://github.com/${CANONICAL_REPOSITORY}/actions/runs/${runId}`;
  if (input.workflowRun.url !== runUrl || !input.workflowRun.sourceRef.startsWith(`${runUrl}#`)) {
    throw new Error('workflow URL/sourceRef is not bound to exact run');
  }
  const packagingHeadSha = exact(input.packagingHeadSha, GIT_SHA, 'packaging head SHA');
  if (exact(input.workflowRun.headSha, GIT_SHA, 'workflow head SHA') !== packagingHeadSha) {
    throw new Error('workflow head does not equal packaging head');
  }
  const artifactId = exact(input.artifact.id, POSITIVE_INTEGER, 'artifact id');
  if (!input.artifact.digestSourceRef.startsWith(`${runUrl}#artifact-${artifactId}`)) {
    throw new Error('artifact digest source does not bind exact run/artifact');
  }
  return Object.freeze({
    repository: input.repository,
    workflowRun: Object.freeze({ ...input.workflowRun, id: runId }),
    androidCandidateSha: exact(input.androidCandidateSha, GIT_SHA, 'Android SHA'),
    hostCandidateSha: exact(input.hostCandidateSha, GIT_SHA, 'host SHA'),
    reconciledMainSha: exact(input.reconciledMainSha, GIT_SHA, 'main SHA'),
    packagingHeadSha,
    artifact: Object.freeze({
      id: artifactId,
      name: requiredString(input.artifact.name, 'artifact name'),
      zipSha256: exact(input.artifact.zipSha256, SHA256, 'artifact ZIP SHA'),
      digestSourceRef: input.artifact.digestSourceRef,
    }),
    apk: Object.freeze({
      applicationId: requiredString(input.apk.applicationId, 'APK applicationId'),
      variant: requiredString(input.apk.variant, 'APK variant'),
      versionCode: requiredString(input.apk.versionCode, 'APK versionCode'),
      versionName: requiredString(input.apk.versionName, 'APK versionName'),
      sha256: exact(input.apk.sha256, SHA256, 'APK SHA'),
    }),
  });
}

function validateArtifact(snapshot, controlTower) {
  const artifact = kv(snapshot, 'artifact-metadata.txt');
  exactKeys(
    artifact,
    [
      'packaging_head_sha',
      'packaging_run_id',
      'artifact_id',
      'artifact_name',
      'artifact_zip_sha256',
    ],
    'artifact metadata',
  );
  const build = kv(snapshot, 'BUILD_IDENTITY.txt');
  exactKeys(
    build,
    [
      'artifact_purpose',
      'source_candidate_sha',
      'source_branch',
      'paired_local_host_candidate_sha',
      'reconciled_main_parent_sha',
      'packaging_head_sha',
      'packaging_branch',
      'packaging_run_id',
      'gateway_environment',
      'device_gateway_port',
      'bootstrap_port',
      'gateway_transport_scope',
      'apk_variant',
      'package_id',
      'version_code',
      'version_name',
      'canonical_acceptance',
      'physical_evidence_required',
      'dp5_status',
    ],
    'BUILD_IDENTITY',
  );
  const bindings = [
    ['artifact_purpose', 'W15-J-DP5-physical-evidence-input'],
    ['source_branch', 'wave/15j-physical-device-integration-acceptance'],
    ['packaging_branch', 'prototype/w15j-physical-apk-artifact'],
    ['gateway_environment', 'LOCAL'],
    ['device_gateway_port', '8080'],
    ['bootstrap_port', '8081'],
    ['gateway_transport_scope', TRANSPORT],
    ['canonical_acceptance', 'false'],
    ['physical_evidence_required', 'true'],
    ['dp5_status', 'INCOMPLETE'],
  ];
  for (const [key, expected] of bindings) {
    if (required(build, key, 'BUILD_IDENTITY') !== expected) {
      throw new Error(`BUILD_IDENTITY.${key} is not canonical tablet-loopback provenance`);
    }
  }
  const tuple = {
    androidCandidateSha: exact(build.source_candidate_sha, GIT_SHA, 'Android candidate SHA'),
    hostCandidateSha: exact(build.paired_local_host_candidate_sha, GIT_SHA, 'host candidate SHA'),
    reconciledMainSha: exact(build.reconciled_main_parent_sha, GIT_SHA, 'main SHA'),
    packagingHeadSha: exact(artifact.packaging_head_sha, GIT_SHA, 'artifact packaging head'),
    artifact: {
      id: exact(artifact.artifact_id, POSITIVE_INTEGER, 'artifact id'),
      name: artifact.artifact_name,
      zipSha256: exact(artifact.artifact_zip_sha256, SHA256, 'artifact ZIP SHA'),
    },
    apk: {
      applicationId: build.package_id,
      variant: build.apk_variant,
      versionCode: build.version_code,
      versionName: build.version_name,
    },
  };
  if (build.packaging_head_sha !== tuple.packagingHeadSha)
    throw new Error('embedded packaging head drift');
  if (build.packaging_run_id !== artifact.packaging_run_id)
    throw new Error('embedded packaging run drift');
  if (digest(snapshot.bytes['artifact.zip']) !== tuple.artifact.zipSha256)
    throw new Error('artifact ZIP digest drift');
  if (tuple.packagingHeadSha !== controlTower.packagingHeadSha)
    throw new Error('packaging head differs from Control Tower');
  if (artifact.packaging_run_id !== controlTower.workflowRun.id)
    throw new Error('packaging run differs from Control Tower');
  for (const key of ['androidCandidateSha', 'hostCandidateSha', 'reconciledMainSha']) {
    if (tuple[key] !== controlTower[key]) throw new Error(`${key} differs from Control Tower`);
  }
  for (const key of ['id', 'name', 'zipSha256']) {
    if (tuple.artifact[key] !== controlTower.artifact[key])
      throw new Error(`artifact.${key} differs from Control Tower`);
  }
  for (const key of ['applicationId', 'variant', 'versionCode', 'versionName']) {
    if (tuple.apk[key] !== controlTower.apk[key])
      throw new Error(`apk.${key} differs from Control Tower`);
  }

  const temp = mkdtempSync(join(tmpdir(), 'w15j-tablet-artifact-'));
  try {
    const zipPath = join(temp, 'artifact.zip');
    writeFileSync(zipPath, snapshot.bytes['artifact.zip'], { flag: 'wx', mode: 0o600 });
    const entries = execFileSync('unzip', ['-Z1', zipPath], { encoding: 'utf8' })
      .trim()
      .split(/\r?\n/u)
      .sort();
    const sumMatch = /^([a-f0-9]{64}) {2}([A-Za-z0-9._-]+\.apk)$/u.exec(
      text(snapshot, 'SHA256SUMS.txt').trim(),
    );
    if (!sumMatch) throw new Error('SHA256SUMS.txt must contain exactly one canonical APK entry');
    const expectedEntries = ['BUILD_IDENTITY.txt', 'SHA256SUMS.txt', sumMatch[2]].sort();
    if (JSON.stringify(entries) !== JSON.stringify(expectedEntries)) {
      throw new Error('artifact ZIP inventory is not exact');
    }
    execFileSync('unzip', ['-q', zipPath, '-d', temp]);
    const extractedBuild = readFileSync(join(temp, 'BUILD_IDENTITY.txt'));
    const extractedSums = readFileSync(join(temp, 'SHA256SUMS.txt'));
    const extractedApk = readFileSync(join(temp, sumMatch[2]));
    if (!extractedBuild.equals(snapshot.bytes['BUILD_IDENTITY.txt']))
      throw new Error('BUILD_IDENTITY copy drift');
    if (!extractedSums.equals(snapshot.bytes['SHA256SUMS.txt']))
      throw new Error('SHA256SUMS copy drift');
    if (!extractedApk.equals(snapshot.bytes['candidate.apk']))
      throw new Error('candidate APK differs from artifact ZIP');
    const apkSha = digest(extractedApk);
    if (apkSha !== sumMatch[1] || apkSha !== controlTower.apk.sha256)
      throw new Error('APK SHA drift');
    return Object.freeze({ ...tuple, apk: Object.freeze({ ...tuple.apk, sha256: apkSha }) });
  } finally {
    rmSync(temp, { recursive: true, force: true });
  }
}

function validateAttestation(snapshot, name, role, tuple, window, operator) {
  let value;
  try {
    value = JSON.parse(text(snapshot, name));
  } catch {
    throw new Error(`${name} must be bounded JSON`);
  }
  const keys = [
    'schemaVersion',
    'role',
    'identity',
    'observedAtUtc',
    'androidCandidateSha',
    'hostCandidateSha',
    'reconciledMainSha',
    'packagingHeadSha',
    'artifactId',
    'apkSha256',
    'hostInstanceId',
    'statement',
  ];
  if (role === 'INDEPENDENT_REVIEWER') keys.push('evidenceManifestSha256');
  exactKeys(value, keys, name);
  if (value.schemaVersion !== 'w15j-attestation-v1' || value.role !== role)
    throw new Error(`${name} role/schema invalid`);
  const identity = requiredString(value.identity, `${name}.identity`);
  if (identity !== identity.trim() || identity.length > 256)
    throw new Error(`${name}.identity invalid`);
  if (role === 'OPERATOR' ? identity !== operator : identity === operator) {
    throw new Error(`${name} identity is not correctly operator/reviewer separated`);
  }
  const expectedBindings = {
    androidCandidateSha: tuple.androidCandidateSha,
    hostCandidateSha: tuple.hostCandidateSha,
    reconciledMainSha: tuple.reconciledMainSha,
    packagingHeadSha: tuple.packagingHeadSha,
    artifactId: tuple.artifact.id,
    apkSha256: tuple.apk.sha256,
    hostInstanceId: tuple.hostInstanceId,
  };
  for (const [key, expected] of Object.entries(expectedBindings)) {
    if (value[key] !== expected) throw new Error(`${name}.${key} drift`);
  }
  const observed = semanticUtc(value.observedAtUtc, `${name}.observedAtUtc`);
  if (role === 'OPERATOR') {
    if (observed < window.start || observed > window.finish)
      throw new Error(`${name} outside collector window`);
  } else {
    if (value.evidenceManifestSha256 !== snapshot.manifest.sha256)
      throw new Error(`${name} manifest binding drift`);
    if (observed < window.finish || observed > Date.now())
      throw new Error(`${name} reviewer timestamp invalid`);
  }
  return Object.freeze({
    reference: name,
    identity,
    observedAtUtc: value.observedAtUtc,
    sha256: digest(snapshot.bytes[name]),
  });
}

function validateHostAndTransport(snapshot, tuple) {
  const transport = kv(snapshot, 'transport-metadata.txt');
  exactKeys(
    transport,
    [
      'transport_scope',
      'control_plane',
      'device_gateway_port',
      'bootstrap_port',
      'adb_reverse_8080_8081',
    ],
    'transport metadata',
  );
  if (
    transport.transport_scope !== TRANSPORT ||
    transport.control_plane !== CONTROL_PLANE ||
    transport.device_gateway_port !== '8080' ||
    transport.bootstrap_port !== '8081' ||
    transport.adb_reverse_8080_8081 !== 'ABSENT_REQUIRED'
  ) {
    throw new Error('transport metadata is not canonical tablet loopback');
  }
  for (const file of [
    'adb-reverse-list-preflight.txt',
    'adb-reverse-list-before-finalize.txt',
    'adb-reverse-list-after-finalize.txt',
  ]) {
    assertExitZero(snapshot, file);
    assertNoReverse(text(snapshot, file), file);
  }
  for (const file of ['adb-control-preflight.txt', 'adb-control-finalize.txt']) {
    assertExitZero(snapshot, file);
    if (text(snapshot, file).trim() !== 'device')
      throw new Error(`${file} must prove authorized self-ADB device state`);
  }

  const ready = kv(snapshot, 'host-ready-announcement.txt');
  exactKeys(
    ready,
    [
      'host_candidate_sha',
      'gateway_identity',
      'gateway_version',
      'device_gateway_port',
      'bootstrap_port',
      'physical_evidence_status',
      'started_at_utc',
      'process_id',
      'host_instance_id',
    ],
    'host ready announcement',
  );
  if (ready.host_candidate_sha !== tuple.hostCandidateSha) throw new Error('host ready SHA drift');
  if (ready.gateway_identity !== 'aurora-w15j-local-host')
    throw new Error('host ready identity drift');
  if (ready.gateway_version !== `git:${tuple.hostCandidateSha}`)
    throw new Error('host ready version drift');
  if (ready.device_gateway_port !== '8080' || ready.bootstrap_port !== '8081')
    throw new Error('host ready port drift');
  if (ready.physical_evidence_status !== 'NOT_RUN')
    throw new Error('host ready cannot claim physical PASS');
  if (!HOST_INSTANCE.test(ready.host_instance_id)) throw new Error('host instance id invalid');
  if (!POSITIVE_INTEGER.test(ready.process_id)) throw new Error('host process id invalid');
  semanticUtc(ready.started_at_utc, 'host.started_at_utc');

  for (const capture of HOST_CAPTURES) {
    assertExitZero(snapshot, capture);
    const probe = kv(snapshot, capture);
    if (probe.host !== '127.0.0.1' || !['8080', '8081'].includes(probe.port)) {
      throw new Error(`${capture} host/port drift`);
    }
    if (probe.authorizes_execution !== 'false' || probe.physical_evidence_status !== 'NOT_RUN') {
      throw new Error(`${capture} violates authority/evidence boundary`);
    }
    if (probe.process_id !== ready.process_id || probe.observed_at_utc !== ready.started_at_utc) {
      throw new Error(`${capture} does not bind exact host process/time`);
    }
    if (capture.startsWith('host-listener-')) {
      const role = capture.includes('8080') ? 'DEVICE_GATEWAY' : 'BOOTSTRAP_EXCHANGE';
      if (
        probe.http_status !== '200' ||
        probe.server_result_code !== 'LOCAL_HOST_INSTANCE' ||
        probe.host_instance_id !== ready.host_instance_id ||
        probe.listener_role !== role ||
        probe.cache_control !== 'no-store' ||
        probe.pragma !== 'no-cache'
      ) {
        throw new Error(`${capture} listener identity drift`);
      }
    } else if (probe.http_status !== '405' || probe.server_error_code !== 'METHOD_NOT_ALLOWED') {
      throw new Error(`${capture} health probe drift`);
    }
  }

  const probeTimes = Object.create(null);
  for (const capture of COLLECTOR_PROBES) {
    assertExitZero(snapshot, capture);
    const probe = kv(snapshot, capture);
    const phase = capture.includes('preflight') ? 'preflight' : 'finalize';
    const port = capture.endsWith('8080.txt') ? '8080' : '8081';
    const role = port === '8080' ? 'DEVICE_GATEWAY' : 'BOOTSTRAP_EXCHANGE';
    if (
      probe.probe !== 'COLLECTOR_HTTP_LISTENER_INSTANCE_RESPONSE' ||
      probe.phase !== phase ||
      probe.host !== '127.0.0.1' ||
      probe.port !== port ||
      probe.http_status !== '200' ||
      probe.server_result_code !== 'LOCAL_HOST_INSTANCE' ||
      probe.host_instance_id !== ready.host_instance_id ||
      probe.listener_role !== role ||
      probe.authorizes_execution !== 'false' ||
      probe.proves_execution_success !== 'false' ||
      probe.retry_authorized !== 'false' ||
      probe.physical_evidence_status !== 'NOT_RUN'
    ) {
      throw new Error(`${capture} is not a canonical direct-loopback collector probe`);
    }
    probeTimes[capture] = semanticUtc(probe.observed_at_utc, `${capture}.observed_at_utc`);
  }
  return Object.freeze({ hostInstanceId: ready.host_instance_id, probeTimes });
}

export function buildTrustedW15JTabletLoopbackPreflight(evidenceDirectory, controlTowerInput) {
  const controlTower = validateControlTowerTuple(controlTowerInput);
  const snapshot = snapshotEvidence(evidenceDirectory);
  const tuple = validateArtifact(snapshot, controlTower);

  for (const capture of RESOURCE_CAPTURES) assertExitZero(snapshot, capture);
  for (const phase of ['preflight', 'finalize']) {
    const pathFile = phase === 'preflight' ? 'package-path.txt' : 'package-path-finalize.txt';
    assertExitZero(snapshot, pathFile);
    const lines = text(snapshot, pathFile).replace(/\r/gu, '').trimEnd().split('\n');
    if (lines.length !== 1 || !/^package:\/(?:[^/\n]+\/)*base\.apk$/u.test(lines[0])) {
      throw new Error(`${pathFile} must contain exactly one base.apk path`);
    }
    const pull = `installed-base-${phase}-pull.txt`;
    assertExitZero(snapshot, pull);
    if (snapshot.manifest.files[pull].sizeBytes === 0) throw new Error(`${pull} is empty`);
    const installed = snapshot.manifest.files[`installed-base-${phase}.apk`]?.sha256;
    if (installed !== tuple.apk.sha256) throw new Error(`installed APK SHA drift at ${phase}`);
  }

  const preflight = kv(snapshot, 'preflight-metadata.txt');
  const finalize = kv(snapshot, 'finalize-metadata.txt');
  const apk = kv(snapshot, 'apk-identity.txt');
  const apkFinalize = kv(snapshot, 'apk-identity-finalize.txt');
  const preflightTime = semanticUtc(
    required(preflight, 'collected_at_utc', 'preflight'),
    'preflight time',
  );
  const finalizeTime = semanticUtc(
    required(finalize, 'finalized_at_utc', 'finalize'),
    'finalize time',
  );
  if (preflightTime > finalizeTime) throw new Error('collector window is reversed');

  const tupleBindings = {
    candidate_sha: tuple.androidCandidateSha,
    host_candidate_sha: tuple.hostCandidateSha,
    reconciled_main_sha: tuple.reconciledMainSha,
    packaging_head_sha: tuple.packagingHeadSha,
    packaging_run_id: controlTower.workflowRun.id,
    artifact_id: tuple.artifact.id,
    artifact_name: tuple.artifact.name,
    artifact_zip_sha256: tuple.artifact.zipSha256,
    apk_variant: tuple.apk.variant,
    serial_sha256: required(preflight, 'serial_sha256', 'preflight'),
    manufacturer: required(preflight, 'manufacturer', 'preflight'),
    model: required(preflight, 'model', 'preflight'),
    product: required(preflight, 'product', 'preflight'),
    api_level: required(preflight, 'api_level', 'preflight'),
    build_fingerprint: required(preflight, 'build_fingerprint', 'preflight'),
    package_id: tuple.apk.applicationId,
    gateway_identity: 'aurora-w15j-local-host',
    gateway_version: `git:${tuple.hostCandidateSha}`,
    gateway_port: '8080',
    transport_scope: TRANSPORT,
    control_plane: CONTROL_PLANE,
    operator: required(preflight, 'operator', 'preflight'),
  };
  exact(tupleBindings.serial_sha256, SHA256, 'device serial SHA');
  if (required(preflight, 'ro.kernel.qemu', 'preflight') === '1')
    throw new Error('emulator evidence rejected');
  if (required(preflight, 'apk_path_sha256', 'preflight') !== tuple.apk.sha256)
    throw new Error('preflight APK SHA drift');
  for (const [key, expected] of Object.entries(tupleBindings)) {
    if (required(preflight, key, 'preflight') !== expected)
      throw new Error(`preflight ${key} drift`);
    const finalizeKey = key === 'apk_path_sha256' ? 'apk_sha256' : key;
    if (
      Object.hasOwn(finalize, finalizeKey) &&
      required(finalize, finalizeKey, 'finalize') !== expected
    ) {
      throw new Error(`finalize ${finalizeKey} drift`);
    }
  }
  if (required(finalize, 'apk_sha256', 'finalize') !== tuple.apk.sha256)
    throw new Error('finalize APK SHA drift');
  if (
    required(finalize, 'host_instance_id', 'finalize') !==
    required(preflight, 'host_instance_id', 'preflight')
  ) {
    throw new Error('host instance drift across window');
  }
  if (required(finalize, 'adb_reverse_8080_8081', 'finalize') !== 'ABSENT_VERIFIED') {
    throw new Error('finalize must prove adb reverse absence');
  }
  for (const field of [
    'candidate_sha',
    'application_id',
    'variant',
    'version_code',
    'version_name',
    'apk_sha256',
  ]) {
    if (required(apk, field, 'preflight APK') !== required(apkFinalize, field, 'final APK')) {
      throw new Error(`installed APK identity drift: ${field}`);
    }
  }

  const host = validateHostAndTransport(snapshot, tuple);
  if (required(preflight, 'host_instance_id', 'preflight') !== host.hostInstanceId) {
    throw new Error('preflight host instance does not match direct host');
  }

  const device = Object.freeze({
    serialSha256: tupleBindings.serial_sha256,
    manufacturer: tupleBindings.manufacturer,
    model: tupleBindings.model,
    product: tupleBindings.product,
    apiLevel: tupleBindings.api_level,
    buildFingerprint: tupleBindings.build_fingerprint,
    physicalDeviceVerified: true,
  });
  const environment = Object.freeze({
    gatewayIdentity: 'aurora-w15j-local-host',
    gatewayVersion: `git:${tuple.hostCandidateSha}`,
    hostInstanceId: host.hostInstanceId,
    gatewayTransport: TRANSPORT,
    adbReversePort: null,
    controlPlane: CONTROL_PLANE,
  });
  const operator = tupleBindings.operator;
  const window = { start: preflightTime, finish: finalizeTime };
  const attestationTuple = { ...tuple, hostInstanceId: host.hostInstanceId };
  const attestations = Object.freeze({
    operator: validateAttestation(
      snapshot,
      'operator-attestation.json',
      'OPERATOR',
      attestationTuple,
      window,
      operator,
    ),
    reviewer: validateAttestation(
      snapshot,
      'reviewer-attestation.json',
      'INDEPENDENT_REVIEWER',
      attestationTuple,
      window,
      operator,
    ),
  });

  const expected = Object.freeze({
    ...tuple,
    repository: controlTower.repository,
    workflowRun: controlTower.workflowRun,
    artifact: Object.freeze({
      ...tuple.artifact,
      digestSourceRef: controlTower.artifact.digestSourceRef,
    }),
    device,
    environment,
    operator,
    attestations,
    preflightObservedAtUtc: required(preflight, 'collected_at_utc', 'preflight'),
    finalizedAtUtc: required(finalize, 'finalized_at_utc', 'finalize'),
  });
  const wake = JSON.parse(text(snapshot, 'wake-evidence.json'));
  const wakeResult = validateW15JWakeEvidence(wake, expected, snapshot.manifest.files);
  const wakeStart = semanticUtc(wake.operator.startedAtUtc, 'wake.operator.startedAtUtc');
  const wakeFinish = semanticUtc(wake.operator.finishedAtUtc, 'wake.operator.finishedAtUtc');
  if (!(preflightTime <= wakeStart && wakeStart <= wakeFinish && wakeFinish <= finalizeTime)) {
    throw new Error('wake window is outside tablet collector window');
  }
  for (const [name, observed] of Object.entries(host.probeTimes)) {
    if (name.includes('preflight') ? observed > wakeStart : observed < wakeFinish) {
      throw new Error(`${name} is not fresh relative to wake window`);
    }
  }

  const result = Object.freeze({
    schemaVersion: 'w15j-tablet-loopback-trusted-preflight-v1',
    expected,
    transportBindings: Object.freeze({
      gatewayTransport: TRANSPORT,
      controlPlane: CONTROL_PLANE,
      deviceGatewayPort: 8080,
      bootstrapPort: 8081,
      adbReverse8080And8081: 'ABSENT_THROUGHOUT_WINDOW',
    }),
    evidenceManifest: snapshot.manifest,
    wakeEvidence: Object.freeze({
      reference: 'wake-evidence.json',
      sha256: snapshot.manifest.files['wake-evidence.json'].sha256,
      schemaVersion: wakeResult.schemaVersion,
      deliberateAttempts: wakeResult.deliberateAttempts,
      scenarioCount: wakeResult.scenarioCount,
      lintReadyForIndependentReview: true,
      physicallyAccepted: false,
    }),
    sourceEvidence: Object.freeze({
      rawDirectory: '.',
      preflightMetadata: 'preflight-metadata.txt',
      finalizeMetadata: 'finalize-metadata.txt',
      sha256Manifest: 'evidence-manifest.sha256',
      adbReverseCleanup: 'adb-reverse-list-after-finalize.txt',
    }),
    trustRoot: Object.freeze({
      ...controlTower,
      tupleSha256: digest(Buffer.from(JSON.stringify(controlTower))),
      liveGitHubRevalidation: 'EXTERNAL_REQUIRED_IMMEDIATELY_BEFORE_ACCEPTANCE',
    }),
    physicallyAccepted: false,
  });
  assertSnapshotCurrent(snapshot);
  return result;
}

if (process.argv[1]?.endsWith('w15j-tablet-loopback-trusted-preflight.mjs')) {
  const evidenceDirectory = process.argv[2];
  const controlTowerPath = process.argv[3];
  const outputPath = process.argv[4];
  if (!evidenceDirectory || !controlTowerPath || !outputPath) {
    console.error(
      'Usage: node tools/acceptance/w15j-tablet-loopback-trusted-preflight.mjs <finalized-evidence-directory> <independent-control-tower-tuple.json> <output-json>',
    );
    process.exitCode = 2;
  } else {
    try {
      const value = buildTrustedW15JTabletLoopbackPreflight(
        evidenceDirectory,
        JSON.parse(readFileSync(controlTowerPath, 'utf8')),
      );
      writeFileSync(outputPath, `${JSON.stringify(value, null, 2)}\n`, { flag: 'wx', mode: 0o600 });
      console.log(`W15J_TABLET_LOOPBACK_TRUSTED_PREFLIGHT_WRITTEN ${outputPath}`);
    } catch (error) {
      console.error(`W15J_TABLET_LOOPBACK_TRUSTED_PREFLIGHT_BLOCKED: ${error.message}`);
      process.exitCode = 1;
    }
  }
}
