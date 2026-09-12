// @ts-expect-error -- mobile-gateway harness uses Node 22 built-ins without repository-wide @types/node.
import assert from 'node:assert/strict';
// @ts-expect-error -- mobile-gateway harness uses Node 22 built-ins without repository-wide @types/node.
import {
  chmodSync,
  existsSync,
  lstatSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs';
// @ts-expect-error -- mobile-gateway harness uses Node 22 built-ins without repository-wide @types/node.
import { tmpdir } from 'node:os';
// @ts-expect-error -- mobile-gateway harness uses Node 22 built-ins without repository-wide @types/node.
import { createServer } from 'node:http';
// @ts-expect-error -- mobile-gateway harness uses Node 22 built-ins without repository-wide @types/node.
import { join } from 'node:path';
// @ts-expect-error -- mobile-gateway harness uses Node 22 built-ins without repository-wide @types/node.
import process from 'node:process';
// @ts-expect-error -- mobile-gateway harness uses Node 22 built-ins without repository-wide @types/node.
import { pathToFileURL } from 'node:url';
// @ts-expect-error -- mobile-gateway harness uses Node 22 built-ins without repository-wide @types/node.
import { spawn, spawnSync } from 'node:child_process';
// @ts-expect-error -- mobile-gateway harness uses Node 22 built-ins without repository-wide @types/node.
import test from 'node:test';

import {
  startW15JLocalPhysicalHostOperator,
  W15JLocalPhysicalHostOperatorError,
} from '../local-physical-host-operator.js';
import type { W15JLocalPhysicalHostRunnerInput } from '../local-physical-host-runner.js';

const NOW = 1_788_633_000_000;
const AUTH_REFERENCE = 'upstream-auth:operator-secret-reference';
const CANONICAL_UTC = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/u;

function exactKv(content: string): Readonly<Record<string, string>> {
  const result: Record<string, string> = {};
  for (const line of content.trimEnd().split('\n')) {
    const separator = line.indexOf('=');
    assert.notEqual(separator, -1);
    const key = line.slice(0, separator);
    assert.equal(Object.hasOwn(result, key), false);
    result[key] = line.slice(separator + 1);
  }
  return result;
}

function principal(overrides: Readonly<Record<string, unknown>> = {}) {
  return {
    tenantId: 'ten_01ARZ3NDEKTSV4RRFFQ69G5FAV',
    actor: {
      kind: 'HUMAN',
      identityId: 'idn_01ARZ3NDEKTSV4RRFFQ69G5FAV',
    },
    correlationId: 'cor_01ARZ3NDEKTSV4RRFFQ69G5FAV',
    deviceId: 'dvc_01ARZ3NDEKTSV4RRFFQ69G5FAV',
    deviceSessionId: 'device-session:operator',
    authenticatedAtMs: NOW - 1_000,
    authenticationExpiresAtMs: NOW + 120_000,
    authenticationReference: AUTH_REFERENCE,
    authorizesExecution: false,
    canGrantPermission: false,
    ...overrides,
  };
}

function dependencies() {
  return {
    receiptEvidenceIngress: { observe: () => ({ ok: false }) },
    createVoiceIntake: () => ({ evaluate: () => ({ ok: false }) }),
    createContainmentLifecycle: () => ({
      transitionCircuit: () => ({ ok: false }),
      transitionKillSwitch: () => ({ ok: false }),
      transitionOperational: () => ({ ok: false }),
    }),
    createAttemptLifecycle: () => ({
      reconcileAndAdvance: () => ({ status: 'REJECTED' }),
      reconcileAndSealTerminal: () => ({ status: 'REJECTED' }),
    }),
  };
}

function provider(input: unknown = undefined) {
  return {
    createW15JLocalPhysicalHostOperatorInput: () =>
      input ?? {
        databaseUrl: 'postgresql://runtime.invalid/aurora',
        dependencies: dependencies(),
        principal: principal(),
      },
  };
}

async function rejectsWithCode(
  action: () => Promise<unknown>,
  code: W15JLocalPhysicalHostOperatorError['code'],
) {
  await assert.rejects(
    action,
    (error: unknown) =>
      error instanceof W15JLocalPhysicalHostOperatorError &&
      error.code === code &&
      !error.message.includes(AUTH_REFERENCE),
  );
}

test('validates owner-backed provider input and pins the real LOCAL runner ports', async () => {
  let captured: W15JLocalPhysicalHostRunnerInput | undefined;
  const handle = await startW15JLocalPhysicalHostOperator(provider(), {
    now: () => NOW,
    startRunner: async (input) => {
      captured = input;
      return {
        address: {
          gateway: { protocol: 'http', host: '127.0.0.1', port: 8080 },
          bootstrap: {
            protocol: 'http',
            host: '127.0.0.1',
            port: 8081,
            path: '/v1/gateway/bootstrap/exchange',
          },
          hostMode: 'LOOPBACK_ONLY',
          physicalEvidenceStatus: 'NOT_RUN',
          authorizesExecution: false,
          hostInstanceId: `whi_${'a'.repeat(64)}`,
        },
        hostInstanceId: `whi_${'a'.repeat(64)}`,
        bootstrapReference: `gbr_${'A'.repeat(43)}`,
        bootstrapExpiresAtMs: NOW + 60_000,
        physicalEvidenceStatus: 'NOT_RUN',
        authorizesExecution: false,
        stop: async () => undefined,
      };
    },
  });

  assert.equal(captured?.host.gatewayPort, 8080);
  assert.equal(captured?.host.bootstrapPort, 8081);
  assert.deepEqual(captured?.principal, principal());
  assert.equal(captured?.principal.authenticationReference, AUTH_REFERENCE);
  assert.equal(handle.physicalEvidenceStatus, 'NOT_RUN');
  assert.equal(handle.authorizesExecution, false);
  assert.equal(handle.hostInstanceId, `whi_${'a'.repeat(64)}`);
});

test('rejects invalid modules, failed factories and malformed/non-owner-backed inputs', async () => {
  await rejectsWithCode(
    () => startW15JLocalPhysicalHostOperator(null, { now: () => NOW }),
    'PROVIDER_MODULE_INVALID',
  );
  await rejectsWithCode(
    () => startW15JLocalPhysicalHostOperator({}, { now: () => NOW }),
    'PROVIDER_MODULE_INVALID',
  );
  await rejectsWithCode(
    () =>
      startW15JLocalPhysicalHostOperator(
        new Proxy(
          {},
          {
            get: () => {
              throw new Error(AUTH_REFERENCE);
            },
          },
        ),
        { now: () => NOW },
      ),
    'PROVIDER_MODULE_INVALID',
  );
  await rejectsWithCode(
    () =>
      startW15JLocalPhysicalHostOperator(
        {
          createW15JLocalPhysicalHostOperatorInput: () => {
            throw new Error(AUTH_REFERENCE);
          },
        },
        { now: () => NOW },
      ),
    'PROVIDER_FACTORY_FAILED',
  );
  await rejectsWithCode(
    () =>
      startW15JLocalPhysicalHostOperator(
        provider({
          databaseUrl: 'postgresql://runtime.invalid/aurora',
          dependencies: {
            receiptEvidenceIngress: { observe: () => ({ ok: false }) },
            voiceIntake: { evaluate: () => ({ ok: false }) },
          },
          principal: principal(),
        }),
        { now: () => NOW },
      ),
    'PROVIDER_INPUT_INVALID',
  );
  await rejectsWithCode(
    () =>
      startW15JLocalPhysicalHostOperator(
        provider({
          databaseUrl: 'postgresql://runtime.invalid/aurora',
          dependencies: dependencies(),
          principal: principal(),
          runtimeIdentity: {
            gatewayIdentity: 'gwc_provider-controlled-must-not-be-accepted',
            gatewayVersion: 'provider-controlled',
          },
        }),
        { now: () => NOW },
      ),
    'PROVIDER_INPUT_INVALID',
  );
  await rejectsWithCode(
    () =>
      startW15JLocalPhysicalHostOperator(
        provider(
          new Proxy(
            {},
            {
              getPrototypeOf: () => {
                throw new Error(AUTH_REFERENCE);
              },
            },
          ),
        ),
        { now: () => NOW },
      ),
    'PROVIDER_INPUT_INVALID',
  );
  await rejectsWithCode(
    () =>
      startW15JLocalPhysicalHostOperator(
        provider({
          databaseUrl: 'postgresql://runtime.invalid/aurora',
          dependencies: dependencies(),
          principal: principal({ authorizesExecution: true }),
        }),
        { now: () => NOW },
      ),
    'PROVIDER_INPUT_INVALID',
  );
  await rejectsWithCode(
    () =>
      startW15JLocalPhysicalHostOperator(
        provider({
          databaseUrl: 'postgresql://runtime.invalid/aurora',
          dependencies: dependencies(),
          principal: principal({ authenticationExpiresAtMs: NOW }),
        }),
        { now: () => NOW },
      ),
    'PROVIDER_INPUT_INVALID',
  );
  await rejectsWithCode(
    () =>
      startW15JLocalPhysicalHostOperator(
        provider({
          databaseUrl: 'postgresql://runtime.invalid/aurora',
          dependencies: dependencies(),
          principal: principal(),
          policyToken: 'must-not-enter-provider-contract',
        }),
        { now: () => NOW },
      ),
    'PROVIDER_INPUT_INVALID',
  );
  await rejectsWithCode(
    () =>
      startW15JLocalPhysicalHostOperator(provider(), {
        now: () => NOW,
        startRunner: async () => {
          throw new Error(AUTH_REFERENCE);
        },
      }),
    'HOST_START_FAILED',
  );
});

test('real launcher emits one allowlisted line, suppresses provider output and stops on SIGTERM', async () => {
  const fixtureDirectory = mkdtempSync(join(tmpdir(), 'aurora-w15j-provider-'));
  const fixturePath = join(fixtureDirectory, 'trusted-provider.mjs');
  const readinessPath = join(fixtureDirectory, 'host-readiness');
  const providerOutputSentinel = 'provider-output-must-not-reach-stdout';
  const databaseSentinel = 'database-password-must-not-reach-stdout';
  writeFileSync(
    fixturePath,
    `export async function createW15JLocalPhysicalHostOperatorInput() {
  console.log('${providerOutputSentinel}');
  console.error('provider-stderr-must-not-escape');
  const now = Date.now();
  return {
    databaseUrl: 'postgresql://operator:${databaseSentinel}@127.0.0.1:1/aurora',
    dependencies: {
      receiptEvidenceIngress: { observe: () => ({ ok: false, code: 'UNAVAILABLE', retryable: true, authorizesExecution: false, provesExecutionSuccess: false, retryAuthorized: false }) },
      createVoiceIntake: () => ({ evaluate: () => ({ ok: false, acceptedForEvaluation: false, authorizesExecution: false, provesExecutionSuccess: false, retryAuthorized: false }) }),
      createContainmentLifecycle: () => ({
        transitionCircuit: () => ({ ok: false, code: 'STATE_UNAVAILABLE', authorizesExecution: false, provesExecutionSuccess: false, retryAuthorized: false }),
        transitionKillSwitch: () => ({ ok: false, code: 'STATE_UNAVAILABLE', authorizesExecution: false, provesExecutionSuccess: false, retryAuthorized: false }),
        transitionOperational: () => ({ ok: false, code: 'STATE_UNAVAILABLE', authorizesExecution: false, provesExecutionSuccess: false, retryAuthorized: false }),
      }),
      createAttemptLifecycle: () => ({
        reconcileAndAdvance: () => ({ status: 'REJECTED', reason: 'PERSISTENCE_UNAVAILABLE', authorizesExecution: false, provesExecutionSuccess: false, retryAuthorized: false }),
        reconcileAndSealTerminal: () => ({ status: 'REJECTED', reason: 'PERSISTENCE_UNAVAILABLE', authorizesExecution: false, provesExecutionSuccess: false, retryAuthorized: false }),
      }),
    },
    principal: {
      tenantId: 'ten_01ARZ3NDEKTSV4RRFFQ69G5FAV',
      actor: { kind: 'HUMAN', identityId: 'idn_01ARZ3NDEKTSV4RRFFQ69G5FAV' },
      correlationId: 'cor_01ARZ3NDEKTSV4RRFFQ69G5FAV',
      deviceId: 'dvc_01ARZ3NDEKTSV4RRFFQ69G5FAV',
      deviceSessionId: 'device-session:operator-process-test',
      authenticatedAtMs: now - 1000,
      authenticationExpiresAtMs: now + 120000,
      authenticationReference: 'upstream-auth:process-test-secret',
      authorizesExecution: false,
      canGrantPermission: false,
    },
  };
}
`,
    { encoding: 'utf8', mode: 0o600 },
  );

  try {
    const staleBuildPath = join(process.cwd(), 'packages/contracts/dist/stale-build-sentinel.js');
    writeFileSync(staleBuildPath, databaseSentinel, { encoding: 'utf8', mode: 0o600 });
    const launcherUrl = pathToFileURL(
      join(process.cwd(), 'tools/physical/run-w15j-local-host.mjs'),
    ).href;
    const childProgram = `Object.defineProperty(process.versions, 'node', { value: '22.16.0' });
const { runW15JLocalHostLauncher } = await import(${JSON.stringify(launcherUrl)});
const started = await runW15JLocalHostLauncher({ applicationArguments: [] });
if (!started) process.exitCode = 1;`;
    const launchNotBeforeMs = Date.now();
    const child = spawn(process.execPath, ['--input-type=module', '--eval', childProgram], {
      cwd: process.cwd(),
      env: {
        ...process.env,
        AURORA_W15J_PROVIDER_MODULE: fixturePath,
        AURORA_W15J_HOST_READINESS_DIR: readinessPath,
      },
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    let stdout = '';
    let stderr = '';
    let bootstrapCheck: Promise<void> = Promise.resolve();
    let bootstrapCheckStarted = false;
    child.stdout.setEncoding('utf8');
    child.stderr.setEncoding('utf8');
    child.stdout.on('data', (chunk: string) => {
      stdout += chunk;
      if (stdout.includes('\n') && !bootstrapCheckStarted) {
        bootstrapCheckStarted = true;
        const ready = JSON.parse(stdout.trim()) as Readonly<{ bootstrapReference: string }>;
        bootstrapCheck = fetch('http://127.0.0.1:8081/v1/gateway/bootstrap/exchange', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ bootstrapReference: ready.bootstrapReference }),
        })
          .then(async (response) => {
            assert.equal(response.status, 200);
            const body = (await response.json()) as Readonly<Record<string, unknown>>;
            assert.equal(body.ok, true);
          })
          .finally(() => child.kill('SIGTERM'));
      }
    });
    child.stderr.on('data', (chunk: string) => {
      stderr += chunk;
    });

    const exit = await new Promise<{ code: number | null; signal: string | null }>(
      (resolveExit, rejectExit) => {
        const timeout = setTimeout(() => {
          child.kill('SIGKILL');
          rejectExit(new Error('real W15-J launcher did not terminate'));
        }, 30_000);
        child.once('error', (error: Error) => {
          clearTimeout(timeout);
          rejectExit(error);
        });
        child.once('exit', (code: number | null, signal: string | null) => {
          clearTimeout(timeout);
          resolveExit({ code, signal });
        });
      },
    );
    await bootstrapCheck;
    const launchNotAfterMs = Date.now();

    assert.deepEqual(exit, { code: 0, signal: null });
    assert.equal(stderr, '');
    assert.equal(stdout.includes(providerOutputSentinel), false);
    assert.equal(stdout.includes(databaseSentinel), false);
    assert.equal(stdout.includes('upstream-auth:process-test-secret'), false);
    assert.equal(existsSync(staleBuildPath), false);
    const lines = stdout.trim().split('\n');
    assert.equal(lines.length, 1);
    const ready = JSON.parse(lines[0] ?? '') as Record<string, unknown>;
    assert.deepEqual(Object.keys(ready).sort(), [
      'authorizesExecution',
      'bootstrap',
      'bootstrapExpiresAtMs',
      'bootstrapReference',
      'gateway',
      'hostMode',
      'kind',
      'physicalEvidenceStatus',
      'provesExecutionSuccess',
      'retryAuthorized',
    ]);
    assert.equal(ready.physicalEvidenceStatus, 'NOT_RUN');
    assert.equal(ready.authorizesExecution, false);

    const expectedReadinessFiles = [
      'host-health-8080.txt',
      'host-health-8080.txt.exit-code',
      'host-health-8081.txt',
      'host-health-8081.txt.exit-code',
      'host-listener-8080.txt',
      'host-listener-8080.txt.exit-code',
      'host-listener-8081.txt',
      'host-listener-8081.txt.exit-code',
      'host-ready-announcement.txt',
    ];
    assert.deepEqual(readdirSync(readinessPath).sort(), expectedReadinessFiles);
    assert.equal(lstatSync(readinessPath).mode & 0o777, 0o700);
    const hostSha = spawnSync('/usr/bin/git', ['rev-parse', 'HEAD'], {
      cwd: process.cwd(),
      encoding: 'utf8',
    }).stdout.trim();
    const hostReady = exactKv(
      readFileSync(join(readinessPath, 'host-ready-announcement.txt'), 'utf8'),
    );
    assert.deepEqual(Object.keys(hostReady).sort(), [
      'bootstrap_port',
      'device_gateway_port',
      'gateway_identity',
      'gateway_version',
      'host_candidate_sha',
      'host_instance_id',
      'physical_evidence_status',
      'process_id',
      'started_at_utc',
    ]);
    assert.equal(hostReady.host_candidate_sha, hostSha);
    assert.equal(hostReady.gateway_identity, 'aurora-w15j-local-host');
    assert.equal(hostReady.gateway_version, `git:${hostSha}`);
    assert.match(hostReady.host_instance_id ?? '', /^whi_[a-f0-9]{64}$/u);
    assert.equal(stdout.includes(hostReady.host_instance_id ?? ''), false);
    assert.equal(hostReady.device_gateway_port, '8080');
    assert.equal(hostReady.bootstrap_port, '8081');
    assert.equal(hostReady.physical_evidence_status, 'NOT_RUN');
    assert.match(hostReady.started_at_utc ?? '', CANONICAL_UTC);
    const startedAtMs = Date.parse(hostReady.started_at_utc ?? '');
    assert.equal(new Date(startedAtMs).toISOString(), hostReady.started_at_utc);
    assert.equal(startedAtMs >= launchNotBeforeMs, true);
    assert.equal(startedAtMs <= launchNotAfterMs, true);
    assert.equal(Number.isSafeInteger(Number(hostReady.process_id)), true);
    assert.equal(Number(hostReady.process_id) > 0, true);
    assert.equal(Number(hostReady.process_id), child.pid);
    for (const name of expectedReadinessFiles) {
      const path = join(readinessPath, name);
      assert.equal(lstatSync(path).mode & 0o777, 0o600);
      const content = readFileSync(path, 'utf8');
      assert.equal(content.includes('gbr_'), false);
      assert.equal(content.includes(databaseSentinel), false);
      assert.equal(content.includes('upstream-auth:process-test-secret'), false);
      assert.equal(content.includes('ten_01ARZ3NDEKTSV4RRFFQ69G5FAV'), false);
      assert.equal(content.includes('gwc_'), false);
    }
    assert.match(
      readFileSync(join(readinessPath, 'host-listener-8080.txt'), 'utf8'),
      /http_status=200/u,
    );
    assert.match(
      readFileSync(join(readinessPath, 'host-health-8080.txt'), 'utf8'),
      /http_status=405/u,
    );
    const listenerProbeFiles = ['host-listener-8080.txt', 'host-listener-8081.txt'];
    for (const name of listenerProbeFiles) {
      const probe = exactKv(readFileSync(join(readinessPath, name), 'utf8'));
      assert.deepEqual(Object.keys(probe).sort(), [
        'authorizes_execution',
        'cache_control',
        'host',
        'host_instance_id',
        'http_status',
        'listener_role',
        'method',
        'observed_at_utc',
        'path',
        'physical_evidence_status',
        'port',
        'pragma',
        'probe',
        'process_id',
        'response_bytes',
        'server_result_code',
      ]);
      assert.equal(probe.observed_at_utc, hostReady.started_at_utc);
      assert.equal(probe.process_id, hostReady.process_id);
      assert.equal(probe.host, '127.0.0.1');
      assert.equal(probe.method, 'GET');
      assert.equal(probe.authorizes_execution, 'false');
      assert.equal(probe.physical_evidence_status, 'NOT_RUN');
      assert.equal(probe.probe, 'HTTP_LISTENER_INSTANCE_RESPONSE');
      assert.equal(probe.path, '/v1/local-host/instance');
      assert.equal(probe.http_status, '200');
      assert.equal(probe.server_result_code, 'LOCAL_HOST_INSTANCE');
      assert.equal(probe.cache_control, 'no-store');
      assert.equal(probe.pragma, 'no-cache');
      assert.equal(probe.host_instance_id, hostReady.host_instance_id);
      assert.equal(
        probe.listener_role,
        name.includes('8080') ? 'DEVICE_GATEWAY' : 'BOOTSTRAP_EXCHANGE',
      );
      assert.equal(Number.isSafeInteger(Number(probe.response_bytes)), true);
      assert.equal(Number(probe.response_bytes) > 0, true);
    }
    assert.match(
      readFileSync(join(readinessPath, 'host-listener-8081.txt'), 'utf8'),
      /http_status=200/u,
    );
    assert.match(
      readFileSync(join(readinessPath, 'host-health-8081.txt'), 'utf8'),
      /http_status=405/u,
    );
    for (const name of ['host-health-8080.txt', 'host-health-8081.txt']) {
      const probe = exactKv(readFileSync(join(readinessPath, name), 'utf8'));
      assert.deepEqual(Object.keys(probe).sort(), [
        'authorizes_execution',
        'host',
        'http_status',
        'method',
        'observed_at_utc',
        'path',
        'physical_evidence_status',
        'port',
        'probe',
        'process_id',
        'response_bytes',
        'server_error_code',
      ]);
      assert.equal(probe.observed_at_utc, hostReady.started_at_utc);
      assert.equal(probe.process_id, hostReady.process_id);
      assert.equal(probe.http_status, '405');
      assert.equal(probe.server_error_code, 'METHOD_NOT_ALLOWED');
    }
    for (const name of expectedReadinessFiles.filter((name) => name.endsWith('.exit-code'))) {
      assert.equal(readFileSync(join(readinessPath, name), 'utf8'), '0\n');
    }
  } finally {
    rmSync(fixtureDirectory, { recursive: true, force: true });
  }
});

