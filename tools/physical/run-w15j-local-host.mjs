import {
  closeSync,
  constants as FS_CONSTANTS,
  existsSync,
  fsyncSync,
  lstatSync,
  mkdirSync,
  openSync,
  readdirSync,
  realpathSync,
  rmSync,
  statSync,
  writeSync,
} from 'node:fs';
import { Buffer } from 'node:buffer';
import { spawnSync } from 'node:child_process';
import { request } from 'node:http';
import { dirname, isAbsolute, join, resolve } from 'node:path';
import process from 'node:process';
import { fileURLToPath, pathToFileURL } from 'node:url';

const PROVIDER_ENV = 'AURORA_W15J_PROVIDER_MODULE';
const READINESS_ENV = 'AURORA_W15J_HOST_READINESS_DIR';
const TRUSTED_GIT = '/usr/bin/git';
const GATEWAY_IDENTITY = 'aurora-w15j-local-host';
const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const allowlistedStdoutWrite = process.stdout.write.bind(process.stdout);
const allowlistedStderrWrite = process.stderr.write.bind(process.stderr);
const ANNOUNCEMENT_KEYS = new Set([
  'kind',
  'bootstrapReference',
  'bootstrapExpiresAtMs',
  'gateway',
  'bootstrap',
  'hostMode',
  'physicalEvidenceStatus',
  'authorizesExecution',
  'provesExecutionSuccess',
  'retryAuthorized',
]);
const BOOTSTRAP_REFERENCE = /^gbr_[A-Za-z0-9_-]{43,128}$/u;
const HOST_INSTANCE_ID = /^whi_[a-f0-9]{64}$/u;
const GIT_SHA = /^[a-f0-9]{40}$/u;
const CANONICAL_UTC = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/u;
const READINESS_FILES = new Set([
  'host-ready-announcement.txt',
  'host-listener-8080.txt',
  'host-listener-8080.txt.exit-code',
  'host-listener-8081.txt',
  'host-listener-8081.txt.exit-code',
  'host-health-8080.txt',
  'host-health-8080.txt.exit-code',
  'host-health-8081.txt',
  'host-health-8081.txt.exit-code',
]);

export function isSupportedW15JLocalHostNodeVersion(value) {
  if (typeof value !== 'string') return false;
  const match = /^(\d+)\.(\d+)\.(\d+)(?:\+.*)?$/u.exec(value);
  if (match === null) return false;
  const major = Number(match[1]);
  const minor = Number(match[2]);
  const patch = Number(match[3]);
  return (
    Number.isSafeInteger(major) &&
    Number.isSafeInteger(minor) &&
    Number.isSafeInteger(patch) &&
    major === 22 &&
    (minor > 16 || (minor === 16 && patch >= 0))
  );
}

function fail(code) {
  allowlistedStderrWrite(`W15J_LOCAL_HOST_FAILED:${code}\n`);
  return false;
}

function providerUrl(reference, applicationArguments) {
  if (applicationArguments.length !== 0) return null;
  if (typeof reference !== 'string' || !isAbsolute(reference)) return null;
  try {
    const realPath = realpathSync(reference);
    if (!statSync(realPath).isFile()) return null;
    return pathToFileURL(realPath).href;
  } catch {
    return null;
  }
}

function metadataAt(path) {
  try {
    return lstatSync(path);
  } catch (error) {
    if (error?.code === 'ENOENT') return null;
    throw error;
  }
}

function sameDirectory(readiness) {
  try {
    const metadata = lstatSync(readiness.path);
    return (
      !metadata.isSymbolicLink() &&
      metadata.isDirectory() &&
      metadata.dev === readiness.dev &&
      metadata.ino === readiness.ino &&
      metadata.uid === readiness.uid &&
      (metadata.mode & 0o777) === 0o700 &&
      realpathSync(readiness.path) === readiness.realPath
    );
  } catch {
    return false;
  }
}

