// @ts-expect-error -- Aurora targets Node 22 built-ins without repository-wide @types/node.
import { createServer } from 'node:http';
// @ts-expect-error -- Aurora targets Node 22 built-ins without repository-wide @types/node.
import { randomBytes } from 'node:crypto';

import {
  TransientGatewayBootstrapBroker,
  type AuthenticatedGatewayBootstrapPrincipal,
  type GatewayBootstrapIssueResult,
} from './gateway-bootstrap.js';

const ROUTE = '/v1/gateway/bootstrap/exchange';
const REFERENCE = /^gbr_[A-Za-z0-9_-]{43,128}$/u;
const LOOPBACK_HOSTS = new Set(['127.0.0.1', '::1', 'localhost']);
const DEFAULT_TTL_MS = 60_000;
const DEFAULT_MAX_REFERENCES = 256;
const DEFAULT_MAX_BODY_BYTES = 4096;

interface RequestLike {
  readonly method?: string;
  readonly url?: string;
  readonly headers: Readonly<Record<string, string | readonly string[] | undefined>>;
  setEncoding(encoding: 'utf8'): void;
  on(event: 'data', listener: (chunk: string) => void): this;
  on(event: 'end' | 'error', listener: () => void): this;
}

interface ResponseLike {
  statusCode: number;
  setHeader(name: string, value: string): void;
  end(body?: string): void;
}

interface ServerLike {
  requestTimeout: number;
  headersTimeout: number;
  keepAliveTimeout: number;
  listen(port: number, host: string, callback: () => void): void;
  close(callback: (error?: Error) => void): void;
  closeAllConnections(): void;
  address(): { readonly address: string; readonly port: number } | string | null;
  once(event: 'error', listener: (error: Error) => void): this;
  off(event: 'error', listener: (error: Error) => void): this;
}

export interface GatewayBootstrapDeliveryConfig {
  readonly host?: string;
  readonly referenceTtlMs?: number;
  readonly maxActiveReferences?: number;
  readonly maxBodyBytes?: number;
  readonly clock?: () => number;
}

export interface GatewayBootstrapReferenceEntropy {
  reference(): string;
}

export type GatewayBootstrapReferenceResult =
  | Readonly<{
      ok: true;
      value: Readonly<{
        reference: string;
        expiresAtMs: number;
        authorizesExecution: false;
      }>;
    }>
  | Readonly<{
      ok: false;
      error: Readonly<{ code: 'CAPACITY_EXHAUSTED' | 'ENTROPY_FAILURE'; retryable: false }>;
      authorizesExecution: false;
    }>;

interface ReferenceRecord {
  readonly principal: unknown;
  readonly expiresAtMs: number;
}

function validNow(nowMs: number): boolean {
  return Number.isSafeInteger(nowMs) && nowMs >= 0;
}

function defaultEntropy(): GatewayBootstrapReferenceEntropy {
  return { reference: () => `gbr_${randomBytes(32).toString('base64url')}` };
}

function writeResponse(target: ResponseLike, statusCode: number, body: unknown): void {
  target.statusCode = statusCode;
  target.setHeader('content-type', 'application/json; charset=utf-8');
  target.setHeader('cache-control', 'no-store');
  target.end(JSON.stringify(body));
}

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