test('launcher instance probe rejects cache-control or pragma header drift', async () => {
  const launcherUrl = pathToFileURL(
    join(process.cwd(), 'tools/physical/run-w15j-local-host.mjs'),
  ).href;
  const launcher = (await import(launcherUrl)) as Readonly<{
    probeW15JLocalHostHttpServer(input: Readonly<Record<string, unknown>>): Promise<unknown>;
  }>;
  const hostInstanceId = `whi_${'a'.repeat(64)}`;

  const rejectsDrift = async (cacheControl: string, pragma: string): Promise<void> => {
    const server = createServer(
      (
        _request: unknown,
        response: {
          statusCode: number;
          setHeader(name: string, value: string): void;
          end(body: string): void;
        },
      ) => {
        response.statusCode = 200;
        response.setHeader('content-type', 'application/json; charset=utf-8');
        response.setHeader('cache-control', cacheControl);
        response.setHeader('pragma', pragma);
        response.end(
          JSON.stringify({
            kind: 'LOCAL_HOST_INSTANCE',
            hostInstanceId,
            listenerRole: 'DEVICE_GATEWAY',
            authorizesExecution: false,
            provesExecutionSuccess: false,
            retryAuthorized: false,
            physicalEvidenceStatus: 'NOT_RUN',
          }),
        );
      },
    );
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    const address = server.address() as Readonly<{ port: number }>;
    try {
      await assert.rejects(
        () =>
          launcher.probeW15JLocalHostHttpServer({
            port: address.port,
            path: '/v1/local-host/instance',
            expectedStatus: 200,
            expectedHostInstanceId: hostInstanceId,
            expectedListenerRole: 'DEVICE_GATEWAY',
          }),
        /unexpected host instance probe response/u,
      );
    } finally {
      await new Promise<void>((resolve, reject) =>
        server.close((error?: Error) => (error === undefined ? resolve() : reject(error))),
      );
    }
  };

  await rejectsDrift('max-age=60', 'no-cache');
  await rejectsDrift('no-store', 'cache');
});