function createReadinessDirectory(reference) {
  if (typeof reference !== 'string' || !isAbsolute(reference) || resolve(reference) !== reference) {
    return null;
  }
  const parent = dirname(reference);
  let created = null;
  try {
    if (metadataAt(reference) !== null) return null;
    if (typeof process.getuid !== 'function') return null;
    const currentUid = process.getuid();
    const parentMetadata = lstatSync(parent);
    if (
      parentMetadata.isSymbolicLink() ||
      !parentMetadata.isDirectory() ||
      parentMetadata.uid !== currentUid ||
      (parentMetadata.mode & 0o022) !== 0
    ) {
      return null;
    }
    if (realpathSync(parent) !== parent) return null;
    mkdirSync(reference, { mode: 0o700 });
    const metadata = lstatSync(reference);
    created = Object.freeze({
      path: reference,
      realPath: reference,
      dev: metadata.dev,
      ino: metadata.ino,
      uid: currentUid,
    });
    const currentParentMetadata = lstatSync(parent);
    if (
      metadata.isSymbolicLink() ||
      !metadata.isDirectory() ||
      metadata.uid !== currentUid ||
      (metadata.mode & 0o777) !== 0o700 ||
      currentParentMetadata.dev !== parentMetadata.dev ||
      currentParentMetadata.ino !== parentMetadata.ino
    ) {
      removeReadinessDirectory(created);
      return null;
    }
    const realPath = realpathSync(reference);
    if (realPath !== reference) {
      removeReadinessDirectory(created);
      return null;
    }
    return Object.freeze({ ...created, realPath });
  } catch {
    removeReadinessDirectory(created);
    return null;
  }
}

function removeReadinessDirectory(readiness) {
  if (readiness === null || !sameDirectory(readiness)) return;
  try {
    rmSync(readiness.path, { recursive: true, force: true });
  } catch {
    // A failed cleanup remains a startup failure and is never reported ready.
  }
}

function verifyReadinessDirectory(readiness) {
  return sameDirectory(readiness);
}

function writeReadinessFile(readiness, name, content) {
  if (
    !READINESS_FILES.has(name) ||
    !verifyReadinessDirectory(readiness) ||
    typeof content !== 'string' ||
    content.length === 0 ||
    content.length > 2048 ||
    content.includes('gbr_')
  ) {
    throw new Error('unsafe readiness output');
  }
  const path = join(readiness.path, name);
  let descriptor;
  try {
    descriptor = openSync(
      path,
      FS_CONSTANTS.O_WRONLY | FS_CONSTANTS.O_CREAT | FS_CONSTANTS.O_EXCL | FS_CONSTANTS.O_NOFOLLOW,
      0o600,
    );
    writeSync(descriptor, content, undefined, 'utf8');
    fsyncSync(descriptor);
  } finally {
    if (descriptor !== undefined) closeSync(descriptor);
  }
  const metadata = lstatSync(path);
  if (
    metadata.isSymbolicLink() ||
    !metadata.isFile() ||
    (metadata.mode & 0o777) !== 0o600 ||
    dirname(realpathSync(path)) !== readiness.realPath
  ) {
    throw new Error('unsafe readiness file');
  }
}

function allowlistedAnnouncement(value) {
  if (
    value === null ||
    typeof value !== 'object' ||
    Array.isArray(value) ||
    Object.keys(value).length !== ANNOUNCEMENT_KEYS.size ||
    !Object.keys(value).every((key) => ANNOUNCEMENT_KEYS.has(key)) ||
    value.kind !== 'W15J_LOCAL_PHYSICAL_HOST_READY' ||
    typeof value.bootstrapReference !== 'string' ||
    !BOOTSTRAP_REFERENCE.test(value.bootstrapReference) ||
    !Number.isSafeInteger(value.bootstrapExpiresAtMs) ||
    value.gateway?.protocol !== 'http' ||
    value.gateway?.host !== '127.0.0.1' ||
    value.gateway?.port !== 8080 ||
    value.bootstrap?.protocol !== 'http' ||
    value.bootstrap?.host !== '127.0.0.1' ||
    value.bootstrap?.port !== 8081 ||
    value.bootstrap?.path !== '/v1/gateway/bootstrap/exchange' ||
    value.hostMode !== 'LOOPBACK_ONLY' ||
    value.physicalEvidenceStatus !== 'NOT_RUN' ||
    value.authorizesExecution !== false ||
    value.provesExecutionSuccess !== false ||
    value.retryAuthorized !== false
  ) {
    throw new Error('invalid runner announcement');
  }
  return value;
}

