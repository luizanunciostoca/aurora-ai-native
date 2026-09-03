import { validateN8nWorkflowBinding } from '../bindings/index.js';
import {
  N8N_WORKFLOW_CREDENTIAL_STATES,
  type N8nWorkflowCredentialBackend,
  type N8nWorkflowCredentialBackendLookup,
  type N8nWorkflowCredentialReference,
  type N8nWorkflowCredentialResolutionFailure,
  type N8nWorkflowCredentialResolutionResult,
  type N8nWorkflowCredentialState,
  type N8nTransientCredentialConsumer,
} from './types.js';

const REQUEST_KEYS = new Set([
  'tenantId',
  'binding',
  'credentialReference',
  'expectedIntegration',
  'expectedProvider',
  'now',
]);
const REFERENCE_KEYS = new Set([
  'kind',
  'schemaVersion',
  'credentialReference',
  'tenantId',
  'bindingId',
  'bindingVersion',
  'workflowReference',
  'workflowVersion',
  'workflowHash',
  'integration',
  'provider',
  'state',
  'credentialVersion',
  'updatedAt',
  'expiresAt',
  'authorizesExecution',
  'canGrantPermission',
]);
const FORBIDDEN_KEYS = new Set([
  'credential',
  'credentials',
  'credentialvalue',
  'secret',
  'secretvalue',
  'password',
  'token',
  'accesstoken',
  'refreshtoken',
  'apikey',
  'pindata',
  'accountid',
  'provideraccountid',
  'externalaccountid',
  'authorization',
]);
const IDENTIFIER = /^[A-Za-z0-9][A-Za-z0-9._:/-]{0,255}$/u;
const VERSION = /^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/u;
const SHA256 = /^sha256:[0-9a-f]{64}$/u;
const MAX_TRANSIENT_CREDENTIAL_LENGTH = 64 * 1024;

function fail(
  error: N8nWorkflowCredentialResolutionFailure['error'],
): N8nWorkflowCredentialResolutionFailure {
  return { ok: false, error, authorizesExecution: false, canGrantPermission: false };
}

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return false;
  try {
    const prototype = Object.getPrototypeOf(value);
    return prototype === Object.prototype || prototype === null;
  } catch {
    return false;
  }
}

function hasOnlyOwnDataProperties(
  value: Record<string, unknown>,
  allowed: ReadonlySet<string>,
): boolean {
  try {
    for (const key of Reflect.ownKeys(value)) {
      if (typeof key !== 'string' || !allowed.has(key)) return false;
      const descriptor = Object.getOwnPropertyDescriptor(value, key);
      if (!descriptor || !('value' in descriptor)) return false;
    }
    return true;
  } catch {
    return false;
  }
}

function ownValue(value: Record<string, unknown>, key: string): unknown {
  try {
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    return descriptor && 'value' in descriptor ? descriptor.value : undefined;
  } catch {
    return undefined;
  }
}

function isPlainDataTree(value: unknown, seen = new Set<object>()): boolean {
  if (value === null || typeof value !== 'object') return typeof value !== 'function';
  if (seen.has(value)) return true;
  seen.add(value);

  try {
    if (Array.isArray(value)) {
      const descriptors = Object.getOwnPropertyDescriptors(value);
      for (const [key, descriptor] of Object.entries(descriptors)) {
        if (key === 'length') continue;
        if (!('value' in descriptor) || !isPlainDataTree(descriptor.value, seen)) return false;
      }
      return Object.getOwnPropertySymbols(value).length === 0;
    }

    const prototype = Object.getPrototypeOf(value);
    if (prototype !== Object.prototype && prototype !== null) return false;
    for (const key of Reflect.ownKeys(value)) {
      if (typeof key !== 'string') return false;
      const descriptor = Object.getOwnPropertyDescriptor(value, key);
      if (!descriptor || !('value' in descriptor) || !isPlainDataTree(descriptor.value, seen)) {
        return false;
      }
    }
    return true;
  } catch {
    return false;
  }
}

function hasSensitiveMaterial(value: unknown, seen = new Set<object>()): boolean {
  if (value === null || typeof value !== 'object') return false;
  if (seen.has(value)) return false;
  seen.add(value);

  try {
    const descriptors = Object.getOwnPropertyDescriptors(value);
    for (const [key, descriptor] of Object.entries(descriptors)) {
      if (key !== 'length' && FORBIDDEN_KEYS.has(key.toLowerCase())) return true;
      if ('value' in descriptor && hasSensitiveMaterial(descriptor.value, seen)) return true;
    }
    return false;
  } catch {
    return false;
  }
}

