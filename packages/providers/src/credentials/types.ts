import type { Rfc3339Timestamp, TenantContext } from '@aurora/contracts/context';
import type { ProviderExternalId } from '@aurora/contracts/ids';
import type { ContractVersion } from '@aurora/contracts/versioning';

import type { ProviderBindingRecord } from '../bindings/types.js';

export const SECRET_REFERENCE_STATES = ['ACTIVE', 'REVOKED', 'ROTATED'] as const;
export type SecretReferenceState = (typeof SECRET_REFERENCE_STATES)[number];

/**
 * Opaque W08-B secret locator metadata. It never contains credential material and
 * never grants Aurora execution authority.
 */
export interface SecretReferenceRecord {
  readonly kind: 'SecretReferenceRecord';
  readonly schemaVersion: ContractVersion;
  readonly secretReference: string;
  readonly tenant: TenantContext;
  readonly provider: string;
  readonly accountReference: ProviderExternalId;
  readonly bindingReference: string;
  readonly state: SecretReferenceState;
  readonly credentialVersion: number;
  readonly updatedAt: Rfc3339Timestamp;
  readonly expiresAt?: Rfc3339Timestamp;
  readonly authorizesExecution: false;
}

export interface CredentialResolutionRequest {
  readonly tenant: TenantContext;
  /** Accepted W08-A binding identity consumed as a precondition, never as authority. */
  readonly binding: ProviderBindingRecord;
  /** Runtime input is unknown so raw-token/accessor/inherited/extra-field objects fail closed. */
  readonly secretReference: unknown;
  readonly now: Rfc3339Timestamp;
}

export interface CredentialBackendLookup {
  readonly secretReference: string;
  readonly tenant: TenantContext;
  readonly provider: string;
  readonly accountReference: ProviderExternalId;
  readonly bindingReference: string;
  readonly credentialVersion: number;
}

export type TransientCredentialConsumer = (credential: string) => void | Promise<void>;

/**
 * The backend never returns plaintext credential material. It exposes material
 * only inside a callback whose lifetime is bounded by this invocation.
 */
export interface CredentialBackend {
  withCredential(
    lookup: CredentialBackendLookup,
    consumeTransientCredential: TransientCredentialConsumer,
  ): Promise<void>;
}

export const CREDENTIAL_RESOLUTION_ERRORS = [
  'REQUEST_MALFORMED',
  'BINDING_MALFORMED',
  'BINDING_UNAVAILABLE',
  'REFERENCE_MALFORMED',
  'TENANT_MISMATCH',
  'PROVIDER_MISMATCH',
  'ACCOUNT_MISMATCH',
  'BINDING_MISMATCH',
  'SECRET_REVOKED',
  'SECRET_ROTATED',
  'SECRET_EXPIRED',
  'SECRET_UNAVAILABLE',
  'BACKEND_PROTOCOL_VIOLATION',
  'CONSUMER_FAILED',
] as const;
export type CredentialResolutionError = (typeof CREDENTIAL_RESOLUTION_ERRORS)[number];

export interface CredentialResolutionSuccess {
  readonly ok: true;
  readonly secretReference: string;
  readonly credentialVersion: number;
  readonly consumedAt: Rfc3339Timestamp;
  readonly authorizesExecution: false;
}

export interface CredentialResolutionFailure {
  readonly ok: false;
  readonly error: CredentialResolutionError;
  readonly authorizesExecution: false;
}

export type CredentialResolutionResult = CredentialResolutionSuccess | CredentialResolutionFailure;
