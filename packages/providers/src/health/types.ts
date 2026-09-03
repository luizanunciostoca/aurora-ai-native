import type { Rfc3339Timestamp, TenantContext } from '@aurora/contracts/context';

import type { ProviderBindingRecord } from '../bindings/index.js';

export const PROVIDER_OPERATIONAL_STATES = [
  'HEALTHY',
  'DEGRADED',
  'UNAVAILABLE',
  'AUTH_FAILED',
  'THROTTLED',
  'QUOTA_EXHAUSTED',
  'TRANSIENT_FAILURE',
  'UNKNOWN',
] as const;
export type ProviderOperationalState = (typeof PROVIDER_OPERATIONAL_STATES)[number];

export type ProviderObservationCurrentness = 'CURRENT' | 'STALE';

export interface ProviderRateLimitMetadata {
  readonly remaining?: number;
  readonly limit?: number;
  readonly resetAt?: Rfc3339Timestamp;
  readonly retryAfterMs?: number;
}

export interface ProviderQuotaMetadata {
  readonly remaining?: number;
  readonly limit?: number;
  readonly resetAt?: Rfc3339Timestamp;
}

export interface ProviderOperationalObservationRequest {
  readonly tenant: TenantContext;
  readonly binding: ProviderBindingRecord;
  readonly now: Rfc3339Timestamp;
  readonly maxObservationAgeMs: number;
  /** Runtime provider input intentionally remains unknown and is parsed fail closed. */
  readonly observation: unknown;
}

export interface ProviderOperationalObservation {
  readonly ok: true;
  readonly state: ProviderOperationalState;
  readonly currentness: ProviderObservationCurrentness;
  readonly provider: string;
  readonly accountReference: string;
  readonly bindingReference: string;
  readonly observedAt: Rfc3339Timestamp;
  readonly sourceEndpoint: string;
  readonly rateLimit?: ProviderRateLimitMetadata;
  readonly quota?: ProviderQuotaMetadata;
  /** Advisory transport timing only. W07 remains the retry-policy owner. */
  readonly advisoryRetryAfterMs?: number;
  readonly retryAuthorized: false;
  readonly authorizesExecution: false;
}

export const PROVIDER_OPERATIONAL_OBSERVATION_ERRORS = [
  'REQUEST_MALFORMED',
  'BINDING_MISMATCH',
  'OBSERVATION_MALFORMED',
  'SENSITIVE_METADATA_REJECTED',
] as const;
export type ProviderOperationalObservationError =
  (typeof PROVIDER_OPERATIONAL_OBSERVATION_ERRORS)[number];

export interface ProviderOperationalObservationFailure {
  readonly ok: false;
  readonly error: ProviderOperationalObservationError;
  readonly retryAuthorized: false;
  readonly authorizesExecution: false;
}

export type ProviderOperationalObservationResult =
  ProviderOperationalObservation | ProviderOperationalObservationFailure;