function trustedGitEnvironment() {
  const gitEnvironment = { ...process.env };
  for (const name of [
    'GIT_DIR',
    'GIT_WORK_TREE',
    'GIT_INDEX_FILE',
    'GIT_OBJECT_DIRECTORY',
    'GIT_COMMON_DIR',
    'GIT_CEILING_DIRECTORIES',
  ]) {
    Reflect.deleteProperty(gitEnvironment, name);
  }
  gitEnvironment.GIT_CONFIG_NOSYSTEM = '1';
  gitEnvironment.GIT_CONFIG_GLOBAL = '/dev/null';
  gitEnvironment.GIT_OPTIONAL_LOCKS = '0';
  return gitEnvironment;
}

function runTrustedGit(root, arguments_) {
  const binary = lstatSync(TRUSTED_GIT);
  if (
    binary.isSymbolicLink() ||
    !binary.isFile() ||
    binary.uid !== 0 ||
    (binary.mode & 0o022) !== 0 ||
    (binary.mode & 0o111) === 0
  ) {
    throw new Error('trusted git unavailable');
  }
  return spawnSync(TRUSTED_GIT, ['-C', root, ...arguments_], {
    cwd: root,
    encoding: 'utf8',
    env: trustedGitEnvironment(),
    timeout: 2_000,
    maxBuffer: 1024,
    stdio: ['ignore', 'pipe', 'pipe'],
  });
}

function exactHead(root) {
  const result = runTrustedGit(root, ['rev-parse', '--verify', 'HEAD^{commit}']);
  const sha = result.stdout.trim();
  if (result.signal !== null || result.status !== 0 || !GIT_SHA.test(sha)) {
    throw new Error('host SHA unavailable');
  }
  return sha;
}

export function inspectW15JHostGitSnapshot(root) {
  const before = exactHead(root);
  const worktree = runTrustedGit(root, ['diff', '--quiet', '--no-ext-diff', '--no-textconv', '--']);
  if (worktree.signal !== null || worktree.status !== 0) {
    throw new Error('tracked worktree is not clean');
  }
  const index = runTrustedGit(root, [
    'diff',
    '--cached',
    '--quiet',
    '--no-ext-diff',
    '--no-textconv',
    '--',
  ]);
  if (index.signal !== null || index.status !== 0) throw new Error('index is not clean');
  const after = exactHead(root);
  if (after !== before) throw new Error('host SHA changed during inspection');
  return Object.freeze({ head: before });
}

function unchangedGitSnapshot(root, expected) {
  const current = inspectW15JHostGitSnapshot(root);
  if (current.head !== expected.head) throw new Error('host SHA changed during startup');
  return current;
}

function normalizedResponseHeader(headers, name) {
  const value = headers[name];
  if (typeof value === 'string') return value.trim().toLowerCase();
  if (Array.isArray(value) && value.length === 1 && typeof value[0] === 'string') {
    return value[0].trim().toLowerCase();
  }
  return null;
}

