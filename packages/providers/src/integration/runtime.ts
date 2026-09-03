import type { ActionIntent } from '@aurora/contracts/actions';
import type { ExecutionTargetReference } from '@aurora/contracts/execution-target';

import { resolveProviderBinding, type ProviderBindingRecord } from '../bindings/index.js';
import { normalizeProviderOperationalObservation } from '../health/index.js';
import { executeProviderRead } from '../read/index.js';
import { reconcileProviderWrite } from '../readback/index.js';
import { executeGovernedProviderWrite, type ProviderWriteSafeMode } from '../write/index.js';
import {
  PROVIDER_INTEGRATION_ENVIRONMENTS,
  type ProviderCapabilitySupportBinding,
  type ProviderIntegrationDependencies,
  type ProviderIntegrationEnvironment,
  type ProviderIntegrationError,
  type ProviderReadIntegrationRequest,
  type ProviderReadIntegrationResult,
  type ProviderWriteIntegrationRequest,
  type ProviderWriteIntegrationResult,
  type W04CapabilityPlanProjection,
  type W04CapabilityPlanSelectionProjection,
} from './types.js';

const PLAN_KEYS = new Set([
  'planKind',
  'tenantId',
  'correlationId',
  'registryVersion',
  'status',
  'selections',
  'authorizesExecution',
]);
const SELECTION_KEYS = new Set([
  'requirementId',
  'capabilityId',
  'status',
  'reason',
  'currentAvailability',
  'selectedBindingIds',
]);
const SUPPORT_KEYS = new Set([
  'kind',
  'supportBindingId',
  'tenantId',
  'provider',
  'providerBindingReference',
  'providerBindingVersion',
  'w04BindingId',
  'capabilityId',
  'supportedActionTypes',
  'supportedReadOperations',
  'state',
  'authorizesExecution',
]);

function failWrite(error: ProviderIntegrationError): ProviderWriteIntegrationResult {
  return { ok: false, error, retryAuthorized: false, authorizesExecution: false };
}

