// @ts-expect-error -- Aurora targets Node 22 runtime built-ins without repository-wide @types/node.
import { createServer } from 'node:http';

import { GatewaySessionManager } from './session-manager.js';
import { GATEWAY_PROTOCOL_VERSION, type GatewaySessionSnapshot } from './types.js';

const DEFAULT_MAX_BODY_BYTES = 32 * 1024;
const DEFAULT_REQUEST_TIMEOUT_MS = 10_000;
const DEFAULT_HEADERS_TIMEOUT_MS = 5_000;
const DEFAULT_KEEP_ALIVE_TIMEOUT_MS = 5_000;
const DEFAULT_MAX_REQUESTS_PER_SOCKET = 128;
const LOOPBACK_HOSTS = new Set(['127.0.0.1', '::1', 'localhost']);

const OPEN_KEYS = new Set([
  'protocolVersion',
  'sessionId',
  'credential',
  'tenantId',
  'actor',
  'correlation',
]);
const RECONNECT_KEYS = new Set([...OPEN_KEYS, 'previousConnectionId']);
const BEGIN_KEYS = new Set(['requestId', 'deadlineMs']);
const REQUEST_KEYS = new Set(['requestId']);
const EMPTY_KEYS = new Set<string>();

type TransportErrorCode =
  | 'BODY_MALFORMED'
  | 'BODY_TOO_LARGE'
  | 'CONTENT_TYPE_UNSUPPORTED'
  | 'METHOD_NOT_ALLOWED'
  | 'ROUTE_NOT_FOUND'
  | 'SESSION_BINDING_REQUIRED';

interface IncomingRequestLike {
  readonly method?: string;
  readonly url?: string;
  readonly headers: Readonly<Record<string, string | readonly string[] | undefined>>;
  readonly socket: SocketLike;
  setEncoding(encoding: 'utf8'): void;
  on(event: 'data', listener: (chunk: string) => void): this;
  on(event: 'end', listener: () => void): this;
  on(event: 'error', listener: () => void): this;
}

interface SocketLike {
  once(event: 'close', listener: () => void): this;
}

interface ServerResponseLike {
  statusCode: number;
  setHeader(name: string, value: string): void;
  end(body?: string): void;
}

interface ServerAddressLike {
  readonly address: string;
  readonly port: number;
}

interface ServerLike {
  requestTimeout: number;
  headersTimeout: number;
  keepAliveTimeout: number;
  maxRequestsPerSocket: number;
  listen(port: number, host: string, callback: () => void): void;
  close(callback: (error?: Error) => void): void;
  address(): ServerAddressLike | string | null;
  once(event: 'error', listener: (error: Error) => void): this;
  off(event: 'error', listener: (error: Error) => void): this;
}

interface SocketBinding {
  readonly sessionId: string;
  readonly connectionId: string;
  readonly tenantId: GatewaySessionSnapshot['tenantId'];
  readonly actorIdentityId: GatewaySessionSnapshot['actorIdentityId'];
  readonly correlationId: GatewaySessionSnapshot['correlationId'];
}

export interface GatewayHttpNetworkTransportConfig {
  readonly host?: string;
  readonly maxBodyBytes?: number;
  readonly requestTimeoutMs?: number;
  readonly headersTimeoutMs?: number;
  readonly keepAliveTimeoutMs?: number;
  readonly maxRequestsPerSocket?: number;
  readonly clock?: () => number;
}

export interface GatewayHttpNetworkAddress {
  readonly protocol: 'http';
  readonly host: string;
  readonly port: number;
  readonly protocolVersion: typeof GATEWAY_PROTOCOL_VERSION;
  readonly authorizesExecution: false;
}

interface ResolvedConfig {
  readonly host: string;
  readonly maxBodyBytes: number;
  readonly requestTimeoutMs: number;
  readonly headersTimeoutMs: number;
  readonly keepAliveTimeoutMs: number;
  readonly maxRequestsPerSocket: number;
  readonly clock: () => number;
}

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function hasOnlyKeys(value: Record<string, unknown>, allowed: ReadonlySet<string>): boolean {
  return Object.keys(value).every((key) => allowed.has(key));
}

