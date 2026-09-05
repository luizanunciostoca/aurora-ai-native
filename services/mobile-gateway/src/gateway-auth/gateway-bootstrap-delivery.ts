// @ts-expect-error -- Aurora targets Node 22 built-ins without repository-wide @types/node.
import { randomBytes } from 'node:crypto';

import type { GatewayActorBinding } from './types.js';
import {
  TransientGatewayBootstrapBroker,
  type AuthenticatedGatewayBootstrapPrincipal,
  type GatewayBootstrapGrant,
} from './gateway-bootstrap.js';

const ACTOR_KINDS = new Set<GatewayActorBinding['kind']>(['HUMAN', 'AGENT', 'SERVICE', 'SYSTEM']);
const SAFE_TOKEN = /^[A-Za-z0-9._:/+-]+$/u;
const DEVICE_ID = /^dvc_[0-9A-HJKMNP-TV-Z]{26}$/u;
const BOOTSTRAP_REFERENCE = /^gbr_[A-Za-z0-9_-]{43,128}$/u;
const DEFAULT_REFERENCE_TTL_MS = 2 * 60_000;
const DEFAULT_MAX_PENDING_REFERENCES = 256;
const MAX_GENERATION_ATTEMPTS = 4;

export interface GatewayBootstrapDeliveryConfig {
  readonly referenceTtlMs: number;
  readonly maxPendingReferences: number;
}

export interface GatewayBootstrapReferenceEntropy {
  reference(): string;
}

export interface GatewayBootstrapReferenceGrant {
  readonly bootstrapReference: string;
  readonly expiresAtMs: number;
  readonly authorizesExecution: false;
  readonly provesExecutionSuccess: false;
  readonly retryAuthorized: false;
}

export type GatewayBootstrapStageErrorCode =
  'PRINCIPAL_INVALID' | 'PRINCIPAL_EXPIRED' | 'CAPACITY_EXHAUSTED' | 'ENTROPY_FAILURE';

export type GatewayBootstrapExchangeErrorCode =
  'REFERENCE_INVALID' | 'REFERENCE_UNKNOWN' | 'REFERENCE_EXPIRED' | 'GRANT_REJECTED';

export type GatewayBootstrapStageResult =
  | Readonly<{ ok: true; value: GatewayBootstrapReferenceGrant }>
  | Readonly<{
      ok: false;
      error: Readonly<{ code: GatewayBootstrapStageErrorCode; retryable: false }>;
      authorizesExecution: false;
      provesExecutionSuccess: false;
      retryAuthorized: false;
    }>;

export type GatewayBootstrapExchangeResult =
  | Readonly<{ ok: true; value: GatewayBootstrapGrant }>
  | Readonly<{
      ok: false;
      error: Readonly<{ code: GatewayBootstrapExchangeErrorCode; retryable: false }>;
      authorizesExecution: false;
      provesExecutionSuccess: false;
      retryAuthorized: false;
    }>;

interface PendingReferenceRecord {
  readonly reference: string;
  readonly principal: AuthenticatedGatewayBootstrapPrincipal;
  readonly issuedAtMs: number;
  readonly expiresAtMs: number;
}

function defaultEntropy(): GatewayBootstrapReferenceEntropy {
  return { reference: () => `gbr_${randomBytes(32).toString('base64url')}` };
}

function positiveInteger(value: unknown): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value > 0;
}

function nonNegativeInteger(value: unknown): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0;
}

function isPlainDataRecord(value: unknown): value is Record<string, unknown> {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return false;
  try {
    const prototype = Object.getPrototypeOf(value);
    if (prototype !== Object.prototype && prototype !== null) return false;
    return Object.values(Object.getOwnPropertyDescriptors(value)).every(
      (descriptor) => descriptor.get === undefined && descriptor.set === undefined,
    );
  } catch {
    return false;
  }
}

function hasOnlyKeys(record: Record<string, unknown>, keys: readonly string[]): boolean {
  const allowed = new Set(keys);
  return Object.keys(record).every((key) => allowed.has(key));
}

function safeToken(value: unknown, maxLength = 256): value is string {
  return (
    typeof value === 'string' &&
    value.length > 0 &&
    value.length <= maxLength &&
    SAFE_TOKEN.test(value)
  );
}

function clonePrincipal(value: unknown): AuthenticatedGatewayBootstrapPrincipal | null {
  if (
    !isPlainDataRecord(value) ||
    !hasOnlyKeys(value, [
      'tenantId',
      'actor',
      'correlationId',
      'deviceId',
      'deviceSessionId',
      'authenticatedAtMs',
      'authenticationExpiresAtMs',
      'authenticationReference',
      'authorizesExecution',
      'canGrantPermission',
    ]) ||
    !isPlainDataRecord(value.actor) ||
    !hasOnlyKeys(value.actor, ['kind', 'identityId']) ||
    !safeToken(value.tenantId, 128) ||
    typeof value.actor.kind !== 'string' ||
    !ACTOR_KINDS.has(value.actor.kind as GatewayActorBinding['kind']) ||
    !safeToken(value.actor.identityId, 128) ||
    !safeToken(value.correlationId, 128) ||
    typeof value.deviceId !== 'string' ||
    !DEVICE_ID.test(value.deviceId) ||
    !safeToken(value.deviceSessionId, 128) ||
    !nonNegativeInteger(value.authenticatedAtMs) ||
    !nonNegativeInteger(value.authenticationExpiresAtMs) ||
    !safeToken(value.authenticationReference, 256) ||
    value.authorizesExecution !== false ||
    value.canGrantPermission !== false
  ) {
    return null;
  }
  return {
    tenantId: value.tenantId as AuthenticatedGatewayBootstrapPrincipal['tenantId'],
    actor: {
      kind: value.actor.kind as GatewayActorBinding['kind'],
      identityId: value.actor.identityId as GatewayActorBinding['identityId'],
    },
    correlationId: value.correlationId as AuthenticatedGatewayBootstrapPrincipal['correlationId'],
    deviceId: value.deviceId,
    deviceSessionId: value.deviceSessionId,
    authenticatedAtMs: value.authenticatedAtMs,
    authenticationExpiresAtMs: value.authenticationExpiresAtMs,
    authenticationReference: value.authenticationReference,
    authorizesExecution: false,
    canGrantPermission: false,
  };
}