function isIdentifier(value: unknown): value is string {
  return typeof value === 'string' && IDENTIFIER.test(value);
}

function isVersion(value: unknown): value is string {
  return typeof value === 'string' && VERSION.test(value);
}

function isHash(value: unknown): value is string {
  return typeof value === 'string' && SHA256.test(value);
}

function isTimestamp(value: unknown): value is string {
  return typeof value === 'string' && value.endsWith('Z') && Number.isFinite(Date.parse(value));
}

function isCredentialState(value: unknown): value is N8nWorkflowCredentialState {
  return (
    typeof value === 'string' &&
    N8N_WORKFLOW_CREDENTIAL_STATES.includes(value as N8nWorkflowCredentialState)
  );
}

function parseReference(value: unknown): N8nWorkflowCredentialReference | null {
  if (!isPlainRecord(value) || !hasOnlyOwnDataProperties(value, REFERENCE_KEYS)) return null;

  const kind = ownValue(value, 'kind');
  const schemaVersion = ownValue(value, 'schemaVersion');
  const credentialReference = ownValue(value, 'credentialReference');
  const tenantId = ownValue(value, 'tenantId');
  const bindingId = ownValue(value, 'bindingId');
  const bindingVersion = ownValue(value, 'bindingVersion');
  const workflowReference = ownValue(value, 'workflowReference');
  const workflowVersion = ownValue(value, 'workflowVersion');
  const workflowHash = ownValue(value, 'workflowHash');
  const integration = ownValue(value, 'integration');
  const provider = ownValue(value, 'provider');
  const state = ownValue(value, 'state');
  const credentialVersion = ownValue(value, 'credentialVersion');
  const updatedAt = ownValue(value, 'updatedAt');
  const expiresAt = ownValue(value, 'expiresAt');
  const authorizesExecution = ownValue(value, 'authorizesExecution');
  const canGrantPermission = ownValue(value, 'canGrantPermission');

  if (
    kind !== 'N8N_WORKFLOW_CREDENTIAL_REFERENCE' ||
    !isVersion(schemaVersion) ||
    !isIdentifier(credentialReference) ||
    !isIdentifier(tenantId) ||
    !isIdentifier(bindingId) ||
    !isVersion(bindingVersion) ||
    !isIdentifier(workflowReference) ||
    !isIdentifier(workflowVersion) ||
    !isHash(workflowHash) ||
    !isIdentifier(integration) ||
    (provider !== null && !isIdentifier(provider)) ||
    !isCredentialState(state) ||
    !Number.isSafeInteger(credentialVersion) ||
    (credentialVersion as number) < 1 ||
    !isTimestamp(updatedAt) ||
    (expiresAt !== null && !isTimestamp(expiresAt)) ||
    authorizesExecution !== false ||
    canGrantPermission !== false
  ) {
    return null;
  }

  return Object.freeze({
    kind,
    schemaVersion,
    credentialReference,
    tenantId,
    bindingId,
    bindingVersion,
    workflowReference,
    workflowVersion,
    workflowHash,
    integration,
    provider,
    state,
    credentialVersion: credentialVersion as number,
    updatedAt,
    expiresAt,
    authorizesExecution: false,
    canGrantPermission: false,
  });
}

/**
 * Resolves workflow credential material through an existing secret/provider owner without storing,
 * returning, logging or otherwise serializing the credential value.
 *
 * A successful resolution remains a precondition only. W09-C never grants action authority.
 */