async function readBody(request: RequestLike, maxBytes: number): Promise<unknown | null> {
  return new Promise((resolve) => {
    let body = '';
    let bytes = 0;
    let done = false;
    const finish = (value: unknown | null): void => {
      if (!done) {
        done = true;
        resolve(value);
      }
    };
    request.setEncoding('utf8');
    request.on('data', (chunk) => {
      if (done) return;
      bytes += new TextEncoder().encode(chunk).byteLength;
      if (bytes > maxBytes) finish(null);
      else body += chunk;
    });
    request.on('end', () => {
      if (done) return;
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
 * Stages an already-authenticated principal for a one-shot, loopback exchange.
 * The reference and principal are process memory only; neither is client authority.
 */
export class TransientGatewayBootstrapDeliveryBroker {
  readonly #broker: TransientGatewayBootstrapBroker;
  readonly #ttlMs: number;
  readonly #maxActiveReferences: number;
  readonly #entropy: GatewayBootstrapReferenceEntropy;
  readonly #references = new Map<string, ReferenceRecord>();

  constructor(
    broker: TransientGatewayBootstrapBroker,
    config: GatewayBootstrapDeliveryConfig = {},
    entropy: GatewayBootstrapReferenceEntropy = defaultEntropy(),
  ) {
    this.#broker = broker;
    this.#ttlMs = config.referenceTtlMs ?? DEFAULT_TTL_MS;
    this.#maxActiveReferences = config.maxActiveReferences ?? DEFAULT_MAX_REFERENCES;
    this.#entropy = entropy;
    if (
      !Number.isSafeInteger(this.#ttlMs) ||
      this.#ttlMs <= 0 ||
      this.#ttlMs > 15 * 60_000 ||
      !Number.isSafeInteger(this.#maxActiveReferences) ||
      this.#maxActiveReferences <= 0 ||
      this.#maxActiveReferences > 4096
    ) {
      throw new Error('Gateway bootstrap delivery limits are invalid.');
    }
  }

  stage(principal: AuthenticatedGatewayBootstrapPrincipal, nowMs: number): GatewayBootstrapReferenceResult {
    if (!validNow(nowMs)) {
      return { ok: false, error: { code: 'ENTROPY_FAILURE', retryable: false }, authorizesExecution: false };
    }
    this.#purge(nowMs);
    if (this.#references.size >= this.#maxActiveReferences) {
      return { ok: false, error: { code: 'CAPACITY_EXHAUSTED', retryable: false }, authorizesExecution: false };
    }
    for (let attempt = 0; attempt < 4; attempt += 1) {
      const reference = this.#entropy.reference();
      if (!REFERENCE.test(reference) || this.#references.has(reference)) continue;
      this.#references.set(reference, { principal, expiresAtMs: nowMs + this.#ttlMs });
      return {
        ok: true,
        value: { reference, expiresAtMs: nowMs + this.#ttlMs, authorizesExecution: false },
      };
    }
    return { ok: false, error: { code: 'ENTROPY_FAILURE', retryable: false }, authorizesExecution: false };
  }

  exchange(reference: string, nowMs: number): GatewayBootstrapIssueResult {
    if (!REFERENCE.test(reference) || !validNow(nowMs)) {
      return {
        ok: false,
        error: { code: 'PRINCIPAL_INVALID', retryable: false },
        authorizesExecution: false,
        provesExecutionSuccess: false,
        retryAuthorized: false,
      };
    }
    const record = this.#references.get(reference);
    if (record === undefined) {
      return {
        ok: false,
        error: { code: 'PRINCIPAL_EXPIRED', retryable: false },
        authorizesExecution: false,
        provesExecutionSuccess: false,
        retryAuthorized: false,
      };
    }
    this.#references.delete(reference);
    if (nowMs >= record.expiresAtMs) {
      return {
        ok: false,
        error: { code: 'PRINCIPAL_EXPIRED', retryable: false },
        authorizesExecution: false,
        provesExecutionSuccess: false,
        retryAuthorized: false,
      };
    }
    return this.#broker.issue(record.principal, nowMs);
  }

  #purge(nowMs: number): void {
    for (const [reference, record] of this.#references) {
      if (nowMs >= record.expiresAtMs) this.#references.delete(reference);
    }
  }
}

export class GatewayBootstrapExchangeTransport {
  readonly #delivery: TransientGatewayBootstrapDeliveryBroker;
  readonly #clock: () => number;
  readonly #maxBodyBytes: number;
  readonly #host: string;
  readonly #server: ServerLike;
  #started = false;

  constructor(
    delivery: TransientGatewayBootstrapDeliveryBroker,
    config: GatewayBootstrapDeliveryConfig = {},
  ) {
    this.#delivery = delivery;
    this.#clock = config.clock ?? Date.now;
    this.#maxBodyBytes = config.maxBodyBytes ?? DEFAULT_MAX_BODY_BYTES;
    this.#host = config.host ?? '127.0.0.1';
    if (!LOOPBACK_HOSTS.has(this.#host) || this.#maxBodyBytes <= 0 || this.#maxBodyBytes > 64 * 1024) {
      throw new Error('Gateway bootstrap exchange must be bounded and loopback-only.');
    }
    this.#server = createServer((request: RequestLike, response: ResponseLike) => {
      void this.#handle(request, response);
    }) as ServerLike;
    this.#server.requestTimeout = 10_000;
    this.#server.headersTimeout = 5_000;
    this.#server.keepAliveTimeout = 5_000;
  }

  async start(port = 8081): Promise<Readonly<{ host: string; port: number; authorizesExecution: false }>> {
    if (this.#started || !Number.isSafeInteger(port) || port < 1 || port > 65_535) {
      throw new Error('Gateway bootstrap exchange port is invalid or already started.');
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
    if (address === null || typeof address === 'string') throw new Error('Exchange address unavailable.');
    return { host: address.address, port: address.port, authorizesExecution: false };
  }

  async stop(): Promise<void> {
    if (!this.#started) return;
    await new Promise<void>((resolve, reject) =>
      this.#server.close((error?: Error) => (error === undefined ? resolve() : reject(error))),
    );
    this.#server.closeAllConnections();
    this.#started = false;
  }

  async #handle(request: RequestLike, response: ResponseLike): Promise<void> {
    if (request.method !== 'POST' || new URL(request.url ?? '/', 'http://localhost').pathname !== ROUTE) {
      writeResponse(response, 404, { ok: false, error: { code: 'ROUTE_NOT_FOUND' }, authorizesExecution: false });
      return;
    }
    const contentType = request.headers['content-type'];
    if (typeof contentType !== 'string' || !contentType.toLowerCase().startsWith('application/json')) {
      writeResponse(response, 415, { ok: false, error: { code: 'CONTENT_TYPE_UNSUPPORTED' }, authorizesExecution: false });
      return;
    }
    const body = await readBody(request, this.#maxBodyBytes);
    if (!isPlainRecord(body) || Object.keys(body).length !== 1 || typeof body.bootstrapReference !== 'string') {
      writeResponse(response, 400, { ok: false, error: { code: 'BODY_MALFORMED' }, authorizesExecution: false });
      return;
    }
    writeResponse(response, 200, this.#delivery.exchange(body.bootstrapReference, this.#clock()));
  }
}

export const GATEWAY_BOOTSTRAP_EXCHANGE_ROUTE = ROUTE;
