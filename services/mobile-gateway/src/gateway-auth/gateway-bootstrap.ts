// @ts-expect-error -- Aurora targets Node 22 built-ins without repository-wide @types/node.
import { randomBytes } from 'node:crypto';

import type { CorrelationId, IdentityId, TenantId } from '@aurora/contracts/ids';

import type {
  GatewayActorBinding,
  GatewayAuthClaims,
  GatewayAuthenticator,
  GatewaySessionSnapshot,
} from './types.js';

const ACTOR_KINDS = new Set<GatewayActorBinding['kind']>(['HUMAN', 'AGENT', 'SERVICE', 'SYSTEM']);
const SAFE_TOKEN = /^[A-Za-z0-9._:/+-]+$/u;
const DEVICE_ID = /^dvc_[0-9A-HJKMNP-TV-Z]{26}$/u;
const OPAQUE_CREDENTIAL = /^gwc_[A-Za-z0-9_-]{43,128}$/u;
const GATEWAY_SESSION_ID = /^gws_[A-Za-z0-9_-]{22,86}$/u;
const AUTH_VERSION = 'w14-bootstrap-v1' as const;

const DEFAULT_CREDENTIAL_TTL_MS = 60_000;
const DEFAULT_MAX_PRINCIPAL_AGE_MS = 5 * 60_000;
const DEFAULT_MAX_ACTIVE_GRANTS = 256;
const MAX_GENERATION_ATTEMPTS = 4;

export interface AuthenticatedGatewayBootstrapPrincipal {
  /**
   * This object is supplied by an already-authenticated server owner. It is not an Android request
   * body and does not create W01 identity or W02/W07 business authority.
   */
  readonly tenantId: TenantId;
  readonly actor: GatewayActorBinding;
  readonly correlationId: CorrelationId;
  readonly deviceId: string;
  readonly deviceSessionId: string;
  readonly authenticatedAtMs: number;
  readonly authenticationExpiresAtMs: number;
  readonly authenticationReference: string;
  readonly authorizesExecution: false;
  readonly canGrantPermission: false;
}

export interface GatewayBootstrapGrant {
  readonly gatewaySessionId: string;
  readonly credential: string;
  readonly tenantId: TenantId;
  readonly actor: GatewayActorBinding;
  readonly correlationId: CorrelationId;
  readonly deviceId: string;
  readonly deviceSessionId: string;
  readonly issuedAtMs: number;
  readonly expiresAtMs: number;
  readonly authVersion: typeof AUTH_VERSION;
  readonly authorizesExecution: false;
  readonly provesExecutionSuccess: false;
  readonly retryAuthorized: false;
}

export type GatewayBootstrapIssueErrorCode =
  | 'PRINCIPAL_INVALID'
  | 'PRINCIPAL_EXPIRED'
  | 'PRINCIPAL_STALE'
  | 'CAPACITY_EXHAUSTED'
  | 'RECONNECT_TARGET_UNAVAILABLE'
  | 'RECONNECT_TARGET_AMBIGUOUS'
  | 'ENTROPY_FAILURE';

export type GatewayBootstrapReconnectTargetResult =
  | Readonly<{ ok: true; gatewaySessionId: string }>
  | Readonly<{
      ok: false;
      error: Readonly<{
        code: GatewayBootstrapIssueErrorCode;
        retryable: false;
      }>;
      authorizesExecution: false;
      provesExecutionSuccess: false;
      retryAuthorized: false;
    }>;

export type GatewayBootstrapIssueResult =
  | Readonly<{
      ok: true;
      value: GatewayBootstrapGrant;
    }>
  | Readonly<{
      ok: false;
      error: Readonly<{
        code: GatewayBootstrapIssueErrorCode;
        retryable: false;
      }>;
      authorizesExecution: false;
      provesExecutionSuccess: false;
      retryAuthorized: false;
    }>;

export interface GatewayBootstrapBrokerConfig {
  readonly credentialTtlMs: number;
  readonly maxPrincipalAgeMs: number;
  readonly maxActiveGrants: number;
}

export interface GatewayBootstrapEntropy {
  credential(): string;
  gatewaySessionId(): string;
}

