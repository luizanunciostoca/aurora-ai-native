import type { ActionIntent } from '@aurora/contracts/actions';
import type { Rfc3339Timestamp, TenantContext } from '@aurora/contracts/context';
import type { ExecutionTargetReference } from '@aurora/contracts/execution-target';

import type { ProviderBindingRecord } from '../bindings/index.js';
import type { CredentialBackend } from '../credentials/index.js';
import type { ProviderOperationalObservationResult } from '../health/index.js';
import type {
  ProviderReadAdapter,
  ProviderReadCursor,
  ProviderReadLimits,
  ProviderReadQueryValue,
  ProviderReadResult,
  ProviderReadTransportResult,
} from '../read/index.js';
import type {
  ProviderReadbackAdapter,
  ProviderReadbackResult,
  ProviderReadbackTransportResult,
} from '../readback/index.js';
import type {
  ProviderWriteAdapter,
  ProviderWriteResult,
  ProviderWriteSafeMode,
  ProviderWriteTransportResult,
  W07ProviderExecutionProof,
} from '../write/index.js';

export const PROVIDER_INTEGRATION_ENVIRONMENTS = ['MOCK', 'SANDBOX', 'STAGING'] as const;
export type ProviderIntegrationEnvironment = (typeof PROVIDER_INTEGRATION_ENVIRONMENTS)[number];

export const PROVIDER_SUPPORT_BINDING_STATES = ['ACTIVE', 'REVOKED'] as const;
export type ProviderSupportBindingState = (typeof PROVIDER_SUPPORT_BINDING_STATES)[number];

/** Exact compatibility projection of W04's target-neutral CapabilityPlan. */
export interface W04CapabilityPlanSelectionProjection {
  readonly requirementId: string;
  readonly capabilityId: string;
  readonly status: 'SELECTED' | 'UNSATISFIED';
  readonly reason: string;
  readonly currentAvailability?: unknown;
  readonly selectedBindingIds: readonly string[];
}

/**
 * W08 consumes W04 capability truth by projection because the provider package
 * cannot own or import W04 runtime internals. This projection never grants
 * execution authority.
 */
export interface W04CapabilityPlanProjection {
  readonly planKind: 'TARGET_NEUTRAL_CAPABILITY_PLAN';
  readonly tenantId: TenantContext['tenantId'];
  readonly correlationId: string;
  readonly registryVersion: string;
  readonly status: 'READY' | 'BLOCKED';
  readonly selections: readonly W04CapabilityPlanSelectionProjection[];
  readonly authorizesExecution: false;
}

/**
 * W08-G support publication binds a provider implementation to an already
 * selected W04 binding. It does not define the capability itself.
 */
export interface ProviderCapabilitySupportBinding {
  readonly kind: 'ProviderCapabilitySupportBinding';
  readonly supportBindingId: string;
  readonly tenantId: TenantContext['tenantId'];
  readonly provider: string;
  readonly providerBindingReference: string;
  readonly providerBindingVersion: number;
  readonly w04BindingId: string;
  readonly capabilityId: string;
  readonly supportedActionTypes: readonly string[];
  readonly supportedReadOperations: readonly string[];
  readonly state: ProviderSupportBindingState;
  readonly authorizesExecution: false;
}

export const PROVIDER_INTEGRATION_ERRORS = [
  'REQUEST_MALFORMED',
  'UNSAFE_ENVIRONMENT',
  'SAFE_MODE_MISMATCH',
  'CAPABILITY_PLAN_INVALID',
  'CAPABILITY_NOT_SELECTED',
  'SUPPORT_BINDING_INVALID',
  'SUPPORT_BINDING_MISMATCH',
  'UNSUPPORTED_OPERATION',
  'TARGET_BINDING_UNAVAILABLE',
] as const;
export type ProviderIntegrationError = (typeof PROVIDER_INTEGRATION_ERRORS)[number];

export interface ProviderIntegrationContext {
  readonly capabilityPlan: unknown;
  readonly supportBinding: unknown;
  readonly environment: ProviderIntegrationEnvironment;
}

export interface ProviderWriteIntegrationRequest extends ProviderIntegrationContext {
  readonly actionIntent: ActionIntent;
  readonly executionProof: W07ProviderExecutionProof;
  readonly binding: ProviderBindingRecord;
  readonly secretReference: unknown;
  readonly now: Rfc3339Timestamp;
  readonly safeMode: ProviderWriteSafeMode;
  readonly healthObservation: unknown;
  readonly maxObservationAgeMs: number;
}

export interface ProviderReadIntegrationRequest extends ProviderIntegrationContext {
  readonly capabilityId: string;
  readonly tenant: TenantContext;
  readonly executionTarget: ExecutionTargetReference;
  readonly binding: ProviderBindingRecord;
  readonly secretReference: unknown;
  readonly now: Rfc3339Timestamp;
  readonly correlationReference: string;
  readonly operation: string;
  readonly fields: readonly string[];
  readonly query: Readonly<Record<string, ProviderReadQueryValue>>;
  readonly cursor?: ProviderReadCursor;
  readonly limits: ProviderReadLimits;
}

export interface ProviderIntegrationDependencies {
  readonly credentials: CredentialBackend;
  readonly writeAdapter: ProviderWriteAdapter;
  readonly readAdapter: ProviderReadAdapter;
  readonly readbackAdapter: ProviderReadbackAdapter;
}

export type ProviderWriteIntegrationResult =
  | Readonly<{
      ok: false;
      error: ProviderIntegrationError;
      retryAuthorized: false;
      authorizesExecution: false;
    }>
  | Readonly<{
      ok: true;
      write: ProviderWriteResult;
      health?: ProviderOperationalObservationResult;
      readback?: ProviderReadbackResult;
      requiresReconciliation: boolean;
      retryAuthorized: false;
      authorizesExecution: false;
    }>;

export type ProviderReadIntegrationResult =
  | Readonly<{
      ok: false;
      error: ProviderIntegrationError;
      authorizesExecution: false;
    }>
  | Readonly<{
      ok: true;
      read: ProviderReadResult;
      authorizesExecution: false;
    }>;

export interface SafeProviderMockScript {
  readonly transientCredential: string;
  readonly writeResult: ProviderWriteTransportResult;
  readonly readResults?: readonly ProviderReadTransportResult[];
  readonly readbackResult?: ProviderReadbackTransportResult;
}

export interface SafeProviderMockTrace {
  readonly credentialUses: number;
  readonly writeCalls: number;
  readonly readCalls: number;
  readonly readbackCalls: number;
}

export interface SafeProviderMockHarness {
  readonly credentials: CredentialBackend;
  readonly writeAdapter: ProviderWriteAdapter;
  readonly readAdapter: ProviderReadAdapter;
  readonly readbackAdapter: ProviderReadbackAdapter;
  snapshot(): SafeProviderMockTrace;
}
