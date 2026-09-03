import type { ActionIntent, JsonObject } from '@aurora/contracts/actions';
import type { Rfc3339Timestamp } from '@aurora/contracts/context';

import type { ProviderBindingRecord } from '../bindings/index.js';
import type { CredentialBackend } from '../credentials/index.js';

export const PROVIDER_WRITE_SAFE_MODES = ['NO_OP', 'SANDBOX', 'PAUSED'] as const;
export type ProviderWriteSafeMode = (typeof PROVIDER_WRITE_SAFE_MODES)[number];

/**
 * Compatibility-safe projection of the accepted W07 authority-gate result.
 * W08 consumes this proof but never evaluates policy/authority itself.
 */
export interface W07ProviderExecutionProof {
  readonly kind: 'W07_PROVIDER_EXECUTION_PROOF';
  readonly actionIntentId: ActionIntent['actionIntentId'];
  readonly currentAuthorityValidated: true;
  readonly executionEligible: true;
  readonly validatedAt: Rfc3339Timestamp;
  readonly authorizesExecution: false;
}

export interface ProviderWriteRequest {
  readonly actionIntent: ActionIntent;
  readonly executionProof: W07ProviderExecutionProof;
  readonly binding: ProviderBindingRecord;
  readonly secretReference: unknown;
  readonly now: Rfc3339Timestamp;
  readonly safeMode: ProviderWriteSafeMode;
}

export interface ProviderWriteTransportRequest {
  readonly actionIntentId: ActionIntent['actionIntentId'];
  readonly provider: string;
  readonly accountReference: string;
  readonly bindingReference: string;
  readonly bindingVersion: number;
  readonly correlationReference: string;
  readonly capability: string;
  readonly actionType: string;
  readonly payload: JsonObject;
  readonly idempotencyKey: string;
  readonly preconditions: ActionIntent['preconditions'];
  readonly expectedState?: ActionIntent['expectedState'];
  readonly safeMode: ProviderWriteSafeMode;
}

export const PROVIDER_WRITE_TRANSPORT_ERRORS = [
  'PROVIDER_AUTHENTICATION_FAILED',
  'RATE_LIMITED',
  'QUOTA_EXHAUSTED',
  'PROVIDER_OUTAGE',
  'TRANSIENT_TRANSPORT_FAILURE',
  'PERMANENT_REQUEST_REJECTED',
  'CONFLICT',
  'AMBIGUOUS_WRITE',
] as const;
export type ProviderWriteTransportError = (typeof PROVIDER_WRITE_TRANSPORT_ERRORS)[number];

export type ProviderWriteTransportResult =
  | Readonly<{
      ok: true;
      providerReference?: string;
      providerRevision?: string;
      requiresReadback: boolean;
    }>
  | Readonly<{
      ok: false;
      error: ProviderWriteTransportError;
      mutationPossible: boolean;
      retryAfterMs?: number;
      providerReference?: string;
    }>;

/** Internal provider mutation port. No retry method is exposed. */
export interface ProviderWriteAdapter {
  writeOnce(
    request: ProviderWriteTransportRequest,
    transientCredential: string,
  ): Promise<ProviderWriteTransportResult>;
}

export const PROVIDER_WRITE_ERRORS = [
  'REQUEST_MALFORMED',
  'EXECUTION_PROOF_INVALID',
  'DEADLINE_EXPIRED',
  'TARGET_BINDING_UNAVAILABLE',
  'IDEMPOTENCY_REQUIRED',
  'CREDENTIAL_UNAVAILABLE',
  'ADAPTER_PROTOCOL_VIOLATION',
  ...PROVIDER_WRITE_TRANSPORT_ERRORS,
] as const;
export type ProviderWriteError = (typeof PROVIDER_WRITE_ERRORS)[number];

export type ProviderWriteResult =
  | Readonly<{
      ok: true;
      provider: string;
      accountReference: string;
      bindingReference: string;
      bindingVersion: number;
      actionIntentId: ActionIntent['actionIntentId'];
      providerReference?: string;
      providerRevision?: string;
      requiresReadback: boolean;
      safeMode: ProviderWriteSafeMode;
      authorizesExecution: false;
    }>
  | Readonly<{
      ok: false;
      error: ProviderWriteError;
      mutationPossible: boolean;
      retryAfterMs?: number;
      providerReference?: string;
      authorizesExecution: false;
    }>;

export interface ProviderWriteDependencies {
  readonly credentials: CredentialBackend;
  readonly adapter: ProviderWriteAdapter;
}
