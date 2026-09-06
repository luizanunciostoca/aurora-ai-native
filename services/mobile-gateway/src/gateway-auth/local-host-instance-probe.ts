// @ts-expect-error -- Aurora targets Node 22 runtime built-ins without repository-wide @types/node.
import { randomBytes } from 'node:crypto';

export const LOCAL_HOST_INSTANCE_PROBE_PATH = '/v1/local-host/instance' as const;

const HOST_INSTANCE_ID = /^whi_[a-f0-9]{64}$/u;
const RESPONSE_KEYS = new Set([
  'kind',
  'hostInstanceId',
  'listenerRole',
  'authorizesExecution',
  'provesExecutionSuccess',
  'retryAuthorized',
  'physicalEvidenceStatus',
]);

export type LocalHostInstanceListenerRole = 'DEVICE_GATEWAY' | 'BOOTSTRAP_EXCHANGE';

export interface LocalHostInstanceProbeResponse {
  readonly kind: 'LOCAL_HOST_INSTANCE';
  readonly hostInstanceId: string;
  readonly listenerRole: LocalHostInstanceListenerRole;
  readonly authorizesExecution: false;
  readonly provesExecutionSuccess: false;
  readonly retryAuthorized: false;
  readonly physicalEvidenceStatus: 'NOT_RUN';
}

export interface LocalHostInstanceProbePort {
  current(listenerRole: LocalHostInstanceListenerRole): LocalHostInstanceProbeResponse | null;
}

export function isLocalHostInstanceId(value: unknown): value is string {
  return typeof value === 'string' && HOST_INSTANCE_ID.test(value);
}

export function isLocalHostInstanceProbeResponse(
  value: unknown,
  listenerRole: LocalHostInstanceListenerRole,
): value is LocalHostInstanceProbeResponse {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return false;
  try {
    const prototype = Object.getPrototypeOf(value);
    const descriptors = Object.getOwnPropertyDescriptors(value);
    const keys = Object.keys(value);
    return (
      (prototype === Object.prototype || prototype === null) &&
      keys.length === RESPONSE_KEYS.size &&
      keys.every((key) => RESPONSE_KEYS.has(key)) &&
      Object.values(descriptors).every(
        (descriptor) => descriptor.get === undefined && descriptor.set === undefined,
      ) &&
      (value as LocalHostInstanceProbeResponse).kind === 'LOCAL_HOST_INSTANCE' &&
      isLocalHostInstanceId((value as LocalHostInstanceProbeResponse).hostInstanceId) &&
      (value as LocalHostInstanceProbeResponse).listenerRole === listenerRole &&
      (value as LocalHostInstanceProbeResponse).authorizesExecution === false &&
      (value as LocalHostInstanceProbeResponse).provesExecutionSuccess === false &&
      (value as LocalHostInstanceProbeResponse).retryAuthorized === false &&
      (value as LocalHostInstanceProbeResponse).physicalEvidenceStatus === 'NOT_RUN'
    );
  } catch {
    return false;
  }
}

/**
 * Ephemeral, process-local listener-ownership proof. It carries no identity, authority, outcome or
 * retry semantics and is deliberately unavailable outside a live start/stop interval.
 */
export class TransientLocalHostInstanceProbe implements LocalHostInstanceProbePort {
  #hostInstanceId: string | undefined;

  start(): string {
    if (this.#hostInstanceId !== undefined) {
      throw new Error('LOCAL host instance probe is already started.');
    }
    const hostInstanceId = `whi_${randomBytes(32).toString('hex')}`;
    if (!isLocalHostInstanceId(hostInstanceId)) {
      throw new Error('LOCAL host instance identifier generation failed.');
    }
    this.#hostInstanceId = hostInstanceId;
    return hostInstanceId;
  }

  stop(expectedHostInstanceId: string): void {
    if (this.#hostInstanceId !== expectedHostInstanceId) {
      throw new Error('LOCAL host instance identifier changed before stop.');
    }
    this.#hostInstanceId = undefined;
  }

  current(listenerRole: LocalHostInstanceListenerRole): LocalHostInstanceProbeResponse | null {
    const hostInstanceId = this.#hostInstanceId;
    if (hostInstanceId === undefined) return null;
    return Object.freeze({
      kind: 'LOCAL_HOST_INSTANCE',
      hostInstanceId,
      listenerRole,
      authorizesExecution: false,
      provesExecutionSuccess: false,
      retryAuthorized: false,
      physicalEvidenceStatus: 'NOT_RUN',
    });
  }
}
