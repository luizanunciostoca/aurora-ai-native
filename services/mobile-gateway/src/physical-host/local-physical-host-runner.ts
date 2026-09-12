// @ts-expect-error -- Aurora targets Node 22 runtime built-ins without repository-wide @types/node.
import * as nodeFs from 'node:fs';
// @ts-expect-error -- Aurora targets Node 22 runtime built-ins without repository-wide @types/node.
import * as nodePath from 'node:path';
// @ts-expect-error -- Aurora targets Node 22 runtime built-ins without repository-wide @types/node.
import process from 'node:process';

import type { AuthenticatedGatewayBootstrapPrincipal } from '../gateway-auth/gateway-bootstrap.js';
import {
  W15JLocalPhysicalHost,
  type W15JLocalPhysicalHostAddress,
  type W15JLocalPhysicalHostConfig,
  type W15JLocalPhysicalHostDependencies,
} from './local-physical-host.js';
import type { W15JPhysicalExecutionStateSeed } from './w03-physical-execution-state-stage.js';

const BOOTSTRAP_REFRESH_FILE_ENV = 'AURORA_W15J_BOOTSTRAP_REFRESH_FILE';
const BOOTSTRAP_REFRESH_SIGNAL = 'SIGUSR2';
const HOST_INSTANCE_ID = /^whi_[a-f0-9]{64}$/u;

export type W15JLocalPhysicalHostSignal = 'SIGINT' | 'SIGTERM';

export interface W15JLocalPhysicalHostRunnerAnnouncement {
  readonly kind: 'W15J_LOCAL_PHYSICAL_HOST_READY';
  readonly bootstrapReference: string;
  readonly bootstrapExpiresAtMs: number;
  readonly gateway: Readonly<{
    protocol: 'http';
    host: string;
    port: number;
  }>;
  readonly bootstrap: Readonly<{
    protocol: 'http';
    host: string;
    port: number;
    path: string;
  }>;
  readonly hostMode: 'LOOPBACK_ONLY';
  readonly physicalEvidenceStatus: 'NOT_RUN';
  readonly authorizesExecution: false;
  readonly provesExecutionSuccess: false;
  readonly retryAuthorized: false;
}

export interface W15JLocalPhysicalHostBootstrapReference {
  readonly bootstrapReference: string;
  readonly bootstrapExpiresAtMs: number;
  readonly authorizesExecution: false;
  readonly provesExecutionSuccess: false;
  readonly retryAuthorized: false;
}

export interface W15JLocalPhysicalHostRunnerHooks {
  readonly emit: (announcement: W15JLocalPhysicalHostRunnerAnnouncement) => void;
  readonly registerSignal: (
    signal: W15JLocalPhysicalHostSignal,
    listener: () => void,
  ) => () => void;
  readonly cleanupFailed?: () => void;
}

export interface W15JLocalPhysicalHostRunnerInput {
  readonly host: W15JLocalPhysicalHostConfig;
  readonly dependencies: W15JLocalPhysicalHostDependencies;
  /** Already-authenticated server-side W14 bootstrap principal; never supplied by Android. */
  readonly principal: AuthenticatedGatewayBootstrapPrincipal;
  /** Optional server-side DP5 seed written through the existing W03 physical stager. */
  readonly executionStateSeed?: W15JPhysicalExecutionStateSeed;
  readonly hooks?: W15JLocalPhysicalHostRunnerHooks;
}

export interface W15JLocalPhysicalHostRunnerHandle {
  readonly address: W15JLocalPhysicalHostAddress;
  /** Ephemeral non-secret ownership proof shared by both loopback listeners. */
  readonly hostInstanceId: string;
  readonly bootstrapReference: string;
  readonly bootstrapExpiresAtMs: number;
  readonly physicalEvidenceStatus: 'NOT_RUN';
  readonly authorizesExecution: false;
  /**
   * Canonical runners expose this recovery control. It remains optional on the structural handle so
   * injected test runners and non-physical harnesses do not accidentally gain a required
   * authority-like capability merely by satisfying this interface. The physical runner itself
   * always supplies the function.
   */
  readonly refreshBootstrapReference?: () => W15JLocalPhysicalHostBootstrapReference;
  stop(): Promise<void>;
}

interface BootstrapRefreshOutputTarget {
  readonly path: string;
  readonly parentPath: string;
  readonly parentDev: number;
  readonly parentIno: number;
  readonly uid: number;
}

function defaultHooks(): W15JLocalPhysicalHostRunnerHooks {
  return {
    emit: (announcement) => {
      process.stdout.write(`${JSON.stringify(announcement)}\n`);
    },
    registerSignal: (signal, listener) => {
      process.once(signal, listener);
      return () => process.off(signal, listener);
    },
    cleanupFailed: () => {
      process.exitCode = 1;
    },
  };
}

