import type { ProviderExternalId } from '@aurora/contracts/ids';
import type { ContractVersion } from '@aurora/contracts/versioning';

import {
  PROVIDER_BINDING_STATES,
  PROVIDER_BINDING_VERIFICATION_STATES,
  type ProviderBindingRecord,
  type ProviderBindingResolutionFailure,
  type ProviderBindingResolutionRequest,
  type ProviderBindingResolutionResult,
  type ProviderBindingState,
  type ProviderBindingVerificationState,
} from './types.js';

const RECORD_KEYS = new Set([
  'kind',
  'schemaVersion',
  'bindingReference',
  'tenant',
  'provider',
  'accountReference',
  'targetType',
  'targetReference',
  'state',
  'verificationState',
  'bindingVersion',
  'updatedAt',
  'authorizesExecution',
]);
const TENANT_KEYS = new Set(['tenantId']);
const CONTRACT_VERSION = /^\d+\.\d+\.\d+$/u;

function fail(
  error: ProviderBindingResolutionFailure['error'],
  candidateIndex?: number,
): ProviderBindingResolutionFailure {
  return {
    ok: false,
    error,
    ...(candidateIndex === undefined ? {} : { candidateIndex }),
    authorizesExecution: false,
  };
}

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function hasOnlyOwnDataProperties(value: Record<string, unknown>, allowed: ReadonlySet<string>): boolean {
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

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

function isRfc3339Like(value: unknown): value is string {
  return isNonEmptyString(value) && Number.isFinite(Date.parse(value));
}

function isState(value: unknown): value is ProviderBindingState {
  return typeof value === 'string' && PROVIDER_BINDING_STATES.includes(value as ProviderBindingState);
}

function isVerificationState(value: unknown): value is ProviderBindingVerificationState {
  return (
    typeof value === 'string' &&
    PROVIDER_BINDING_VERIFICATION_STATES.includes(value as ProviderBindingVerificationState)
  );
}

function parseTenant(value: unknown): ProviderBindingRecord['tenant'] | null {
  if (!isPlainRecord(value) || !hasOnlyOwnDataProperties(value, TENANT_KEYS)) return null;
  const tenantId = ownValue(value, 'tenantId');
  if (!isNonEmptyString(tenantId)) return null;
  return { tenantId: tenantId as ProviderBindingRecord['tenant']['tenantId'] };
}

function parseBinding(value: unknown): ProviderBindingRecord | null {
  if (!isPlainRecord(value) || !hasOnlyOwnDataProperties(value, RECORD_KEYS)) return null;

  const kind = ownValue(value, 'kind');
  const schemaVersion = ownValue(value, 'schemaVersion');
  const bindingReference = ownValue(value, 'bindingReference');
  const tenant = parseTenant(ownValue(value, 'tenant'));
  const provider = ownValue(value, 'provider');
  const accountReference = ownValue(value, 'accountReference');
  const targetType = ownValue(value, 'targetType');
  const targetReference = ownValue(value, 'targetReference');
  const state = ownValue(value, 'state');
  const verificationState = ownValue(value, 'verificationState');
  const bindingVersion = ownValue(value, 'bindingVersion');
  const updatedAt = ownValue(value, 'updatedAt');
  const authorizesExecution = ownValue(value, 'authorizesExecution');

  if (
    kind !== 'ProviderBindingRecord' ||
    !isNonEmptyString(schemaVersion) ||
    !CONTRACT_VERSION.test(schemaVersion) ||
    !isNonEmptyString(bindingReference) ||
    tenant === null ||
    !isNonEmptyString(provider) ||
    !isNonEmptyString(accountReference) ||
    (targetType !== undefined && !isNonEmptyString(targetType)) ||
    (targetReference !== undefined && !isNonEmptyString(targetReference)) ||
    !isState(state) ||
    !isVerificationState(verificationState) ||
    !Number.isSafeInteger(bindingVersion) ||
    (bindingVersion as number) < 1 ||
    !isRfc3339Like(updatedAt) ||
    authorizesExecution !== false
  ) {
    return null;
  }

  return {
    kind,
    schemaVersion: schemaVersion as ContractVersion,
    bindingReference,
    tenant,
    provider,
    accountReference: accountReference as ProviderExternalId,
    ...(targetType === undefined ? {} : { targetType }),
    ...(targetReference === undefined
      ? {}
      : { targetReference: targetReference as ProviderExternalId }),
    state,
    verificationState,
    bindingVersion: bindingVersion as number,
    updatedAt: updatedAt as ProviderBindingRecord['updatedAt'],
    authorizesExecution: false,
  };
}

function requestIsWellFormed(request: ProviderBindingResolutionRequest): boolean {
  return (
    isPlainRecord(request.tenant) &&
    hasOnlyOwnDataProperties(request.tenant, TENANT_KEYS) &&
    isNonEmptyString(ownValue(request.tenant, 'tenantId')) &&
    Array.isArray(request.candidates)
  );
}

/**
 * Resolve one exact provider binding. This function is intentionally stricter
 * than W07's legacy provider helper because W08 owns tenant/account mapping.
 */
export function resolveProviderBinding(
  request: ProviderBindingResolutionRequest,
): ProviderBindingResolutionResult {
  if (!requestIsWellFormed(request)) return fail('REQUEST_MALFORMED');
  if (request.executionTarget.kind !== 'PROVIDER') return fail('NON_PROVIDER_TARGET');
  if (!isNonEmptyString(request.executionTarget.accountReference)) {
    return fail('TARGET_ACCOUNT_REQUIRED');
  }

  const parsed: ProviderBindingRecord[] = [];
  for (const [candidateIndex, candidate] of request.candidates.entries()) {
    const binding = parseBinding(candidate);
    if (binding === null) return fail('MALFORMED_BINDING', candidateIndex);
    parsed.push(binding);
  }

  const matches = parsed.filter(
    (binding) =>
      binding.tenant.tenantId === request.tenant.tenantId &&
      binding.provider === request.executionTarget.provider &&
      binding.accountReference === request.executionTarget.accountReference &&
      binding.targetType === request.executionTarget.targetType &&
      binding.targetReference === request.executionTarget.targetReference,
  );

  if (matches.length === 0) return fail('BINDING_NOT_FOUND');
  if (matches.length > 1) return fail('BINDING_AMBIGUOUS');

  const binding = matches[0];
  if (!binding) return fail('BINDING_NOT_FOUND');
  if (binding.state === 'INACTIVE') return fail('BINDING_INACTIVE');
  if (binding.state === 'REVOKED') return fail('BINDING_REVOKED');
  if (binding.verificationState === 'STALE') return fail('BINDING_STALE');

  return {
    ok: true,
    binding,
    verificationState: binding.verificationState,
    authorizesExecution: false,
  };
}
