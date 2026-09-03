import type { JsonObject, JsonValue } from '@aurora/contracts/actions';
import type { Rfc3339Timestamp } from '@aurora/contracts/context';

import { resolveProviderBinding } from '../bindings/index.js';
import { withResolvedCredential } from '../credentials/index.js';
import type { ProviderOperationalObservation } from '../health/index.js';
import {
  type ProviderReadbackDependencies,
  type ProviderReadbackRequest,
  type ProviderReadbackResult,
  type ProviderReadbackTransportResult,
  type W07ProviderReconciliationObservation,
} from './types.js';

const TRANSPORT_SUCCESS_KEYS = new Set([
  'ok',
  'status',
  'observedAt',
  'providerReference',
  'providerRevision',
  'observedState',
]);
const TRANSPORT_FAILURE_KEYS = new Set(['ok', 'error', 'retryAfterMs']);
const READBACK_STATUSES = new Set([
  'OBSERVED',
  'NO_EFFECT_CONFIRMED',
  'NOT_FOUND',
  'DUPLICATE',
  'PENDING',
  'DELAYED',
]);
const TRANSPORT_ERRORS = new Set([
  'PROVIDER_AUTHENTICATION_FAILED',
  'RATE_LIMITED',
  'QUOTA_EXHAUSTED',
  'PROVIDER_OUTAGE',
  'TRANSIENT_TRANSPORT_FAILURE',
  'PERMANENT_REQUEST_REJECTED',
  'NOT_FOUND',
  'CONFLICT',
]);
const MAX_JSON_DEPTH = 8;
const MAX_JSON_NODES = 512;

