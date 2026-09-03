import type { Rfc3339Timestamp, TenantContext } from '@aurora/contracts/context';
import type { ExecutionTargetReference } from '@aurora/contracts/execution-target';

import type { ProviderBindingRecord } from '../bindings/index.js';
import type { CredentialBackend } from '../credentials/index.js';

export type ProviderReadQueryValue = string | number | boolean | null;

export interface ProviderReadLimits {
  readonly maxPages: number;
  readonly maxItems: number;
}

/**
 * Opaque continuation scoped to one exact tenant/provider/account/binding/query.
 * Reusing it under a different scope fails closed before provider access.
 */
export interface ProviderReadCursor {
  readonly token: string;
  readonly scopeKey: string;
}

export interface ProviderReadRequest {
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

export interface ProviderReadRateLimitObservation {
  readonly remaining?: number;
  readonly limit?: number;
  readonly resetAt?: Rfc3339Timestamp;
  readonly retryAfterMs?: number;
}

export interface ProviderReadTransportRequest {
  readonly tenant: TenantContext;
  readonly provider: string;
  readonly accountReference: string;
  readonly bindingReference: string;
  readonly bindingVersion: number;
  readonly correlationReference: string;
  readonly operation: string;
  readonly fields: readonly string[];
  readonly query: Readonly<Record<string, ProviderReadQueryValue>>;
  readonly cursorToken?: string;
  readonly itemBudget: number;
}

export interface ProviderReadTransportPage {
  readonly items: readonly unknown[];
  readonly observedAt: Rfc3339Timestamp;
  readonly nextCursorToken?: string;
  readonly providerRevision?: string;
  readonly rateLimit?: ProviderReadRateLimitObservation;
}

export const PROVIDER_READ_TRANSPORT_ERRORS = [
  'PROVIDER_AUTHENTICATION_FAILED',
  'RATE_LIMITED',
  'QUOTA_EXHAUSTED',
  'PROVIDER_OUTAGE',
  'TRANSIENT_TRANSPORT_FAILURE',
  'PERMANENT_REQUEST_REJECTED',
  'NOT_FOUND',
  'CONFLICT',
] as const;
export type ProviderReadTransportError = (typeof PROVIDER_READ_TRANSPORT_ERRORS)[number];

export type ProviderReadTransportResult =
  | Readonly<{ ok: true; page: ProviderReadTransportPage }>
  | Readonly<{
      ok: false;
      error: ProviderReadTransportError;
      retryAfterMs?: number;
    }>;

/**
 * Read-only provider port. The W08-C public surface deliberately exposes no
 * mutation/write/raw-client method.
 */
export interface ProviderReadAdapter {
  readPage(
    request: ProviderReadTransportRequest,
    transientCredential: string,
  ): Promise<ProviderReadTransportResult>;
}

export const PROVIDER_READ_ERRORS = [
  'REQUEST_MALFORMED',
  'BINDING_UNAVAILABLE',
  'CREDENTIAL_UNAVAILABLE',
  'CURSOR_SCOPE_MISMATCH',
  'ADAPTER_PROTOCOL_VIOLATION',
  ...PROVIDER_READ_TRANSPORT_ERRORS,
] as const;
export type ProviderReadError = (typeof PROVIDER_READ_ERRORS)[number];

export interface ProviderReadSuccess {
  readonly ok: true;
  readonly tenant: TenantContext;
  readonly provider: string;
  readonly accountReference: string;
  readonly bindingReference: string;
  readonly bindingVersion: number;
  readonly correlationReference: string;
  readonly items: readonly unknown[];
  readonly pagesRead: number;
  readonly observedAt: Rfc3339Timestamp;
  readonly providerRevision?: string;
  readonly continuationCursor?: ProviderReadCursor;
  readonly rateLimit?: ProviderReadRateLimitObservation;
  readonly authorizesExecution: false;
}

export interface ProviderReadFailure {
  readonly ok: false;
  readonly error: ProviderReadError;
  readonly retryAfterMs?: number;
  readonly authorizesExecution: false;
}

export type ProviderReadResult = ProviderReadSuccess | ProviderReadFailure;

export interface ProviderReadDependencies {
  readonly credentials: CredentialBackend;
  readonly adapter: ProviderReadAdapter;
}
