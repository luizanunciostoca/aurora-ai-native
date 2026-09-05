// @ts-expect-error -- Aurora targets Node 22 built-ins without repository-wide @types/node.
import { createServer } from 'node:http';

import type { GatewayBootstrapDeliveryBroker } from './gateway-bootstrap-delivery.js';

const LOOPBACK_HOSTS = new Set(['127.0.0.1', '::1', 'localhost']);
const EXCHANGE_PATH = '/v1/gateway/bootstrap/exchange';
const DEFAULT_MAX_BODY_BYTES = 4 * 1024;
const DEFAULT_REQUEST_TIMEOUT_MS = 5_000;

interface IncomingRequestLike {
  readonly method?: string;
  readonly url?: string;
  readonly headers: Readonly<Record<string, string | readonly string[] | undefined>>;
  setEncoding(encoding: 'utf8'): void;
  on(event: 'data', listener: (chunk: string) => void): this;
  on(event: 'end' | 'error', listener: () => void): this;
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
  listen(port: number, host: string, callback: () => void): void;
  close(callback: (error?: Error) => void): void;
  closeAllConnections(): void;
  address(): ServerAddressLike | string | null;
  once(event: 'error', listener: (error: Error) => void): this;
  off(event: 'error', listener: (error: Error) => void): this;
}

export interface GatewayBootstrapHttpExchangeConfig {
  readonly host?: string;
  readonly maxBodyBytes?: number;
  readonly requestTimeoutMs?: number;
  readonly clock?: () => number;
}

export interface GatewayBootstrapHttpExchangeAddress {
  readonly protocol: 'http';
  readonly host: string;
  readonly port: number;
  readonly path: typeof EXCHANGE_PATH;
  readonly authorizesExecution: false;
}

function positiveInteger(value: unknown, maximum: number): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value > 0 && value <= maximum;
}

function normalizedContentType(headers: IncomingRequestLike['headers']): string | null {
  const value = headers['content-type'];
  if (typeof value === 'string') return value.toLowerCase();
  if (Array.isArray(value) && typeof value[0] === 'string') return value[0].toLowerCase();
  return null;
}

function isPlainRecord(value: unknown): value is Record<string, unknown> {
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

function reply(response: ServerResponseLike, statusCode: number, body: unknown): void {
  response.statusCode = statusCode;
  response.setHeader('content-type', 'application/json; charset=utf-8');
  response.setHeader('cache-control', 'no-store');
  response.setHeader('pragma', 'no-cache');
  response.end(JSON.stringify(body));
}

function rejected(response: ServerResponseLike, statusCode: number, code: string): void {
  reply(response, statusCode, {
    ok: false,
    bootstrapError: { code },
    authorizesExecution: false,
    provesExecutionSuccess: false,
    retryAuthorized: false,
  });
}

async function readJsonBody(
  request: IncomingRequestLike,
  maxBodyBytes: number,
): Promise<unknown | null> {
  return new Promise((resolve) => {
    let settled = false;
    let bytes = 0;
    let body = '';
    const finish = (value: unknown | null): void => {
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
        finish(null);
        return;
      }
      body += chunk;
    });
    request.on('end', () => {
      if (settled) return;
      try {
        finish(JSON.parse(body) as unknown);
      } catch {
        finish(null);
      }
    });
    request.on('error', () => finish(null));
  });
}

/**
 * LOCAL/physical-acceptance exchange listener. It is deliberately separate from the authenticated
 * W14 session socket because this request exists before a gateway session can exist. The listener
 * is loopback-only and exposes exchange only; trusted server code must stage references directly
 * on GatewayBootstrapDeliveryBroker. It is not a voice stack and carries no business authority.
 */
export class GatewayBootstrapHttpExchangeServer {
  readonly #delivery: GatewayBootstrapDeliveryBroker;
  readonly #host: string;
  readonly #maxBodyBytes: number;
  readonly #clock: () => number;
  readonly #server: ServerLike;
  #started = false;