interface GrantRecord {
  readonly credential: string;
  readonly gatewaySessionId: string;
  readonly tenantId: TenantId;
  readonly actorKind: GatewayActorBinding['kind'];
  readonly actorIdentityId: IdentityId;
  readonly correlationId: CorrelationId;
  readonly deviceId: string;
  readonly deviceSessionId: string;
  readonly authenticationReference: string;
  readonly authenticationExpiresAtMs: number;
  readonly issuedAtMs: number;
  readonly expiresAtMs: number;
}

interface VerifiedSessionBinding {
  readonly gatewaySessionId: string;
  readonly tenantId: TenantId;
  readonly actorKind: GatewayActorBinding['kind'];
  readonly actorIdentityId: IdentityId;
  readonly correlationId: CorrelationId;
  readonly deviceId: string;
  readonly deviceSessionId: string;
  readonly authenticationReference: string;
  readonly authenticationExpiresAtMs: number;
  readonly verifiedAtMs: number;
}

function defaultEntropy(): GatewayBootstrapEntropy {
  return {
    credential: () => `gwc_${randomBytes(32).toString('base64url')}`,
    gatewaySessionId: () => `gws_${randomBytes(16).toString('base64url')}`,
  };
}

function positiveInteger(value: unknown): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value > 0;
}

function nonNegativeInteger(value: unknown): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0;
}

function safeToken(value: unknown, maxLength = 256): value is string {
  return (
    typeof value === 'string' &&
    value.length > 0 &&
    value.length <= maxLength &&
    SAFE_TOKEN.test(value)
  );
}

function isPlainDataRecord(value: unknown): value is Record<string, unknown> {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return false;
  try {
    const prototype = Object.getPrototypeOf(value);
    if (prototype !== Object.prototype && prototype !== null) return false;
    const descriptors = Object.getOwnPropertyDescriptors(value);
    return Object.values(descriptors).every(
      (descriptor) => descriptor.get === undefined && descriptor.set === undefined,
    );
  } catch {
    return false;
  }
}

function hasOnlyKeys(record: Record<string, unknown>, keys: readonly string[]): boolean {
  try {
    const allowed = new Set(keys);
    return Object.keys(record).every((key) => allowed.has(key));
  } catch {
    return false;
  }
}

function validPrincipal(value: unknown): value is AuthenticatedGatewayBootstrapPrincipal {
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
    !hasOnlyKeys(value.actor, ['kind', 'identityId'])
  ) {
    return false;
  }
  return (
    safeToken(value.tenantId, 128) &&
    typeof value.actor.kind === 'string' &&
    ACTOR_KINDS.has(value.actor.kind as GatewayActorBinding['kind']) &&
    safeToken(value.actor.identityId, 128) &&
    safeToken(value.correlationId, 128) &&
    typeof value.deviceId === 'string' &&
    DEVICE_ID.test(value.deviceId) &&
    safeToken(value.deviceSessionId, 128) &&
    nonNegativeInteger(value.authenticatedAtMs) &&
    nonNegativeInteger(value.authenticationExpiresAtMs) &&
    safeToken(value.authenticationReference, 256) &&
    value.authorizesExecution === false &&
    value.canGrantPermission === false
  );
}

function rejected(code: GatewayBootstrapIssueErrorCode): GatewayBootstrapIssueResult {
  return {
    ok: false,
    error: { code, retryable: false },
    authorizesExecution: false,
    provesExecutionSuccess: false,
    retryAuthorized: false,
  };
}

function reconnectTargetRejected(
  code: GatewayBootstrapIssueErrorCode,
): GatewayBootstrapReconnectTargetResult {
  return {
    ok: false,
    error: { code, retryable: false },
    authorizesExecution: false,
    provesExecutionSuccess: false,
    retryAuthorized: false,
  };
}

function grantFromRecord(record: GrantRecord): GatewayBootstrapGrant {
  return {
    gatewaySessionId: record.gatewaySessionId,
    credential: record.credential,
    tenantId: record.tenantId,
    actor: { kind: record.actorKind, identityId: record.actorIdentityId },
    correlationId: record.correlationId,
    deviceId: record.deviceId,
    deviceSessionId: record.deviceSessionId,
    issuedAtMs: record.issuedAtMs,
    expiresAtMs: record.expiresAtMs,
    authVersion: AUTH_VERSION,
    authorizesExecution: false,
    provesExecutionSuccess: false,
    retryAuthorized: false,
  };
}

