import type { Rfc3339Timestamp } from '@aurora/contracts/context';

import { resolveProviderBinding } from '../bindings/index.js';
import { withResolvedCredential } from '../credentials/index.js';
import {
  PROVIDER_READ_TRANSPORT_ERRORS,
  type ProviderReadCursor,
  type ProviderReadDependencies,
  type ProviderReadFailure,
  type ProviderReadQueryValue,
  type ProviderReadRateLimitObservation,
  type ProviderReadRequest,
  type ProviderReadResult,
  type ProviderReadTransportPage,
  type ProviderReadTransportResult,
} from './types.js';

const REQUEST_KEYS = new Set([
  'tenant',
  'executionTarget',
  'binding',
  'secretReference',
  'now',
  'correlationReference',
  'operation',
  'fields',
  'query',
  'cursor',
  'limits',
]);
const CURSOR_KEYS = new Set(['token', 'scopeKey']);
const LIMIT_KEYS = new Set(['maxPages', 'maxItems']);
const RATE_LIMIT_KEYS = new Set(['remaining', 'limit', 'resetAt', 'retryAfterMs']);
const TRANSPORT_SUCCESS_KEYS = new Set(['ok', 'page']);
const TRANSPORT_FAILURE_KEYS = new Set(['ok', 'error', 'retryAfterMs']);
const PAGE_KEYS = new Set([
  'items',
  'observedAt',
  'nextCursorToken',
  'providerRevision',
  'rateLimit',
]);
const MAX_FIELDS = 64;
const MAX_QUERY_KEYS = 64;
const MAX_PAGES = 20;
const MAX_ITEMS = 1_000;

function fail(error: ProviderReadFailure['error'], retryAfterMs?: number): ProviderReadFailure {
  return {
    ok: false,
    error,
    ...(retryAfterMs === undefined ? {} : { retryAfterMs }),
    authorizesExecution: false,
  };
}

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function hasOnlyOwnDataProperties(
  value: Record<string, unknown>,
  allowed: ReadonlySet<string>,
): boolean {
  for (const key of Reflect.ownKeys(value)) {
    if (typeof key !== 'string' || !allowed.has(key)) return false;
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    if (!descriptor || !('value' in descriptor)) return false;
  }
  return true;
}

function ownValue(value: Record<string, unknown>, key: string): unknown {
  const descriptor = Object.getOwnPropertyDescriptor(value, key);
  return descriptor && 'value' in descriptor ? descriptor.value : undefined;
}

function isNonEmptyString(value: unknown, maxLength = 512): value is string {
  return typeof value === 'string' && value.trim().length > 0 && value.length <= maxLength;
}

function isTimestamp(value: unknown): value is Rfc3339Timestamp {
  return isNonEmptyString(value, 128) && Number.isFinite(Date.parse(value));
}

function isFiniteNonNegativeInteger(value: unknown): value is number {
  return Number.isSafeInteger(value) && (value as number) >= 0;
}

function parseFields(value: unknown): readonly string[] | null {
  if (!Array.isArray(value) || value.length === 0 || value.length > MAX_FIELDS) return null;
  const fields: string[] = [];
  const seen = new Set<string>();
  for (const field of value) {
    if (!isNonEmptyString(field, 128) || seen.has(field)) return null;
    seen.add(field);
    fields.push(field);
  }
  return fields;
}

function isQueryValue(value: unknown): value is ProviderReadQueryValue {
  return (
    value === null ||
    typeof value === 'string' ||
    typeof value === 'boolean' ||
    (typeof value === 'number' && Number.isFinite(value))
  );
}

function parseQuery(value: unknown): Readonly<Record<string, ProviderReadQueryValue>> | null {
  if (!isPlainRecord(value)) return null;
  const keys = Reflect.ownKeys(value);
  if (keys.length > MAX_QUERY_KEYS) return null;

  const parsed: Record<string, ProviderReadQueryValue> = Object.create(null) as Record<
    string,
    ProviderReadQueryValue
  >;
  for (const key of keys) {
    if (typeof key !== 'string' || !isNonEmptyString(key, 128)) return null;
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    if (!descriptor || !('value' in descriptor) || !isQueryValue(descriptor.value)) return null;
    if (typeof descriptor.value === 'string' && descriptor.value.length > 2_048) return null;
    parsed[key] = descriptor.value;
  }
  return parsed;
}

function parseLimits(value: unknown): { readonly maxPages: number; readonly maxItems: number } | null {
  if (!isPlainRecord(value) || !hasOnlyOwnDataProperties(value, LIMIT_KEYS)) return null;
  const maxPages = ownValue(value, 'maxPages');
  const maxItems = ownValue(value, 'maxItems');
  if (
    !Number.isSafeInteger(maxPages) ||
    !Number.isSafeInteger(maxItems) ||
    (maxPages as number) < 1 ||
    (maxPages as number) > MAX_PAGES ||
    (maxItems as number) < 1 ||
    (maxItems as number) > MAX_ITEMS
  ) {
    return null;
  }
  return { maxPages: maxPages as number, maxItems: maxItems as number };
}

