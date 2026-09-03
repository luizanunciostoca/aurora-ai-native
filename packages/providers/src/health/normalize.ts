import type { Rfc3339Timestamp } from '@aurora/contracts/context';

import {
  PROVIDER_OPERATIONAL_STATES,
  type ProviderOperationalObservationFailure,
  type ProviderOperationalObservationRequest,
  type ProviderOperationalObservationResult,
  type ProviderOperationalState,
  type ProviderQuotaMetadata,
  type ProviderRateLimitMetadata,
} from './types.js';

const OBSERVATION_KEYS = new Set([
  'provider',
  'accountReference',
  'bindingReference',
  'observedAt',
  'sourceEndpoint',
  'state',
  'rateLimit',
  'quota',
  'retryAfterMs',
]);
const RATE_LIMIT_KEYS = new Set(['remaining', 'limit', 'resetAt', 'retryAfterMs']);
const QUOTA_KEYS = new Set(['remaining', 'limit', 'resetAt']);
const SENSITIVE_KEY = /authorization|token|secret|credential|cookie|password|api.?key/iu;
const MAX_RETRY_AFTER_MS = 86_400_000;
const MAX_OBSERVATION_AGE_MS = 604_800_000;

function fail(
  error: ProviderOperationalObservationFailure['error'],
): ProviderOperationalObservationFailure {
  return { ok: false, error, retryAuthorized: false, authorizesExecution: false };
}

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function ownValue(value: Record<string, unknown>, key: string): unknown {
  const descriptor = Object.getOwnPropertyDescriptor(value, key);
  return descriptor && 'value' in descriptor ? descriptor.value : undefined;
}

function ownDataKeys(value: Record<string, unknown>): readonly string[] | null {
  const keys: string[] = [];
  for (const key of Reflect.ownKeys(value)) {
    if (typeof key !== 'string') return null;
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    if (!descriptor || !('value' in descriptor)) return null;
    keys.push(key);
  }
  return keys;
}

function keyValidation(
  value: Record<string, unknown>,
  allowed: ReadonlySet<string>,
): 'VALID' | 'UNKNOWN' | 'SENSITIVE' {
  const keys = ownDataKeys(value);
  if (keys === null) return 'UNKNOWN';
  for (const key of keys) {
    if (allowed.has(key)) continue;
    if (SENSITIVE_KEY.test(key)) return 'SENSITIVE';
    return 'UNKNOWN';
  }
  return 'VALID';
}

function isNonEmptyString(value: unknown, maxLength = 512): value is string {
  return typeof value === 'string' && value.trim().length > 0 && value.length <= maxLength;
}

function isTimestamp(value: unknown): value is Rfc3339Timestamp {
  return isNonEmptyString(value, 128) && Number.isFinite(Date.parse(value));
}

function isNonNegativeInteger(value: unknown): value is number {
  return Number.isSafeInteger(value) && (value as number) >= 0;
}

function safeEndpoint(value: unknown): value is string {
  return isNonEmptyString(value, 512) && /^[A-Za-z0-9._:/-]+$/u.test(value);
}