export function probeW15JLocalHostHttpServer({
  port,
  path,
  expectedStatus,
  responseField,
  expectedCode,
  expectedHostInstanceId,
  expectedListenerRole,
}) {
  return new Promise((resolveProbe, rejectProbe) => {
    const probe = request(
      {
        host: '127.0.0.1',
        port,
        method: 'GET',
        path,
        headers: { accept: 'application/json', connection: 'close' },
        timeout: 2_000,
      },
      (response) => {
        let body = '';
        let bytes = 0;
        response.setEncoding('utf8');
        response.on('data', (chunk) => {
          bytes += Buffer.byteLength(chunk);
          if (bytes > 4096) {
            probe.destroy(new Error('probe response exceeded bound'));
            return;
          }
          body += chunk;
        });
        response.on('end', () => {
          try {
            const parsed = JSON.parse(body);
            if (expectedHostInstanceId !== undefined) {
              const cacheControl = normalizedResponseHeader(response.headers, 'cache-control');
              const pragma = normalizedResponseHeader(response.headers, 'pragma');
              const expectedKeys = new Set([
                'kind',
                'hostInstanceId',
                'listenerRole',
                'authorizesExecution',
                'provesExecutionSuccess',
                'retryAuthorized',
                'physicalEvidenceStatus',
              ]);
              if (
                response.statusCode !== expectedStatus ||
                parsed === null ||
                typeof parsed !== 'object' ||
                Array.isArray(parsed) ||
                Object.keys(parsed).length !== expectedKeys.size ||
                !Object.keys(parsed).every((key) => expectedKeys.has(key)) ||
                parsed.kind !== 'LOCAL_HOST_INSTANCE' ||
                parsed.hostInstanceId !== expectedHostInstanceId ||
                parsed.listenerRole !== expectedListenerRole ||
                parsed.authorizesExecution !== false ||
                parsed.provesExecutionSuccess !== false ||
                parsed.retryAuthorized !== false ||
                parsed.physicalEvidenceStatus !== 'NOT_RUN' ||
                cacheControl !== 'no-store' ||
                pragma !== 'no-cache'
              ) {
                throw new Error('unexpected host instance probe response');
              }
              resolveProbe(
                Object.freeze({
                  port,
                  path,
                  status: expectedStatus,
                  resultCode: 'LOCAL_HOST_INSTANCE',
                  hostInstanceId: parsed.hostInstanceId,
                  listenerRole: parsed.listenerRole,
                  cacheControl,
                  pragma,
                  responseBytes: bytes,
                }),
              );
              return;
            }
            if (
              response.statusCode !== expectedStatus ||
              parsed === null ||
              typeof parsed !== 'object' ||
              parsed.ok !== false ||
              parsed.authorizesExecution !== false ||
              parsed[responseField]?.code !== expectedCode
            ) {
              throw new Error('unexpected probe response');
            }
            resolveProbe(
              Object.freeze({
                port,
                path,
                status: expectedStatus,
                errorCode: expectedCode,
                responseBytes: bytes,
              }),
            );
          } catch (error) {
            rejectProbe(error);
          }
        });
      },
    );
    probe.once('error', rejectProbe);
    probe.once('timeout', () => probe.destroy(new Error('probe timed out')));
    probe.end();
  });
}

function probeCapture(kind, probe, runtimeMetadata) {
  const result = [
    `probe=${kind}`,
    `observed_at_utc=${runtimeMetadata.startedAtUtc}`,
    `process_id=${runtimeMetadata.processId}`,
    'host=127.0.0.1',
    `port=${probe.port}`,
    'method=GET',
    `path=${probe.path}`,
    `http_status=${probe.status}`,
    ...(probe.resultCode === undefined
      ? [`server_error_code=${probe.errorCode}`]
      : [
          `server_result_code=${probe.resultCode}`,
          `host_instance_id=${probe.hostInstanceId}`,
          `listener_role=${probe.listenerRole}`,
          `cache_control=${probe.cacheControl}`,
          `pragma=${probe.pragma}`,
        ]),
    `response_bytes=${probe.responseBytes}`,
    'authorizes_execution=false',
    'physical_evidence_status=NOT_RUN',
    '',
  ];
  return result.join('\n');
}