function positiveInteger(value: number, name: string, maximum = Number.MAX_SAFE_INTEGER): number {
  if (!Number.isSafeInteger(value) || value <= 0 || value > maximum) {
    throw new Error(`${name} must be a positive bounded integer.`);
  }
  return value;
}

function resolveConfig(config: GatewayHttpNetworkTransportConfig): ResolvedConfig {
  const host = config.host ?? '127.0.0.1';
  if (!LOOPBACK_HOSTS.has(host)) {
    throw new Error('Gateway HTTP transport must bind to an explicit loopback host.');
  }
  const requestTimeoutMs = positiveInteger(
    config.requestTimeoutMs ?? DEFAULT_REQUEST_TIMEOUT_MS,
    'requestTimeoutMs',
    60_000,
  );
  const headersTimeoutMs = positiveInteger(
    config.headersTimeoutMs ?? DEFAULT_HEADERS_TIMEOUT_MS,
    'headersTimeoutMs',
    requestTimeoutMs,
  );
  return {
    host,
    maxBodyBytes: positiveInteger(
      config.maxBodyBytes ?? DEFAULT_MAX_BODY_BYTES,
      'maxBodyBytes',
      1024 * 1024,
    ),
    requestTimeoutMs,
    headersTimeoutMs,
    keepAliveTimeoutMs: positiveInteger(
      config.keepAliveTimeoutMs ?? DEFAULT_KEEP_ALIVE_TIMEOUT_MS,
      'keepAliveTimeoutMs',
      60_000,
    ),
    maxRequestsPerSocket: positiveInteger(
      config.maxRequestsPerSocket ?? DEFAULT_MAX_REQUESTS_PER_SOCKET,
      'maxRequestsPerSocket',
      10_000,
    ),
    clock: config.clock ?? Date.now,
  };
}

function transportError(
  response: ServerResponseLike,
  statusCode: number,
  code: TransportErrorCode,
  message: string,
): void {
  response.statusCode = statusCode;
  response.setHeader('content-type', 'application/json; charset=utf-8');
  response.setHeader('cache-control', 'no-store');
  response.end(
    JSON.stringify({
      ok: false,
      transportError: { code, message },
      authorizesExecution: false,
    }),
  );
}

function protocolResult(response: ServerResponseLike, result: unknown): void {
  response.statusCode = 200;
  response.setHeader('content-type', 'application/json; charset=utf-8');
  response.setHeader('cache-control', 'no-store');
  response.end(JSON.stringify(result));
}

function normalizedContentType(headers: IncomingRequestLike['headers']): string | null {
  const value = headers['content-type'];
  if (typeof value === 'string') return value.toLowerCase();
  if (Array.isArray(value) && typeof value[0] === 'string') return value[0].toLowerCase();
  return null;
}

async function readJsonBody(
  request: IncomingRequestLike,
  maxBodyBytes: number,
): Promise<
  | { readonly ok: true; readonly value: unknown }
  | { readonly ok: false; readonly tooLarge: boolean }
> {
  return new Promise((resolve) => {
    let settled = false;
    let bytes = 0;
    let body = '';
    const finish = (
      value:
        | { readonly ok: true; readonly value: unknown }
        | { readonly ok: false; readonly tooLarge: boolean },
    ): void => {
      if (settled) return;
      settled = true;
      resolve(value);
    };

    request.setEncoding('utf8');
    request.on('data', (chunk) => {
      if (settled) return;
      bytes += new TextEncoder().encode(chunk).byteLength;
      if (bytes > maxBodyBytes) {
        body = '';
        finish({ ok: false, tooLarge: true });
        return;
      }
      body += chunk;
    });
    request.on('end', () => {
      if (settled) return;
      try {
        finish({ ok: true, value: JSON.parse(body) as unknown });
      } catch {
        finish({ ok: false, tooLarge: false });
      }
    });
    request.on('error', () => finish({ ok: false, tooLarge: false }));
  });
}

