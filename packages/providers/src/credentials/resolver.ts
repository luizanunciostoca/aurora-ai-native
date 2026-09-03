import type { ProviderExternalId } from '@aurora/contracts/ids';
import type { ContractVersion } from '@aurora/contracts/versioning';

import {
  SECRET_REFERENCE_STATES,
  type CredentialBackend,
  type CredentialBackendLookup,
  type CredentialResolutionFailure,
  type CredentialResolutionRequest,
  type CredentialResolutionResult,
  type SecretReferenceRecord,
  type SecretReferenceState,
  type TransientCredentialConsumer,
} from './types.js';

const SECRET_REFERENCE_KEYS = new Set([
  'kind',
  'schemaVersion',
  'secretReference',
  'tenant',
  'provider',
  'accountReference',
  'bindingReference',
  'state',
  'credentialVersion',
  'updatedAt',
  'expiresAt',
  'authorizesExecution',
]);
const TENANT_KEYS = new Set(['tenantId']);
const BINDING_KEYS = new Set([
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
const CONTRACT_VERSION = /^\d+\.\d+\.\d+$/u;
const BINDING_STATES = ['ACTIVE', 'INACTIVE', 'REVOKED'] as const;
const BINDING_VERIFICATION_STATES = ['UNVERIFIED', 'VERIFIED', 'STALE'] as const;

interface BindingIdentity {
  readonly tenantId: string;
  readonly provider: string;
  readonly accountReference: string;
  readonly bindingReference: string;
  readonly available: boolean;
}

function fail(error: CredentialResolutionFailure['error']): CredentialResolutionFailure {
  return { ok: false, error, authorizesExecution: false };
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

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

function isRfc3339Like(value: unknown): value is string {
  return isNonEmptyString(value) && Number.isFinite(Date.parse(value));
}

function isSecretState(value: unknown): value is SecretReferenceState {
  return (
    typeof value === 'string' && SECRET_REFERENCE_STATES.includes(value as SecretReferenceState)
  );
}

function isBindingState(value: unknown): value is (typeof BINDING_STATES)[number] {
  return (
    typeof value === 'string' && BINDING_STATES.includes(value as (typeof BINDING_STATES)[number])
  );
}

function isBindingVerificationState(
  value: unknown,
): value is (typeof BINDING_VERIFICATION_STATES)[number] {
  return (
    typeof value === 'string' &&
    BINDING_VERIFICATION_STATES.includes(value as (typeof BINDING_VERIFICATION_STATES)[number])
  );
}

function parseTenantId(value: unknown): string | null {
  if (!isPlainRecord(value) || !hasOnlyOwnDataProperties(value, TENANT_KEYS)) return null;
  const tenantId = ownValue(value, 'tenantId');
  return isNonEmptyString(tenantId) ? tenantId : null;
}

function parseBindingIdentity(value: unknown): BindingIdentity | null {
  if (!isPlainRecord(value) || !hasOnlyOwnDataProperties(value, BINDING_KEYS)) return null;

  const kind = ownValue(value, 'kind');
  const schemaVersion = ownValue(value, 'schemaVersion');
  const bindingReference = ownValue(value, 'bindingReference');
  const tenantId = parseTenantId(ownValue(value, 'tenant'));
  const provider = ownValue(value, 'provider');
  const accountReference = ownValue(value, 'accountReference');
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
    tenantId === null ||
    !isNonEmptyString(provider) ||
    !isNonEmptyString(accountReference) ||
    !isBindingState(state) ||
    !isBindingVerificationState(verificationState) ||
    !Number.isSafeInteger(bindingVersion) ||
    (bindingVersion as number) < 1 ||
    !isRfc3339Like(updatedAt) ||
    authorizesExecution !== false
  ) {
    return null;
  }

  return {
    tenantId,
    provider,
    accountReference,
    bindingReference,
    available: state === 'ACTIVE' && verificationState !== 'STALE',
  };
}

function parseSecretReference(value: unknown): SecretReferenceRecord | null {
  if (!isPlainRecord(value) || !hasOnlyOwnDataProperties(value, SECRET_REFERENCE_KEYS)) return null;

  const kind = ownValue(value, 'kind');
  const schemaVersion = ownValue(value, 'schemaVersion');
  const secretReference = ownValue(value, 'secretReference');
  const tenantId = parseTenantId(ownValue(value, 'tenant'));
  const provider = ownValue(value, 'provider');
  const accountReference = ownValue(value, 'accountReference');
  const bindingReference = ownValue(value, 'bindingReference');
  const state = ownValue(value, 'state');
  const credentialVersion = ownValue(value, 'credentialVersion');
  const updatedAt = ownValue(value, 'updatedAt');
  const expiresAt = ownValue(value, 'expiresAt');
  const authorizesExecution = ownValue(value, 'authorizesExecution');

  if (
    kind !== 'SecretReferenceRecord' ||
    !isNonEmptyString(schemaVersion) ||
    !CONTRACT_VERSION.test(schemaVersion) ||
    !isNonEmptyString(secretReference) ||
    tenantId === null ||
    !isNonEmptyString(provider) ||
    !isNonEmptyString(accountReference) ||
    !isNonEmptyString(bindingReference) ||
    !isSecretState(state) ||
    !Number.isSafeInteger(credentialVersion) ||
    (credentialVersion as number) < 1 ||
    !isRfc3339Like(updatedAt) ||
    (expiresAt !== undefined && !isRfc3339Like(expiresAt)) ||
    authorizesExecution !== false
  ) {
    return null;
  }

  return {
    kind,
    schemaVersion: schemaVersion as ContractVersion,
    secretReference,
    tenant: { tenantId: tenantId as SecretReferenceRecord['tenant']['tenantId'] },
    provider,
    accountReference: accountReference as ProviderExternalId,
    bindingReference,
    state,
    credentialVersion: credentialVersion as number,
    updatedAt: updatedAt as SecretReferenceRecord['updatedAt'],
    ...(expiresAt === undefined
      ? {}
      : { expiresAt: expiresAt as SecretReferenceRecord['expiresAt'] }),
    authorizesExecution: false,
  };
}

function requestTenantId(request: CredentialResolutionRequest): string | null {
  return parseTenantId(request.tenant);
}

/**
 * Resolves and consumes provider credential material without returning or
 * serializing the credential. All returned state is sanitized metadata only.
 */
export async function withResolvedCredential(
  request: CredentialResolutionRequest,
  backend: CredentialBackend,
  consumeTransientCredential: TransientCredentialConsumer,
): Promise<CredentialResolutionResult> {
  const tenantId = requestTenantId(request);
  if (tenantId === null || !isRfc3339Like(request.now)) return fail('REQUEST_MALFORMED');

  const binding = parseBindingIdentity(request.binding);
  if (binding === null) return fail('BINDING_MALFORMED');
  if (!binding.available) return fail('BINDING_UNAVAILABLE');

  const reference = parseSecretReference(request.secretReference);
  if (reference === null) return fail('REFERENCE_MALFORMED');

  if (reference.tenant.tenantId !== tenantId || binding.tenantId !== tenantId) {
    return fail('TENANT_MISMATCH');
  }
  if (reference.provider !== binding.provider) return fail('PROVIDER_MISMATCH');
  if (reference.accountReference !== binding.accountReference) return fail('ACCOUNT_MISMATCH');
  if (reference.bindingReference !== binding.bindingReference) return fail('BINDING_MISMATCH');
  if (reference.state === 'REVOKED') return fail('SECRET_REVOKED');
  if (reference.state === 'ROTATED') return fail('SECRET_ROTATED');

  const nowMs = Date.parse(request.now);
  if (reference.expiresAt !== undefined && Date.parse(reference.expiresAt) <= nowMs) {
    return fail('SECRET_EXPIRED');
  }

  const lookup: CredentialBackendLookup = {
    secretReference: reference.secretReference,
    tenant: reference.tenant,
    provider: reference.provider,
    accountReference: reference.accountReference,
    bindingReference: reference.bindingReference,
    credentialVersion: reference.credentialVersion,
  };

  let callbackCount = 0;
  let consumerFailed = false;
  let protocolFailed = false;

  try {
    await backend.withCredential(lookup, async (credential) => {
      callbackCount += 1;
      if (callbackCount !== 1 || !isNonEmptyString(credential)) {
        protocolFailed = true;
        throw new Error('CREDENTIAL_BACKEND_PROTOCOL_VIOLATION');
      }
      try {
        await consumeTransientCredential(credential);
      } catch {
        consumerFailed = true;
        throw new Error('CREDENTIAL_CONSUMER_FAILED');
      }
    });
  } catch {
    if (consumerFailed) return fail('CONSUMER_FAILED');
    if (protocolFailed || callbackCount > 1) return fail('BACKEND_PROTOCOL_VIOLATION');
    return fail('SECRET_UNAVAILABLE');
  }

  if (callbackCount !== 1) return fail('BACKEND_PROTOCOL_VIOLATION');

  return {
    ok: true,
    secretReference: reference.secretReference,
    credentialVersion: reference.credentialVersion,
    consumedAt: request.now,
    authorizesExecution: false,
  };
}