test('Node gate accepts only the pinned >=22.16.0 <23 range and direct mismatch fails first', async () => {
  const launcherUrl = pathToFileURL(
    join(process.cwd(), 'tools/physical/run-w15j-local-host.mjs'),
  ).href;
  const launcher = (await import(launcherUrl)) as Readonly<{
    isSupportedW15JLocalHostNodeVersion(value: unknown): boolean;
  }>;
  for (const accepted of ['22.16.0', '22.16.1', '22.99.999', '22.16.0+runtime']) {
    assert.equal(launcher.isSupportedW15JLocalHostNodeVersion(accepted), true);
  }
  for (const rejected of [
    '22.15.999',
    '21.99.0',
    '23.0.0',
    '24.19.0',
    '22.16.0-rc.1',
    'v22.16.0',
    '22.16',
    '',
    null,
  ]) {
    assert.equal(launcher.isSupportedW15JLocalHostNodeVersion(rejected), false);
  }

  if (!launcher.isSupportedW15JLocalHostNodeVersion(process.versions.node)) {
    const direct = spawnSync(process.execPath, ['tools/physical/run-w15j-local-host.mjs'], {
      cwd: process.cwd(),
      encoding: 'utf8',
    });
    assert.equal(direct.status, 1);
    assert.equal(direct.stdout, '');
    assert.equal(direct.stderr, 'W15J_LOCAL_HOST_FAILED:NODE_VERSION_UNSUPPORTED\n');
  }
});

