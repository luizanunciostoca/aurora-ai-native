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

const GIT_SHA = /^[a-f0-9]{40}$/u;
const SHA256 = /^[a-f0-9]{64}$/u;
const ARTIFACT_ID = /^[1-9][0-9]*$/u;
const RUN_ID = /^[1-9][0-9]*$/u;
const CANONICAL_REPOSITORY = 'luizanunciostoca/aurora-ai-native';
const ISO_UTC = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/u;
const MAX_MANIFEST_BYTES = 4 * 1024 * 1024;
const FILE_SIZE_LIMITS = Object.freeze({
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
const HOST_READINESS_CAPTURES = Object.freeze([
  'host-listener-8080.txt',
  'host-listener-8081.txt',
  'host-health-8080.txt',
  'host-health-8081.txt',
]);
const COLLECTOR_PROBE_CAPTURES = Object.freeze(
  ['preflight', 'finalize'].flatMap((phase) =>
    [8080, 8081].map((port) => `collector-probe-${phase}-${port}.txt`),
  ),
);
const REQUIRED_SUCCESS_CAPTURES = Object.freeze([
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
  'apk-identity.txt',
  'apk-identity-finalize.txt',
  'dual-port-metadata.txt',
  'artifact-metadata.txt',
  'artifact.zip',
  'candidate.apk',
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
  'BUILD_IDENTITY.txt',
  'SHA256SUMS.txt',
  'adb-reverse-list-after-finalize.txt',
  'adb-reverse-dual-port-preflight.txt',
  'adb-reverse-dual-port-after-finalize.txt',
  'adb-reverse-remove.txt.exit-code',
  'wake-evidence.json',
  'host-ready-announcement.txt',
  'operator-attestation.json',
  ...HOST_READINESS_CAPTURES.flatMap((name) => [name, `${name}.exit-code`]),
  ...COLLECTOR_PROBE_CAPTURES.flatMap((name) => [name, `${name}.exit-code`]),
  ...REQUIRED_SUCCESS_CAPTURES.flatMap((name) => [name, `${name}.exit-code`]),
]);

function parseKeyValueBytes(bytes, label) {
  const result = Object.create(null);
  for (const rawLine of bytes.toString('utf8').split(/\r?\n/u)) {
    if (rawLine === '') continue;
    const separator = rawLine.indexOf('=');
    if (separator <= 0) throw new Error(`invalid metadata line in ${label}`);
    const key = rawLine.slice(0, separator);
    const value = rawLine.slice(separator + 1);
    if (Object.hasOwn(result, key)) throw new Error(`duplicate metadata key ${key}`);
    result[key] = value;
  }
  return result;
}

function required(record, key, label) {
  const value = record[key];
  if (typeof value !== 'string' || value.trim() === '')
    throw new Error(`${label}.${key} is required`);
  return value;
}

function exact(value, pattern, label) {
  const normalized = value.toLowerCase();
  if (!pattern.test(normalized)) throw new Error(`${label} has invalid format`);
  return normalized;
}

function exactPort(value, expected, label) {
  const port = Number(value);
  if (!Number.isSafeInteger(port) || port !== expected)
    throw new Error(`${label} must be ${expected}`);
  return port;
}

function exactKeys(record, keys, label) {
  if (Object.keys(record).sort().join(',') !== keys.slice().sort().join(',')) {
    throw new Error(`${label} must contain exactly the canonical keys`);
  }
}

function positiveDecimal(value, label, minimum = 1) {
  if (!/^[0-9]+$/u.test(value) || Number(value) < minimum || !Number.isSafeInteger(Number(value))) {
    throw new Error(`${label} must be an integer >= ${minimum}`);
  }
  return Number(value);
}

function semanticUtc(value, label) {
  if (!ISO_UTC.test(value)) throw new Error(`${label} must be an RFC3339 UTC timestamp`);
  const timestamp = Date.parse(value);
  if (!Number.isFinite(timestamp)) throw new Error(`${label} is not a real UTC instant`);
  const normalizedInput = value.replace(/\.0+Z$/u, 'Z');
  const normalizedDate = new Date(timestamp).toISOString().replace(/\.000Z$/u, 'Z');
  if (normalizedInput !== normalizedDate) throw new Error(`${label} is not a real UTC instant`);
  return timestamp;
}

function validateControlTowerTuple(input) {
  if (!input || typeof input !== 'object')
    throw new Error('independent Control Tower tuple is required');
  if (input.schemaVersion !== 'w15j-control-tower-tuple-v1') {
    throw new Error('Control Tower tuple schema w15j-control-tower-tuple-v1 is required');
  }
  if (input.repository !== CANONICAL_REPOSITORY)
    throw new Error('Control Tower repository is not canonical');
  const runId = exact(
    required(input.workflowRun, 'id', 'Control Tower workflowRun'),
    RUN_ID,
    'workflow run id',
  );
  const expectedUrl = `https://github.com/${CANONICAL_REPOSITORY}/actions/runs/${runId}`;
  if (required(input.workflowRun, 'url', 'Control Tower workflowRun') !== expectedUrl) {
    throw new Error('Control Tower workflow run URL does not match repository and run id');
  }
  if (required(input.workflowRun, 'status', 'Control Tower workflowRun') !== 'SUCCESS') {
    throw new Error('Control Tower workflow run status must be SUCCESS');
  }
  const packagingHeadSha = exact(
    required(input, 'packagingHeadSha', 'Control Tower'),
    GIT_SHA,
    'Control Tower packaging SHA',
  );
  const workflowHeadSha = exact(
    required(input.workflowRun, 'headSha', 'Control Tower workflowRun'),
    GIT_SHA,
    'Control Tower workflow head SHA',
  );
  if (workflowHeadSha !== packagingHeadSha) {
    throw new Error('Control Tower workflow head must equal packaging head');
  }
  const sourceRef = required(input.workflowRun, 'sourceRef', 'Control Tower workflowRun');
  if (!sourceRef.startsWith(`${expectedUrl}#`)) {
    throw new Error('Control Tower workflow sourceRef must be anchored to the exact run URL');
  }
  const artifactId = exact(
    required(input.artifact, 'id', 'Control Tower artifact'),
    ARTIFACT_ID,
    'Control Tower artifact id',
  );
  const digestSourceRef = required(input.artifact, 'digestSourceRef', 'Control Tower artifact');
  if (!digestSourceRef.startsWith(`${expectedUrl}#artifact-${artifactId}`)) {
    throw new Error(
      'Control Tower artifact digestSourceRef must bind the exact run and artifact id',
    );
  }
  return {
    repository: input.repository,
    workflowRun: {
      id: runId,
      url: expectedUrl,
      status: 'SUCCESS',
      headSha: workflowHeadSha,
      sourceRef,
    },
    androidCandidateSha: exact(
      required(input, 'androidCandidateSha', 'Control Tower'),
      GIT_SHA,
      'Control Tower Android SHA',
    ),
    hostCandidateSha: exact(
      required(input, 'hostCandidateSha', 'Control Tower'),
      GIT_SHA,
      'Control Tower host SHA',
    ),
    reconciledMainSha: exact(
      required(input, 'reconciledMainSha', 'Control Tower'),
      GIT_SHA,
      'Control Tower main SHA',
    ),
    packagingHeadSha,
    artifact: {
      id: artifactId,
      name: required(input.artifact, 'name', 'Control Tower artifact'),
      zipSha256: exact(
        required(input.artifact, 'zipSha256', 'Control Tower artifact'),
        SHA256,
        'Control Tower artifact ZIP SHA-256',
      ),
      digestSourceRef,
    },
    apk: {
      applicationId: required(input.apk, 'applicationId', 'Control Tower APK'),
      variant: required(input.apk, 'variant', 'Control Tower APK'),
      versionCode: required(input.apk, 'versionCode', 'Control Tower APK'),
      versionName: required(input.apk, 'versionName', 'Control Tower APK'),
      sha256: exact(
        required(input.apk, 'sha256', 'Control Tower APK'),
        SHA256,
        'Control Tower APK SHA-256',
      ),
    },
  };
}

function assertTupleMatches(actual, expected) {
  for (const field of [
    'androidCandidateSha',
    'hostCandidateSha',
    'reconciledMainSha',
    'packagingHeadSha',
  ]) {
    if (actual[field] !== expected[field])
      throw new Error(`${field} does not match independent Control Tower tuple`);
  }
  for (const field of ['id', 'name', 'zipSha256']) {
    if (actual.artifact[field] !== expected.artifact[field])
      throw new Error(`artifact.${field} does not match independent Control Tower tuple`);
  }
  for (const field of ['applicationId', 'variant', 'versionCode', 'versionName', 'sha256']) {
    if (actual.apk[field] !== expected.apk[field])
      throw new Error(`apk.${field} does not match independent Control Tower tuple`);
  }
}

function digestBytes(bytes) {
  return createHash('sha256').update(bytes).digest('hex');
}

function safeManifestPath(value) {
  if (!value || value !== basename(value) || value === '.' || value === '..') {
    throw new Error(`unsafe evidence manifest path ${value || '<empty>'}`);
  }
  return value;
}

function sameFileState(left, right) {
  return ['dev', 'ino', 'size', 'mtimeNs', 'ctimeNs'].every(
    (field) => left[field] === right[field],
  );
}

function secureSnapshotFile(rootReal, path, label, maxBytes) {
  const directoryEntry = lstatSync(path, { bigint: true });
  if (directoryEntry.isSymbolicLink() || !directoryEntry.isFile()) {
    throw new Error(`${label} must be a regular non-symlink file`);
  }
  if (directoryEntry.nlink !== 1n) throw new Error(`${label} must not be a hardlink`);
  const real = realpathSync(path);
  if (dirname(real) !== rootReal) throw new Error(`${label} escapes the evidence directory`);
  let descriptor;
  try {
    descriptor = openSync(path, constants.O_RDONLY | constants.O_NOFOLLOW);
    const before = fstatSync(descriptor, { bigint: true });
    if (!before.isFile()) throw new Error(`${label} must be a regular non-symlink file`);
    if (before.nlink !== 1n) throw new Error(`${label} must not be a hardlink`);
    if (before.size > BigInt(maxBytes)) throw new Error(`${label} exceeds its bounded size limit`);
    const bytes = readFileSync(descriptor);
    const after = fstatSync(descriptor, { bigint: true });
    if (!sameFileState(before, after) || BigInt(bytes.length) !== before.size) {
      throw new Error(`${label} changed while its immutable snapshot was read`);
    }
    return { bytes, state: before };
  } finally {
    if (descriptor !== undefined) closeSync(descriptor);
  }
}

function evidenceSizeLimit(name) {
  const lower = name.toLowerCase();
  if (RAW_AUDIO_NAME.test(lower)) throw new Error(`raw audio evidence is prohibited: ${name}`);
  if (lower.endsWith('.exit-code')) return 1024;
  const extension = extname(lower);
  const limit = FILE_SIZE_LIMITS[extension];
  if (!limit) throw new Error(`evidence file type is not allowlisted: ${name}`);
  return limit;
}

function createEvidenceSnapshot(evidenceDirectory) {
  const manifestName = 'evidence-manifest.sha256';
  const reviewerSidecarName = 'reviewer-attestation.json';
  const rootMetadata = lstatSync(evidenceDirectory);
  if (rootMetadata.isSymbolicLink() || !rootMetadata.isDirectory()) {
    throw new Error('evidence directory must be a real directory, not a symlink');
  }
  const rootReal = realpathSync(evidenceDirectory);
  const manifestPath = join(evidenceDirectory, manifestName);
  const manifestSnapshot = secureSnapshotFile(
    rootReal,
    manifestPath,
    manifestName,
    MAX_MANIFEST_BYTES,
  );
  const manifestBytes = manifestSnapshot.bytes;
  const files = Object.create(null);
  const bytes = Object.create(null);
  const states = Object.create(null);
  for (const line of manifestBytes.toString('utf8').split(/\r?\n/u)) {
    if (line === '') continue;
    const match = /^([a-f0-9]{64}) {2}(.+)$/u.exec(line);
    if (!match) throw new Error('final evidence manifest contains an invalid line');
    const name = safeManifestPath(match[2]);
    if (name === manifestName) throw new Error('final evidence manifest cannot hash itself');
    if (Object.hasOwn(files, name)) throw new Error(`duplicate evidence manifest entry ${name}`);
    const path = join(evidenceDirectory, name);
    const snapshot = secureSnapshotFile(
      rootReal,
      path,
      `manifest entry ${name}`,
      evidenceSizeLimit(name),
    );
    const actual = digestBytes(snapshot.bytes);
    if (actual !== match[1]) throw new Error(`evidence manifest digest mismatch for ${name}`);
    files[name] = Object.freeze({ sha256: actual, sizeBytes: snapshot.bytes.length });
    bytes[name] = snapshot.bytes;
    states[name] = snapshot.state;
  }
  const actualFiles = readdirSync(evidenceDirectory)
    .filter((name) => name !== manifestName && name !== reviewerSidecarName)
    .map((name) => {
      safeManifestPath(name);
      if (!Object.hasOwn(states, name)) {
        throw new Error(`unmanifested top-level evidence entry ${name}`);
      }
      return name;
    })
    .sort();
  const manifestedFiles = Object.keys(files).sort();
  if (JSON.stringify(actualFiles) !== JSON.stringify(manifestedFiles)) {
    throw new Error(
      'final evidence manifest must cover every top-level evidence file exactly once',
    );
  }
  for (const name of REQUIRED_FILES) {
    if (!Object.hasOwn(files, name)) throw new Error(`final evidence manifest is missing ${name}`);
  }
  if (Object.hasOwn(files, reviewerSidecarName)) {
    throw new Error('reviewer attestation must be a post-finalize sidecar, not a manifest entry');
  }
  const reviewerSidecar = secureSnapshotFile(
    rootReal,
    join(evidenceDirectory, reviewerSidecarName),
    reviewerSidecarName,
    FILE_SIZE_LIMITS['.json'],
  );
  bytes[reviewerSidecarName] = reviewerSidecar.bytes;
  states[reviewerSidecarName] = reviewerSidecar.state;
  return {
    evidenceDirectory,
    rootReal,
    bytes: Object.freeze(bytes),
    states: Object.freeze({ ...states, [manifestName]: manifestSnapshot.state }),
    publicManifest: Object.freeze({
      fileName: manifestName,
      sha256: digestBytes(manifestBytes),
      files: Object.freeze(files),
    }),
  };
}

function assertSnapshotStillCurrent(snapshot) {
  const expectedNames = Object.keys(snapshot.states).sort();
  const actualNames = readdirSync(snapshot.evidenceDirectory).sort();
  if (JSON.stringify(actualNames) !== JSON.stringify(expectedNames)) {
    throw new Error('evidence inventory changed after immutable snapshot creation');
  }
  for (const name of expectedNames) {
    const path = join(snapshot.evidenceDirectory, name);
    const metadata = lstatSync(path, { bigint: true });
    if (metadata.isSymbolicLink() || !metadata.isFile() || metadata.nlink !== 1n) {
      throw new Error(`evidence entry ${name} changed file type or link count after snapshot`);
    }
    if (!sameFileState(metadata, snapshot.states[name])) {
      throw new Error(`evidence entry ${name} changed after immutable snapshot creation`);
    }
  }
}

export function verifyEvidenceManifest(evidenceDirectory) {
  return createEvidenceSnapshot(evidenceDirectory).publicManifest;
}

function snapshotText(snapshot, name) {
  return snapshot.bytes[name].toString('utf8');
}

function snapshotKeyValues(snapshot, name) {
  return parseKeyValueBytes(snapshot.bytes[name], name);
}

function validateAttestation(snapshot, name, role, tuple, window, operator) {
  let value;
  try {
    value = JSON.parse(snapshotText(snapshot, name));
  } catch {
    throw new Error(`${name} must contain bounded JSON`);
  }
  const canonicalKeys = [
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
  if (role === 'INDEPENDENT_REVIEWER') canonicalKeys.push('evidenceManifestSha256');
  exactKeys(value, canonicalKeys, name);
  if (value.schemaVersion !== 'w15j-attestation-v1' || value.role !== role) {
    throw new Error(`${name} schema/role is invalid`);
  }
  const identity = required(value, 'identity', name);
  const statement = required(value, 'statement', name);
  if (identity !== identity.trim() || statement !== statement.trim()) {
    throw new Error(`${name} identity/statement cannot have surrounding whitespace`);
  }
  if (identity.length > 256 || statement.length > 2048) {
    throw new Error(`${name} identity/statement exceeds its bound`);
  }
  if (role === 'OPERATOR' ? identity !== operator : identity === operator) {
    throw new Error(`${name} identity is not independent and correctly bound`);
  }
  for (const [field, expected] of [
    ['androidCandidateSha', tuple.androidCandidateSha],
    ['hostCandidateSha', tuple.hostCandidateSha],
    ['reconciledMainSha', tuple.reconciledMainSha],
    ['packagingHeadSha', tuple.packagingHeadSha],
    ['artifactId', tuple.artifact.id],
    ['apkSha256', tuple.apk.sha256],
    ['hostInstanceId', tuple.hostInstanceId],
  ]) {
    if (value[field] !== expected) throw new Error(`${name}.${field} does not match exact tuple`);
  }
  const observed = semanticUtc(value.observedAtUtc, `${name}.observedAtUtc`);
  if (role === 'INDEPENDENT_REVIEWER') {
    if (value.evidenceManifestSha256 !== snapshot.publicManifest.sha256) {
      throw new Error(`${name} does not bind the exact finalized evidence manifest`);
    }
  }
  if (
    role === 'OPERATOR'
      ? observed < window.start || observed > window.finish
      : observed < window.finish || observed > Date.now()
  ) {
    throw new Error(
      role === 'OPERATOR'
        ? `${name}.observedAtUtc is outside the collector window`
        : `${name}.observedAtUtc must be at/after finalize and not in the future`,
    );
  }
  return Object.freeze({
    reference: name,
    identity,
    observedAtUtc: value.observedAtUtc,
    sha256: digestBytes(snapshot.bytes[name]),
  });
}

function equalField(left, leftKey, right, rightKey, message) {
  if (required(left, leftKey, 'left') !== required(right, rightKey, 'right'))
    throw new Error(message);
}

function requireRemovedMappings(text, ports, label) {
  for (const port of ports) {
    if (text.includes(`tcp:${port} tcp:${port}`))
      throw new Error(`${label} still contains tcp:${port}`);
  }
}

function parseApkSum(contents) {
  const lines = contents.trim().split(/\r?\n/u);
  if (lines.length !== 1) throw new Error('SHA256SUMS.txt must contain exactly one APK entry');
  const match = /^([a-f0-9]{64}) {2}([A-Za-z0-9._-]+\.apk)$/u.exec(lines[0]);
  if (!match) throw new Error('SHA256SUMS.txt APK entry is invalid');
  return { sha256: match[1], fileName: match[2] };
}

function validateArtifact(snapshot, artifact, build, apk, manifest) {
  const zipDigest = digestBytes(snapshot.bytes['artifact.zip']);
  const expectedZipDigest = exact(
    required(artifact, 'artifact_zip_sha256', 'artifact'),
    SHA256,
    'artifact ZIP SHA-256',
  );
  if (zipDigest !== expectedZipDigest)
    throw new Error('artifact ZIP digest does not match artifact metadata');
  if (manifest.files['artifact.zip'].sha256 !== zipDigest)
    throw new Error('artifact ZIP is not immutably manifested');

  const extractionDirectory = mkdtempSync(join(tmpdir(), 'w15j-artifact-'));
  try {
    const zipPath = join(extractionDirectory, 'artifact.zip');
    writeFileSync(zipPath, snapshot.bytes['artifact.zip'], { flag: 'wx', mode: 0o600 });
    const entries = execFileSync('unzip', ['-Z1', zipPath], { encoding: 'utf8' })
      .trim()
      .split(/\r?\n/u)
      .sort();
    const apkSum = parseApkSum(snapshotText(snapshot, 'SHA256SUMS.txt'));
    const expectedEntries = ['BUILD_IDENTITY.txt', 'SHA256SUMS.txt', apkSum.fileName].sort();
    if (JSON.stringify(entries) !== JSON.stringify(expectedEntries)) {
      throw new Error(
        'artifact ZIP must contain exactly APK, BUILD_IDENTITY.txt, and SHA256SUMS.txt',
      );
    }
    execFileSync('unzip', ['-q', zipPath, '-d', extractionDirectory]);
    const extractionRoot = realpathSync(extractionDirectory);
    const extractedEntries = readdirSync(extractionDirectory)
      .filter((name) => name !== 'artifact.zip')
      .sort();
    if (JSON.stringify(extractedEntries) !== JSON.stringify(expectedEntries)) {
      throw new Error('extracted artifact entries do not match the canonical ZIP file set');
    }
    const extractedSnapshots = Object.fromEntries(
      extractedEntries.map((name) => [
        name,
        secureSnapshotFile(
          extractionRoot,
          join(extractionDirectory, name),
          `ZIP entry ${name}`,
          evidenceSizeLimit(name),
        ).bytes,
      ]),
    );
    for (const name of ['BUILD_IDENTITY.txt', 'SHA256SUMS.txt']) {
      if (!extractedSnapshots[name].equals(snapshot.bytes[name]))
        throw new Error(`${name} differs from the embedded artifact file`);
    }
    if (!extractedSnapshots[apkSum.fileName].equals(snapshot.bytes['candidate.apk']))
      throw new Error('candidate APK differs from the artifact ZIP APK');
    const apkDigest = digestBytes(snapshot.bytes['candidate.apk']);
    if (apkDigest !== apkSum.sha256 || apkDigest !== required(apk, 'apk_sha256', 'apk')) {
      throw new Error('APK digest drift across artifact, SHA256SUMS, and installed identity');
    }
    return { apkDigest, zipDigest };
  } finally {
    rmSync(extractionDirectory, { recursive: true, force: true });
  }
}

function validateBuildIdentity(build, apk) {
  for (const [buildKey, apkKey] of [
    ['source_candidate_sha', 'candidate_sha'],
    ['apk_variant', 'variant'],
    ['package_id', 'application_id'],
    ['version_code', 'version_code'],
    ['version_name', 'version_name'],
  ])
    equalField(
      build,
      buildKey,
      apk,
      apkKey,
      `BUILD_IDENTITY ${buildKey} does not match installed APK identity`,
    );
  if (
    required(build, 'canonical_acceptance', 'BUILD_IDENTITY') !== 'false' ||
    required(build, 'physical_evidence_required', 'BUILD_IDENTITY') !== 'true' ||
    required(build, 'dp5_status', 'BUILD_IDENTITY') !== 'INCOMPLETE'
  ) {
    throw new Error('BUILD_IDENTITY must remain non-canonical and physical-evidence-required');
  }
}

export function buildTrustedW15JPreflight(evidenceDirectory, controlTowerInput) {
  const controlTower = validateControlTowerTuple(controlTowerInput);
  const snapshot = createEvidenceSnapshot(evidenceDirectory);
  const manifest = snapshot.publicManifest;
  const preflight = snapshotKeyValues(snapshot, 'preflight-metadata.txt');
  const finalize = snapshotKeyValues(snapshot, 'finalize-metadata.txt');
  const apk = snapshotKeyValues(snapshot, 'apk-identity.txt');
  const apkFinalize = snapshotKeyValues(snapshot, 'apk-identity-finalize.txt');
  const dual = snapshotKeyValues(snapshot, 'dual-port-metadata.txt');
  const artifact = snapshotKeyValues(snapshot, 'artifact-metadata.txt');
  const build = snapshotKeyValues(snapshot, 'BUILD_IDENTITY.txt');

  const androidCandidateSha = exact(
    required(build, 'source_candidate_sha', 'BUILD_IDENTITY'),
    GIT_SHA,
    'Android candidate SHA',
  );
  const hostCandidateSha = exact(
    required(build, 'paired_local_host_candidate_sha', 'BUILD_IDENTITY'),
    GIT_SHA,
    'host candidate SHA',
  );
  const canonicalGatewayIdentity = 'aurora-w15j-local-host';
  const canonicalGatewayVersion = `git:${hostCandidateSha}`;
  const reconciledMainSha = exact(
    required(build, 'reconciled_main_parent_sha', 'BUILD_IDENTITY'),
    GIT_SHA,
    'reconciled main SHA',
  );
  const packagingHeadSha = exact(
    required(artifact, 'packaging_head_sha', 'artifact'),
    GIT_SHA,
    'packaging head SHA',
  );
  const artifactId = exact(
    required(artifact, 'artifact_id', 'artifact'),
    ARTIFACT_ID,
    'artifact id',
  );
  const artifactName = required(artifact, 'artifact_name', 'artifact');
  if (!/^[A-Za-z0-9._-]+$/u.test(artifactName))
    throw new Error('artifact name contains unsafe characters');

  validateBuildIdentity(build, apk);
  const artifactResult = validateArtifact(snapshot, artifact, build, apk, manifest);
  const tuple = {
    androidCandidateSha,
    hostCandidateSha,
    reconciledMainSha,
    packagingHeadSha,
    artifact: { id: artifactId, name: artifactName, zipSha256: artifactResult.zipDigest },
    apk: {
      applicationId: required(apk, 'application_id', 'apk'),
      variant: required(apk, 'variant', 'apk'),
      versionCode: required(apk, 'version_code', 'apk'),
      versionName: required(apk, 'version_name', 'apk'),
      sha256: artifactResult.apkDigest,
    },
  };
  assertTupleMatches(tuple, controlTower);
  for (const name of ['installed-base-preflight.apk', 'installed-base-finalize.apk']) {
    if (manifest.files[name].sha256 !== artifactResult.apkDigest) {
      throw new Error(`${name} does not match the artifact APK SHA-256`);
    }
  }
  for (const phase of ['preflight', 'finalize']) {
    const log = `installed-base-${phase}-pull.txt`;
    if (manifest.files[log].sizeBytes === 0) throw new Error(`${log} must not be empty`);
    if (snapshotText(snapshot, `${log}.exit-code`).trim() !== '0') {
      throw new Error(`${log} did not complete successfully`);
    }
    const packagePath = phase === 'preflight' ? 'package-path.txt' : 'package-path-finalize.txt';
    if (snapshotText(snapshot, `${packagePath}.exit-code`).trim() !== '0') {
      throw new Error(`${packagePath} did not complete successfully`);
    }
    const normalizedPackagePath = snapshotText(snapshot, packagePath).replace(/\r\n/gu, '\n');
    const packageLines = normalizedPackagePath.endsWith('\n')
      ? normalizedPackagePath.slice(0, -1).split('\n')
      : normalizedPackagePath.split('\n');
    if (
      packageLines.length !== 1 ||
      !/^package:\/(?:[^/\r\n]+\/)*base\.apk$/u.test(packageLines[0])
    ) {
      throw new Error(`${packagePath} must contain exactly one package:/.../base.apk line`);
    }
  }

  const tupleBindings = [
    ['candidate_sha', androidCandidateSha],
    ['host_candidate_sha', hostCandidateSha],
    ['reconciled_main_sha', reconciledMainSha],
    ['packaging_head_sha', packagingHeadSha],
    ['artifact_id', artifactId],
    ['artifact_name', artifactName],
    ['artifact_zip_sha256', artifactResult.zipDigest],
    ['apk_path_sha256', artifactResult.apkDigest],
    ['apk_variant', tuple.apk.variant],
    ['package_id', tuple.apk.applicationId],
  ];
  for (const [key, expectedValue] of tupleBindings) {
    if (required(preflight, key, 'preflight') !== expectedValue)
      throw new Error(`preflight ${key} does not match artifact tuple`);
  }
  for (const [key, expectedValue] of tupleBindings) {
    const finalizeKey = key === 'apk_path_sha256' ? 'apk_sha256' : key;
    if (required(finalize, finalizeKey, 'finalize') !== expectedValue)
      throw new Error(`finalize ${finalizeKey} drift from preflight tuple`);
  }
  for (const field of [
    'candidate_sha',
    'application_id',
    'variant',
    'version_code',
    'version_name',
    'apk_sha256',
  ]) {
    if (required(apkFinalize, field, 'final APK') !== required(apk, field, 'preflight APK'))
      throw new Error(`installed APK identity drift at finalize: ${field}`);
  }
  if (
    required(preflight, 'gateway_identity', 'preflight') !== canonicalGatewayIdentity ||
    required(preflight, 'gateway_version', 'preflight') !== canonicalGatewayVersion
  ) {
    throw new Error('gateway identity/version must be derived from the exact host candidate SHA');
  }
  if (required(preflight, 'ro.kernel.qemu', 'preflight') === '1')
    throw new Error('emulator evidence is not physical DP5 provenance');
  for (const field of [
    'serial_sha256',
    'manufacturer',
    'model',
    'product',
    'api_level',
    'build_fingerprint',
    'gateway_identity',
    'gateway_version',
    'host_instance_id',
    'operator',
  ]) {
    if (required(finalize, field, 'finalize') !== required(preflight, field, 'preflight'))
      throw new Error(`finalize identity drift: ${field}`);
  }
  for (const capture of REQUIRED_SUCCESS_CAPTURES) {
    if (manifest.files[capture].sizeBytes === 0) throw new Error(`${capture} must not be empty`);
    if (snapshotText(snapshot, `${capture}.exit-code`).trim() !== '0') {
      throw new Error(`${capture} did not complete successfully`);
    }
  }

  const preflightObservedAtUtc = required(preflight, 'collected_at_utc', 'preflight');
  const finalizedAtUtc = required(finalize, 'finalized_at_utc', 'finalize');
  const preflightTime = semanticUtc(preflightObservedAtUtc, 'preflight.collected_at_utc');
  const finalizeTime = semanticUtc(finalizedAtUtc, 'finalize.finalized_at_utc');

  const deviceGatewayPort = exactPort(
    required(dual, 'device_gateway_port', 'dual-port'),
    8080,
    'device_gateway_port',
  );
  const bootstrapPort = exactPort(
    required(dual, 'bootstrap_port', 'dual-port'),
    8081,
    'bootstrap_port',
  );
  if (required(dual, 'transport_scope', 'dual-port') !== 'LOCAL_ADB_REVERSE_ONLY')
    throw new Error('dual-port transport scope must be LOCAL_ADB_REVERSE_ONLY');
  const preflightMappings = snapshotText(snapshot, 'adb-reverse-dual-port-preflight.txt');
  for (const port of [deviceGatewayPort, bootstrapPort]) {
    if (!preflightMappings.includes(`tcp:${port} tcp:${port}`)) {
      throw new Error(`ADB reverse mapping tcp:${port} was not present during preflight`);
    }
  }
  const hostReady = snapshotKeyValues(snapshot, 'host-ready-announcement.txt');
  const hostReadyBindings = [
    ['host_candidate_sha', hostCandidateSha],
    ['gateway_identity', required(preflight, 'gateway_identity', 'preflight')],
    ['gateway_version', required(preflight, 'gateway_version', 'preflight')],
    ['device_gateway_port', String(deviceGatewayPort)],
    ['bootstrap_port', String(bootstrapPort)],
    ['physical_evidence_status', 'NOT_RUN'],
  ];
  const hostInstanceId = required(hostReady, 'host_instance_id', 'host readiness');
  if (!/^whi_[0-9a-f]{64}$/u.test(hostInstanceId)) {
    throw new Error('host readiness.host_instance_id must be canonical');
  }
  if (required(preflight, 'host_instance_id', 'preflight') !== hostInstanceId) {
    throw new Error('preflight host instance does not match host readiness');
  }
  if (
    Object.keys(hostReady).sort().join(',') !==
    [...hostReadyBindings.map(([key]) => key), 'started_at_utc', 'process_id', 'host_instance_id']
      .sort()
      .join(',')
  ) {
    throw new Error('host ready announcement must contain exactly nine canonical keys');
  }
  const hostStartedAtUtc = required(hostReady, 'started_at_utc', 'host readiness');
  const hostStartedAt = semanticUtc(hostStartedAtUtc, 'host readiness.started_at_utc');
  const hostProcessId = positiveDecimal(
    required(hostReady, 'process_id', 'host readiness'),
    'host readiness.process_id',
  );
  if (hostStartedAt > preflightTime || preflightTime - hostStartedAt > 5 * 60 * 1000) {
    throw new Error('host ready announcement is stale or after collector preflight');
  }
  for (const [key, expectedValue] of hostReadyBindings) {
    if (required(hostReady, key, 'host readiness') !== expectedValue) {
      throw new Error(`host readiness ${key} does not match the physical tuple`);
    }
  }
  for (const capture of HOST_READINESS_CAPTURES) {
    if (manifest.files[capture].sizeBytes === 0) throw new Error(`${capture} must not be empty`);
    if (snapshotText(snapshot, `${capture}.exit-code`).trim() !== '0') {
      throw new Error(`${capture} did not complete successfully`);
    }
    const probe = snapshotKeyValues(snapshot, capture);
    const port = capture.includes('8080') ? 8080 : 8081;
    const listener = capture.includes('listener');
    exactKeys(
      probe,
      listener
        ? [
            'probe',
            'observed_at_utc',
            'process_id',
            'host',
            'port',
            'method',
            'path',
            'http_status',
            'server_result_code',
            'host_instance_id',
            'listener_role',
            'cache_control',
            'pragma',
            'response_bytes',
            'authorizes_execution',
            'physical_evidence_status',
          ]
        : [
            'probe',
            'host',
            'port',
            'method',
            'path',
            'http_status',
            'server_error_code',
            'response_bytes',
            'authorizes_execution',
            'physical_evidence_status',
            'observed_at_utc',
            'process_id',
          ],
      capture,
    );
    const expectedPath = listener
      ? '/v1/local-host/instance'
      : port === 8080
        ? '/v1/gateway/sessions/open'
        : '/v1/gateway/bootstrap/exchange';
    const expectedStatus = listener ? '200' : '405';
    for (const [key, value] of [
      ['probe', listener ? 'HTTP_LISTENER_INSTANCE_RESPONSE' : 'HTTP_ROUTE_HEALTH_RESPONSE'],
      ['host', '127.0.0.1'],
      ['port', String(port)],
      ['method', 'GET'],
      ['path', expectedPath],
      ['http_status', expectedStatus],
      ['authorizes_execution', 'false'],
      ['physical_evidence_status', 'NOT_RUN'],
    ]) {
      if (required(probe, key, capture) !== value) throw new Error(`${capture}.${key} is invalid`);
    }
    if (listener) {
      const expectedRole = port === 8080 ? 'DEVICE_GATEWAY' : 'BOOTSTRAP_EXCHANGE';
      for (const [key, value] of [
        ['server_result_code', 'LOCAL_HOST_INSTANCE'],
        ['host_instance_id', hostInstanceId],
        ['listener_role', expectedRole],
        ['cache_control', 'no-store'],
        ['pragma', 'no-cache'],
      ]) {
        if (required(probe, key, capture) !== value)
          throw new Error(`${capture}.${key} is invalid`);
      }
    } else if (required(probe, 'server_error_code', capture) !== 'METHOD_NOT_ALLOWED') {
      throw new Error(`${capture}.server_error_code is invalid`);
    }
    positiveDecimal(required(probe, 'response_bytes', capture), `${capture}.response_bytes`);
    const processId = positiveDecimal(
      required(probe, 'process_id', capture),
      `${capture}.process_id`,
    );
    const observedAtUtc = required(probe, 'observed_at_utc', capture);
    semanticUtc(observedAtUtc, `${capture}.time`);
    if (processId !== hostProcessId || observedAtUtc !== hostStartedAtUtc) {
      throw new Error(`${capture} does not bind the host announcement process/time`);
    }
  }
  const collectorProbeTimes = Object.create(null);
  for (const capture of COLLECTOR_PROBE_CAPTURES) {
    if (manifest.files[capture].sizeBytes === 0) throw new Error(`${capture} must not be empty`);
    if (snapshotText(snapshot, `${capture}.exit-code`).trim() !== '0') {
      throw new Error(`${capture} did not complete successfully`);
    }
    const probe = snapshotKeyValues(snapshot, capture);
    exactKeys(
      probe,
      [
        'probe',
        'phase',
        'observed_at_utc',
        'host',
        'port',
        'method',
        'path',
        'http_status',
        'server_result_code',
        'host_instance_id',
        'listener_role',
        'response_bytes',
        'cache_control',
        'pragma',
        'authorizes_execution',
        'proves_execution_success',
        'retry_authorized',
        'physical_evidence_status',
      ],
      capture,
    );
    const phase = capture.includes('preflight') ? 'preflight' : 'finalize';
    const port = capture.endsWith('8080.txt') ? 8080 : 8081;
    const listenerRole = port === 8080 ? 'DEVICE_GATEWAY' : 'BOOTSTRAP_EXCHANGE';
    for (const [key, value] of [
      ['probe', 'COLLECTOR_HTTP_LISTENER_INSTANCE_RESPONSE'],
      ['phase', phase],
      ['host', '127.0.0.1'],
      ['port', String(port)],
      ['method', 'GET'],
      ['path', '/v1/local-host/instance'],
      ['http_status', '200'],
      ['server_result_code', 'LOCAL_HOST_INSTANCE'],
      ['host_instance_id', hostInstanceId],
      ['listener_role', listenerRole],
      ['cache_control', 'no-store'],
      ['pragma', 'no-cache'],
      ['authorizes_execution', 'false'],
      ['proves_execution_success', 'false'],
      ['retry_authorized', 'false'],
      ['physical_evidence_status', 'NOT_RUN'],
    ]) {
      if (required(probe, key, capture) !== value) throw new Error(`${capture}.${key} is invalid`);
    }
    positiveDecimal(required(probe, 'response_bytes', capture), `${capture}.response_bytes`);
    const observed = semanticUtc(required(probe, 'observed_at_utc', capture), `${capture}.time`);
    if (observed < preflightTime || observed > finalizeTime) {
      throw new Error(`${capture} is outside the collector physical window`);
    }
    collectorProbeTimes[capture] = observed;
  }
  if (
    required(finalize, 'adb_reverse_status', 'finalize') !== 'REMOVED' ||
    required(finalize, 'dual_port_cleanup', 'finalize') !== 'REMOVED'
  )
    throw new Error('finalize cleanup status must prove both mappings removed');
  if (snapshotText(snapshot, 'adb-reverse-remove.txt.exit-code').trim() !== '0')
    throw new Error('ADB reverse removal command did not succeed');
  requireRemovedMappings(
    snapshotText(snapshot, 'adb-reverse-list-after-finalize.txt'),
    [deviceGatewayPort],
    'device-plane cleanup evidence',
  );
  requireRemovedMappings(
    snapshotText(snapshot, 'adb-reverse-dual-port-after-finalize.txt'),
    [deviceGatewayPort, bootstrapPort],
    'dual-port cleanup evidence',
  );

  const device = {
    serialSha256: exact(
      required(preflight, 'serial_sha256', 'preflight'),
      SHA256,
      'device serial SHA-256',
    ),
    manufacturer: required(preflight, 'manufacturer', 'preflight'),
    model: required(preflight, 'model', 'preflight'),
    product: required(preflight, 'product', 'preflight'),
    apiLevel: required(preflight, 'api_level', 'preflight'),
    buildFingerprint: required(preflight, 'build_fingerprint', 'preflight'),
  };
  const environment = {
    gatewayIdentity: canonicalGatewayIdentity,
    gatewayVersion: canonicalGatewayVersion,
    hostInstanceId,
    gatewayTransport: 'LOCAL_ADB_REVERSE_ONLY',
  };
  const operator = required(preflight, 'operator', 'preflight');
  const attestationWindow = { start: preflightTime, finish: finalizeTime };
  const attestations = {
    operator: validateAttestation(
      snapshot,
      'operator-attestation.json',
      'OPERATOR',
      { ...tuple, hostInstanceId },
      attestationWindow,
      operator,
    ),
    reviewer: validateAttestation(
      snapshot,
      'reviewer-attestation.json',
      'INDEPENDENT_REVIEWER',
      { ...tuple, hostInstanceId },
      attestationWindow,
      operator,
    ),
  };
  const expected = {
    ...tuple,
    artifact: { ...tuple.artifact, digestSourceRef: controlTower.artifact.digestSourceRef },
    repository: controlTower.repository,
    workflowRun: controlTower.workflowRun,
    device,
    environment,
    operator,
    attestations,
    preflightObservedAtUtc,
    finalizedAtUtc,
  };
  const wake = JSON.parse(snapshotText(snapshot, 'wake-evidence.json'));
  const wakeResult = validateW15JWakeEvidence(wake, expected, manifest.files);
  const wakeStart = semanticUtc(wake.operator.startedAtUtc, 'wake.operator.startedAtUtc');
  const wakeFinish = semanticUtc(wake.operator.finishedAtUtc, 'wake.operator.finishedAtUtc');
  if (!(preflightTime <= wakeStart && wakeStart <= wakeFinish && wakeFinish <= finalizeTime)) {
    throw new Error(
      'physical timeline must satisfy preflight <= wake start <= wake finish <= finalize',
    );
  }
  for (const [name, observed] of Object.entries(collectorProbeTimes)) {
    if (name.includes('preflight') ? observed > wakeStart : observed < wakeFinish) {
      throw new Error(`${name} is not fresh in its collector phase`);
    }
  }

  const result = {
    schemaVersion: 'w15j-trusted-preflight-v2',
    expected,
    adbReverseMappings: [
      { host: 'tcp', port: deviceGatewayPort, status: 'PRESENT_DURING_WINDOW_REMOVED_AT_FINALIZE' },
      { host: 'tcp', port: bootstrapPort, status: 'PRESENT_DURING_WINDOW_REMOVED_AT_FINALIZE' },
    ],
    evidenceManifest: manifest,
    wakeEvidence: {
      reference: 'wake-evidence.json',
      sha256: manifest.files['wake-evidence.json'].sha256,
      schemaVersion: wakeResult.schemaVersion,
      deliberateAttempts: wakeResult.deliberateAttempts,
      scenarioCount: wakeResult.scenarioCount,
      lintReadyForIndependentReview: true,
      physicallyAccepted: false,
    },
    sourceEvidence: {
      rawDirectory: '.',
      preflightMetadata: 'preflight-metadata.txt',
      finalizeMetadata: 'finalize-metadata.txt',
      sha256Manifest: 'evidence-manifest.sha256',
      adbReverseCleanup: 'adb-reverse-dual-port-after-finalize.txt',
    },
    trustRoot: {
      ...controlTower,
      tupleSha256: digestBytes(Buffer.from(JSON.stringify(controlTower))),
      liveGitHubRevalidation: 'EXTERNAL_REQUIRED_IMMEDIATELY_BEFORE_ACCEPTANCE',
    },
    physicallyAccepted: false,
  };
  assertSnapshotStillCurrent(snapshot);
  return result;
}

if (process.argv[1]?.endsWith('w15j-trusted-preflight-from-collector.mjs')) {
  const evidenceDirectory = process.argv[2];
  const controlTowerPath = process.argv[3];
  const outputPath = process.argv[4];
  if (!evidenceDirectory || !controlTowerPath || !outputPath) {
    console.error(
      'Usage: node tools/acceptance/w15j-trusted-preflight-from-collector.mjs <finalized-evidence-directory> <independent-control-tower-tuple.json> <output-json>',
    );
    process.exitCode = 2;
  } else {
    try {
      writeFileSync(
        outputPath,
        `${JSON.stringify(buildTrustedW15JPreflight(evidenceDirectory, JSON.parse(readFileSync(controlTowerPath, 'utf8'))), null, 2)}\n`,
        { flag: 'wx' },
      );
      console.log(`W15J_TRUSTED_PREFLIGHT_WRITTEN ${outputPath}`);
    } catch (error) {
      console.error(`W15J_TRUSTED_PREFLIGHT_BLOCKED: ${error.message}`);
      process.exitCode = 1;
    }
  }
}
