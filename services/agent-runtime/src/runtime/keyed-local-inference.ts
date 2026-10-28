import {
  LOCAL_QWEN_CHAT_ENDPOINT,
  LocalQwenInferenceClient,
  type LocalInferenceRequest,
  type LocalInferenceResult,
} from './local-inference.js';

const API_KEY_PATTERN = /^[A-Za-z0-9_-]{43,128}$/u;
const MAX_CREDENTIAL_OBSERVATION_AGE_MS = 10_000;
const MAX_CREDENTIAL_LEASE_MS = 120_000;
const MAX_HTTP_REQUEST_BODY_BYTES = 12_288;
const CREDENTIAL_FIELDS = new Set([
  'kind',
  'bearerToken',
  'observedAtEpochMs',
  'expiresAtEpochMs',
  'authorizesExecution',
  'canInvokeTools',
]);

/**
 * Ephemeral secret supplied by the *separately owned, trusted* local launcher.
 * Neither the Android client, the W06 prompt nor the model may supply it.
 * This type itself does NOT attest a PID, binary, port owner or GGUF digest.
 */
export interface EphemeralLocalModelCredential {
  readonly kind: 'LOCAL_MODEL_EPHEMERAL_BEARER';
  readonly bearerToken: string;
  readonly observedAtEpochMs: number;
  readonly expiresAtEpochMs: number;
  readonly authorizesExecution: false;
  readonly canInvokeTools: false;
}

export interface EphemeralLocalModelCredentialSource {
  readCurrent(): Promise<EphemeralLocalModelCredential | null>;
}

export interface KeyedLocalQwenInferenceDependencies {
  readonly credentialSource: EphemeralLocalModelCredentialSource;
  readonly transport?: typeof fetch;
  readonly now?: () => number;
}

function plainRecord(value: unknown): value is Record<string, unknown> {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return false;
  try {
    const prototype = Object.getPrototypeOf(value);
    return prototype === Object.prototype || prototype === null;
  } catch {
    return false;
  }
}

function parseCredential(value: unknown, nowEpochMs: number): { readonly token: string } | null {
  if (!plainRecord(value) || !Number.isSafeInteger(nowEpochMs)) return null;
  try {
    const fields = Object.getOwnPropertyDescriptors(value);
    if (!Object.keys(fields).every((key) => CREDENTIAL_FIELDS.has(key))) return null;
    if (Object.values(fields).some((field) => field.get !== undefined || field.set !== undefined)) {
      return null;
    }
    const kind = fields.kind?.value as unknown;
    const bearer = fields.bearerToken?.value as unknown;
    const observed = fields.observedAtEpochMs?.value as unknown;
    const expires = fields.expiresAtEpochMs?.value as unknown;
    if (
      kind !== 'LOCAL_MODEL_EPHEMERAL_BEARER' ||
      typeof bearer !== 'string' ||
      !API_KEY_PATTERN.test(bearer) ||
      typeof observed !== 'number' ||
      !Number.isSafeInteger(observed) ||
      typeof expires !== 'number' ||
      !Number.isSafeInteger(expires) ||
      observed > nowEpochMs ||
      nowEpochMs - observed > MAX_CREDENTIAL_OBSERVATION_AGE_MS ||
      expires <= nowEpochMs ||
      expires <= observed ||
      expires - observed > MAX_CREDENTIAL_LEASE_MS ||
      fields.authorizesExecution?.value !== false ||
      fields.canInvokeTools?.value !== false
    ) {
      return null;
    }
    return { token: bearer };
  } catch {
    return null;
  }
}