function parseCursor(value: unknown): ProviderReadCursor | null {
  if (!isPlainRecord(value) || !hasOnlyOwnDataProperties(value, CURSOR_KEYS)) return null;
  const token = ownValue(value, 'token');
  const scopeKey = ownValue(value, 'scopeKey');
  if (!isNonEmptyString(token, 4_096) || !isNonEmptyString(scopeKey, 8_192)) return null;
  return { token, scopeKey };
}

function stableQuery(query: Readonly<Record<string, ProviderReadQueryValue>>): string {
  return JSON.stringify(
    Object.keys(query)
      .sort()
      .map((key) => [key, query[key]]),
  );
}

function scopeKey(
  bindingReference: string,
  bindingVersion: number,
  provider: string,
  accountReference: string,
  operation: string,
  fields: readonly string[],
  query: Readonly<Record<string, ProviderReadQueryValue>>,
): string {
  return JSON.stringify([
    bindingReference,
    bindingVersion,
    provider,
    accountReference,
    operation,
    [...fields].sort(),
    stableQuery(query),
  ]);
}

function parseRateLimit(value: unknown): ProviderReadRateLimitObservation | null {
  if (!isPlainRecord(value) || !hasOnlyOwnDataProperties(value, RATE_LIMIT_KEYS)) return null;
  const remaining = ownValue(value, 'remaining');
  const limit = ownValue(value, 'limit');
  const resetAt = ownValue(value, 'resetAt');
  const retryAfterMs = ownValue(value, 'retryAfterMs');
  if (
    (remaining !== undefined && !isFiniteNonNegativeInteger(remaining)) ||
    (limit !== undefined && !isFiniteNonNegativeInteger(limit)) ||
    (resetAt !== undefined && !isTimestamp(resetAt)) ||
    (retryAfterMs !== undefined && !isFiniteNonNegativeInteger(retryAfterMs))
  ) {
    return null;
  }
  if (
    typeof remaining === 'number' &&
    typeof limit === 'number' &&
    remaining > limit
  ) {
    return null;
  }
  return {
    ...(remaining === undefined ? {} : { remaining }),
    ...(limit === undefined ? {} : { limit }),
    ...(resetAt === undefined ? {} : { resetAt }),
    ...(retryAfterMs === undefined ? {} : { retryAfterMs }),
  };
}

function parsePage(value: unknown, itemBudget: number): ProviderReadTransportPage | null {
  if (!isPlainRecord(value) || !hasOnlyOwnDataProperties(value, PAGE_KEYS)) return null;
  const items = ownValue(value, 'items');
  const observedAt = ownValue(value, 'observedAt');
  const nextCursorToken = ownValue(value, 'nextCursorToken');
  const providerRevision = ownValue(value, 'providerRevision');
  const rateLimitValue = ownValue(value, 'rateLimit');

  if (!Array.isArray(items) || items.length > itemBudget || !isTimestamp(observedAt)) return null;
  if (nextCursorToken !== undefined && !isNonEmptyString(nextCursorToken, 4_096)) return null;
  if (providerRevision !== undefined && !isNonEmptyString(providerRevision, 512)) return null;
  const rateLimit = rateLimitValue === undefined ? undefined : parseRateLimit(rateLimitValue);
  if (rateLimitValue !== undefined && rateLimit === null) return null;

  return {
    items,
    observedAt,
    ...(nextCursorToken === undefined ? {} : { nextCursorToken }),
    ...(providerRevision === undefined ? {} : { providerRevision }),
    ...(rateLimit === undefined ? {} : { rateLimit }),
  };
}

function parseTransportResult(
  value: unknown,
  itemBudget: number,
): ProviderReadTransportResult | null {
  if (!isPlainRecord(value)) return null;
  const ok = ownValue(value, 'ok');
  if (ok === true) {
    if (!hasOnlyOwnDataProperties(value, TRANSPORT_SUCCESS_KEYS)) return null;
    const page = parsePage(ownValue(value, 'page'), itemBudget);
    return page === null ? null : { ok: true, page };
  }
  if (ok === false) {
    if (!hasOnlyOwnDataProperties(value, TRANSPORT_FAILURE_KEYS)) return null;
    const error = ownValue(value, 'error');
    const retryAfterMs = ownValue(value, 'retryAfterMs');
    if (
      typeof error !== 'string' ||
      !PROVIDER_READ_TRANSPORT_ERRORS.includes(
        error as (typeof PROVIDER_READ_TRANSPORT_ERRORS)[number],
      ) ||
      (retryAfterMs !== undefined && !isFiniteNonNegativeInteger(retryAfterMs))
    ) {
      return null;
    }
    return {
      ok: false,
      error: error as (typeof PROVIDER_READ_TRANSPORT_ERRORS)[number],
      ...(retryAfterMs === undefined ? {} : { retryAfterMs }),
    };
  }
  return null;
}

