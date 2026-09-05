import type { CorrelationId, IdentityId, TenantId } from '@aurora/contracts/ids';

import {
  GATEWAY_PROTOCOL_VERSION,
  type BeginGatewayRequestInput,
  type GatewayBoundRequestOperationInput,
  type GatewayBoundSessionInput,
  type GatewayActorBinding,
  type GatewayAuthClaims,
  type GatewayAuthenticator,
  type GatewayProtocolError,
  type GatewayProtocolErrorCode,
  type GatewayProtocolResult,
  type GatewayRequestSnapshot,
  type GatewaySessionSnapshot,
  type GatewayTransportConfig,
  type OpenGatewaySessionInput,
  type ReconnectGatewaySessionInput,
} from './types.js';

interface RequestRecord {
  readonly requestId: string;
  readonly deadlineMs: number;
  readonly startedAtMs: number;
  state: 'ACTIVE' | 'CANCEL_REQUESTED' | 'COMPLETED';
  cancelRequestedAtMs?: number;
  completedAtMs?: number;
}

interface SessionRecord {
  readonly protocolVersion: typeof GATEWAY_PROTOCOL_VERSION;
  readonly sessionId: string;
  connectionId: string;
  generation: number;
  state: 'OPEN' | 'CLOSED';
  readonly tenantId: TenantId;
  readonly actorKind: GatewayActorBinding['kind'];
  readonly actorIdentityId: IdentityId;
  correlationId: CorrelationId;
  authIssuedAtMs: number;
  authExpiresAtMs: number;
  openedAtMs: number;
  closedAtMs?: number;
  readonly requests: Map<string, RequestRecord>;
}

const DEFAULT_CONFIG: GatewayTransportConfig = {
  maxOpenSessions: 256,
  maxRememberedSessions: 1024,
  maxOutstandingRequestsPerSession: 64,
  maxTrackedRequestsPerSession: 1024,
  maxCredentialLength: 8192,
  maxAuthAgeMs: 15 * 60 * 1000,
  maxDeadlineHorizonMs: 5 * 60 * 1000,
};

const ACTOR_KINDS = new Set(['HUMAN', 'AGENT', 'SERVICE', 'SYSTEM']);
const SAFE_TOKEN = /^[A-Za-z0-9._:-]+$/;

function error(
  code: GatewayProtocolErrorCode,
  message: string,
  retryable = false,
): GatewayProtocolError {
  return { ok: false, error: { code, message, retryable } };
}

function success<T>(value: T): GatewayProtocolResult<T> {
  return { ok: true, value };
}

function isFiniteInteger(value: unknown): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value);
}

