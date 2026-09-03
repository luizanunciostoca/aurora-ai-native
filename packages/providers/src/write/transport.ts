import type { ActionIntent, JsonObject, JsonValue } from '@aurora/contracts/actions';
import type { ContractVersion } from '@aurora/contracts/versioning';

import { resolveProviderBinding } from '../bindings/index.js';
import { withResolvedCredential } from '../credentials/index.js';
import {
  PROVIDER_WRITE_SAFE_MODES,
  PROVIDER_WRITE_TRANSPORT_ERRORS,
  type ProviderWriteDependencies,
  type ProviderWriteRequest,
  type ProviderWriteResult,
  type ProviderWriteSafeMode,
  type ProviderWriteTransportResult,
} from './types.js';

const REQUEST_KEYS = new Set([
  'actionIntent',
  'executionProof',
  'binding',
  'secretReference',
  'now',
  'safeMode',
]);
const PROOF_KEYS = new Set([
  'kind',
  'actionIntentId',
  'currentAuthorityValidated',
  'executionEligible',
  'validatedAt',
  'authorizesExecution',
]);
const PROVIDER_TARGET_KEYS = new Set([
  'schemaVersion',
  'kind',
  'provider',
  'targetType',
  'targetReference',
  'accountReference',
]);
const CORRELATION_KEYS = new Set(['correlationId', 'causation']);
const CAPABILITY_KEYS = new Set(['capability', 'actionType']);
const IDEMPOTENCY_KEYS = new Set(['mode', 'key', 'reference']);
const PRECONDITION_KEYS = new Set(['preconditionType', 'parameters']);
const EXPECTED_STATE_KEYS = new Set(['stateType', 'value']);
const TRANSPORT_SUCCESS_KEYS = new Set([
  'ok',
  'providerReference',
  'providerRevision',
  'requiresReadback',
]);
const TRANSPORT_FAILURE_KEYS = new Set([
  'ok',
  'error',
  'mutationPossible',
  'retryAfterMs',
  'providerReference',
]);
const CONTRACT_VERSION = /^\d+\.\d+\.\d+$/u;
const MAX_JSON_DEPTH = 8;
const MAX_JSON_NODES = 512;

