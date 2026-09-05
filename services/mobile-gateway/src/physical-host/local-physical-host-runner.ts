// @ts-expect-error -- Aurora targets Node 22 runtime built-ins without repository-wide @types/node.
import process from 'node:process';

import type { AuthenticatedGatewayBootstrapPrincipal } from '../gateway-auth/gateway-bootstrap.js';
import {
  W15JLocalPhysicalHost,
  type W15JLocalPhysicalHostAddress,
  type W15JLocalPhysicalHostConfig,
  type W15JLocalPhysicalHostDependencies,
} from './local-physical-host.js';

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
  readonly hooks?: W15JLocalPhysicalHostRunnerHooks;
}

export interface W15JLocalPhysicalHostRunnerHandle {
  readonly address: W15JLocalPhysicalHostAddress;
  readonly bootstrapReference: string;
  readonly bootstrapExpiresAtMs: number;
  readonly physicalEvidenceStatus: 'NOT_RUN';
  readonly authorizesExecution: false;
  stop(): Promise<void>;
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

/**
 * Starts the controlled LOCAL W15-J host, stages one opaque bootstrap reference, emits only
 * allowlisted non-secret runtime metadata, and installs idempotent SIGINT/SIGTERM cleanup.
 *
 * The runner does not load policy, identity, authority or execution state itself. Those owners must
 * already be composed in `dependencies`. It never prints the staged principal, gateway credential,
 * authentication reference, policy material, verified outcome or retry permission. A successful
 * start is still software readiness only; physical DP5 remains NOT_RUN until real-device evidence.
 */
export async function startW15JLocalPhysicalHostRunner(
  input: W15JLocalPhysicalHostRunnerInput,
): Promise<W15JLocalPhysicalHostRunnerHandle> {
  const hooks = input.hooks ?? defaultHooks();
  const host = new W15JLocalPhysicalHost(input.host, input.dependencies);
  const address = await host.start();

  const staged = host.stageBootstrap(input.principal);
  if (!staged.ok) {
    await host.stop();
    throw new Error(`W15-J LOCAL bootstrap staging failed: ${staged.error.code}`);
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
    hooks.emit(
      announcement(address, staged.value.bootstrapReference, staged.value.expiresAtMs),
    );
  } catch {
    await stop();
    throw new Error('W15-J LOCAL runner initialization failed.');
  }

  return Object.freeze({
    address,
    bootstrapReference: staged.value.bootstrapReference,
    bootstrapExpiresAtMs: staged.value.expiresAtMs,
    physicalEvidenceStatus: 'NOT_RUN',
    authorizesExecution: false,
    stop,
  });
}
