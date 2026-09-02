import type {
  DataClassification,
  Rfc3339Timestamp,
  TenantContext,
} from '@aurora/contracts/context';

import type { MinimalContextPackage } from '../minimal-context/types.js';
import type { ContextQuery } from '../query/types.js';

export interface SemanticCacheSourceVersion {
  readonly sourceReference: string;
  readonly sourceRevision: string;
}

export interface SemanticCacheInvalidationCursor {
  readonly streamKey: string;
  readonly sequence: number;
  readonly eventId: string;
}

/**
 * W06-F cache entries accelerate context reuse only. They never represent
 * credentials, current authority, approval or permission to execute.
 */
export interface SemanticCacheEntry {
  readonly kind: 'SemanticCacheEntry';
  readonly cacheKey: string;
  readonly queryFingerprint: string;
  readonly tenant: TenantContext;
  readonly maxDataClassification: DataClassification;
  readonly package: MinimalContextPackage;
  readonly configVersion: string;
  readonly sourceVersions: readonly SemanticCacheSourceVersion[];
  readonly createdAt: Rfc3339Timestamp;
  readonly expiresAt: Rfc3339Timestamp;
  readonly invalidated: boolean;
  readonly invalidatedAt?: Rfc3339Timestamp;
  readonly invalidationCursors: readonly SemanticCacheInvalidationCursor[];
  readonly authorizesExecution: false;
}

export const SEMANTIC_CACHE_CREATE_REASONS = [
  'INVALID_PACKAGE',
  'INVALID_CONFIG_VERSION',
  'INVALID_CREATED_AT',
  'INVALID_TTL',
  'SOURCE_REVISION_REQUIRED',
  'SENSITIVE_VALUE_REJECTED',
] as const;
export type SemanticCacheCreateReason = (typeof SEMANTIC_CACHE_CREATE_REASONS)[number];

export interface SemanticCacheCreateRequest {
  readonly package: MinimalContextPackage;
  readonly configVersion: string;
  readonly createdAt: Rfc3339Timestamp;
  readonly ttlMs: number;
}

export type SemanticCacheCreateResult =
  | Readonly<{
      kind: 'SemanticCacheCreateResult';
      valid: true;
      reasons: readonly [];
      entry: SemanticCacheEntry;
      authorizesExecution: false;
    }>
  | Readonly<{
      kind: 'SemanticCacheCreateResult';
      valid: false;
      reasons: readonly SemanticCacheCreateReason[];
      authorizesExecution: false;
    }>;

export type SemanticCacheEvaluationStatus =
  'HIT' | 'MISS' | 'STALE_REJECTED' | 'INVALIDATED_REJECTED' | 'INCOMPATIBLE_REJECTED';

export interface SemanticCacheEvaluationRequest {
  readonly query: ContextQuery;
  readonly entry: SemanticCacheEntry;
  readonly evaluatedAt: Rfc3339Timestamp;
  readonly configVersion: string;
  readonly expectedSourceVersions: readonly SemanticCacheSourceVersion[];
}

export interface SemanticCacheEvaluationResult {
  readonly kind: 'SemanticCacheEvaluationResult';
  readonly status: SemanticCacheEvaluationStatus;
  readonly package?: MinimalContextPackage;
  readonly authorizesExecution: false;
}

/** Read-only projection of a W03-governed invalidation event. */
export interface SemanticCacheInvalidationSignal {
  readonly kind: 'SemanticCacheInvalidationSignal';
  readonly eventId: string;
  readonly tenant: TenantContext;
  readonly streamKey: string;
  readonly sequence: number;
  readonly occurredAt: Rfc3339Timestamp;
  readonly sourceReference: string;
  readonly nextSourceRevision: string;
  readonly authorizesExecution: false;
}

export type SemanticCacheInvalidationStatus =
  | 'APPLIED'
  | 'NO_CHANGE'
  | 'DUPLICATE'
  | 'OUT_OF_ORDER_REJECTED'
  | 'SOURCE_NOT_PRESENT'
  | 'TENANT_REJECTED'
  | 'INVALID_SIGNAL';

export interface SemanticCacheInvalidationResult {
  readonly kind: 'SemanticCacheInvalidationResult';
  readonly status: SemanticCacheInvalidationStatus;
  readonly entry: SemanticCacheEntry;
  readonly authorizesExecution: false;
}