function failRead(error: ProviderIntegrationError): ProviderReadIntegrationResult {
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

function isNonEmptyString(value: unknown, maxLength = 512): value is string {
  return typeof value === 'string' && value.trim().length > 0 && value.length <= maxLength;
}

function stringArray(value: unknown, maxItems = 128): readonly string[] | null {
  if (!Array.isArray(value) || value.length > maxItems) return null;
  const values: string[] = [];
  for (const entry of value) {
    if (!isNonEmptyString(entry, 512)) return null;
    values.push(entry);
  }
  return values;
}

function parseSelection(value: unknown): W04CapabilityPlanSelectionProjection | null {
  if (!isPlainRecord(value) || !hasOnlyOwnDataProperties(value, SELECTION_KEYS)) return null;
  const requirementId = ownValue(value, 'requirementId');
  const capabilityId = ownValue(value, 'capabilityId');
  const status = ownValue(value, 'status');
  const reason = ownValue(value, 'reason');
  const selectedBindingIds = stringArray(ownValue(value, 'selectedBindingIds'));
  if (
    !isNonEmptyString(requirementId) ||
    !isNonEmptyString(capabilityId) ||
    (status !== 'SELECTED' && status !== 'UNSATISFIED') ||
    !isNonEmptyString(reason) ||
    selectedBindingIds === null
  ) {
    return null;
  }
  const currentAvailability = ownValue(value, 'currentAvailability');
  return {
    requirementId,
    capabilityId,
    status,
    reason,
    ...(currentAvailability === undefined ? {} : { currentAvailability }),
    selectedBindingIds,
  };
}

function parseCapabilityPlan(value: unknown): W04CapabilityPlanProjection | null {
  if (!isPlainRecord(value) || !hasOnlyOwnDataProperties(value, PLAN_KEYS)) return null;
  const planKind = ownValue(value, 'planKind');
  const tenantId = ownValue(value, 'tenantId');
  const correlationId = ownValue(value, 'correlationId');
  const registryVersion = ownValue(value, 'registryVersion');
  const status = ownValue(value, 'status');
  const authorizesExecution = ownValue(value, 'authorizesExecution');
  const selectionsValue = ownValue(value, 'selections');
  if (
    planKind !== 'TARGET_NEUTRAL_CAPABILITY_PLAN' ||
    !isNonEmptyString(tenantId) ||
    !isNonEmptyString(correlationId) ||
    !isNonEmptyString(registryVersion) ||
    (status !== 'READY' && status !== 'BLOCKED') ||
    authorizesExecution !== false ||
    !Array.isArray(selectionsValue) ||
    selectionsValue.length > 128
  ) {
    return null;
  }
  const selections: W04CapabilityPlanSelectionProjection[] = [];
  for (const selectionValue of selectionsValue) {
    const selection = parseSelection(selectionValue);
    if (selection === null) return null;
    selections.push(selection);
  }
  return {
    planKind,
    tenantId: tenantId as W04CapabilityPlanProjection['tenantId'],
    correlationId,
    registryVersion,
    status,
    selections,
    authorizesExecution: false,
  };
}

function parseSupportBinding(value: unknown): ProviderCapabilitySupportBinding | null {
  if (!isPlainRecord(value) || !hasOnlyOwnDataProperties(value, SUPPORT_KEYS)) return null;
  const kind = ownValue(value, 'kind');
  const supportBindingId = ownValue(value, 'supportBindingId');
  const tenantId = ownValue(value, 'tenantId');
  const provider = ownValue(value, 'provider');
  const providerBindingReference = ownValue(value, 'providerBindingReference');
  const providerBindingVersion = ownValue(value, 'providerBindingVersion');
  const w04BindingId = ownValue(value, 'w04BindingId');
  const capabilityId = ownValue(value, 'capabilityId');
  const supportedActionTypes = stringArray(ownValue(value, 'supportedActionTypes'));
  const supportedReadOperations = stringArray(ownValue(value, 'supportedReadOperations'));
  const state = ownValue(value, 'state');
  const authorizesExecution = ownValue(value, 'authorizesExecution');
  if (
    kind !== 'ProviderCapabilitySupportBinding' ||
    !isNonEmptyString(supportBindingId) ||
    !isNonEmptyString(tenantId) ||
    !isNonEmptyString(provider) ||
    !isNonEmptyString(providerBindingReference) ||
    !Number.isSafeInteger(providerBindingVersion) ||
    (providerBindingVersion as number) < 1 ||
    !isNonEmptyString(w04BindingId) ||
    !isNonEmptyString(capabilityId) ||
    supportedActionTypes === null ||
    supportedReadOperations === null ||
    (state !== 'ACTIVE' && state !== 'REVOKED') ||
    authorizesExecution !== false
  ) {
    return null;
  }
  return {
    kind,
    supportBindingId,
    tenantId: tenantId as ProviderCapabilitySupportBinding['tenantId'],
    provider,
    providerBindingReference,
    providerBindingVersion: providerBindingVersion as number,
    w04BindingId,
    capabilityId,
    supportedActionTypes,
    supportedReadOperations,
    state,
    authorizesExecution: false,
  };
}

function environmentSafe(environment: unknown): environment is ProviderIntegrationEnvironment {
  return (
    typeof environment === 'string' &&
    PROVIDER_INTEGRATION_ENVIRONMENTS.includes(environment as ProviderIntegrationEnvironment)
  );
}

function safeModeMatches(
  environment: ProviderIntegrationEnvironment,
  safeMode: ProviderWriteSafeMode,
): boolean {
  if (environment === 'MOCK') return safeMode === 'NO_OP';
  if (environment === 'SANDBOX') return safeMode === 'SANDBOX';
  return safeMode === 'PAUSED' || safeMode === 'NO_OP';
}

type ProviderExecutionTarget = Extract<ExecutionTargetReference, { readonly kind: 'PROVIDER' }>;

function providerTarget(actionIntent: ActionIntent): ProviderExecutionTarget | null {
  const target = actionIntent.executionTarget;
  return target?.kind === 'PROVIDER' ? target : null;
}

function selectedCapability(
  plan: W04CapabilityPlanProjection,
  capabilityId: string,
): W04CapabilityPlanSelectionProjection | null {
  const matching = plan.selections.filter(
    (selection) => selection.capabilityId === capabilityId && selection.status === 'SELECTED',
  );
  return matching.length === 1 ? (matching[0] ?? null) : null;
}

function validateComposition(options: {
  readonly planValue: unknown;
  readonly supportValue: unknown;
  readonly environment: unknown;
  readonly tenantId: string;
  readonly correlationId: string;
  readonly capabilityId: string;
  readonly provider: string;
  readonly binding: ProviderBindingRecord;
  readonly operationKind: 'WRITE' | 'READ';
  readonly operation: string;
}): ProviderIntegrationError | null {
  if (!environmentSafe(options.environment)) return 'UNSAFE_ENVIRONMENT';
  const plan = parseCapabilityPlan(options.planValue);
  if (plan === null) return 'CAPABILITY_PLAN_INVALID';
  if (
    plan.status !== 'READY' ||
    plan.tenantId !== options.tenantId ||
    plan.correlationId !== options.correlationId
  ) {
    return 'CAPABILITY_NOT_SELECTED';
  }
  const selection = selectedCapability(plan, options.capabilityId);
  if (selection === null) return 'CAPABILITY_NOT_SELECTED';

  const support = parseSupportBinding(options.supportValue);
  if (support === null) return 'SUPPORT_BINDING_INVALID';
  if (
    support.state !== 'ACTIVE' ||
    support.tenantId !== options.tenantId ||
    support.provider !== options.provider ||
    support.providerBindingReference !== options.binding.bindingReference ||
    support.providerBindingVersion !== options.binding.bindingVersion ||
    support.capabilityId !== options.capabilityId ||
    !selection.selectedBindingIds.includes(support.w04BindingId)
  ) {
    return 'SUPPORT_BINDING_MISMATCH';
  }
  const supported =
    options.operationKind === 'WRITE'
      ? support.supportedActionTypes.includes(options.operation)
      : support.supportedReadOperations.includes(options.operation);
  return supported ? null : 'UNSUPPORTED_OPERATION';
}

function bindingAvailable(options: {
  readonly tenant: ActionIntent['tenant'];
  readonly executionTarget: ExecutionTargetReference;
  readonly binding: ProviderBindingRecord;
}): boolean {
  return resolveProviderBinding({
    tenant: options.tenant,
    executionTarget: options.executionTarget,
    candidates: [options.binding],
  }).ok;
}

/**
 * Composes one safe W07->W08 provider write. The only mutation attempt remains
 * W08-D's exactly-once transport call; ambiguous outcomes flow into W08-F
 * readback and remain W07 reconciliation evidence with retryAuthorized=false.
 */
export async function executeSafeProviderWriteIntegration(
  request: ProviderWriteIntegrationRequest,
  dependencies: ProviderIntegrationDependencies,
): Promise<ProviderWriteIntegrationResult> {
  if (!environmentSafe(request.environment)) return failWrite('UNSAFE_ENVIRONMENT');
  if (!safeModeMatches(request.environment, request.safeMode))
    return failWrite('SAFE_MODE_MISMATCH');
  const target = providerTarget(request.actionIntent);
  if (target === null) return failWrite('REQUEST_MALFORMED');
  if (
    !bindingAvailable({
      tenant: request.actionIntent.tenant,
      executionTarget: target,
      binding: request.binding,
    })
  ) {
    return failWrite('TARGET_BINDING_UNAVAILABLE');
  }
  const compositionError = validateComposition({
    planValue: request.capabilityPlan,
    supportValue: request.supportBinding,
    environment: request.environment,
    tenantId: request.actionIntent.tenant.tenantId,
    correlationId: request.actionIntent.correlation.correlationId,
    capabilityId: request.actionIntent.capability.capability,
    provider: target.provider,
    binding: request.binding,
    operationKind: 'WRITE',
    operation: request.actionIntent.capability.actionType,
  });
  if (compositionError !== null) return failWrite(compositionError);

  const write = await executeGovernedProviderWrite(
    {
      actionIntent: request.actionIntent,
      executionProof: request.executionProof,
      binding: request.binding,
      secretReference: request.secretReference,
      now: request.now,
      safeMode: request.safeMode,
    },
    { credentials: dependencies.credentials, adapter: dependencies.writeAdapter },
  );

  const needsReadback =
    (write.ok && write.requiresReadback) ||
    (!write.ok && write.error === 'AMBIGUOUS_WRITE' && write.mutationPossible);
  if (!needsReadback) {
    return {
      ok: true,
      write,
      requiresReconciliation: false,
      retryAuthorized: false,
      authorizesExecution: false,
    };
  }

  const health = normalizeProviderOperationalObservation({
    tenant: request.actionIntent.tenant,
    binding: request.binding,
    now: request.now,
    maxObservationAgeMs: request.maxObservationAgeMs,
    observation: request.healthObservation,
  });
  const readback = await reconcileProviderWrite(
    {
      actionIntent: request.actionIntent,
      binding: request.binding,
      secretReference: request.secretReference,
      writeResult: write,
      health,
      writeOccurredAt: request.now,
      now: request.now,
      maxObservationAgeMs: request.maxObservationAgeMs,
    },
    { credentials: dependencies.credentials, adapter: dependencies.readbackAdapter },
  );
  return {
    ok: true,
    write,
    health,
    readback,
    requiresReconciliation: !readback.ok || readback.requiresFurtherReadback,
    retryAuthorized: false,
    authorizesExecution: false,
  };
}

/** Read-only integration path. It cannot receive or invoke a write adapter. */
export async function executeSafeProviderReadIntegration(
  request: ProviderReadIntegrationRequest,
  dependencies: Pick<ProviderIntegrationDependencies, 'credentials' | 'readAdapter'>,
): Promise<ProviderReadIntegrationResult> {
  if (!environmentSafe(request.environment)) return failRead('UNSAFE_ENVIRONMENT');
  if (request.executionTarget.kind !== 'PROVIDER') return failRead('REQUEST_MALFORMED');
  if (
    !bindingAvailable({
      tenant: request.tenant,
      executionTarget: request.executionTarget,
      binding: request.binding,
    })
  ) {
    return failRead('TARGET_BINDING_UNAVAILABLE');
  }
  const compositionError = validateComposition({
    planValue: request.capabilityPlan,
    supportValue: request.supportBinding,
    environment: request.environment,
    tenantId: request.tenant.tenantId,
    correlationId: request.correlationReference,
    capabilityId: request.capabilityId,
    provider: request.executionTarget.provider,
    binding: request.binding,
    operationKind: 'READ',
    operation: request.operation,
  });
  if (compositionError !== null) return failRead(compositionError);

  const read = await executeProviderRead(
    {
      tenant: request.tenant,
      executionTarget: request.executionTarget,
      binding: request.binding,
      secretReference: request.secretReference,
      now: request.now,
      correlationReference: request.correlationReference,
      operation: request.operation,
      fields: request.fields,
      query: request.query,
      ...(request.cursor === undefined ? {} : { cursor: request.cursor }),
      limits: request.limits,
    },
    { credentials: dependencies.credentials, adapter: dependencies.readAdapter },
  );
  return { ok: true, read, authorizesExecution: false };
}