function announcement(
  address: W15JLocalPhysicalHostAddress,
  bootstrapReference: string,
  bootstrapExpiresAtMs: number,
): W15JLocalPhysicalHostRunnerAnnouncement {
  return Object.freeze({
    kind: 'W15J_LOCAL_PHYSICAL_HOST_READY',
    bootstrapReference,
    bootstrapExpiresAtMs,
    gateway: Object.freeze({
      protocol: address.gateway.protocol,
      host: address.gateway.host,
      port: address.gateway.port,
    }),
    bootstrap: Object.freeze({
      protocol: address.bootstrap.protocol,
      host: address.bootstrap.host,
      port: address.bootstrap.port,
      path: address.bootstrap.path,
    }),
    hostMode: 'LOOPBACK_ONLY',
    physicalEvidenceStatus: 'NOT_RUN',
    authorizesExecution: false,
    provesExecutionSuccess: false,
    retryAuthorized: false,
  });
}

function bootstrapRefreshOutputTarget(reference: unknown): BootstrapRefreshOutputTarget | null {
  if (
    typeof reference !== 'string' ||
    reference.length === 0 ||
    reference.length > 4096 ||
    !nodePath.isAbsolute(reference) ||
    nodePath.resolve(reference) !== reference ||
    typeof process.getuid !== 'function'
  ) {
    return null;
  }
  try {
    const uid = process.getuid();
    const parentPath = nodePath.dirname(reference);
    const parent = nodeFs.lstatSync(parentPath);
    if (
      parent.isSymbolicLink() ||
      !parent.isDirectory() ||
      parent.uid !== uid ||
      (parent.mode & 0o022) !== 0 ||
      nodeFs.realpathSync(parentPath) !== parentPath
    ) {
      return null;
    }
    try {
      const existing = nodeFs.lstatSync(reference);
      if (
        existing.isSymbolicLink() ||
        !existing.isFile() ||
        existing.uid !== uid ||
        (existing.mode & 0o777) !== 0o600 ||
        nodePath.dirname(nodeFs.realpathSync(reference)) !== parentPath
      ) {
        return null;
      }
    } catch (error) {
      if ((error as { code?: string }).code !== 'ENOENT') return null;
    }
    return Object.freeze({
      path: reference,
      parentPath,
      parentDev: parent.dev,
      parentIno: parent.ino,
      uid,
    });
  } catch {
    return null;
  }
}

function refreshOutputTargetStillSafe(target: BootstrapRefreshOutputTarget): boolean {
  try {
    const parent = nodeFs.lstatSync(target.parentPath);
    return (
      !parent.isSymbolicLink() &&
      parent.isDirectory() &&
      parent.uid === target.uid &&
      parent.dev === target.parentDev &&
      parent.ino === target.parentIno &&
      (parent.mode & 0o022) === 0 &&
      nodeFs.realpathSync(target.parentPath) === target.parentPath
    );
  } catch {
    return false;
  }
}

function writeBootstrapRefreshOutput(
  target: BootstrapRefreshOutputTarget,
  hostInstanceId: string,
  refreshed: W15JLocalPhysicalHostBootstrapReference,
): void {
  if (!refreshOutputTargetStillSafe(target) || !HOST_INSTANCE_ID.test(hostInstanceId)) {
    throw new Error('bootstrap refresh output target is unsafe');
  }
  const record = JSON.stringify({
    kind: 'W15J_LOCAL_BOOTSTRAP_REFRESH_READY',
    hostInstanceId,
    bootstrapReference: refreshed.bootstrapReference,
    bootstrapExpiresAtMs: refreshed.bootstrapExpiresAtMs,
    physicalEvidenceStatus: 'NOT_RUN',
    authorizesExecution: false,
    provesExecutionSuccess: false,
    retryAuthorized: false,
  });
  const temporary = `${target.path}.tmp-${process.pid}`;
  let descriptor: number | undefined;
  try {
    nodeFs.rmSync(temporary, { force: true });
    descriptor = nodeFs.openSync(
      temporary,
      nodeFs.constants.O_WRONLY |
        nodeFs.constants.O_CREAT |
        nodeFs.constants.O_EXCL |
        nodeFs.constants.O_NOFOLLOW,
      0o600,
    );
    nodeFs.writeSync(descriptor, `${record}\n`, undefined, 'utf8');
    nodeFs.fsyncSync(descriptor);
    nodeFs.closeSync(descriptor);
    descriptor = undefined;
    if (!refreshOutputTargetStillSafe(target)) {
      throw new Error('bootstrap refresh output parent changed');
    }
    nodeFs.renameSync(temporary, target.path);
    const written = nodeFs.lstatSync(target.path);
    if (
      written.isSymbolicLink() ||
      !written.isFile() ||
      written.uid !== target.uid ||
      (written.mode & 0o777) !== 0o600 ||
      nodePath.dirname(nodeFs.realpathSync(target.path)) !== target.parentPath
    ) {
      throw new Error('bootstrap refresh output verification failed');
    }
  } finally {
    if (descriptor !== undefined) nodeFs.closeSync(descriptor);
    nodeFs.rmSync(temporary, { force: true });
  }
}

