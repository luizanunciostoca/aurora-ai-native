import type { Rfc3339Timestamp, TenantContext } from '@aurora/contracts/context';

import type { MinimalContextPackage } from '../minimal-context/types.js';
import type { SemanticCacheEntry } from '../semantic-cache/types.js';
import type { ContextSnapshot } from '../snapshots/types.js';

export interface SpeculativePreparationLimits {
  readonly maxUnits: number;
}

export type SpeculativePreparationUnitKind =
  | 'PREFETCH_BINDING'
  | 'PRE_RANK_PACKAGE'
  | 'PRECOMPUTE_CACHE_LOOKUP';

export interface SpeculativePreparationUnit {
  readonly kind: SpeculativePreparationUnitKind;
  readonly unitKey: string;
  readonly sourceReference?: string;
  readonly sourceRevision?: string;
  readonly orderedSourceReferences?: readonly string[];
  readonly cacheKey?: string;
  readonly authorizesExecution: false;
}

export interface SpeculativeSourceBinding {
  readonly sourceReference: string;
  readonly sourceRevision: string;
}

export interface SpeculativeCancellationCursor {
  readonly streamKey: string;
  readonly sequence: number;
  readonly eventId: string;
}

/**
 * W06-G preparation is reversible read-only metadata. PREPARED/UNCOMMITTED
 * never means approved, authoritative, durable or executable.
 */
export interface SpeculativePreparation {
  readonly kind: 'SpeculativePreparation';
  readonly preparationId: string;
  readonly tenant: TenantContext;
  readonly queryFingerprint: string;
  readonly snapshotHash: string;
  readonly snapshotContentHash: string;
  readonly snapshotVersion: number;
  readonly policyCompatibilityVersion: string;
  readonly configVersion: string;
  readonly preparedAt: Rfc3339Timestamp;
  readonly deadlineAt: Rfc3339Timestamp;
  readonly sourceBindings: readonly SpeculativeSourceBinding[];
  readonly cacheBinding?: Readonly<{
    cacheKey: string;
    expiresAt: Rfc3339Timestamp;
  }>;
  readonly units: readonly SpeculativePreparationUnit[];
  readonly status: 'PREPARED' | 'CANCELLED';
  readonly commitState: 'UNCOMMITTED';
  readonly cancelledAt?: Rfc3339Timestamp;
  readonly cancellationCursor?: SpeculativeCancellationCursor;
  readonly authorizesExecution: false;
}

export const SPECULATIVE_PREPARATION_REASONS = [
  'INVALID_REQUEST',
  'INVALID_TIME',
  'DEADLINE_EXPIRED',
  'QUERY_DEADLINE_EXCEEDED',
  'INVALID_LIMITS',
  'INVALID_POLICY_VERSION',
  'INVALID_CONFIG_VERSION',
  'SNAPSHOT_NOT_CURRENT',
  'SNAPSHOT_MISMATCH',
  'CACHE_INCOMPATIBLE',
  'SPECULATION_LIMIT_EXCEEDED',
] as const;
export type SpeculativePreparationReason = (typeof SPECULATIVE_PREPARATION_REASONS)[number];

export interface SpeculativePreparationRequest {
  readonly package: MinimalContextPackage;
  readonly snapshot: ContextSnapshot;
  readonly cacheEntry?: SemanticCacheEntry;
  readonly policyCompatibilityVersion: string;
  readonly configVersion: string;
  readonly preparedAt: Rfc3339Timestamp;
  readonly deadlineAt: Rfc3339Timestamp;
  readonly limits: SpeculativePreparationLimits;
}

export type SpeculativePreparationResult =
  | Readonly<{
      kind: 'SpeculativePreparationResult';
      valid: true;
      reasons: readonly [];
      preparation: SpeculativePreparation;
      authorizesExecution: false;
    }>
  | Readonly<{
      kind: 'SpeculativePreparationResult';
      valid: false;
      reasons: readonly SpeculativePreparationReason[];
      authorizesExecution: false;
    }>;

export type SpeculativeReuseStatus =
  | 'REUSABLE'
  | 'CANCELLED_REJECTED'
  | 'DEADLINE_REJECTED'
  | 'POLICY_REJECTED'
  | 'CONFIG_REJECTED'
  | 'TENANT_REJECTED'
  | 'SNAPSHOT_REJECTED'
  | 'SOURCE_REJECTED'
  | 'CACHE_REJECTED';

export interface SpeculativeReuseRequest {
  readonly preparation: SpeculativePreparation;
  readonly package: MinimalContextPackage;
  readonly snapshot: ContextSnapshot;
  readonly cacheEntry?: SemanticCacheEntry;
  readonly policyCompatibilityVersion: string;
  readonly configVersion: string;
  readonly evaluatedAt: Rfc3339Timestamp;
}

export interface SpeculativeReuseResult {
  readonly kind: 'SpeculativeReuseResult';
  readonly status: SpeculativeReuseStatus;
  readonly authorizesExecution: false;
}

export interface SpeculativeCancellationSignal {
  readonly kind: 'SpeculativeCancellationSignal';
  readonly preparationId: string;
  readonly tenant: TenantContext;
  readonly streamKey: string;
  readonly sequence: number;
  readonly eventId: string;
  readonly occurredAt: Rfc3339Timestamp;
  readonly authorizesExecution: false;
}

export type SpeculativeCancellationStatus =
  | 'CANCELLED'
  | 'DUPLICATE'
  | 'OUT_OF_ORDER_REJECTED'
  | 'PREPARATION_MISMATCH'
  | 'TENANT_REJECTED'
  | 'INVALID_SIGNAL';

export interface SpeculativeCancellationResult {
  readonly kind: 'SpeculativeCancellationResult';
  readonly status: SpeculativeCancellationStatus;
  readonly preparation: SpeculativePreparation;
  readonly authorizesExecution: false;
}