test('Git snapshot uses fixed trusted binary and rejects tracked worktree or index changes', async () => {
  const fixtureDirectory = mkdtempSync(join(tmpdir(), 'aurora-w15j-git-snapshot-'));
  const fakeDirectory = join(fixtureDirectory, 'fake-bin');
  const fakeGit = join(fakeDirectory, 'git');
  const fakeGitSentinel = join(fixtureDirectory, 'fake-git-ran');
  const source = join(fixtureDirectory, 'tracked.txt');
  const launcherUrl = pathToFileURL(
    join(process.cwd(), 'tools/physical/run-w15j-local-host.mjs'),
  ).href;
  const launcher = (await import(launcherUrl)) as Readonly<{
    inspectW15JHostGitSnapshot(root: string): Readonly<{ head: string }>;
  }>;
  const git = (...arguments_: readonly string[]) => {
    const result = spawnSync('/usr/bin/git', arguments_, {
      cwd: fixtureDirectory,
      encoding: 'utf8',
    });
    assert.equal(result.status, 0, result.stderr);
    return result.stdout.trim();
  };

  try {
    git('init', '--quiet');
    git('config', 'user.name', 'Aurora Test');
    git('config', 'user.email', 'aurora-test.invalid@example.invalid');
    writeFileSync(source, 'clean\n', { encoding: 'utf8', mode: 0o600 });
    git('add', 'tracked.txt');
    git('commit', '--quiet', '-m', 'fixture');
    mkdirSync(fakeDirectory, { mode: 0o700 });
    writeFileSync(fakeGit, `#!/bin/sh\ntouch '${fakeGitSentinel}'\nexit 99\n`, {
      encoding: 'utf8',
      mode: 0o700,
    });
    chmodSync(fakeGit, 0o700);

    const previousPath = process.env.PATH;
    process.env.PATH = `${fakeDirectory}:${previousPath ?? ''}`;
    try {
      assert.equal(
        launcher.inspectW15JHostGitSnapshot(fixtureDirectory).head,
        git('rev-parse', 'HEAD'),
      );
    } finally {
      if (previousPath === undefined) Reflect.deleteProperty(process.env, 'PATH');
      else process.env.PATH = previousPath;
    }
    assert.equal(existsSync(fakeGitSentinel), false);

    writeFileSync(source, 'dirty worktree\n', { encoding: 'utf8', mode: 0o600 });
    assert.throws(
      () => launcher.inspectW15JHostGitSnapshot(fixtureDirectory),
      /tracked worktree is not clean/u,
    );
    git('restore', 'tracked.txt');

    writeFileSync(source, 'dirty index\n', { encoding: 'utf8', mode: 0o600 });
    git('add', 'tracked.txt');
    assert.throws(
      () => launcher.inspectW15JHostGitSnapshot(fixtureDirectory),
      /index is not clean/u,
    );
  } finally {
    rmSync(fixtureDirectory, { recursive: true, force: true });
  }
});