/**
 * Starts the controlled LOCAL W15-J host, optionally stages one server-owned W03 execution-state
 * fixture through the existing W03 stager, stages one opaque bootstrap reference, emits only
 * allowlisted non-secret runtime metadata, and installs idempotent SIGINT/SIGTERM cleanup.
 *
 * When the trusted operator supplies AURORA_W15J_BOOTSTRAP_REFRESH_FILE, SIGUSR2 becomes a local
 * recovery control that stages a new one-shot bootstrap reference for the same authenticated
 * principal and same host instance. The refreshed reference is written only to that protected
 * operator file. It never grants policy authority, execution authority, retry permission or DP5
 * acceptance, and it cannot widen the authenticated principal's lifetime.
 */
export async function startW15JLocalPhysicalHostRunner(
  input: W15JLocalPhysicalHostRunnerInput,
): Promise<W15JLocalPhysicalHostRunnerHandle> {
  const hooks = input.hooks ?? defaultHooks();
  const host = new W15JLocalPhysicalHost(input.host, input.dependencies);

  if (input.executionStateSeed !== undefined) {
    const seeded = host.stageExecutionState(input.executionStateSeed);
    if (!seeded.ok) {
      throw new Error(`W15-J LOCAL W03 state staging failed: ${seeded.code}`);
    }
  }

  const address = await host.start();

  const staged = host.stageBootstrap(input.principal);
  if (!staged.ok) {
    await host.stop();
    throw new Error(`W15-J LOCAL bootstrap staging failed: ${staged.error.code}`);
  }

  const refreshBootstrapReference = (): W15JLocalPhysicalHostBootstrapReference => {
    const refreshed = host.stageBootstrap(input.principal);
    if (!refreshed.ok) {
      throw new Error(`W15-J LOCAL bootstrap refresh failed: ${refreshed.error.code}`);
    }
    return Object.freeze({
      bootstrapReference: refreshed.value.bootstrapReference,
      bootstrapExpiresAtMs: refreshed.value.expiresAtMs,
      authorizesExecution: false,
      provesExecutionSuccess: false,
      retryAuthorized: false,
    });
  };

  const refreshOutputReference = process.env[BOOTSTRAP_REFRESH_FILE_ENV];
  const refreshOutput =
    refreshOutputReference === undefined
      ? null
      : bootstrapRefreshOutputTarget(refreshOutputReference);
  if (refreshOutputReference !== undefined && refreshOutput === null) {
    await host.stop();
    throw new Error('W15-J LOCAL bootstrap refresh output is invalid.');
  }

  const removers: Array<() => void> = [];
  let stopPromise: Promise<void> | undefined;
  const stop = (): Promise<void> => {
    stopPromise ??= (async () => {
      for (const remove of removers.splice(0)) {
        try {
          remove();
        } catch {
          // Signal-listener cleanup is best-effort; host shutdown still runs.
        }
      }
      await host.stop();
    })();
    return stopPromise;
  };
  const onSignal = (): void => {
    void stop().catch(() => hooks.cleanupFailed?.());
  };

  try {
    removers.push(hooks.registerSignal('SIGINT', onSignal));
    removers.push(hooks.registerSignal('SIGTERM', onSignal));
    if (refreshOutput !== null) {
      const onRefreshSignal = (): void => {
        try {
          if (!refreshOutputTargetStillSafe(refreshOutput)) return;
          const refreshed = refreshBootstrapReference();
          writeBootstrapRefreshOutput(refreshOutput, address.hostInstanceId, refreshed);
        } catch {
          // Recovery is fail-closed. The live host/session boundary remains unchanged and the
          // operator receives no replacement reference when refresh cannot be proven safe.
        }
      };
      process.on(BOOTSTRAP_REFRESH_SIGNAL, onRefreshSignal);
      removers.push(() => process.off(BOOTSTRAP_REFRESH_SIGNAL, onRefreshSignal));
    }
    hooks.emit(announcement(address, staged.value.bootstrapReference, staged.value.expiresAtMs));
  } catch {
    await stop();
    throw new Error('W15-J LOCAL runner initialization failed.');
  }

  return Object.freeze({
    address,
    hostInstanceId: address.hostInstanceId,
    bootstrapReference: staged.value.bootstrapReference,
    bootstrapExpiresAtMs: staged.value.expiresAtMs,
    physicalEvidenceStatus: 'NOT_RUN',
    authorizesExecution: false,
    refreshBootstrapReference,
    stop,
  });
}