function captureReadinessRuntimeMetadata() {
  const startedAtUtc = new Date().toISOString();
  const processId = process.pid;
  if (!CANONICAL_UTC.test(startedAtUtc) || !Number.isSafeInteger(processId) || processId <= 0) {
    throw new Error('runtime metadata unavailable');
  }
  return Object.freeze({ startedAtUtc, processId });
}

async function writeHostReadiness(
  readiness,
  hostCandidateSha,
  hostInstanceId,
  runtimeMetadata,
  verifySourceState,
) {
  const probes = await Promise.all([
    probeW15JLocalHostHttpServer({
      port: 8080,
      path: '/v1/local-host/instance',
      expectedStatus: 200,
      expectedHostInstanceId: hostInstanceId,
      expectedListenerRole: 'DEVICE_GATEWAY',
    }),
    probeW15JLocalHostHttpServer({
      port: 8081,
      path: '/v1/local-host/instance',
      expectedStatus: 200,
      expectedHostInstanceId: hostInstanceId,
      expectedListenerRole: 'BOOTSTRAP_EXCHANGE',
    }),
    probeW15JLocalHostHttpServer({
      port: 8080,
      path: '/v1/gateway/sessions/open',
      expectedStatus: 405,
      responseField: 'transportError',
      expectedCode: 'METHOD_NOT_ALLOWED',
    }),
    probeW15JLocalHostHttpServer({
      port: 8081,
      path: '/v1/gateway/bootstrap/exchange',
      expectedStatus: 405,
      responseField: 'bootstrapError',
      expectedCode: 'METHOD_NOT_ALLOWED',
    }),
  ]);
  const captures = [
    ['host-listener-8080.txt', 'HTTP_LISTENER_INSTANCE_RESPONSE', probes[0]],
    ['host-listener-8081.txt', 'HTTP_LISTENER_INSTANCE_RESPONSE', probes[1]],
    ['host-health-8080.txt', 'HTTP_ROUTE_HEALTH_RESPONSE', probes[2]],
    ['host-health-8081.txt', 'HTTP_ROUTE_HEALTH_RESPONSE', probes[3]],
  ];
  verifySourceState();
  for (const [name, kind, probe] of captures) {
    writeReadinessFile(readiness, name, probeCapture(kind, probe, runtimeMetadata));
    writeReadinessFile(readiness, `${name}.exit-code`, '0\n');
  }
  writeReadinessFile(
    readiness,
    'host-ready-announcement.txt',
    [
      `host_candidate_sha=${hostCandidateSha}`,
      `gateway_identity=${GATEWAY_IDENTITY}`,
      `gateway_version=git:${hostCandidateSha}`,
      `host_instance_id=${hostInstanceId}`,
      `started_at_utc=${runtimeMetadata.startedAtUtc}`,
      `process_id=${runtimeMetadata.processId}`,
      'device_gateway_port=8080',
      'bootstrap_port=8081',
      'physical_evidence_status=NOT_RUN',
      '',
    ].join('\n'),
  );
  if (
    !verifyReadinessDirectory(readiness) ||
    JSON.stringify(readdirSync(readiness.path).sort()) !==
      JSON.stringify([...READINESS_FILES].sort())
  ) {
    throw new Error('readiness output set is incomplete');
  }
}