function bindingFrom(snapshot: GatewaySessionSnapshot): SocketBinding {
  return {
    sessionId: snapshot.sessionId,
    connectionId: snapshot.connectionId,
    tenantId: snapshot.tenantId,
    actorIdentityId: snapshot.actorIdentityId,
    correlationId: snapshot.correlationId,
  };
}

export class GatewayHttpNetworkTransport {
  readonly #manager: GatewaySessionManager;
  readonly #config: ResolvedConfig;
  readonly #socketBindings = new WeakMap<SocketLike, SocketBinding>();
  readonly #server: ServerLike;
  #started = false;

  constructor(manager: GatewaySessionManager, config: GatewayHttpNetworkTransportConfig = {}) {
    this.#manager = manager;
    this.#config = resolveConfig(config);
    this.#server = createServer((request: IncomingRequestLike, response: ServerResponseLike) => {
      void this.#handle(request, response);
    }) as ServerLike;
    this.#server.requestTimeout = this.#config.requestTimeoutMs;
    this.#server.headersTimeout = this.#config.headersTimeoutMs;
    this.#server.keepAliveTimeout = this.#config.keepAliveTimeoutMs;
    this.#server.maxRequestsPerSocket = this.#config.maxRequestsPerSocket;
  }

  async start(port = 0): Promise<GatewayHttpNetworkAddress> {
    if (this.#started) throw new Error('Gateway HTTP transport is already started.');
    if (!Number.isSafeInteger(port) || port < 0 || port > 65_535) {
      throw new Error('Gateway HTTP transport port is invalid.');
    }

    await new Promise<void>((resolve, reject) => {
      const onError = (error: Error): void => reject(error);
      this.#server.once('error', onError);
      this.#server.listen(port, this.#config.host, () => {
        this.#server.off('error', onError);
        resolve();
      });
    });
    this.#started = true;
    const address = this.#server.address();
    if (address === null || typeof address === 'string') {
      await this.stop();
      throw new Error('Gateway HTTP transport did not expose a TCP address.');
    }
    return {
      protocol: 'http',
      host: address.address,
      port: address.port,
      protocolVersion: GATEWAY_PROTOCOL_VERSION,
      authorizesExecution: false,
    };
  }

  async stop(): Promise<void> {
    if (!this.#started) return;
    await new Promise<void>((resolve, reject) => {
      this.#server.close((error?: Error) => {
        if (error !== undefined) reject(error);
        else resolve();
      });
    });
    this.#started = false;
  }

  async #handle(request: IncomingRequestLike, response: ServerResponseLike): Promise<void> {
    const method = request.method ?? '';
    const path = new URL(request.url ?? '/', 'http://aurora-gateway.invalid').pathname;
    const knownRoute =
      path === '/v1/gateway/sessions/open' ||
      path === '/v1/gateway/sessions/reconnect' ||
      path === '/v1/gateway/requests/begin' ||
      path === '/v1/gateway/requests/cancel' ||
      path === '/v1/gateway/requests/complete' ||
      path === '/v1/gateway/sessions/close';

    if (!knownRoute) {
      transportError(
        response,
        404,
        'ROUTE_NOT_FOUND',
        'Gateway transport route is not allowlisted.',
      );
      return;
    }
    if (method !== 'POST') {
      transportError(response, 405, 'METHOD_NOT_ALLOWED', 'Gateway transport accepts POST only.');
      return;
    }
    const contentType = normalizedContentType(request.headers);
    if (contentType === null || !contentType.startsWith('application/json')) {
      transportError(
        response,
        415,
        'CONTENT_TYPE_UNSUPPORTED',
        'Gateway transport requires application/json.',
      );
      return;
    }

    const parsed = await readJsonBody(request, this.#config.maxBodyBytes);
    if (!parsed.ok) {
      transportError(
        response,
        parsed.tooLarge ? 413 : 400,
        parsed.tooLarge ? 'BODY_TOO_LARGE' : 'BODY_MALFORMED',
        parsed.tooLarge
          ? 'Gateway transport body exceeds the configured limit.'
          : 'Gateway transport body is not valid JSON.',
      );
      return;
    }
    if (!isPlainRecord(parsed.value)) {
      transportError(response, 400, 'BODY_MALFORMED', 'Gateway transport body must be an object.');
      return;
    }

    if (path === '/v1/gateway/sessions/open') {
      if (!hasOnlyKeys(parsed.value, OPEN_KEYS)) {
        transportError(
          response,
          400,
          'BODY_MALFORMED',
          'Gateway open-session body shape is invalid.',
        );
        return;
      }
      const result = this.#manager.openSession({ ...parsed.value, nowMs: this.#config.clock() });
      if (result.ok) this.#bindSocket(request.socket, result.value);
      protocolResult(response, result);
      return;
    }

    if (path === '/v1/gateway/sessions/reconnect') {
      if (!hasOnlyKeys(parsed.value, RECONNECT_KEYS)) {
        transportError(response, 400, 'BODY_MALFORMED', 'Gateway reconnect body shape is invalid.');
        return;
      }
      const result = this.#manager.reconnectSession({
        ...parsed.value,
        nowMs: this.#config.clock(),
      });
      if (result.ok) this.#bindSocket(request.socket, result.value);
      protocolResult(response, result);
      return;
    }

    const binding = this.#socketBindings.get(request.socket);
    if (binding === undefined) {
      transportError(
        response,
        409,
        'SESSION_BINDING_REQUIRED',
        'This TCP connection has no authenticated gateway session binding.',
      );
      return;
    }

    if (path === '/v1/gateway/requests/begin') {
      if (!hasOnlyKeys(parsed.value, BEGIN_KEYS)) {
        transportError(
          response,
          400,
          'BODY_MALFORMED',
          'Gateway begin-request body shape is invalid.',
        );
        return;
      }
      protocolResult(
        response,
        this.#manager.beginRequest({
          protocolVersion: GATEWAY_PROTOCOL_VERSION,
          ...binding,
          requestId: parsed.value.requestId,
          deadlineMs: parsed.value.deadlineMs,
          nowMs: this.#config.clock(),
        }),
      );
      return;
    }

    if (path === '/v1/gateway/requests/cancel' || path === '/v1/gateway/requests/complete') {
      if (!hasOnlyKeys(parsed.value, REQUEST_KEYS)) {
        transportError(
          response,
          400,
          'BODY_MALFORMED',
          'Gateway request-operation body shape is invalid.',
        );
        return;
      }
      const input = {
        protocolVersion: GATEWAY_PROTOCOL_VERSION,
        ...binding,
        requestId: parsed.value.requestId,
        nowMs: this.#config.clock(),
      };
      protocolResult(
        response,
        path.endsWith('/cancel')
          ? this.#manager.cancelRequest(input)
          : this.#manager.completeRequest(input),
      );
      return;
    }

    if (!hasOnlyKeys(parsed.value, EMPTY_KEYS)) {
      transportError(response, 400, 'BODY_MALFORMED', 'Gateway close-session body must be empty.');
      return;
    }
    protocolResult(
      response,
      this.#manager.closeSession({
        protocolVersion: GATEWAY_PROTOCOL_VERSION,
        ...binding,
        nowMs: this.#config.clock(),
      }),
    );
    this.#socketBindings.delete(request.socket);
  }

  #bindSocket(socket: SocketLike, snapshot: GatewaySessionSnapshot): void {
    const binding = bindingFrom(snapshot);
    this.#socketBindings.set(socket, binding);
    socket.once('close', () => {
      const current = this.#socketBindings.get(socket);
      if (current === undefined || current.connectionId !== binding.connectionId) return;
      this.#socketBindings.delete(socket);
      this.#manager.closeSession({
        protocolVersion: GATEWAY_PROTOCOL_VERSION,
        ...binding,
        nowMs: this.#config.clock(),
      });
    });
  }
}