function fail(
  error: Extract<ProviderWriteResult, { readonly ok: false }>['error'],
  options: {
    readonly mutationPossible?: boolean;
    readonly retryAfterMs?: number;
    readonly providerReference?: string;
  } = {},
): Extract<ProviderWriteResult, { readonly ok: false }> {
  return {
    ok: false,
    error,
    mutationPossible: options.mutationPossible ?? false,
    ...(options.retryAfterMs === undefined ? {} : { retryAfterMs: options.retryAfterMs }),
    ...(options.providerReference === undefined
      ? {}
      : { providerReference: options.providerReference }),
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

function isTimestamp(value: unknown): value is string {
  return isNonEmptyString(value, 128) && Number.isFinite(Date.parse(value));
}

function isSafeMode(value: unknown): value is ProviderWriteSafeMode {
  return (
    typeof value === 'string' && PROVIDER_WRITE_SAFE_MODES.includes(value as ProviderWriteSafeMode)
  );
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

function providerTarget(value: unknown): NonNullable<ActionIntent['executionTarget']> | null {
  if (!isPlainRecord(value) || !hasOnlyOwnDataProperties(value, PROVIDER_TARGET_KEYS)) return null;
  const schemaVersion = ownValue(value, 'schemaVersion');
  const kind = ownValue(value, 'kind');
  const provider = ownValue(value, 'provider');
  const targetType = ownValue(value, 'targetType');
  const targetReference = ownValue(value, 'targetReference');
  const accountReference = ownValue(value, 'accountReference');
  if (
    !isNonEmptyString(schemaVersion, 32) ||
    !CONTRACT_VERSION.test(schemaVersion) ||
    kind !== 'PROVIDER' ||
    !isNonEmptyString(provider, 256) ||
    !isNonEmptyString(accountReference, 512) ||
    (targetType !== undefined && !isNonEmptyString(targetType, 256)) ||
    (targetReference !== undefined && !isNonEmptyString(targetReference, 512))
  ) {
    return null;
  }
  return {
    schemaVersion: schemaVersion as ContractVersion,
    kind: 'PROVIDER',
    provider,
    accountReference,
    ...(targetType === undefined ? {} : { targetType }),
    ...(targetReference === undefined ? {} : { targetReference }),
  };
}

function correlationReference(value: unknown): string | null {
  if (!isPlainRecord(value) || !hasOnlyOwnDataProperties(value, CORRELATION_KEYS)) return null;
  const correlationId = ownValue(value, 'correlationId');
  return isNonEmptyString(correlationId, 512) ? correlationId : null;
}

function capability(
  value: unknown,
): { readonly capability: string; readonly actionType: string } | null {
  if (!isPlainRecord(value) || !hasOnlyOwnDataProperties(value, CAPABILITY_KEYS)) return null;
  const capabilityValue = ownValue(value, 'capability');
  const actionType = ownValue(value, 'actionType');
  return isNonEmptyString(capabilityValue, 256) && isNonEmptyString(actionType, 256)
    ? { capability: capabilityValue, actionType }
    : null;
}

function idempotencyKey(value: unknown): string | null {
  if (!isPlainRecord(value) || !hasOnlyOwnDataProperties(value, IDEMPOTENCY_KEYS)) return null;
  if (ownValue(value, 'mode') !== 'REQUIRED') return null;
  const key = ownValue(value, 'key');
  return isNonEmptyString(key, 512) ? key : null;
}

function preconditions(value: unknown): ActionIntent['preconditions'] | null {
  if (!Array.isArray(value) || value.length > 64) return null;
  const parsed: { readonly preconditionType: string; readonly parameters: JsonObject }[] = [];
  for (const candidate of value) {
    if (!isPlainRecord(candidate) || !hasOnlyOwnDataProperties(candidate, PRECONDITION_KEYS)) {
      return null;
    }
    const preconditionType = ownValue(candidate, 'preconditionType');
    const parameters = jsonObject(ownValue(candidate, 'parameters'));
    if (!isNonEmptyString(preconditionType, 256) || parameters === null) return null;
    parsed.push({ preconditionType, parameters });
  }
  return parsed;
}

function expectedState(value: unknown): ActionIntent['expectedState'] | null | undefined {
  if (value === undefined) return undefined;
  if (!isPlainRecord(value) || !hasOnlyOwnDataProperties(value, EXPECTED_STATE_KEYS)) return null;
  const stateType = ownValue(value, 'stateType');
  const expectedValue = jsonObject(ownValue(value, 'value'));
  if (!isNonEmptyString(stateType, 256) || expectedValue === null) return null;
  return { stateType, value: expectedValue };
}

function executionProofValid(
  proof: unknown,
  actionIntentId: ActionIntent['actionIntentId'],
  now: string,
): boolean {
  if (!isPlainRecord(proof) || !hasOnlyOwnDataProperties(proof, PROOF_KEYS)) return false;
  const validatedAt = ownValue(proof, 'validatedAt');
  return (
    ownValue(proof, 'kind') === 'W07_PROVIDER_EXECUTION_PROOF' &&
    ownValue(proof, 'actionIntentId') === actionIntentId &&
    ownValue(proof, 'currentAuthorityValidated') === true &&
    ownValue(proof, 'executionEligible') === true &&
    ownValue(proof, 'authorizesExecution') === false &&
    isTimestamp(validatedAt) &&
    Date.parse(validatedAt) <= Date.parse(now)
  );
}

function parseTransportResult(value: unknown): ProviderWriteTransportResult | null {
  if (!isPlainRecord(value)) return null;
  const ok = ownValue(value, 'ok');
  if (ok === true) {
    if (!hasOnlyOwnDataProperties(value, TRANSPORT_SUCCESS_KEYS)) return null;
    const providerReference = ownValue(value, 'providerReference');
    const providerRevision = ownValue(value, 'providerRevision');
    const requiresReadback = ownValue(value, 'requiresReadback');
    if (
      (providerReference !== undefined && !isNonEmptyString(providerReference, 1_024)) ||
      (providerRevision !== undefined && !isNonEmptyString(providerRevision, 512)) ||
      typeof requiresReadback !== 'boolean'
    ) {
      return null;
    }
    return {
      ok: true,
      ...(providerReference === undefined ? {} : { providerReference }),
      ...(providerRevision === undefined ? {} : { providerRevision }),
      requiresReadback,
    };
  }
  if (ok === false) {
    if (!hasOnlyOwnDataProperties(value, TRANSPORT_FAILURE_KEYS)) return null;
    const error = ownValue(value, 'error');
    const mutationPossible = ownValue(value, 'mutationPossible');
    const retryAfterMs = ownValue(value, 'retryAfterMs');
    const providerReference = ownValue(value, 'providerReference');
    if (
      typeof error !== 'string' ||
      !PROVIDER_WRITE_TRANSPORT_ERRORS.includes(
        error as (typeof PROVIDER_WRITE_TRANSPORT_ERRORS)[number],
      ) ||
      typeof mutationPossible !== 'boolean' ||
      (retryAfterMs !== undefined &&
        (!Number.isSafeInteger(retryAfterMs) || (retryAfterMs as number) < 0)) ||
      (providerReference !== undefined && !isNonEmptyString(providerReference, 1_024))
    ) {
      return null;
    }
    if ((error === 'AMBIGUOUS_WRITE') !== mutationPossible) return null;
    return {
      ok: false,
      error: error as (typeof PROVIDER_WRITE_TRANSPORT_ERRORS)[number],
      mutationPossible,
      ...(retryAfterMs === undefined ? {} : { retryAfterMs: retryAfterMs as number }),
      ...(providerReference === undefined ? {} : { providerReference }),
    };
  }
  return null;
}

/**
 * Performs exactly one provider write attempt below W07. It never retries,
 * never evaluates authority, and never upgrades provider acknowledgement to a
 * verified external-state outcome.
 */
export async function executeGovernedProviderWrite(
  request: ProviderWriteRequest,
  dependencies: ProviderWriteDependencies,
): Promise<ProviderWriteResult> {
  if (!isPlainRecord(request) || !hasOnlyOwnDataProperties(request, REQUEST_KEYS)) {
    return fail('REQUEST_MALFORMED');
  }
  if (!isTimestamp(request.now) || !isSafeMode(request.safeMode)) {
    return fail('REQUEST_MALFORMED');
  }

  const intentValue = request.actionIntent as unknown;
  if (!isPlainRecord(intentValue)) return fail('REQUEST_MALFORMED');
  const kind = ownValue(intentValue, 'kind');
  const actionIntentId = ownValue(intentValue, 'actionIntentId');
  const deadlineAt = ownValue(intentValue, 'deadlineAt');
  if (
    kind !== 'ACTION_INTENT' ||
    !isNonEmptyString(actionIntentId, 512) ||
    !isTimestamp(deadlineAt)
  ) {
    return fail('REQUEST_MALFORMED');
  }
  if (Date.parse(deadlineAt) <= Date.parse(request.now)) return fail('DEADLINE_EXPIRED');

  if (
    !executionProofValid(request.executionProof, request.actionIntent.actionIntentId, request.now)
  ) {
    return fail('EXECUTION_PROOF_INVALID');
  }

  const target = providerTarget(ownValue(intentValue, 'executionTarget'));
  const tenant = ownValue(intentValue, 'tenant');
  if (target === null || !isPlainRecord(tenant)) return fail('REQUEST_MALFORMED');

  const resolvedBinding = resolveProviderBinding({
    tenant: request.actionIntent.tenant,
    executionTarget: target,
    candidates: [request.binding],
  });
  if (!resolvedBinding.ok) return fail('TARGET_BINDING_UNAVAILABLE');

  const resolvedCapability = capability(ownValue(intentValue, 'capability'));
  const correlation = correlationReference(ownValue(intentValue, 'correlation'));
  const payload = jsonObject(ownValue(intentValue, 'resolvedParameters'));
  const key = idempotencyKey(ownValue(intentValue, 'idempotency'));
  const parsedPreconditions = preconditions(ownValue(intentValue, 'preconditions'));
  const parsedExpectedState = expectedState(ownValue(intentValue, 'expectedState'));
  if (key === null) return fail('IDEMPOTENCY_REQUIRED');
  if (
    resolvedCapability === null ||
    correlation === null ||
    payload === null ||
    parsedPreconditions === null ||
    parsedExpectedState === null
  ) {
    return fail('REQUEST_MALFORMED');
  }

  const binding = resolvedBinding.binding;
  let transportOutcome: ProviderWriteResult | undefined;
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
        rawResult = await dependencies.adapter.writeOnce(
          {
            actionIntentId: request.actionIntent.actionIntentId,
            provider: binding.provider,
            accountReference: binding.accountReference,
            bindingReference: binding.bindingReference,
            bindingVersion: binding.bindingVersion,
            correlationReference: correlation,
            capability: resolvedCapability.capability,
            actionType: resolvedCapability.actionType,
            payload,
            idempotencyKey: key,
            preconditions: parsedPreconditions,
            ...(parsedExpectedState === undefined ? {} : { expectedState: parsedExpectedState }),
            safeMode: request.safeMode,
          },
          credential,
        );
      } catch {
        transportOutcome = fail('AMBIGUOUS_WRITE', { mutationPossible: true });
        return;
      }

      const transport = parseTransportResult(rawResult);
      if (transport === null) {
        transportOutcome = fail('ADAPTER_PROTOCOL_VIOLATION');
        return;
      }
      if (!transport.ok) {
        transportOutcome = fail(transport.error, {
          mutationPossible: transport.mutationPossible,
          ...(transport.retryAfterMs === undefined ? {} : { retryAfterMs: transport.retryAfterMs }),
          ...(transport.providerReference === undefined
            ? {}
            : { providerReference: transport.providerReference }),
        });
        return;
      }

      transportOutcome = {
        ok: true,
        provider: binding.provider,
        accountReference: binding.accountReference,
        bindingReference: binding.bindingReference,
        bindingVersion: binding.bindingVersion,
        actionIntentId: request.actionIntent.actionIntentId,
        ...(transport.providerReference === undefined
          ? {}
          : { providerReference: transport.providerReference }),
        ...(transport.providerRevision === undefined
          ? {}
          : { providerRevision: transport.providerRevision }),
        requiresReadback: transport.requiresReadback,
        safeMode: request.safeMode,
        authorizesExecution: false,
      };
    },
  );

  if (!credentialResult.ok) return fail('CREDENTIAL_UNAVAILABLE');
  return transportOutcome ?? fail('ADAPTER_PROTOCOL_VIOLATION');
}