  constructor(
    delivery: GatewayBootstrapDeliveryBroker,
    config: GatewayBootstrapHttpExchangeConfig = {},
  ) {
    const host = config.host ?? '127.0.0.1';
    if (!LOOPBACK_HOSTS.has(host)) {
      throw new Error('Gateway bootstrap exchange must bind to loopback.');
    }
    const maxBodyBytes = config.maxBodyBytes ?? DEFAULT_MAX_BODY_BYTES;
    const requestTimeoutMs = config.requestTimeoutMs ?? DEFAULT_REQUEST_TIMEOUT_MS;
    if (!positiveInteger(maxBodyBytes, 64 * 1024) || !positiveInteger(requestTimeoutMs, 60_000)) {
      throw new Error('Gateway bootstrap exchange limits are invalid.');
    }
    this.#delivery = delivery;
    this.#host = host;
    this.#maxBodyBytes = maxBodyBytes;
    this.#clock = config.clock ?? Date.now;
    this.#server = createServer((request: IncomingRequestLike, response: ServerResponseLike) => {
      void this.#handle(request, response);
    }) as ServerLike;
    this.#server.requestTimeout = requestTimeoutMs;
    this.#server.headersTimeout = requestTimeoutMs;
  }

  async start(port = 0): Promise<GatewayBootstrapHttpExchangeAddress> {
    if (this.#started) throw new Error('Gateway bootstrap exchange is already started.');
    if (!Number.isSafeInteger(port) || port < 0 || port > 65_535) {
      throw new Error('Gateway bootstrap exchange port is invalid.');
    }
    await new Promise<void>((resolve, reject) => {
      const onError = (error: Error): void => reject(error);
      this.#server.once('error', onError);
      this.#server.listen(port, this.#host, () => {
        this.#server.off('error', onError);
        resolve();
      });
    });
    this.#started = true;
    const address = this.#server.address();
    if (address === null || typeof address === 'string') {
      await this.stop();
      throw new Error('Gateway bootstrap exchange did not expose a TCP address.');
    }
    return {
      protocol: 'http',
      host: address.address,
      port: address.port,
      path: EXCHANGE_PATH,
      authorizesExecution: false,
    };
  }

  async stop(): Promise<void> {
    if (!this.#started) return;
    await new Promise<void>((resolve, reject) => {
      this.#server.close((error?: Error) => (error === undefined ? resolve() : reject(error)));
      this.#server.closeAllConnections();
    });
    this.#started = false;
  }

  async #handle(request: IncomingRequestLike, response: ServerResponseLike): Promise<void> {
    const path = new URL(request.url ?? '/', 'http://aurora-bootstrap.invalid').pathname;
    if (path !== EXCHANGE_PATH) {
      rejected(response, 404, 'ROUTE_NOT_FOUND');
      return;
    }
    if (request.method !== 'POST') {
      rejected(response, 405, 'METHOD_NOT_ALLOWED');
      return;
    }
    const contentType = normalizedContentType(request.headers);
    if (contentType === null || !contentType.startsWith('application/json')) {
      rejected(response, 415, 'CONTENT_TYPE_UNSUPPORTED');
      return;
    }
    const parsed = await readJsonBody(request, this.#maxBodyBytes);
    if (
      !isPlainRecord(parsed) ||
      Object.keys(parsed).length !== 1 ||
      typeof parsed.bootstrapReference !== 'string'
    ) {
      rejected(response, 400, 'BODY_MALFORMED');
      return;
    }
    const result = this.#delivery.exchange(parsed.bootstrapReference, this.#clock());
    if (!result.ok) {
      // Deliberately collapse unknown/expired/replayed references to the same network observation.
      rejected(response, 401, 'BOOTSTRAP_REJECTED');
      return;
    }
    reply(response, 200, { ok: true, value: result.value });
  }
}