test('readiness path rejects unsafe targets and cleanup never removes a swapped path', () => {
  const fixtureDirectory = mkdtempSync(join(tmpdir(), 'aurora-w15j-readiness-safety-'));
  const providerPath = join(fixtureDirectory, 'provider.mjs');
  const launcherUrl = pathToFileURL(
    join(process.cwd(), 'tools/physical/run-w15j-local-host.mjs'),
  ).href;
  const childProgram = `Object.defineProperty(process.versions, 'node', { value: '22.16.0' });
const { runW15JLocalHostLauncher } = await import(${JSON.stringify(launcherUrl)});
const started = await runW15JLocalHostLauncher({ applicationArguments: [] });
if (!started) process.exitCode = 1;`;
  writeFileSync(providerPath, 'export const wrongProviderContract = true;\n', {
    encoding: 'utf8',
    mode: 0o600,
  });

  const run = (readinessPath: string) =>
    spawnSync(process.execPath, ['--input-type=module', '--eval', childProgram], {
      cwd: process.cwd(),
      env: {
        ...process.env,
        AURORA_W15J_PROVIDER_MODULE: providerPath,
        AURORA_W15J_HOST_READINESS_DIR: readinessPath,
      },
      encoding: 'utf8',
      timeout: 30_000,
    });

  try {
    const existing = join(fixtureDirectory, 'existing');
    mkdirSync(existing, { mode: 0o700 });
    const existingResult = run(existing);
    assert.equal(existingResult.status, 1);
    assert.equal(existingResult.stdout, '');
    assert.equal(existingResult.stderr, 'W15J_LOCAL_HOST_FAILED:READINESS_DIRECTORY_INVALID\n');
    assert.equal(lstatSync(existing).isDirectory(), true);

    const danglingTarget = join(fixtureDirectory, 'dangling-target');
    symlinkSync(join(fixtureDirectory, 'missing-target'), danglingTarget);
    const danglingResult = run(danglingTarget);
    assert.equal(danglingResult.status, 1);
    assert.equal(danglingResult.stdout, '');
    assert.equal(danglingResult.stderr, 'W15J_LOCAL_HOST_FAILED:READINESS_DIRECTORY_INVALID\n');
    assert.equal(lstatSync(danglingTarget).isSymbolicLink(), true);

    const realParent = join(fixtureDirectory, 'real-parent');
    const linkedParent = join(fixtureDirectory, 'linked-parent');
    mkdirSync(realParent, { mode: 0o700 });
    symlinkSync(realParent, linkedParent, 'dir');
    const linkedTarget = join(linkedParent, 'new-readiness');
    const linkedResult = run(linkedTarget);
    assert.equal(linkedResult.status, 1);
    assert.equal(linkedResult.stdout, '');
    assert.equal(linkedResult.stderr, 'W15J_LOCAL_HOST_FAILED:READINESS_DIRECTORY_INVALID\n');
    assert.equal(existsSync(linkedTarget), false);

    const writableParent = join(fixtureDirectory, 'group-writable-parent');
    mkdirSync(writableParent, { mode: 0o770 });
    chmodSync(writableParent, 0o770);
    const writableTarget = join(writableParent, 'new-readiness');
    const writableResult = run(writableTarget);
    assert.equal(writableResult.status, 1);
    assert.equal(writableResult.stdout, '');
    assert.equal(writableResult.stderr, 'W15J_LOCAL_HOST_FAILED:READINESS_DIRECTORY_INVALID\n');
    assert.equal(existsSync(writableTarget), false);

    const partial = join(fixtureDirectory, 'partial-readiness');
    const partialResult = run(partial);
    assert.equal(partialResult.status, 1);
    assert.equal(partialResult.stdout, '');
    assert.equal(partialResult.stderr, 'W15J_LOCAL_HOST_FAILED:START_REJECTED\n');
    assert.equal(existsSync(partial), false);

    const swappableParent = join(fixtureDirectory, 'swappable-parent');
    const movedParent = join(fixtureDirectory, 'swappable-parent-original');
    const swappedTarget = join(swappableParent, 'host-readiness');
    const replacementMarker = join(swappedTarget, 'replacement-must-survive');
    mkdirSync(swappableParent, { mode: 0o700 });
    const swappingProvider = join(fixtureDirectory, 'swapping-provider.mjs');
    writeFileSync(
      swappingProvider,
      `import { mkdirSync, renameSync, writeFileSync } from 'node:fs';
renameSync(${JSON.stringify(swappableParent)}, ${JSON.stringify(movedParent)});
mkdirSync(${JSON.stringify(swappableParent)}, { mode: 0o700 });
mkdirSync(${JSON.stringify(swappedTarget)}, { mode: 0o700 });
writeFileSync(${JSON.stringify(replacementMarker)}, 'survive', { mode: 0o600 });
export const wrongProviderContract = true;
`,
      { encoding: 'utf8', mode: 0o600 },
    );
    const swappedResult = spawnSync(
      process.execPath,
      ['--input-type=module', '--eval', childProgram],
      {
        cwd: process.cwd(),
        env: {
          ...process.env,
          AURORA_W15J_PROVIDER_MODULE: swappingProvider,
          AURORA_W15J_HOST_READINESS_DIR: swappedTarget,
        },
        encoding: 'utf8',
        timeout: 30_000,
      },
    );
    assert.equal(swappedResult.status, 1);
    assert.equal(swappedResult.stdout, '');
    assert.equal(swappedResult.stderr, 'W15J_LOCAL_HOST_FAILED:START_REJECTED\n');
    assert.equal(readFileSync(replacementMarker, 'utf8'), 'survive');
    assert.equal(existsSync(join(movedParent, 'host-readiness')), true);
  } finally {
    rmSync(fixtureDirectory, { recursive: true, force: true });
  }
});