function assertRequestShape(
  input: RequestInfo | URL,
  init?: RequestInit,
): { readonly headers: Headers; readonly signal: AbortSignal } {
  if (
    typeof input !== 'string' ||
    input !== LOCAL_QWEN_CHAT_ENDPOINT ||
    init?.method !== 'POST' ||
    init.redirect !== 'error' ||
    init.credentials !== 'omit' ||
    init.cache !== 'no-store' ||
    init.referrerPolicy !== 'no-referrer' ||
    typeof init.body !== 'string' ||
    new TextEncoder().encode(init.body).byteLength > MAX_HTTP_REQUEST_BODY_BYTES ||
    init.signal === undefined ||
    init.signal === null ||
    init.signal.aborted === true
  ) {
    throw new Error('LOCAL_KEYED_HTTP_REQUEST_REJECTED');
  }
  const headers = new Headers(init.headers);
  if (
    headers.get('content-type') !== 'application/json' ||
    headers.has('authorization') ||
    headers.has('cookie') ||
    headers.has('proxy-authorization')
  ) {
    throw new Error('LOCAL_KEYED_HTTP_HEADERS_REJECTED');
  }
  return { headers, signal: init.signal };
}

function readCredentialWithinRequest(
  source: EphemeralLocalModelCredentialSource,
  signal: AbortSignal,
): Promise<unknown> {
  return new Promise((resolve, reject) => {
    if (signal.aborted) {
      reject(new Error('LOCAL_KEY_REQUEST_CANCELLED'));
      return;
    }
    const cancelled = (): void => {
      signal.removeEventListener('abort', cancelled);
      reject(new Error('LOCAL_KEY_REQUEST_CANCELLED'));
    };
    signal.addEventListener('abort', cancelled, { once: true });
    void Promise.resolve()
      .then(() => source.readCurrent())
      .then(
        (value) => {
          signal.removeEventListener('abort', cancelled);
          if (signal.aborted) reject(new Error('LOCAL_KEY_REQUEST_CANCELLED'));
          else resolve(value);
        },
        () => {
          signal.removeEventListener('abort', cancelled);
          reject(new Error('LOCAL_KEY_SOURCE_UNAVAILABLE'));
        },
      );
  });
}

/**
 * W05-F private composition guard for a future W14-authenticated model route.
 *
 * An anonymous/default local model client is NOT an authorized production
 * composition. The real owner must obtain its short-lived secret from the
 * launch process that actually controls the pinned model and binary. A bearer
 * proves API *access* only: this adapter cannot itself attest the remote
 * process, prevent a different app from racing the raw port, or certify W15-J.
 * It never starts a server, manages Android permission or invokes tools.
 */
export class KeyedLocalQwenInferenceClient {
  readonly #client: LocalQwenInferenceClient;

  constructor(dependencies: KeyedLocalQwenInferenceDependencies) {
    if (
      dependencies === null ||
      typeof dependencies !== 'object' ||
      typeof dependencies.credentialSource?.readCurrent !== 'function'
    ) {
      throw new Error('LOCAL_KEY_SOURCE_REQUIRED');
    }
    const now = dependencies.now ?? Date.now;
    const transport = dependencies.transport ?? fetch;
    const keyedTransport = (async (
      input: RequestInfo | URL,
      init?: RequestInit,
    ): Promise<Response> => {
      const { headers, signal } = assertRequestShape(input, init);
      // assertRequestShape enforces a live AbortSignal from W05-F's bounded client.
      const rawCredential = await readCredentialWithinRequest(
        dependencies.credentialSource,
        signal,
      );
      const credential = parseCredential(rawCredential, now());
      if (credential === null) throw new Error('LOCAL_KEY_UNAVAILABLE');
      if (signal.aborted) throw new Error('LOCAL_KEY_REQUEST_CANCELLED');
      headers.set('authorization', `Bearer ${credential.token}`);
      return transport(LOCAL_QWEN_CHAT_ENDPOINT, { ...init, headers });
    }) as typeof fetch;
    this.#client = new LocalQwenInferenceClient({ transport: keyedTransport, now });
  }

  infer(request: LocalInferenceRequest): Promise<LocalInferenceResult> {
    return this.#client.infer(request);
  }
}