function isBoundedToken(value: unknown, maxLength = 128): value is string {
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

function parseActor(value: unknown): GatewayActorBinding | null {
  if (!isPlainDataRecord(value) || !hasOnlyKeys(value, ['kind', 'identityId'])) return null;
  if (!ACTOR_KINDS.has(String(value.kind)) || !isBoundedToken(value.identityId, 256)) return null;
  return {
    kind: value.kind as GatewayActorBinding['kind'],
    identityId: value.identityId as IdentityId,
  };
}

function parseCorrelation(value: unknown): { correlationId: CorrelationId } | null {
  if (!isPlainDataRecord(value) || !hasOnlyKeys(value, ['correlationId'])) return null;
  if (!isBoundedToken(value.correlationId, 256)) return null;
  return { correlationId: value.correlationId as CorrelationId };
}

function validateAuthClaims(
  value: unknown,
  nowMs: number,
  config: GatewayTransportConfig,
): GatewayProtocolResult<GatewayAuthClaims> {
  if (
    !isPlainDataRecord(value) ||
    !hasOnlyKeys(value, [
      'tenantId',
      'actorIdentityId',
      'issuedAtMs',
      'expiresAtMs',
      'authVersion',
      'gatewaySessionId',
      'actorKind',
      'correlationId',
    ]) ||
    !isBoundedToken(value.tenantId, 256) ||
    !isBoundedToken(value.actorIdentityId, 256) ||
    !isBoundedToken(value.authVersion, 64) ||
    !isFiniteInteger(value.issuedAtMs) ||
    !isFiniteInteger(value.expiresAtMs) ||
    (value.gatewaySessionId !== undefined && !isBoundedToken(value.gatewaySessionId)) ||
    (value.actorKind !== undefined && !ACTOR_KINDS.has(String(value.actorKind))) ||
    (value.correlationId !== undefined && !isBoundedToken(value.correlationId, 256))
  ) {
    return error(
      'AUTH_INVALID',
      'Authentication claims are malformed or contain unsupported fields.',
    );
  }

  if (value.issuedAtMs > nowMs || value.expiresAtMs <= value.issuedAtMs) {
    return error('AUTH_INVALID', 'Authentication claim timing is invalid.');
  }
  if (nowMs >= value.expiresAtMs) {
    return error('AUTH_EXPIRED', 'Authentication has expired.');
  }
  if (nowMs - value.issuedAtMs > config.maxAuthAgeMs) {
    return error('AUTH_STALE', 'Authentication state is too old for a new transport session.');
  }

  return success({
    tenantId: value.tenantId as TenantId,
    actorIdentityId: value.actorIdentityId as IdentityId,
    issuedAtMs: value.issuedAtMs,
    expiresAtMs: value.expiresAtMs,
    authVersion: value.authVersion,
    ...(value.gatewaySessionId === undefined ? {} : { gatewaySessionId: value.gatewaySessionId }),
    ...(value.actorKind === undefined
      ? {}
      : { actorKind: value.actorKind as GatewayActorBinding['kind'] }),
    ...(value.correlationId === undefined
      ? {}
      : { correlationId: value.correlationId as CorrelationId }),
  });
}

function sessionSnapshot(record: SessionRecord): GatewaySessionSnapshot {
  const base = {
    protocolVersion: record.protocolVersion,
    sessionId: record.sessionId,
    connectionId: record.connectionId,
    generation: record.generation,
    state: record.state,
    tenantId: record.tenantId,
    actorKind: record.actorKind,
    actorIdentityId: record.actorIdentityId,
    correlationId: record.correlationId,
    authIssuedAtMs: record.authIssuedAtMs,
    authExpiresAtMs: record.authExpiresAtMs,
    openedAtMs: record.openedAtMs,
    outstandingRequests: [...record.requests.values()].filter(
      (request) => request.state !== 'COMPLETED',
    ).length,
    authorizesExecution: false as const,
  };
  return record.closedAtMs === undefined ? base : { ...base, closedAtMs: record.closedAtMs };
}

function requestSnapshot(record: SessionRecord, request: RequestRecord): GatewayRequestSnapshot {
  const base = {
    requestId: request.requestId,
    sessionId: record.sessionId,
    connectionId: record.connectionId,
    state: request.state,
    deadlineMs: request.deadlineMs,
    startedAtMs: request.startedAtMs,
    authorizesExecution: false as const,
  };
  return {
    ...base,
    ...(request.cancelRequestedAtMs === undefined
      ? {}
      : { cancelRequestedAtMs: request.cancelRequestedAtMs }),
    ...(request.completedAtMs === undefined ? {} : { completedAtMs: request.completedAtMs }),
  };
}

export class GatewaySessionManager {
  readonly #sessions = new Map<string, SessionRecord>();
  readonly #authenticator: GatewayAuthenticator;
  readonly #config: GatewayTransportConfig;

  constructor(authenticator: GatewayAuthenticator, config: Partial<GatewayTransportConfig> = {}) {
    this.#authenticator = authenticator;
    this.#config = { ...DEFAULT_CONFIG, ...config };
    if (
      this.#config.maxOpenSessions <= 0 ||
      this.#config.maxRememberedSessions < this.#config.maxOpenSessions ||
      this.#config.maxOutstandingRequestsPerSession <= 0 ||
      this.#config.maxTrackedRequestsPerSession < this.#config.maxOutstandingRequestsPerSession ||
      this.#config.maxCredentialLength <= 0 ||
      this.#config.maxAuthAgeMs <= 0 ||
      this.#config.maxDeadlineHorizonMs <= 0
    ) {
      throw new Error('Gateway transport limits must all be positive.');
    }
  }

  openSession(input: unknown): GatewayProtocolResult<GatewaySessionSnapshot> {
    const parsed = this.#parseOpenInput(input, false);
    if (!parsed.ok) return parsed;
    const existing = this.#sessions.get(parsed.value.sessionId);
    if (existing !== undefined) {
      return error(
        'SESSION_CONFLICT',
        'Session identifier already exists; use explicit reconnect.',
      );
    }
    const capacity = this.#prepareSessionSlot();
    if (!capacity.ok) return capacity;
    return this.#establish(parsed.value, 1);
  }

  reconnectSession(input: unknown): GatewayProtocolResult<GatewaySessionSnapshot> {
    const parsed = this.#parseOpenInput(input, true);
    if (!parsed.ok) return parsed;
    const existing = this.#sessions.get(parsed.value.sessionId);
    if (existing === undefined) {
      return error('SESSION_NOT_FOUND', 'No previous session exists to reconnect.');
    }
    if (existing.state === 'OPEN') {
      return error('SESSION_CONFLICT', 'An active connection already owns this session.');
    }
    if (parsed.value.previousConnectionId !== existing.connectionId) {
      return error('CONNECTION_MISMATCH', 'Reconnect does not reference the last connection.');
    }
    if (
      existing.tenantId !== parsed.value.tenantId ||
      existing.actorIdentityId !== parsed.value.actor.identityId ||
      existing.actorKind !== parsed.value.actor.kind
    ) {
      return error('SESSION_CONFLICT', 'Reconnect cannot change the bound tenant or actor.');
    }
    if (existing.correlationId !== parsed.value.correlation.correlationId) {
      return error('CORRELATION_MISMATCH', 'Reconnect cannot change the session correlation.');
    }
    return this.#establish(parsed.value, existing.generation + 1, existing.requests);
  }

  beginRequest(input: unknown): GatewayProtocolResult<GatewayRequestSnapshot> {
    const parsed = this.#parseBeginRequest(input);
    if (!parsed.ok) return parsed;
    const sessionResult = this.#requireBoundOpenSession(parsed.value, parsed.value.nowMs);
    if (!sessionResult.ok) return sessionResult;
    const session = sessionResult.value;
    if (parsed.value.deadlineMs <= parsed.value.nowMs) {
      return error('DEADLINE_EXCEEDED', 'Request deadline has already expired.');
    }
    if (parsed.value.deadlineMs - parsed.value.nowMs > this.#config.maxDeadlineHorizonMs) {
      return error(
        'DEADLINE_OUT_OF_RANGE',
        'Request deadline exceeds the bounded transport horizon.',
      );
    }
    if (session.requests.has(parsed.value.requestId)) {
      return error(
        'REQUEST_DUPLICATE',
        'Request identifier has already been used in this session.',
      );
    }
    const outstanding = [...session.requests.values()].filter(
      (request) => request.state !== 'COMPLETED',
    ).length;
    if (outstanding >= this.#config.maxOutstandingRequestsPerSession) {
      return error('BACKPRESSURE', 'Session has too many outstanding requests.', true);
    }
    const capacity = this.#prepareRequestSlot(session);
    if (!capacity.ok) return capacity;
    const request: RequestRecord = {
      requestId: parsed.value.requestId,
      deadlineMs: parsed.value.deadlineMs,
      startedAtMs: parsed.value.nowMs,
      state: 'ACTIVE',
    };
    session.requests.set(request.requestId, request);
    return success(requestSnapshot(session, request));
  }

  cancelRequest(input: unknown): GatewayProtocolResult<GatewayRequestSnapshot> {
    const parsed = this.#parseBoundRequestOperation(input);
    if (!parsed.ok) return parsed;
    const sessionResult = this.#requireBoundSessionOperation(parsed.value);
    if (!sessionResult.ok) return sessionResult;
    const request = sessionResult.value.requests.get(parsed.value.requestId);
    if (request === undefined) return error('REQUEST_NOT_FOUND', 'Request does not exist.');
    if (request.state === 'ACTIVE') {
      request.state = 'CANCEL_REQUESTED';
      request.cancelRequestedAtMs = parsed.value.nowMs;
    }
    return success(requestSnapshot(sessionResult.value, request));
  }

  completeRequest(input: unknown): GatewayProtocolResult<GatewayRequestSnapshot> {
    const parsed = this.#parseBoundRequestOperation(input);
    if (!parsed.ok) return parsed;
    const sessionResult = this.#requireBoundSessionOperation(parsed.value);
    if (!sessionResult.ok) return sessionResult;
    const request = sessionResult.value.requests.get(parsed.value.requestId);
    if (request === undefined) return error('REQUEST_NOT_FOUND', 'Request does not exist.');
    if (request.state !== 'COMPLETED') {
      request.state = 'COMPLETED';
      request.completedAtMs = parsed.value.nowMs;
    }
    return success(requestSnapshot(sessionResult.value, request));
  }

  closeSession(input: unknown): GatewayProtocolResult<GatewaySessionSnapshot> {
    const parsed = this.#parseBoundSessionOperation(input, false);
    if (!parsed.ok) return parsed;
    const sessionResult = this.#requireBoundSessionOperation(parsed.value);
    if (!sessionResult.ok) return sessionResult;
    sessionResult.value.state = 'CLOSED';
    sessionResult.value.closedAtMs = parsed.value.nowMs;
    return success(sessionSnapshot(sessionResult.value));
  }

  getSession(sessionId: unknown, nowMs: unknown): GatewayProtocolResult<GatewaySessionSnapshot> {
    if (!isBoundedToken(sessionId) || !isFiniteInteger(nowMs)) {
      return error('MALFORMED_REQUEST', 'Session lookup context is malformed.');
    }
    const session = this.#sessions.get(sessionId);
    if (session === undefined) return error('SESSION_NOT_FOUND', 'Session does not exist.');
    if (session.state === 'OPEN' && nowMs >= session.authExpiresAtMs) {
      session.state = 'CLOSED';
      session.closedAtMs = nowMs;
      return error('AUTH_EXPIRED', 'Session authentication expired.');
    }
    return success(sessionSnapshot(session));
  }

  #prepareSessionSlot(): GatewayProtocolResult<true> {
    const activeSessions = [...this.#sessions.values()].filter(
      (session) => session.state === 'OPEN',
    ).length;
    if (activeSessions >= this.#config.maxOpenSessions) {
      return error('BACKPRESSURE', 'Gateway session capacity is exhausted.', true);
    }
    if (this.#sessions.size < this.#config.maxRememberedSessions) return success(true);

    const oldestClosed = [...this.#sessions.values()]
      .filter((session) => session.state === 'CLOSED')
      .sort(
        (left, right) =>
          (left.closedAtMs ?? Number.MAX_SAFE_INTEGER) -
          (right.closedAtMs ?? Number.MAX_SAFE_INTEGER),
      )[0];
    if (oldestClosed === undefined) {
      return error('BACKPRESSURE', 'Gateway remembered-session capacity is exhausted.', true);
    }
    this.#sessions.delete(oldestClosed.sessionId);
    return success(true);
  }

  #prepareRequestSlot(session: SessionRecord): GatewayProtocolResult<true> {
    if (session.requests.size < this.#config.maxTrackedRequestsPerSession) return success(true);
    const oldestCompleted = [...session.requests.values()]
      .filter((request) => request.state === 'COMPLETED')
      .sort(
        (left, right) =>
          (left.completedAtMs ?? Number.MAX_SAFE_INTEGER) -
          (right.completedAtMs ?? Number.MAX_SAFE_INTEGER),
      )[0];
    if (oldestCompleted === undefined) {
      return error('BACKPRESSURE', 'Session request tracking capacity is exhausted.', true);
    }
    session.requests.delete(oldestCompleted.requestId);
    return success(true);
  }

  #establish(
    input: OpenGatewaySessionInput | ReconnectGatewaySessionInput,
    generation: number,
    requests = new Map<string, RequestRecord>(),
  ): GatewayProtocolResult<GatewaySessionSnapshot> {
    let rawClaims: GatewayAuthClaims | null;
    try {
      rawClaims = this.#authenticator.verify(input.credential, input.nowMs);
    } catch {
      return error('AUTH_INVALID', 'Authentication verifier rejected the credential.');
    }
    if (rawClaims === null) {
      return error('AUTH_INVALID', 'Authentication credential is invalid.');
    }
    const claims = validateAuthClaims(rawClaims, input.nowMs, this.#config);
    if (!claims.ok) return claims;
    if (claims.value.tenantId !== input.tenantId) {
      return error('TENANT_MISMATCH', 'Authenticated tenant does not match the session tenant.');
    }
    if (claims.value.actorIdentityId !== input.actor.identityId) {
      return error('ACTOR_MISMATCH', 'Authenticated actor does not match the session actor.');
    }
    if (
      claims.value.gatewaySessionId !== undefined &&
      claims.value.gatewaySessionId !== input.sessionId
    ) {
      return error(
        'SESSION_CONFLICT',
        'Authenticated gateway session does not match the requested session.',
      );
    }
    if (claims.value.actorKind !== undefined && claims.value.actorKind !== input.actor.kind) {
      return error('ACTOR_MISMATCH', 'Authenticated actor kind does not match the session actor.');
    }
    if (
      claims.value.correlationId !== undefined &&
      claims.value.correlationId !== input.correlation.correlationId
    ) {
      return error(
        'CORRELATION_MISMATCH',
        'Authenticated correlation does not match the session context.',
      );
    }

    const connectionId = `conn:${input.sessionId}:${generation}`;
    const record: SessionRecord = {
      protocolVersion: GATEWAY_PROTOCOL_VERSION,
      sessionId: input.sessionId,
      connectionId,
      generation,
      state: 'OPEN',
      tenantId: input.tenantId,
      actorKind: input.actor.kind,
      actorIdentityId: input.actor.identityId,
      correlationId: input.correlation.correlationId,
      authIssuedAtMs: claims.value.issuedAtMs,
      authExpiresAtMs: claims.value.expiresAtMs,
      openedAtMs: input.nowMs,
      requests,
    };
    this.#sessions.set(input.sessionId, record);
    return success(sessionSnapshot(record));
  }

  #parseOpenInput(input: unknown, reconnect: false): GatewayProtocolResult<OpenGatewaySessionInput>;
  #parseOpenInput(
    input: unknown,
    reconnect: true,
  ): GatewayProtocolResult<ReconnectGatewaySessionInput>;
  #parseOpenInput(
    input: unknown,
    reconnect: boolean,
  ): GatewayProtocolResult<OpenGatewaySessionInput | ReconnectGatewaySessionInput> {
    const allowedKeys = [
      'protocolVersion',
      'sessionId',
      'credential',
      'tenantId',
      'actor',
      'correlation',
      'nowMs',
      ...(reconnect ? ['previousConnectionId'] : []),
    ];
    if (!isPlainDataRecord(input) || !hasOnlyKeys(input, allowedKeys)) {
      return error('MALFORMED_REQUEST', 'Session handshake must be a plain data object.');
    }
    if (input.protocolVersion !== GATEWAY_PROTOCOL_VERSION) {
      return error('PROTOCOL_VERSION_UNSUPPORTED', 'Gateway protocol version is unsupported.');
    }
    if (!isBoundedToken(input.sessionId) || !isBoundedToken(input.tenantId, 256)) {
      return error('MALFORMED_REQUEST', 'Session or tenant binding is malformed.');
    }
    if (
      typeof input.credential !== 'string' ||
      input.credential.length === 0 ||
      input.credential.length > this.#config.maxCredentialLength
    ) {
      return error('AUTH_REQUIRED', 'A bounded authentication credential is required.');
    }
    const actor = parseActor(input.actor);
    const correlation = parseCorrelation(input.correlation);
    if (actor === null || correlation === null || !isFiniteInteger(input.nowMs)) {
      return error('MALFORMED_REQUEST', 'Actor, correlation or timing context is malformed.');
    }
    const base: OpenGatewaySessionInput = {
      protocolVersion: GATEWAY_PROTOCOL_VERSION,
      sessionId: input.sessionId,
      credential: input.credential,
      tenantId: input.tenantId as TenantId,
      actor,
      correlation,
      nowMs: input.nowMs,
    };
    if (!reconnect) return success(base);
    if (!isBoundedToken(input.previousConnectionId, 256)) {
      return error('MALFORMED_REQUEST', 'Reconnect requires the previous connection reference.');
    }
    return success({ ...base, previousConnectionId: input.previousConnectionId });
  }

  #parseBeginRequest(input: unknown): GatewayProtocolResult<BeginGatewayRequestInput> {
    const keys = [
      'protocolVersion',
      'sessionId',
      'connectionId',
      'requestId',
      'tenantId',
      'actorIdentityId',
      'correlationId',
      'deadlineMs',
      'nowMs',
    ];
    if (!isPlainDataRecord(input) || !hasOnlyKeys(input, keys)) {
      return error('MALFORMED_REQUEST', 'Request envelope must be a plain data object.');
    }
    if (input.protocolVersion !== GATEWAY_PROTOCOL_VERSION) {
      return error('PROTOCOL_VERSION_UNSUPPORTED', 'Gateway protocol version is unsupported.');
    }
    if (
      !isBoundedToken(input.sessionId) ||
      !isBoundedToken(input.connectionId, 256) ||
      !isBoundedToken(input.requestId) ||
      !isBoundedToken(input.tenantId, 256) ||
      !isBoundedToken(input.actorIdentityId, 256) ||
      !isBoundedToken(input.correlationId, 256) ||
      !isFiniteInteger(input.deadlineMs) ||
      !isFiniteInteger(input.nowMs)
    ) {
      return error('MALFORMED_REQUEST', 'Request binding or timing is malformed.');
    }
    return success({
      protocolVersion: GATEWAY_PROTOCOL_VERSION,
      sessionId: input.sessionId,
      connectionId: input.connectionId,
      requestId: input.requestId,
      tenantId: input.tenantId as TenantId,
      actorIdentityId: input.actorIdentityId as IdentityId,
      correlationId: input.correlationId as CorrelationId,
      deadlineMs: input.deadlineMs,
      nowMs: input.nowMs,
    });
  }

  #parseBoundRequestOperation(
    input: unknown,
  ): GatewayProtocolResult<GatewayBoundRequestOperationInput> {
    const parsed = this.#parseBoundSessionOperation(input, true);
    if (!parsed.ok) return parsed;
    if (!('requestId' in parsed.value) || !isBoundedToken(parsed.value.requestId)) {
      return error('MALFORMED_REQUEST', 'Bound request operation requires a request identifier.');
    }
    return success(parsed.value as GatewayBoundRequestOperationInput);
  }

  #parseBoundSessionOperation(
    input: unknown,
    includeRequestId: false,
  ): GatewayProtocolResult<GatewayBoundSessionInput>;
  #parseBoundSessionOperation(
    input: unknown,
    includeRequestId: true,
  ): GatewayProtocolResult<GatewayBoundRequestOperationInput>;
  #parseBoundSessionOperation(
    input: unknown,
    includeRequestId: boolean,
  ): GatewayProtocolResult<GatewayBoundSessionInput | GatewayBoundRequestOperationInput> {
    const keys = [
      'protocolVersion',
      'sessionId',
      'connectionId',
      'tenantId',
      'actorIdentityId',
      'correlationId',
      'nowMs',
      ...(includeRequestId ? ['requestId'] : []),
    ];
    if (!isPlainDataRecord(input) || !hasOnlyKeys(input, keys)) {
      return error('MALFORMED_REQUEST', 'Bound session operation must be a plain data object.');
    }
    if (input.protocolVersion !== GATEWAY_PROTOCOL_VERSION) {
      return error('PROTOCOL_VERSION_UNSUPPORTED', 'Gateway protocol version is unsupported.');
    }
    if (
      !isBoundedToken(input.sessionId) ||
      !isBoundedToken(input.connectionId, 256) ||
      !isBoundedToken(input.tenantId, 256) ||
      !isBoundedToken(input.actorIdentityId, 256) ||
      !isBoundedToken(input.correlationId, 256) ||
      !isFiniteInteger(input.nowMs) ||
      (includeRequestId && !isBoundedToken(input.requestId))
    ) {
      return error('MALFORMED_REQUEST', 'Bound session operation context is malformed.');
    }
    const base: GatewayBoundSessionInput = {
      protocolVersion: GATEWAY_PROTOCOL_VERSION,
      sessionId: input.sessionId,
      connectionId: input.connectionId,
      tenantId: input.tenantId as TenantId,
      actorIdentityId: input.actorIdentityId as IdentityId,
      correlationId: input.correlationId as CorrelationId,
      nowMs: input.nowMs,
    };
    return includeRequestId
      ? success({ ...base, requestId: input.requestId as string })
      : success(base);
  }

  #requireBoundSessionOperation(
    input: GatewayBoundSessionInput,
  ): GatewayProtocolResult<SessionRecord> {
    const result = this.#requireOpenSession(input.sessionId, input.connectionId, input.nowMs);
    if (!result.ok) return result;
    if (result.value.tenantId !== input.tenantId) {
      return error('TENANT_MISMATCH', 'Operation tenant does not match the authenticated session.');
    }
    if (result.value.actorIdentityId !== input.actorIdentityId) {
      return error('ACTOR_MISMATCH', 'Operation actor does not match the authenticated session.');
    }
    if (result.value.correlationId !== input.correlationId) {
      return error(
        'CORRELATION_MISMATCH',
        'Operation correlation does not match the session context.',
      );
    }
    return result;
  }

  #requireBoundOpenSession(
    input: BeginGatewayRequestInput,
    nowMs: number,
  ): GatewayProtocolResult<SessionRecord> {
    const result = this.#requireOpenSession(input.sessionId, input.connectionId, nowMs);
    if (!result.ok) return result;
    if (result.value.tenantId !== input.tenantId) {
      return error('TENANT_MISMATCH', 'Request tenant does not match the authenticated session.');
    }
    if (result.value.actorIdentityId !== input.actorIdentityId) {
      return error('ACTOR_MISMATCH', 'Request actor does not match the authenticated session.');
    }
    if (result.value.correlationId !== input.correlationId) {
      return error(
        'CORRELATION_MISMATCH',
        'Request correlation does not match the session context.',
      );
    }
    return result;
  }

  #requireOpenSession(
    sessionId: string,
    connectionId: string,
    nowMs: number,
  ): GatewayProtocolResult<SessionRecord> {
    const session = this.#sessions.get(sessionId);
    if (session === undefined) return error('SESSION_NOT_FOUND', 'Session does not exist.');
    if (session.connectionId !== connectionId) {
      return error('CONNECTION_MISMATCH', 'Connection does not own this session.');
    }
    if (session.state !== 'OPEN') return error('SESSION_CLOSED', 'Session is closed.');
    if (nowMs >= session.authExpiresAtMs) {
      session.state = 'CLOSED';
      session.closedAtMs = nowMs;
      return error('AUTH_EXPIRED', 'Session authentication expired.');
    }
    return success(session);
  }
}