function requestShape(
  request: ProviderReadRequest,
):
  | Readonly<{
      fields: readonly string[];
      query: Readonly<Record<string, ProviderReadQueryValue>>;
      limits: { readonly maxPages: number; readonly maxItems: number };
      cursor?: ProviderReadCursor;
    }>
  | null {
  if (!isPlainRecord(request) || !hasOnlyOwnDataProperties(request, REQUEST_KEYS)) return null;
  if (
    !isNonEmptyString(request.correlationReference, 512) ||
    !isNonEmptyString(request.operation, 256) ||
    !isTimestamp(request.now) ||
    !isPlainRecord(request.executionTarget) ||
    ownValue(request.executionTarget, 'kind') !== 'PROVIDER'
  ) {
    return null;
  }
  const fields = parseFields(request.fields);
  const query = parseQuery(request.query);
  const limits = parseLimits(request.limits);
  if (fields === null || query === null || limits === null) return null;
  if (request.cursor === undefined) return { fields, query, limits };
  const cursor = parseCursor(request.cursor);
  return cursor === null ? null : { fields, query, limits, cursor };
}

/**
 * Executes bounded, read-only provider pagination while keeping credential
 * material callback-scoped. The result is observation data only and never
 * execution authority.
 */
export async function executeProviderRead(
  request: ProviderReadRequest,
  dependencies: ProviderReadDependencies,
): Promise<ProviderReadResult> {
  const shape = requestShape(request);
  if (shape === null) return fail('REQUEST_MALFORMED');

  const resolution = resolveProviderBinding({
    tenant: request.tenant,
    executionTarget: request.executionTarget,
    candidates: [request.binding],
  });
  if (!resolution.ok) return fail('BINDING_UNAVAILABLE');

  const binding = resolution.binding;
  const expectedScope = scopeKey(
    binding.bindingReference,
    binding.bindingVersion,
    binding.provider,
    binding.accountReference,
    request.operation,
    shape.fields,
    shape.query,
  );
  if (shape.cursor !== undefined && shape.cursor.scopeKey !== expectedScope) {
    return fail('CURSOR_SCOPE_MISMATCH');
  }

  let readOutcome: ProviderReadResult | undefined;
  const credentialResult = await withResolvedCredential(
    {
      tenant: request.tenant,
      binding,
      secretReference: request.secretReference,
      now: request.now,
    },
    dependencies.credentials,
    async (credential) => {
      const items: unknown[] = [];
      const seenCursors = new Set<string>();
      let cursorToken = shape.cursor?.token;
      if (cursorToken !== undefined) seenCursors.add(cursorToken);
      let pagesRead = 0;
      let observedAt: Rfc3339Timestamp = request.now;
      let providerRevision: string | undefined;
      let rateLimit: ProviderReadRateLimitObservation | undefined;
      let continuationToken: string | undefined;

      for (let pageIndex = 0; pageIndex < shape.limits.maxPages; pageIndex += 1) {
        const itemBudget = shape.limits.maxItems - items.length;
        if (itemBudget <= 0) break;

        let rawResult: unknown;
        try {
          rawResult = await dependencies.adapter.readPage(
            {
              provider: binding.provider,
              accountReference: binding.accountReference,
              bindingReference: binding.bindingReference,
              bindingVersion: binding.bindingVersion,
              correlationReference: request.correlationReference,
              operation: request.operation,
              fields: shape.fields,
              query: shape.query,
              ...(cursorToken === undefined ? {} : { cursorToken }),
              itemBudget,
            },
            credential,
          );
        } catch {
          readOutcome = fail('TRANSIENT_TRANSPORT_FAILURE');
          return;
        }

        const transport = parseTransportResult(rawResult, itemBudget);
        if (transport === null) {
          readOutcome = fail('ADAPTER_PROTOCOL_VIOLATION');
          return;
        }
        if (!transport.ok) {
          readOutcome = fail(transport.error, transport.retryAfterMs);
          return;
        }

        pagesRead += 1;
        items.push(...transport.page.items);
        observedAt = transport.page.observedAt;
        providerRevision = transport.page.providerRevision;
        rateLimit = transport.page.rateLimit;

        const next = transport.page.nextCursorToken;
        if (next === undefined) {
          continuationToken = undefined;
          break;
        }
        if (seenCursors.has(next)) {
          readOutcome = fail('ADAPTER_PROTOCOL_VIOLATION');
          return;
        }
        seenCursors.add(next);
        continuationToken = next;
        cursorToken = next;

        if (items.length >= shape.limits.maxItems) break;
      }

      readOutcome = {
        ok: true,
        provider: binding.provider,
        accountReference: binding.accountReference,
        bindingReference: binding.bindingReference,
        bindingVersion: binding.bindingVersion,
        correlationReference: request.correlationReference,
        items,
        pagesRead,
        observedAt,
        ...(providerRevision === undefined ? {} : { providerRevision }),
        ...(continuationToken === undefined
          ? {}
          : { continuationCursor: { token: continuationToken, scopeKey: expectedScope } }),
        ...(rateLimit === undefined ? {} : { rateLimit }),
        authorizesExecution: false,
      };
    },
  );

  if (!credentialResult.ok) return fail('CREDENTIAL_UNAVAILABLE');
  return readOutcome ?? fail('ADAPTER_PROTOCOL_VIOLATION');
}
