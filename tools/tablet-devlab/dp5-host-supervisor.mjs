import { Buffer } from 'node:buffer';
import { createRequire } from 'node:module';
import { createServer } from 'node:net';
import { chmodSync, existsSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

import { executionStateCompatible } from './dp5-w03-state-compat.mjs';

const require = createRequire(import.meta.url);
const DEVLAB = process.env.AURORA_DEVLAB_ROOT ?? join(homedir(), 'aurora-devlab');
const HOST = join(DEVLAB, 'worktrees', 'host');
const STATE = join(DEVLAB, 'state');
const MATERIAL = join(DEVLAB, 'config', 'w15j-dp5-material.json');
export const DEFAULT_SOCKET = join(STATE, 'dp5-host-supervisor.sock');
const STATUS_FILE = join(STATE, 'dp5-host-supervisor.json');
const MAX_REQUEST_BYTES = 256 * 1024;

function readEnvValue(path, key) {
  const line = readFileSync(path, 'utf8')
    .split(/\r?\n/u)
    .find((item) => item.startsWith(`${key}=`));
  if (!line) throw new Error(`${key} missing from ${path}`);
  return line.slice(key.length + 1);
}

function hostHead() {
  const { execFileSync } = require('node:child_process');
  return execFileSync('git', ['-C', HOST, 'rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();
}

function safeStatus(active, hostSha) {
  return Object.freeze({
    kind: 'DP5_HOST_SUPERVISOR_STATUS',
    hostSha,
    active: active !== null,
    hostInstanceId: active?.hostInstanceId ?? null,
    materialGeneratedAt: active?.material.generatedAt ?? null,
    authorizesExecution: false,
    provesExecutionSuccess: false,
    retryAuthorized: false,
  });
}

function writeStatus(active, hostSha) {
  writeFileSync(STATUS_FILE, `${JSON.stringify(safeStatus(active, hostSha), null, 2)}\n`, {
    mode: 0o600,
  });
  chmodSync(STATUS_FILE, 0o600);
}

export function validateDispatchMaterial(request, material) {
  const command = request?.command;
  const context = request?.context;
  return (
    command !== null &&
    typeof command === 'object' &&
    command.commandId === material.commandId &&
    command.executionId === material.executionId &&
    command.actionIntent?.actionIntentId === material.actionIntentId &&
    command.authorizesExecution === false &&
    context !== null &&
    typeof context === 'object' &&
    context.tenantId === material.tenantId &&
    context.deviceId === material.deviceId &&
    context.deviceSessionId === material.deviceSessionId
  );
}

export function validateSupervisorRequest(value) {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return false;
  const keys = Object.keys(value);
  if (value.op === 'STATUS' || value.op === 'REFRESH' || value.op === 'STOP') {
    return keys.length === 1;
  }
  if (value.op === 'DISPATCH') {
    return keys.length === 2 && keys.includes('request') && value.request !== null;
  }
  return false;
}

async function prepareRuntimeInput(databaseUrl) {
  const provider = await import(
    pathToFileURL(join(HOST, 'tools/physical/w15j-local-dp5-provider-runtime.mjs')).href
  );
  const input = await provider.createW15JLocalDp5OperatorInput({
    databaseUrl,
    materialPath: MATERIAL,
  });
  const material = provider.loadAndValidateW15JDp5Material(MATERIAL);
  return { input, material };
}

async function buildRuntime(continuity, databaseUrl, preparedInput = null) {
  const { input, material } = preparedInput ?? (await prepareRuntimeInput(databaseUrl));

  const { W15JLocalPhysicalHost } = require(
    join(HOST, 'services/mobile-gateway/dist/physical-host/local-physical-host.js'),
  );
  const { PsqlW03SyncExecutor } = require(
    join(HOST, 'services/mobile-gateway/dist/physical-host/w03-postgres-reservations.js'),
  );
  const { W03PostgresExecutionAttemptQuotaSource } = require(
    join(HOST, 'services/mobile-gateway/dist/physical-host/w03-attempt-quota-source.js'),
  );
  const { W03PostgresCurrentContainmentStateSource } = require(
    join(HOST, 'services/mobile-gateway/dist/physical-host/w03-containment-state.js'),
  );

  const sql = new PsqlW03SyncExecutor({ databaseUrl });
  const attemptSource = new W03PostgresExecutionAttemptQuotaSource(sql);
  const containmentSource = new W03PostgresCurrentContainmentStateSource(sql);

  const host = new W15JLocalPhysicalHost(
    {
      databaseUrl,
      gatewayPort: 8080,
      bootstrapPort: 8081,
      bootstrapCredentialTtlMs: 10 * 60_000,
      bootstrapMaxPrincipalAgeMs: 10 * 60_000,
      w14Continuity: continuity,
    },
    input.dependencies,
  );

  for (const seed of input.executionStateSeed) {
    const staged = host.stageExecutionState(seed);
    if (staged.ok) continue;
    if (staged.code !== 'ATTEMPT_ALREADY_EXISTS') {
      throw new Error(`W03 stage failed: ${staged.code}`);
    }
    const attempt = attemptSource.lookup({
      tenantId: seed.tenantId,
      actionIntentId: seed.actionIntentId,
      executionRef: seed.executionRef,
    });
    const containment = containmentSource.resolveCurrent({
      tenantId: seed.tenantId,
      circuitKey: seed.circuitKey,
      evaluatedAt: new Date().toISOString(),
    });
    if (!executionStateCompatible(seed, attempt, containment)) {
      throw new Error('existing W03 state is incompatible');
    }
  }

  const address = await host.start();
  const bootstrap = host.stageBootstrap(input.principal);
  if (!bootstrap.ok) {
    await host.stop();
    throw new Error(`bootstrap stage failed: ${bootstrap.error?.code ?? 'unknown'}`);
  }

  return {
    host,
    hostInstanceId: address.hostInstanceId,
    bootstrapReference: bootstrap.value.bootstrapReference,
    material,
  };
}

async function stopActive(active) {
  if (active === null) return;
  await active.host.stop();
}

export async function startSupervisor(socketPath = DEFAULT_SOCKET) {
  const hostSha = hostHead();
  const hostModule = require(
    join(HOST, 'services/mobile-gateway/dist/physical-host/local-physical-host.js'),
  );
  if (typeof hostModule.createW15JLocalPhysicalHostW14Continuity !== 'function') {
    throw new Error('Host candidate does not expose W14 continuity');
  }
  const continuity = hostModule.createW15JLocalPhysicalHostW14Continuity();
  const databaseUrl = readEnvValue(join(STATE, 'postgres.env'), 'AURORA_W15J_DATABASE_URL');
  let active = null;
  let closing = false;

  if (existsSync(socketPath)) rmSync(socketPath, { force: true });
  writeStatus(active, hostSha);

  const handleRequest = async (input) => {
    if (!validateSupervisorRequest(input)) {
      return { ok: false, code: 'REQUEST_REJECTED', authorizesExecution: false };
    }
    if (input.op === 'STATUS') return { ok: true, value: safeStatus(active, hostSha) };
    if (input.op === 'REFRESH') {
      // Validate provider/material bindings before disrupting the currently active Host.
      // A stale or malformed candidate must fail closed while preserving the known-good runtime.
      const preparedInput = await prepareRuntimeInput(databaseUrl);
      await stopActive(active);
      active = null;
      writeStatus(active, hostSha);
      active = await buildRuntime(continuity, databaseUrl, preparedInput);
      writeStatus(active, hostSha);
      return {
        ok: true,
        value: {
          kind: 'DP5_HOST_REFRESH_READY',
          hostSha,
          hostInstanceId: active.hostInstanceId,
          bootstrapReference: active.bootstrapReference,
          materialGeneratedAt: active.material.generatedAt,
          authorizesExecution: false,
          retryAuthorized: false,
        },
      };
    }

    if (input.op === 'DISPATCH') {
      if (active === null) {
        return { ok: false, code: 'HOST_NOT_ACTIVE', authorizesExecution: false };
      }
      if (!validateDispatchMaterial(input.request, active.material)) {
        return { ok: false, code: 'DISPATCH_BINDING_REJECTED', authorizesExecution: false };
      }
      const value = active.host.governedDeviceDispatch.dispatch(input.request);
      return { ok: true, value };
    }
    if (input.op === 'STOP') {
      await stopActive(active);
      active = null;
      writeStatus(active, hostSha);
      closing = true;
      return {
        ok: true,
        value: {
          stopped: true,
          authorizesExecution: false,
          provesExecutionSuccess: false,
          retryAuthorized: false,
        },
      };
    }
    return { ok: false, code: 'REQUEST_REJECTED', authorizesExecution: false };
  };

  const server = createServer({ allowHalfOpen: true }, (socket) => {
    socket.setEncoding('utf8');
    socket.on('error', (error) => {
      if (!closing) {
        console.error(
          `DP5_HOST_SUPERVISOR_SOCKET_ERROR=${error instanceof Error ? error.message : String(error)}`,
        );
      }
    });
    let data = '';
    socket.on('data', (chunk) => {
      data += chunk;
      if (Buffer.byteLength(data, 'utf8') > MAX_REQUEST_BYTES) socket.destroy();
    });
    socket.on('end', async () => {
      let response;
      try {
        const input = JSON.parse(data);
        response = await handleRequest(input);
      } catch (error) {
        response = {
          ok: false,
          code: 'SUPERVISOR_ERROR',
          message: error instanceof Error ? error.message : 'unknown',
          authorizesExecution: false,
        };
      }
      socket.end(`${JSON.stringify(response)}\n`);
      if (closing) {
        server.close();
      }
    });
  });

  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(socketPath, () => {
      server.off('error', reject);
      resolve();
    });
  });
  chmodSync(socketPath, 0o600);

  const shutdown = async () => {
    if (closing) return;
    closing = true;
    try {
      await stopActive(active);
      active = null;
      writeStatus(active, hostSha);
    } finally {
      server.close();
    }
  };
  process.once('SIGTERM', () => void shutdown());
  process.once('SIGINT', () => void shutdown());

  return {
    socketPath,
    hostSha,
    stop: shutdown,
  };
}

const invoked = process.argv[1] ? pathToFileURL(process.argv[1]).href : '';
if (import.meta.url === invoked) {
  startSupervisor()
    .then(({ socketPath, hostSha }) => {
      console.log('DP5_HOST_SUPERVISOR=READY_NOT_AUTHORITY');
      console.log(`host_sha=${hostSha}`);
      console.log(`socket=${socketPath}`);
    })
    .catch((error) => {
      console.error(
        `DP5_HOST_SUPERVISOR_ERROR=${error instanceof Error ? error.message : String(error)}`,
      );
      process.exitCode = 2;
    });
}
