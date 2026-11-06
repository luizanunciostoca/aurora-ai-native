import type { CommandId, ExecutionId } from '@aurora/contracts/ids';

const COMMAND_ID = /^cmd_[0-9A-HJKMNP-TV-Z]{26}$/u;
const EXECUTION_ID = /^exe_[0-9A-HJKMNP-TV-Z]{26}$/u;
const SAFE = /^[A-Za-z0-9._:/+-]{1,512}$/u;
const MAX_ENTRIES = 512;

export interface W07DeviceExecutionAuthorizationTransportView {
  readonly kind: 'W07_DEVICE_EXECUTION_AUTHORIZATION';
  readonly executionId: ExecutionId;
  readonly tenantId: string;
  readonly deviceId: string;
  readonly capabilityId: string;
  readonly targetKind: 'DEVICE';
  readonly authoritySource: 'W07_CURRENT_EXECUTION_AUTHORITY';
  readonly actionId: string;
  readonly arguments: Readonly<Record<string, string>>;
  readonly authorizedAtMs: number;
  readonly expiresAtMs: number;
  readonly authorizesExecution: true;
  readonly cancelled: false;
}

interface StoredAuthorization {
  readonly commandId: CommandId;
  readonly value: W07DeviceExecutionAuthorizationTransportView;
}

function safeText(value: unknown, max = 512): value is string {
  return typeof value === 'string' && value.length > 0 && value.length <= max && SAFE.test(value);
}

function validArguments(value: Readonly<Record<string, string>>): boolean {
  const entries = Object.entries(value);
  return (
    entries.length <= 16 &&
    entries.every(([key, item]) => safeText(key, 128) && safeText(item, 256))
  );
}

function validAuthorization(
  commandId: string,
  value: W07DeviceExecutionAuthorizationTransportView,
  nowMs: number,
): boolean {
  return (
    COMMAND_ID.test(commandId) &&
    value.kind === 'W07_DEVICE_EXECUTION_AUTHORIZATION' &&
    EXECUTION_ID.test(value.executionId) &&
    safeText(value.tenantId, 128) &&
    safeText(value.deviceId, 128) &&
    safeText(value.capabilityId, 256) &&
    value.targetKind === 'DEVICE' &&
    value.authoritySource === 'W07_CURRENT_EXECUTION_AUTHORITY' &&
    safeText(value.actionId, 256) &&
    validArguments(value.arguments) &&
    Number.isSafeInteger(value.authorizedAtMs) &&
    Number.isSafeInteger(value.expiresAtMs) &&
    value.authorizedAtMs >= 0 &&
    value.authorizedAtMs <= nowMs &&
    nowMs < value.expiresAtMs &&
    value.expiresAtMs - value.authorizedAtMs <= 30_000 &&
    value.authorizesExecution === true &&
    value.cancelled === false
  );
}

/**
 * W14 transport cache for W07-owned short-lived execution authorization.
 *
 * It cannot mint/refresh authority. Publishing requires a current W07-produced object; resolving
 * only returns the exact immutable object while all command/session bindings and expiry still hold.
 */
export class W14W07DeviceExecutionAuthorizationTransport {
  readonly #entries = new Map<CommandId, StoredAuthorization>();

  publish(input: {
    readonly commandId: string;
    readonly executionId: string;
    readonly tenantId: string;
    readonly deviceId: string;
    readonly capabilityId: string;
    readonly authorization: W07DeviceExecutionAuthorizationTransportView;
    readonly nowMs: number;
  }): boolean {
    this.#evictExpired(input.nowMs);
    const value = input.authorization;
    if (
      !validAuthorization(input.commandId, value, input.nowMs) ||
      value.executionId !== input.executionId ||
      value.tenantId !== input.tenantId ||
      value.deviceId !== input.deviceId ||
      value.capabilityId !== input.capabilityId
    ) {
      return false;
    }
    const commandId = input.commandId as CommandId;
    const existing = this.#entries.get(commandId);
    if (existing !== undefined) {
      return JSON.stringify(existing.value) === JSON.stringify(value);
    }
    if (this.#entries.size >= MAX_ENTRIES) return false;
    const frozen = Object.freeze({ ...value, arguments: Object.freeze({ ...value.arguments }) });
    this.#entries.set(commandId, Object.freeze({ commandId, value: frozen }));
    return true;
  }

  resolve(input: {
    readonly commandId: string;
    readonly executionId: string;
    readonly tenantId: string;
    readonly deviceId: string;
    readonly deviceSessionId: string;
    readonly nowMs: number;
  }): W07DeviceExecutionAuthorizationTransportView | null {
    if (!safeText(input.deviceSessionId, 256)) return null;
    this.#evictExpired(input.nowMs);
    if (!COMMAND_ID.test(input.commandId)) return null;
    const entry = this.#entries.get(input.commandId as CommandId);
    if (entry === undefined || !validAuthorization(input.commandId, entry.value, input.nowMs)) {
      return null;
    }
    const value = entry.value;
    return value.executionId === input.executionId &&
      value.tenantId === input.tenantId &&
      value.deviceId === input.deviceId
      ? value
      : null;
  }

  revoke(commandId: string): void {
    if (COMMAND_ID.test(commandId)) this.#entries.delete(commandId as CommandId);
  }

  #evictExpired(nowMs: number): void {
    if (!Number.isSafeInteger(nowMs) || nowMs < 0) {
      this.#entries.clear();
      return;
    }
    for (const [key, entry] of this.#entries) {
      if (nowMs >= entry.value.expiresAtMs) this.#entries.delete(key);
    }
  }
}