/**
 * W14-owned, server-side bridge between an already-authenticated principal and the existing W14-A
 * gateway authenticator contract.
 *
 * The broker intentionally has no HTTP parser and no Android storage surface. Callers must supply
 * an upstream-authenticated principal. Grants are memory-only, short lived and single-use. The
 * resulting authentication proves only transport/session identity; it never mints policy/action
 * authority, execution success, permission or retry eligibility.
 */
export class TransientGatewayBootstrapBroker implements GatewayAuthenticator {
  readonly #config: GatewayBootstrapBrokerConfig;
  readonly #entropy: GatewayBootstrapEntropy;
  readonly #grants = new Map<string, GrantRecord>();
  readonly #credentialByGatewaySession = new Map<string, string>();
  readonly #pendingEstablishment = new Map<string, GrantRecord>();
  readonly #verifiedSessions = new Map<string, VerifiedSessionBinding>();

  constructor(
    config: Partial<GatewayBootstrapBrokerConfig> = {},
    entropy: GatewayBootstrapEntropy = defaultEntropy(),
  ) {
    this.#config = {
      credentialTtlMs: config.credentialTtlMs ?? DEFAULT_CREDENTIAL_TTL_MS,
      maxPrincipalAgeMs: config.maxPrincipalAgeMs ?? DEFAULT_MAX_PRINCIPAL_AGE_MS,
      maxActiveGrants: config.maxActiveGrants ?? DEFAULT_MAX_ACTIVE_GRANTS,
    };
    this.#entropy = entropy;
    if (
      !positiveInteger(this.#config.credentialTtlMs) ||
      !positiveInteger(this.#config.maxPrincipalAgeMs) ||
      !positiveInteger(this.#config.maxActiveGrants) ||
      this.#config.credentialTtlMs > 15 * 60_000 ||
      this.#config.maxPrincipalAgeMs > 60 * 60_000 ||
      this.#config.maxActiveGrants > 4096
    ) {
      throw new Error('Gateway bootstrap limits are invalid.');
    }
  }

  issue(principal: unknown, nowMs: number): GatewayBootstrapIssueResult {
    if (!validPrincipal(principal) || !nonNegativeInteger(nowMs)) {
      return rejected('PRINCIPAL_INVALID');
    }
    if (
      principal.authenticatedAtMs > nowMs ||
      principal.authenticationExpiresAtMs <= principal.authenticatedAtMs
    ) {
      return rejected('PRINCIPAL_INVALID');
    }
    if (nowMs >= principal.authenticationExpiresAtMs) {
      return rejected('PRINCIPAL_EXPIRED');
    }
    if (nowMs - principal.authenticatedAtMs > this.#config.maxPrincipalAgeMs) {
      return rejected('PRINCIPAL_STALE');
    }

    this.#purgeExpired(nowMs);
    if (this.#grants.size + this.#pendingEstablishment.size >= this.#config.maxActiveGrants) {
      return rejected('CAPACITY_EXHAUSTED');
    }

    const generated = this.#generateUniqueMaterial();
    if (generated === null) return rejected('ENTROPY_FAILURE');

    const expiresAtMs = Math.min(
      principal.authenticationExpiresAtMs,
      nowMs + this.#config.credentialTtlMs,
    );
    const record: GrantRecord = {
      credential: generated.credential,
      gatewaySessionId: generated.gatewaySessionId,
      tenantId: principal.tenantId,
      actorKind: principal.actor.kind,
      actorIdentityId: principal.actor.identityId,
      correlationId: principal.correlationId,
      deviceId: principal.deviceId,
      deviceSessionId: principal.deviceSessionId,
      authenticationReference: principal.authenticationReference,
      authenticationExpiresAtMs: principal.authenticationExpiresAtMs,
      issuedAtMs: nowMs,
      expiresAtMs,
    };
    this.#grants.set(record.credential, record);
    this.#credentialByGatewaySession.set(record.gatewaySessionId, record.credential);

    return {
      ok: true,
      value: grantFromRecord(record),
    };
  }

  resolveReconnectTarget(principal: unknown, nowMs: number): GatewayBootstrapReconnectTargetResult {
    if (!validPrincipal(principal) || !nonNegativeInteger(nowMs)) {
      return reconnectTargetRejected('PRINCIPAL_INVALID');
    }
    if (
      principal.authenticatedAtMs > nowMs ||
      principal.authenticationExpiresAtMs <= principal.authenticatedAtMs
    ) {
      return reconnectTargetRejected('PRINCIPAL_INVALID');
    }
    if (nowMs >= principal.authenticationExpiresAtMs) {
      return reconnectTargetRejected('PRINCIPAL_EXPIRED');
    }
    if (nowMs - principal.authenticatedAtMs > this.#config.maxPrincipalAgeMs) {
      return reconnectTargetRejected('PRINCIPAL_STALE');
    }

    this.#purgeExpired(nowMs);
    const candidates = [...this.#verifiedSessions.values()].filter(
      (binding) =>
        binding.tenantId === principal.tenantId &&
        binding.actorKind === principal.actor.kind &&
        binding.actorIdentityId === principal.actor.identityId &&
        binding.correlationId === principal.correlationId &&
        binding.deviceId === principal.deviceId &&
        binding.deviceSessionId === principal.deviceSessionId &&
        binding.authenticationReference === principal.authenticationReference,
    );
    if (candidates.length === 0) {
      return reconnectTargetRejected('RECONNECT_TARGET_UNAVAILABLE');
    }
    if (candidates.length !== 1) {
      return reconnectTargetRejected('RECONNECT_TARGET_AMBIGUOUS');
    }
    const target = candidates[0];
    if (target === undefined) return reconnectTargetRejected('RECONNECT_TARGET_UNAVAILABLE');
    return { ok: true, gatewaySessionId: target.gatewaySessionId };
  }

  issueReconnect(
    principal: unknown,
    gatewaySessionId: unknown,
    nowMs: number,
  ): GatewayBootstrapIssueResult {
    const resolved = this.resolveReconnectTarget(principal, nowMs);
    if (!resolved.ok) return rejected(resolved.error.code);
    if (gatewaySessionId !== resolved.gatewaySessionId) {
      return rejected('RECONNECT_TARGET_UNAVAILABLE');
    }
    if (!validPrincipal(principal)) return rejected('PRINCIPAL_INVALID');
    const target = this.#verifiedSessions.get(resolved.gatewaySessionId);
    if (target === undefined) return rejected('RECONNECT_TARGET_UNAVAILABLE');
    if (this.#credentialByGatewaySession.has(target.gatewaySessionId)) {
      return rejected('CAPACITY_EXHAUSTED');
    }
    if (this.#grants.size + this.#pendingEstablishment.size >= this.#config.maxActiveGrants) {
      return rejected('CAPACITY_EXHAUSTED');
    }
    const credential = this.#generateUniqueCredential();
    if (credential === null) return rejected('ENTROPY_FAILURE');
    const authenticationExpiresAtMs = Math.min(
      target.authenticationExpiresAtMs,
      principal.authenticationExpiresAtMs,
    );
    const expiresAtMs = Math.min(authenticationExpiresAtMs, nowMs + this.#config.credentialTtlMs);
    if (expiresAtMs <= nowMs) return rejected('PRINCIPAL_EXPIRED');
    const record: GrantRecord = {
      credential,
      gatewaySessionId: target.gatewaySessionId,
      tenantId: target.tenantId,
      actorKind: target.actorKind,
      actorIdentityId: target.actorIdentityId,
      correlationId: target.correlationId,
      deviceId: target.deviceId,
      deviceSessionId: target.deviceSessionId,
      authenticationReference: target.authenticationReference,
      authenticationExpiresAtMs,
      issuedAtMs: nowMs,
      expiresAtMs,
    };
    this.#grants.set(record.credential, record);
    this.#credentialByGatewaySession.set(record.gatewaySessionId, record.credential);
    return { ok: true, value: grantFromRecord(record) };
  }

  verify(credential: string, nowMs: number): GatewayAuthClaims | null {
    if (!OPAQUE_CREDENTIAL.test(credential) || !nonNegativeInteger(nowMs)) return null;
    const record = this.#grants.get(credential);
    if (record === undefined) return null;

    // Consume before evaluating time so replay remains impossible even for an expired credential.
    this.#grants.delete(credential);
    this.#credentialByGatewaySession.delete(record.gatewaySessionId);
    if (nowMs < record.issuedAtMs || nowMs >= record.expiresAtMs) return null;

    this.#pendingEstablishment.set(record.gatewaySessionId, record);

    return {
      tenantId: record.tenantId,
      actorIdentityId: record.actorIdentityId,
      issuedAtMs: record.issuedAtMs,
      expiresAtMs: record.expiresAtMs,
      authVersion: AUTH_VERSION,
      gatewaySessionId: record.gatewaySessionId,
      actorKind: record.actorKind,
      correlationId: record.correlationId,
    };
  }

  noteSessionEstablished(snapshot: GatewaySessionSnapshot): void {
    const record = this.#pendingEstablishment.get(snapshot.sessionId);
    if (record === undefined) return;
    this.#pendingEstablishment.delete(snapshot.sessionId);
    if (
      snapshot.tenantId !== record.tenantId ||
      snapshot.actorKind !== record.actorKind ||
      snapshot.actorIdentityId !== record.actorIdentityId ||
      snapshot.correlationId !== record.correlationId ||
      snapshot.authIssuedAtMs !== record.issuedAtMs ||
      snapshot.authExpiresAtMs !== record.expiresAtMs
    ) {
      return;
    }
    this.#verifiedSessions.set(snapshot.sessionId, {
      gatewaySessionId: snapshot.sessionId,
      tenantId: record.tenantId,
      actorKind: record.actorKind,
      actorIdentityId: record.actorIdentityId,
      correlationId: record.correlationId,
      deviceId: record.deviceId,
      deviceSessionId: record.deviceSessionId,
      authenticationReference: record.authenticationReference,
      authenticationExpiresAtMs: record.authenticationExpiresAtMs,
      verifiedAtMs: snapshot.openedAtMs,
    });
  }

  revokeGatewaySession(gatewaySessionId: string): boolean {
    if (!GATEWAY_SESSION_ID.test(gatewaySessionId)) return false;
    let revoked = this.#verifiedSessions.delete(gatewaySessionId);
    revoked = this.#pendingEstablishment.delete(gatewaySessionId) || revoked;
    const credential = this.#credentialByGatewaySession.get(gatewaySessionId);
    if (credential !== undefined) {
      this.#credentialByGatewaySession.delete(gatewaySessionId);
      revoked = this.#grants.delete(credential) || revoked;
    }
    return revoked;
  }

  #purgeExpired(nowMs: number): void {
    for (const [credential, record] of this.#grants) {
      if (nowMs < record.expiresAtMs) continue;
      this.#grants.delete(credential);
      this.#credentialByGatewaySession.delete(record.gatewaySessionId);
    }
    for (const [gatewaySessionId, record] of this.#pendingEstablishment) {
      if (nowMs < record.expiresAtMs) continue;
      this.#pendingEstablishment.delete(gatewaySessionId);
    }
    for (const [gatewaySessionId, binding] of this.#verifiedSessions) {
      if (nowMs < binding.authenticationExpiresAtMs) continue;
      this.#verifiedSessions.delete(gatewaySessionId);
      const credential = this.#credentialByGatewaySession.get(gatewaySessionId);
      if (credential !== undefined) this.#grants.delete(credential);
      this.#credentialByGatewaySession.delete(gatewaySessionId);
    }
  }

  #generateUniqueMaterial(): { credential: string; gatewaySessionId: string } | null {
    for (let attempt = 0; attempt < MAX_GENERATION_ATTEMPTS; attempt += 1) {
      const credential = this.#entropy.credential();
      const gatewaySessionId = this.#entropy.gatewaySessionId();
      if (!OPAQUE_CREDENTIAL.test(credential) || !GATEWAY_SESSION_ID.test(gatewaySessionId)) {
        continue;
      }
      if (this.#grants.has(credential) || this.#credentialByGatewaySession.has(gatewaySessionId)) {
        continue;
      }
      return { credential, gatewaySessionId };
    }
    return null;
  }

  #generateUniqueCredential(): string | null {
    for (let attempt = 0; attempt < MAX_GENERATION_ATTEMPTS; attempt += 1) {
      const credential = this.#entropy.credential();
      if (!OPAQUE_CREDENTIAL.test(credential) || this.#grants.has(credential)) continue;
      return credential;
    }
    return null;
  }
}