function compileFreshRuntime(root) {
  const tsc = resolve(root, 'node_modules/.bin/tsc');
  if (!existsSync(tsc)) return false;
  const builds = [
    {
      output: resolve(root, 'packages/contracts/dist'),
      project: 'packages/contracts/tsconfig.build.json',
    },
    {
      output: resolve(root, 'packages/events/dist'),
      project: 'packages/events/tsconfig.build.json',
    },
    {
      output: resolve(root, 'services/mobile-gateway/dist'),
      project: 'services/mobile-gateway/tsconfig.runtime.json',
    },
  ];

  for (const build of builds) {
    try {
      rmSync(build.output, { recursive: true, force: true });
    } catch {
      return false;
    }
    const result = spawnSync(tsc, ['--project', build.project, '--pretty', 'false'], {
      cwd: root,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    if (result.status !== 0) return false;
  }
  return true;
}

export async function runW15JLocalHostLauncher(runtime = {}) {
  if (!isSupportedW15JLocalHostNodeVersion(process.versions.node)) {
    return fail('NODE_VERSION_UNSUPPORTED');
  }

  const applicationArguments = runtime.applicationArguments ?? process.argv.slice(2);
  const providerReference = runtime.providerReference ?? process.env[PROVIDER_ENV];
  const externalProviderUrl = providerUrl(providerReference, applicationArguments);
  if (externalProviderUrl === null) return fail('PROVIDER_REFERENCE_INVALID');

  const readinessReference = runtime.readinessDirectory ?? process.env[READINESS_ENV];
  const readiness = createReadinessDirectory(readinessReference);
  if (readiness === null) return fail('READINESS_DIRECTORY_INVALID');

  const root = repoRoot;
  let startupSnapshot;
  try {
    startupSnapshot = inspectW15JHostGitSnapshot(root);
  } catch {
    removeReadinessDirectory(readiness);
    return fail('SOURCE_STATE_INVALID');
  }
  if (!compileFreshRuntime(root)) {
    removeReadinessDirectory(readiness);
    return fail('RUNTIME_BUILD_FAILED');
  }
  try {
    unchangedGitSnapshot(root, startupSnapshot);
  } catch {
    removeReadinessDirectory(readiness);
    return fail('SOURCE_STATE_CHANGED');
  }

  let operatorHandle;
  try {
    process.stdout.write = () => true;
    process.stderr.write = () => true;
    const providerModule = await import(externalProviderUrl);
    const operatorModule = await import(
      pathToFileURL(
        resolve(root, 'services/mobile-gateway/dist/physical-host/local-physical-host-operator.js'),
      ).href
    );
    const runnerModule = await import(
      pathToFileURL(
        resolve(root, 'services/mobile-gateway/dist/physical-host/local-physical-host-runner.js'),
      ).href
    );
    let readyAnnouncement;
    operatorHandle = await operatorModule.startW15JLocalPhysicalHostOperator(providerModule, {
      startRunner: (input) =>
        runnerModule.startW15JLocalPhysicalHostRunner({
          ...input,
          hooks: {
            emit: (announcement) => {
              readyAnnouncement = allowlistedAnnouncement(announcement);
            },
            registerSignal: (signal, listener) => {
              process.once(signal, listener);
              return () => process.off(signal, listener);
            },
            cleanupFailed: () => {
              process.exitCode = 1;
            },
          },
        }),
    });
    if (readyAnnouncement === undefined) throw new Error('runner did not announce readiness');
    if (!HOST_INSTANCE_ID.test(operatorHandle.hostInstanceId)) {
      throw new Error('runner host instance identifier is invalid');
    }
    const runtimeMetadata = captureReadinessRuntimeMetadata();
    await writeHostReadiness(
      readiness,
      startupSnapshot.head,
      operatorHandle.hostInstanceId,
      runtimeMetadata,
      () => unchangedGitSnapshot(root, startupSnapshot),
    );
    unchangedGitSnapshot(root, startupSnapshot);
    allowlistedStdoutWrite(`${JSON.stringify(readyAnnouncement)}\n`);
    return true;
  } catch {
    try {
      await operatorHandle?.stop();
    } catch {
      // Startup remains rejected even if host cleanup also fails.
    }
    removeReadinessDirectory(readiness);
    return fail('START_REJECTED');
  }
}

function isDirectExecution() {
  const invokedPath = process.argv[1];
  if (typeof invokedPath !== 'string') return false;
  try {
    return pathToFileURL(realpathSync(invokedPath)).href === import.meta.url;
  } catch {
    return false;
  }
}

if (isDirectExecution()) {
  const started = await runW15JLocalHostLauncher();
  if (!started) process.exitCode = 1;
}