function stageRejected(code: GatewayBootstrapStageErrorCode): GatewayBootstrapStageResult {
  return {
    ok: false,
    error: { code, retryable: false },
    authorizesExecution: false,
    provesExecutionSuccess: false,
    retryAuthorized: false,
  };
}

function exchangeRejected(code: GatewayBootstrapExchangeErrorCode): GatewayBootstrapExchangeResult {
  return {
    ok: false,
    error: { code, retryable: false },
    authorizesExecution: false,
    provesExecutionSuccess: false,
    retryAuthorized: false,
  };
}

/**
 * Pre-session delivery boundary for physical Android bootstrap.
 *
 * Trusted server code stages an already-authenticated principal and receives only an opaque,
 * short-lived reference. Android may exchange that reference exactly once. The exchange request
 * carries no tenant, actor, device-trust, policy, outcome or retry claims; all such transport
 * bindings originate from the staged server-side principal and the accepted W14 broker.
 */
export class GatewayBootstrapDeliveryBroker {
  readonly #issuer: TransientGatewayBootstrapBroker;
  readonly #config: GatewayBootstrapDeliveryConfig;
  readonly #entropy: GatewayBootstrapReferenceEntropy;
  readonly #pending = new Map<string, PendingReferenceRecord>();

  constructor(
    issuer: TransientGatewayBootstrapBroker,
    config: Partial<GatewayBootstrapDeliveryConfig> = {},
    entropy: GatewayBootstrapReferenceEntropy = defaultEntropy(),
  ) {
    this.#issuer = issuer;
    this.#config = {
      referenceTtlMs: config.referenceTtlMs ?? DEFAULT_REFERENCE_TTL_MS,
      maxPendingReferences: config.maxPendingReferences ?? DEFAULT_MAX_PENDING_REFERENCES,
    };
    this.#entropy = entropy;
    if (
      !positiveInteger(this.#config.referenceTtlMs) ||
      !positiveInteger(this.#config.maxPendingReferences) ||
      this.#config.referenceTtlMs > 10 * 60_000 ||
      this.#config.maxPendingReferences > 4096
    ) {
      throw new Error('Gateway bootstrap delivery limits are invalid.');
    }
  }

  stage(principalInput: unknown, nowMs: number): GatewayBootstrapStageResult {
    const principal = clonePrincipal(principalInput);
    if (principal === null || !nonNegativeInteger(nowMs) || principal.authenticatedAtMs > nowMs) {
      return stageRejected('PRINCIPAL_INVALID');
    }
    if (
      principal.authenticationExpiresAtMs <= principal.authenticatedAtMs ||
      nowMs >= principal.authenticationExpiresAtMs
    ) {
      return stageRejected('PRINCIPAL_EXPIRED');
    }

    this.#purgeExpired(nowMs);
    if (this.#pending.size >= this.#config.maxPendingReferences) {
      return stageRejected('CAPACITY_EXHAUSTED');
    }
    const reference = this.#generateUniqueReference();
    if (reference === null) return stageRejected('ENTROPY_FAILURE');
    const expiresAtMs = Math.min(
      principal.authenticationExpiresAtMs,
      nowMs + this.#config.referenceTtlMs,
    );
    this.#pending.set(reference, { reference, principal, issuedAtMs: nowMs, expiresAtMs });
    return {
      ok: true,
      value: {
        bootstrapReference: reference,
        expiresAtMs,
        authorizesExecution: false,
        provesExecutionSuccess: false,
        retryAuthorized: false,
      },
    };
  }

  exchange(reference: unknown, nowMs: number): GatewayBootstrapExchangeResult {
    if (
      typeof reference !== 'string' ||
      !BOOTSTRAP_REFERENCE.test(reference) ||
      !nonNegativeInteger(nowMs)
    ) {
      return exchangeRejected('REFERENCE_INVALID');
    }
    const record = this.#pending.get(reference);
    if (record === undefined) return exchangeRejected('REFERENCE_UNKNOWN');

    // Consume before time/issuer evaluation. Network ambiguity can therefore never authorize replay.
    this.#pending.delete(reference);
    if (nowMs < record.issuedAtMs || nowMs >= record.expiresAtMs) {
      return exchangeRejected('REFERENCE_EXPIRED');
    }
    const issued = this.#issuer.issue(record.principal, nowMs);
    return issued.ok ? { ok: true, value: issued.value } : exchangeRejected('GRANT_REJECTED');
  }

  revoke(reference: unknown): boolean {
    return typeof reference === 'string' && BOOTSTRAP_REFERENCE.test(reference)
      ? this.#pending.delete(reference)
      : false;
  }

  #purgeExpired(nowMs: number): void {
    for (const [reference, record] of this.#pending) {
      if (nowMs < record.expiresAtMs) continue;
      this.#pending.delete(reference);
    }
  }

  #generateUniqueReference(): string | null {
    for (let attempt = 0; attempt < MAX_GENERATION_ATTEMPTS; attempt += 1) {
      const reference = this.#entropy.reference();
      if (BOOTSTRAP_REFERENCE.test(reference) && !this.#pending.has(reference)) return reference;
    }
    return null;
  }
}