export async function withResolvedN8nWorkflowCredential(
  request: unknown,
  backend: N8nWorkflowCredentialBackend,
  consumeTransientCredential: N8nTransientCredentialConsumer,
): Promise<N8nWorkflowCredentialResolutionResult> {
  if (!isPlainDataTree(request)) return fail('REQUEST_MALFORMED');
  if (hasSensitiveMaterial(request)) return fail('SENSITIVE_MATERIAL_PROHIBITED');
  if (!isPlainRecord(request) || !hasOnlyOwnDataProperties(request, REQUEST_KEYS)) {
    return fail('REQUEST_MALFORMED');
  }

  const tenantId = ownValue(request, 'tenantId');
  const expectedIntegration = ownValue(request, 'expectedIntegration');
  const expectedProvider = ownValue(request, 'expectedProvider');
  const now = ownValue(request, 'now');
  if (
    !isIdentifier(tenantId) ||
    !isIdentifier(expectedIntegration) ||
    (expectedProvider !== null && !isIdentifier(expectedProvider)) ||
    !isTimestamp(now)
  ) {
    return fail('REQUEST_MALFORMED');
  }

  const bindingResult = validateN8nWorkflowBinding(ownValue(request, 'binding'));
  if (!bindingResult.ok) return fail('BINDING_MALFORMED');
  const binding = bindingResult.value;
  if (binding.status !== 'ACTIVE') return fail('BINDING_UNAVAILABLE');

  const reference = parseReference(ownValue(request, 'credentialReference'));
  if (reference === null) return fail('REFERENCE_MALFORMED');
  if (Date.parse(reference.updatedAt) > Date.parse(now)) return fail('REFERENCE_MALFORMED');

  if (binding.tenantId !== tenantId || reference.tenantId !== tenantId) {
    return fail('TENANT_MISMATCH');
  }
  if (
    reference.bindingId !== binding.bindingId ||
    reference.bindingVersion !== binding.bindingVersion
  ) {
    return fail('BINDING_MISMATCH');
  }
  if (
    reference.workflowReference !== binding.workflow.workflowReference ||
    reference.workflowVersion !== binding.workflow.workflowVersion ||
    reference.workflowHash !== binding.workflow.workflowHash
  ) {
    return fail('WORKFLOW_MISMATCH');
  }
  if (reference.integration !== expectedIntegration) return fail('INTEGRATION_MISMATCH');
  if (reference.provider !== expectedProvider) return fail('PROVIDER_MISMATCH');

  const declaredRequirement = binding.credentialRequirements.some(
    (requirement) =>
      requirement.credentialReference === reference.credentialReference &&
      requirement.integration === reference.integration,
  );
  if (!declaredRequirement) return fail('REFERENCE_NOT_REQUIRED');

  if (reference.state === 'REVOKED') return fail('CREDENTIAL_REVOKED');
  if (reference.state === 'ROTATED') return fail('CREDENTIAL_ROTATED');
  if (reference.state === 'STALE') return fail('CREDENTIAL_STALE');
  if (reference.expiresAt !== null && Date.parse(reference.expiresAt) <= Date.parse(now)) {
    return fail('CREDENTIAL_EXPIRED');
  }

  const lookup: N8nWorkflowCredentialBackendLookup = Object.freeze({
    credentialReference: reference.credentialReference,
    tenantId: reference.tenantId,
    bindingId: reference.bindingId,
    bindingVersion: reference.bindingVersion,
    workflowReference: reference.workflowReference,
    workflowVersion: reference.workflowVersion,
    workflowHash: reference.workflowHash,
    integration: reference.integration,
    provider: reference.provider,
    credentialVersion: reference.credentialVersion,
  });

  let callbackCount = 0;
  let consumerCompleted = false;
  let consumerFailed = false;
  let protocolFailed = false;

  try {
    await backend.withCredential(lookup, async (credential) => {
      callbackCount += 1;
      if (
        callbackCount !== 1 ||
        typeof credential !== 'string' ||
        credential.length === 0 ||
        credential.length > MAX_TRANSIENT_CREDENTIAL_LENGTH
      ) {
        protocolFailed = true;
        throw new Error('N8N_CREDENTIAL_BACKEND_PROTOCOL_VIOLATION');
      }
      try {
        await consumeTransientCredential(credential);
        consumerCompleted = true;
      } catch {
        consumerFailed = true;
        throw new Error('N8N_CREDENTIAL_CONSUMER_FAILED');
      }
    });
  } catch {
    if (consumerFailed) return fail('CONSUMER_FAILED');
    if (consumerCompleted || callbackCount > 1) return fail('CREDENTIAL_CONSUMPTION_UNCERTAIN');
    if (protocolFailed) return fail('BACKEND_PROTOCOL_VIOLATION');
    return fail('CREDENTIAL_UNAVAILABLE');
  }

  if (callbackCount !== 1 || !consumerCompleted) return fail('BACKEND_PROTOCOL_VIOLATION');

  return Object.freeze({
    ok: true,
    credentialReference: reference.credentialReference,
    credentialVersion: reference.credentialVersion,
    consumedAt: now,
    authorizesExecution: false,
    canGrantPermission: false,
  });
}
