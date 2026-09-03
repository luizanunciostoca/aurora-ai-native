import type { ActionIntent, JsonObject } from '@aurora/contracts/actions';
import type { Rfc3339Timestamp } from '@aurora/contracts/context';

import type { ProviderBindingRecord } from '../bindings/index.js';
import type { CredentialBackend } from '../credentials/index.js';
import type { ProviderOperationalObservationResult } from '../health/index.js';
import type { ProviderReadTransportError } from '../read/index.js';
import type { ProviderWriteResult } from '../write/index.js';

export const PROVIDER_READBACK_STATUSES = [
  'OBSERVED',
  'NO_EFFECT_CONFIRMED',
  'NOT_FOUND',
  'DUPLICATE',
  'PENDING',
  'DELAYED',
] as const;
export type ProviderReadbackStatus = (typeof PROVIDER_READBACK_STATUSES)[number];

export interface ProviderReadbackRequest {
  readonly actionIntent: ActionIntent;
  readonly binding: ProviderBindingRecord;
  readonly secretReference: unknown;
  readonly writeResult: ProviderWriteResult;
  readonly health: ProviderOperationalObservationResult;
  readonly writeOccurredAt: Rfc3339Timestamp;
  readonly now: Rfc3339Timestamp;
  readonly maxObservationAgeMs: number;
}

export interface ProviderReadbackTransportRequest {
  readonly actionIntentId: ActionIntent['actionIntentId'];
  readonly provider: string;
  readonly accountReference: string;
  readonly bindingReference: string;
  readonly bindingVersion: number;
  readonly correlationReference: string;
  readonly writeOccurredAt: Rfc3339Timestamp;
  readonly providerReference?: string;
  readonly providerRevision?: string;
  readonly expectedState?: ActionIntent['expectedState'];
}

export type ProviderReadbackTransportResult =
  | Readonly<{
      ok: true;
      status: ProviderReadbackStatus;
      observedAt: Rfc3339Timestamp;
      providerReference?: string;
      providerRevision?: string;
      observedState?: JsonObject;
    }>
  | Readonly<{
      ok: false;
      error: ProviderReadTransportError;
      retryAfterMs?: number;
    }>;

/** Read-only provider port. One reconciliation read occurs per invocation. */
export interface ProviderReadbackAdapter {
  readbackOnce(
    request: ProviderReadbackTransportRequest,
    transientCredential: string,
  ): Promise<ProviderReadbackTransportResult>;
}

/**
 * Compatibility-safe projection of W07's accepted ReconciliationObservation.
 * W08-F produces observations for W07 but never decides retry authority.
 */
export type W07ProviderReconciliationObservation =
  | Readonly<{
      state: 'EFFECT_OBSERVED';
      observedAt: Rfc3339Timestamp;
      reference?: string;
    }>
  | Readonly<{
      state: 'NO_EFFECT_CONFIRMED';
      observedAt: Rfc3339Timestamp;
      reference?: string;
    }>
  | Readonly<{
      state: 'INDETERMINATE';
      observedAt: Rfc3339Timestamp;
      reason: string;
      reference?: string;
    }>;

export const PROVIDER_READBACK_ERRORS = [
  'REQUEST_MALFORMED',
  'WRITE_OUTCOME_INELIGIBLE',
  'TARGET_BINDING_UNAVAILABLE',
  'HEALTH_BINDING_MISMATCH',
  'CREDENTIAL_UNAVAILABLE',
  'ADAPTER_PROTOCOL_VIOLATION',
] as const;
export type ProviderReadbackError = (typeof PROVIDER_READBACK_ERRORS)[number];

export type ProviderReadbackResult =
  | Readonly<{
      ok: true;
      provider: string;
      accountReference: string;
      bindingReference: string;
      bindingVersion: number;
      actionIntentId: ActionIntent['actionIntentId'];
      observation: W07ProviderReconciliationObservation;
      observedState?: JsonObject;
      providerRevision?: string;
      advisoryRetryAfterMs?: number;
      requiresFurtherReadback: boolean;
      retryAuthorized: false;
      authorizesExecution: false;
    }>
  | Readonly<{
      ok: false;
      error: ProviderReadbackError;
      retryAuthorized: false;
      authorizesExecution: false;
    }>;

export interface ProviderReadbackDependencies {
  readonly credentials: CredentialBackend;
  readonly adapter: ProviderReadbackAdapter;
}
