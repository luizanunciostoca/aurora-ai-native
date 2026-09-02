import type { Rfc3339Timestamp, TenantContext } from '@aurora/contracts/context';
import type { ExecutionTargetReference } from '@aurora/contracts/execution-target';
import type { ProviderExternalId } from '@aurora/contracts/ids';
import type { ContractVersion } from '@aurora/contracts/versioning';

export const PROVIDER_BINDING_STATES = ['ACTIVE', 'INACTIVE', 'REVOKED'] as const;
export type ProviderBindingState = (typeof PROVIDER_BINDING_STATES)[number];

export const PROVIDER_BINDING_VERIFICATION_STATES = ['UNVERIFIED', 'VERIFIED', 'STALE'] as const;
export type ProviderBindingVerificationState =
  (typeof PROVIDER_BINDING_VERIFICATION_STATES)[number];

/**
 * W08-owned provider mapping. External provider identifiers remain explicitly
 * non-canonical and this record can never grant Aurora execution authority.
 */
export interface ProviderBindingRecord {
  readonly kind: 'ProviderBindingRecord';
  readonly schemaVersion: ContractVersion;
  readonly bindingReference: string;
  readonly tenant: TenantContext;
  readonly provider: string;
  readonly accountReference: ProviderExternalId;
  readonly targetType?: string;
  readonly targetReference?: ProviderExternalId;
  readonly state: ProviderBindingState;
  readonly verificationState: ProviderBindingVerificationState;
  readonly bindingVersion: number;
  readonly updatedAt: Rfc3339Timestamp;
  readonly authorizesExecution: false;
}

export interface ProviderBindingResolutionRequest {
  readonly tenant: TenantContext;
  readonly executionTarget: ExecutionTargetReference;
  /** Runtime input stays unknown so malformed/accessor/inherited records fail closed. */
  readonly candidates: readonly unknown[];
}

export const PROVIDER_BINDING_RESOLUTION_ERRORS = [
  'REQUEST_MALFORMED',
  'NON_PROVIDER_TARGET',
  'TARGET_ACCOUNT_REQUIRED',
  'MALFORMED_BINDING',
  'BINDING_NOT_FOUND',
  'BINDING_AMBIGUOUS',
  'BINDING_INACTIVE',
  'BINDING_REVOKED',
  'BINDING_STALE',
] as const;
export type ProviderBindingResolutionError = (typeof PROVIDER_BINDING_RESOLUTION_ERRORS)[number];

export interface ProviderBindingResolutionSuccess {
  readonly ok: true;
  readonly binding: ProviderBindingRecord;
  readonly verificationState: ProviderBindingVerificationState;
  readonly authorizesExecution: false;
}

export interface ProviderBindingResolutionFailure {
  readonly ok: false;
  readonly error: ProviderBindingResolutionError;
  readonly candidateIndex?: number;
  readonly authorizesExecution: false;
}

export type ProviderBindingResolutionResult =
  ProviderBindingResolutionSuccess | ProviderBindingResolutionFailure;