test('launcher rejects identity-like argv and non-absolute provider references without stdout', () => {
  const argvSecret = 'tenant:must-not-escape';
  const withArgument = spawnSync(
    process.execPath,
    ['tools/physical/run-w15j-local-host.mjs', argvSecret],
    {
      cwd: process.cwd(),
      env: { ...process.env, AURORA_W15J_PROVIDER_MODULE: '/does/not/matter.mjs' },
      encoding: 'utf8',
    },
  );
  assert.equal(withArgument.status, 1);
  assert.equal(withArgument.stdout, '');
  const expectedFailure =
    process.versions.node.startsWith('22.') && Number(process.versions.node.split('.')[1]) >= 16
      ? 'PROVIDER_REFERENCE_INVALID'
      : 'NODE_VERSION_UNSUPPORTED';
  assert.equal(withArgument.stderr, `W15J_LOCAL_HOST_FAILED:${expectedFailure}\n`);
  assert.equal(withArgument.stderr.includes(argvSecret), false);

  const relativeReference = spawnSync(
    process.execPath,
    ['tools/physical/run-w15j-local-host.mjs'],
    {
      cwd: process.cwd(),
      env: { ...process.env, AURORA_W15J_PROVIDER_MODULE: './trusted-provider.mjs' },
      encoding: 'utf8',
    },
  );
  assert.equal(relativeReference.status, 1);
  assert.equal(relativeReference.stdout, '');
  assert.equal(relativeReference.stderr, `W15J_LOCAL_HOST_FAILED:${expectedFailure}\n`);
});