function fail(error: Extract<ProviderReadbackResult, { ok: false }>['error']): ProviderReadbackResult {
  return {
    ok: false,
    error,
    retryAuthorized: false,
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

function isNonEmptyString(value: unknown, maxLength = 4_096): value is string {
  return typeof value === 'string' && value.trim().length > 0 && value.length <= maxLength;
}

function isTimestamp(value: unknown): value is Rfc3339Timestamp {
  return isNonEmptyString(value, 128) && Number.isFinite(Date.parse(value));
}

function isFiniteNonNegativeInteger(value: unknown): value is number {
  return Number.isSafeInteger(value) && (value as number) >= 0;
}

function isJsonData(value: unknown, depth: number, counter: { count: number }): value is JsonValue {
  counter.count += 1;
  if (counter.count > MAX_JSON_NODES || depth > MAX_JSON_DEPTH) return false;
  if (
    value === null ||
    typeof value === 'string' ||
    typeof value === 'boolean' ||
    (typeof value === 'number' && Number.isFinite(value))
  ) {
    return true;
  }
  if (Array.isArray(value)) {
    return value.every((entry) => isJsonData(entry, depth + 1, counter));
  }
  if (!isPlainRecord(value)) return false;
  for (const key of Reflect.ownKeys(value)) {
    if (typeof key !== 'string' || !isNonEmptyString(key, 256)) return false;
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    if (!descriptor || !('value' in descriptor)) return false;
    if (!isJsonData(descriptor.value, depth + 1, counter)) return false;
  }
  return true;
}

function jsonObject(value: unknown): JsonObject | null {
  if (!isPlainRecord(value)) return null;
  const counter = { count: 0 };
  return isJsonData(value, 0, counter) ? (value as JsonObject) : null;
}

function stableJson(value: JsonObject): string {
  const canonicalize = (candidate: JsonValue): JsonValue => {
    if (Array.isArray(candidate)) return candidate.map((entry) => canonicalize(entry));
    if (candidate === null || typeof candidate !== 'object') return candidate;
    const sorted: Record<string, JsonValue> = Object.create(null) as Record<string, JsonValue>;
    for (const key of Object.keys(candidate).sort()) {
      const child = candidate[key];
      if (child !== undefined) sorted[key] = canonicalize(child);
    }
    return sorted;
  };
  return JSON.stringify(canonicalize(value));
}

function sameJson(left: JsonObject, right: JsonObject): boolean {
  return stableJson(left) === stableJson(right);
}

function indeterminate(
  observedAt: Rfc3339Timestamp,
  reason: string,
  reference?: string,
): W07ProviderReconciliationObservation {
  return {
    state: 'INDETERMINATE',
    observedAt,
    reason,
    ...(reference === undefined ? {} : { reference }),
  };
}

function parseTransportResult(value: unknown): ProviderReadbackTransportResult | null {
  if (!isPlainRecord(value)) return null;
  const ok = ownValue(value, 'ok');
  if (ok === true) {
    if (!hasOnlyOwnDataProperties(value, TRANSPORT_SUCCESS_KEYS)) return null;
    const status = ownValue(value, 'status');
    const observedAt = ownValue(value, 'observedAt');
    const providerReference = ownValue(value, 'providerReference');
    const providerRevision = ownValue(value, 'providerRevision');
    const observedStateValue = ownValue(value, 'observedState');
    if (
      typeof status !== 'string' ||
      !READBACK_STATUSES.has(status) ||
      !isTimestamp(observedAt) ||
      (providerReference !== undefined && !isNonEmptyString(providerReference, 1_024)) ||
      (providerRevision !== undefined && !isNonEmptyString(providerRevision, 512))
    ) {
      return null;
    }
    const observedState =
      observedStateValue === undefined ? undefined : jsonObject(observedStateValue);
    if (observedStateValue !== undefined && observedState === null) return null;
    return {
      ok: true,
      status: status as Extract<ProviderReadbackTransportResult, { ok: true }>['status'],
      observedAt,
      ...(providerReference === undefined ? {} : { providerReference }),
      ...(providerRevision === undefined ? {} : { providerRevision }),
      ...(observedState === undefined ? {} : { observedState }),
    };
  }
  if (ok === false) {
    if (!hasOnlyOwnDataProperties(value, TRANSPORT_FAILURE_KEYS)) return null;
    const error = ownValue(value, 'error');
    const retryAfterMs = ownValue(value, 'retryAfterMs');
    if (
      typeof error !== 'string' ||
      !TRANSPORT_ERRORS.has(error) ||
      (retryAfterMs !== undefined && !isFiniteNonNegativeInteger(retryAfterMs))
    ) {
      return null;
    }
    return {
      ok: false,
      error: error as Extract<ProviderReadbackTransportResult, { ok: false }>['error'],
      ...(retryAfterMs === undefined ? {} : { retryAfterMs }),
    };
  }
  return null;
}

function healthMatchesBinding(
  health: ProviderOperationalObservation,
  binding: ProviderReadbackRequest['binding'],
): boolean {
  return (
    health.provider === binding.provider &&
    health.accountReference === binding.accountReference &&
    health.bindingReference === binding.bindingReference
  );
}

function eligibleWriteOutcome(request: ProviderReadbackRequest): boolean {
  if (request.writeResult.ok) {
    return (
      request.writeResult.requiresReadback === true &&
      request.writeResult.provider === request.binding.provider &&
      request.writeResult.accountReference === request.binding.accountReference &&
      request.writeResult.bindingReference === request.binding.bindingReference &&
      request.writeResult.bindingVersion === request.binding.bindingVersion &&
      request.writeResult.actionIntentId === request.actionIntent.actionIntentId
    );
  }
  return request.writeResult.mutationPossible === true;
}

/**
 * Performs one read-only provider observation after a write or ambiguous write.
 * The output is reconciliation evidence for W07 only; W08-F never authorizes a
 * retry or promotes provider transport acknowledgement into verified truth.
 */
export async function reconcileProviderWrite(
  request: ProviderReadbackRequest,
  dependencies: ProviderReadbackDependencies,
): Promise<ProviderReadbackResult> {
  if (
    !isPlainRecord(request) ||
    !isTimestamp(request.writeOccurredAt) ||
    !isTimestamp(request.now) ||
    !isFiniteNonNegativeInteger(request.maxObservationAgeMs) ||
    request.maxObservationAgeMs < 1 ||
    Date.parse(request.writeOccurredAt) > Date.parse(request.now)
  ) {
    return fail('REQUEST_MALFORMED');
  }

  if (!eligibleWriteOutcome(request)) return fail('WRITE_OUTCOME_INELIGIBLE');

  const resolution = resolveProviderBinding({
    tenant: request.actionIntent.tenant,
    executionTarget: request.actionIntent.executionTarget,
    candidates: [request.binding],
  });
  if (!resolution.ok) return fail('TARGET_BINDING_UNAVAILABLE');

  if (!request.health.ok) {
    return {
      ok: true,
      provider: request.binding.provider,
      accountReference: request.binding.accountReference,
      bindingReference: request.binding.bindingReference,
      bindingVersion: request.binding.bindingVersion,
      actionIntentId: request.actionIntent.actionIntentId,
      observation: indeterminate(request.now, 'PROVIDER_HEALTH_UNAVAILABLE'),
      requiresFurtherReadback: true,
      retryAuthorized: false,
      authorizesExecution: false,
    };
  }
  if (!healthMatchesBinding(request.health, request.binding)) {
    return fail('HEALTH_BINDING_MISMATCH');
  }
  if (request.health.currentness !== 'CURRENT') {
    return {
      ok: true,
      provider: request.binding.provider,
      accountReference: request.binding.accountReference,
      bindingReference: request.binding.bindingReference,
      bindingVersion: request.binding.bindingVersion,
      actionIntentId: request.actionIntent.actionIntentId,
      observation: indeterminate(request.health.observedAt, 'PROVIDER_HEALTH_STALE'),
      ...(request.health.advisoryRetryAfterMs === undefined
        ? {}
        : { advisoryRetryAfterMs: request.health.advisoryRetryAfterMs }),
      requiresFurtherReadback: true,
      retryAuthorized: false,
      authorizesExecution: false,
    };
  }

  const binding = resolution.binding;
  let result: ProviderReadbackResult | undefined;
  const credentialResult = await withResolvedCredential(
    {
      tenant: request.actionIntent.tenant,
      binding,
      secretReference: request.secretReference,
      now: request.now,
    },
    dependencies.credentials,
    async (credential) => {
      let rawResult: unknown;
      try {
        rawResult = await dependencies.adapter.readbackOnce(
          {
            actionIntentId: request.actionIntent.actionIntentId,
            provider: binding.provider,
            accountReference: binding.accountReference,
            bindingReference: binding.bindingReference,
            bindingVersion: binding.bindingVersion,
            correlationReference: request.actionIntent.correlation.correlationId,
            writeOccurredAt: request.writeOccurredAt,
            ...(request.writeResult.providerReference === undefined
              ? {}
              : { providerReference: request.writeResult.providerReference }),
            ...(request.writeResult.ok && request.writeResult.providerRevision !== undefined
              ? { providerRevision: request.writeResult.providerRevision }
              : {}),
            ...(request.actionIntent.expectedState === undefined
              ? {}
              : { expectedState: request.actionIntent.expectedState }),
          },
          credential,
        );
      } catch {
        result = {
          ok: true,
          provider: binding.provider,
          accountReference: binding.accountReference,
          bindingReference: binding.bindingReference,
          bindingVersion: binding.bindingVersion,
          actionIntentId: request.actionIntent.actionIntentId,
          observation: indeterminate(request.now, 'READBACK_TRANSPORT_EXCEPTION'),
          requiresFurtherReadback: true,
          retryAuthorized: false,
          authorizesExecution: false,
        };
        return;
      }

      const transport = parseTransportResult(rawResult);
      if (transport === null) {
        result = fail('ADAPTER_PROTOCOL_VIOLATION');
        return;
      }
      if (!transport.ok) {
        result = {
          ok: true,
          provider: binding.provider,
          accountReference: binding.accountReference,
          bindingReference: binding.bindingReference,
          bindingVersion: binding.bindingVersion,
          actionIntentId: request.actionIntent.actionIntentId,
          observation: indeterminate(request.now, `READBACK_${transport.error}`),
          ...(transport.retryAfterMs === undefined
            ? {}
            : { advisoryRetryAfterMs: transport.retryAfterMs }),
          requiresFurtherReadback: true,
          retryAuthorized: false,
          authorizesExecution: false,
        };
        return;
      }

      const observedMs = Date.parse(transport.observedAt);
      const writeMs = Date.parse(request.writeOccurredAt);
      const nowMs = Date.parse(request.now);
      const stale = nowMs - observedMs > request.maxObservationAgeMs;
      const outOfOrder = observedMs < writeMs || observedMs > nowMs;
      let observation: W07ProviderReconciliationObservation;
      let requiresFurtherReadback = false;

      if (stale) {
        observation = indeterminate(
          transport.observedAt,
          'READBACK_STALE',
          transport.providerReference,
        );
        requiresFurtherReadback = true;
      } else if (outOfOrder) {
        observation = indeterminate(
          transport.observedAt,
          'READBACK_TIME_ORDER_INVALID',
          transport.providerReference,
        );
        requiresFurtherReadback = true;
      } else if (transport.status === 'NO_EFFECT_CONFIRMED') {
        observation = {
          state: 'NO_EFFECT_CONFIRMED',
          observedAt: transport.observedAt,
          ...(transport.providerReference === undefined
            ? {}
            : { reference: transport.providerReference }),
        };
      } else if (transport.status === 'OBSERVED') {
        const expectedState = request.actionIntent.expectedState?.value;
        if (expectedState === undefined) {
          observation = {
            state: 'EFFECT_OBSERVED',
            observedAt: transport.observedAt,
            ...(transport.providerReference === undefined
              ? {}
              : { reference: transport.providerReference }),
          };
        } else if (transport.observedState === undefined) {
          observation = indeterminate(
            transport.observedAt,
            'READBACK_STATE_MISSING',
            transport.providerReference,
          );
          requiresFurtherReadback = true;
        } else if (sameJson(expectedState, transport.observedState)) {
          observation = {
            state: 'EFFECT_OBSERVED',
            observedAt: transport.observedAt,
            ...(transport.providerReference === undefined
              ? {}
              : { reference: transport.providerReference }),
          };
        } else {
          observation = indeterminate(
            transport.observedAt,
            'READBACK_MISMATCH',
            transport.providerReference,
          );
          requiresFurtherReadback = true;
        }
      } else {
        observation = indeterminate(
          transport.observedAt,
          `READBACK_${transport.status}`,
          transport.providerReference,
        );
        requiresFurtherReadback = true;
      }

      result = {
        ok: true,
        provider: binding.provider,
        accountReference: binding.accountReference,
        bindingReference: binding.bindingReference,
        bindingVersion: binding.bindingVersion,
        actionIntentId: request.actionIntent.actionIntentId,
        observation,
        ...(transport.observedState === undefined ? {} : { observedState: transport.observedState }),
        ...(transport.providerRevision === undefined
          ? {}
          : { providerRevision: transport.providerRevision }),
        requiresFurtherReadback,
        retryAuthorized: false,
        authorizesExecution: false,
      };
    },
  );

  if (!credentialResult.ok) return fail('CREDENTIAL_UNAVAILABLE');
  return result ?? fail('ADAPTER_PROTOCOL_VIOLATION');
}