function parseRateLimit(
  value: unknown,
): ProviderRateLimitMetadata | null | 'SENSITIVE_METADATA_REJECTED' {
  if (value === undefined) return null;
  if (!isPlainRecord(value)) return null;
  const validation = keyValidation(value, RATE_LIMIT_KEYS);
  if (validation === 'SENSITIVE') return 'SENSITIVE_METADATA_REJECTED';
  if (validation !== 'VALID') return null;

  const remaining = ownValue(value, 'remaining');
  const limit = ownValue(value, 'limit');
  const resetAt = ownValue(value, 'resetAt');
  const retryAfterMs = ownValue(value, 'retryAfterMs');
  if (
    (remaining !== undefined && !isNonNegativeInteger(remaining)) ||
    (limit !== undefined && !isNonNegativeInteger(limit)) ||
    (resetAt !== undefined && !isTimestamp(resetAt)) ||
    (retryAfterMs !== undefined &&
      (!isNonNegativeInteger(retryAfterMs) || retryAfterMs > MAX_RETRY_AFTER_MS)) ||
    (typeof remaining === 'number' && typeof limit === 'number' && remaining > limit)
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

function parseQuota(value: unknown): ProviderQuotaMetadata | null | 'SENSITIVE_METADATA_REJECTED' {
  if (value === undefined) return null;
  if (!isPlainRecord(value)) return null;
  const validation = keyValidation(value, QUOTA_KEYS);
  if (validation === 'SENSITIVE') return 'SENSITIVE_METADATA_REJECTED';
  if (validation !== 'VALID') return null;

  const remaining = ownValue(value, 'remaining');
  const limit = ownValue(value, 'limit');
  const resetAt = ownValue(value, 'resetAt');
  if (
    (remaining !== undefined && !isNonNegativeInteger(remaining)) ||
    (limit !== undefined && !isNonNegativeInteger(limit)) ||
    (resetAt !== undefined && !isTimestamp(resetAt)) ||
    (typeof remaining === 'number' && typeof limit === 'number' && remaining > limit)
  ) {
    return null;
  }
  return {
    ...(remaining === undefined ? {} : { remaining }),
    ...(limit === undefined ? {} : { limit }),
    ...(resetAt === undefined ? {} : { resetAt }),
  };
}

function state(value: unknown): ProviderOperationalState | null {
  return typeof value === 'string' && PROVIDER_OPERATIONAL_STATES.includes(value as ProviderOperationalState)
    ? (value as ProviderOperationalState)
    : null;
}

/**
 * Converts already-acquired provider operational data into bounded, log-safe,
 * non-authoritative metadata. It never decides whether an action may execute
 * or retry; those decisions remain with Policy/W07.
 */
export function normalizeProviderOperationalObservation(
  request: ProviderOperationalObservationRequest,
): ProviderOperationalObservationResult {
  if (!isPlainRecord(request)) return fail('REQUEST_MALFORMED');
  const now = ownValue(request, 'now');
  const maxObservationAgeMs = ownValue(request, 'maxObservationAgeMs');
  const tenant = ownValue(request, 'tenant');
  const binding = ownValue(request, 'binding');
  const raw = ownValue(request, 'observation');

  if (
    !isTimestamp(now) ||
    !isNonNegativeInteger(maxObservationAgeMs) ||
    maxObservationAgeMs > MAX_OBSERVATION_AGE_MS ||
    !isPlainRecord(tenant) ||
    !isPlainRecord(binding) ||
    !isPlainRecord(raw)
  ) {
    return fail('REQUEST_MALFORMED');
  }

  const tenantId = ownValue(tenant, 'tenantId');
  const bindingTenant = ownValue(binding, 'tenant');
  if (!isNonEmptyString(tenantId) || !isPlainRecord(bindingTenant)) return fail('REQUEST_MALFORMED');
  const bindingTenantId = ownValue(bindingTenant, 'tenantId');
  const bindingProvider = ownValue(binding, 'provider');
  const bindingAccount = ownValue(binding, 'accountReference');
  const bindingReference = ownValue(binding, 'bindingReference');
  if (
    bindingTenantId !== tenantId ||
    !isNonEmptyString(bindingProvider) ||
    !isNonEmptyString(bindingAccount) ||
    !isNonEmptyString(bindingReference) ||
    ownValue(binding, 'state') !== 'ACTIVE' ||
    ownValue(binding, 'verificationState') === 'STALE' ||
    ownValue(binding, 'authorizesExecution') !== false
  ) {
    return fail('BINDING_MISMATCH');
  }

  const observationValidation = keyValidation(raw, OBSERVATION_KEYS);
  if (observationValidation === 'SENSITIVE') return fail('SENSITIVE_METADATA_REJECTED');
  if (observationValidation !== 'VALID') return fail('OBSERVATION_MALFORMED');

  const provider = ownValue(raw, 'provider');
  const accountReference = ownValue(raw, 'accountReference');
  const observedBindingReference = ownValue(raw, 'bindingReference');
  const observedAt = ownValue(raw, 'observedAt');
  const sourceEndpoint = ownValue(raw, 'sourceEndpoint');
  const normalizedState = state(ownValue(raw, 'state'));
  const retryAfterMs = ownValue(raw, 'retryAfterMs');

  if (
    provider !== bindingProvider ||
    accountReference !== bindingAccount ||
    observedBindingReference !== bindingReference
  ) {
    return fail('BINDING_MISMATCH');
  }
  if (
    !isTimestamp(observedAt) ||
    !safeEndpoint(sourceEndpoint) ||
    normalizedState === null ||
    (retryAfterMs !== undefined &&
      (!isNonNegativeInteger(retryAfterMs) || retryAfterMs > MAX_RETRY_AFTER_MS))
  ) {
    return fail('OBSERVATION_MALFORMED');
  }

  const nowMs = Date.parse(now);
  const observedAtMs = Date.parse(observedAt);
  if (observedAtMs > nowMs) return fail('OBSERVATION_MALFORMED');

  const rateLimit = parseRateLimit(ownValue(raw, 'rateLimit'));
  const quota = parseQuota(ownValue(raw, 'quota'));
  if (rateLimit === 'SENSITIVE_METADATA_REJECTED' || quota === 'SENSITIVE_METADATA_REJECTED') {
    return fail('SENSITIVE_METADATA_REJECTED');
  }
  if (
    (ownValue(raw, 'rateLimit') !== undefined && rateLimit === null) ||
    (ownValue(raw, 'quota') !== undefined && quota === null)
  ) {
    return fail('OBSERVATION_MALFORMED');
  }

  const nestedRetryAfterMs = rateLimit?.retryAfterMs;
  if (
    retryAfterMs !== undefined &&
    nestedRetryAfterMs !== undefined &&
    retryAfterMs !== nestedRetryAfterMs
  ) {
    return fail('OBSERVATION_MALFORMED');
  }
  const advisoryRetryAfterMs =
    typeof retryAfterMs === 'number' ? retryAfterMs : nestedRetryAfterMs;

  return {
    ok: true,
    state: normalizedState,
    currentness: nowMs - observedAtMs <= maxObservationAgeMs ? 'CURRENT' : 'STALE',
    provider: bindingProvider,
    accountReference: bindingAccount,
    bindingReference,
    observedAt,
    sourceEndpoint,
    ...(rateLimit === null ? {} : { rateLimit }),
    ...(quota === null ? {} : { quota }),
    ...(advisoryRetryAfterMs === undefined ? {} : { advisoryRetryAfterMs }),
    retryAuthorized: false,
    authorizesExecution: false,
  };
}
