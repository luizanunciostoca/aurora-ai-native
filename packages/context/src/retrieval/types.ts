import type { Rfc3339Timestamp } from '@aurora/contracts/context';

import type { ContextQuery, ContextSourceClass } from '../query/types.js';
import type {
  AcquiredContextItem,
  ContextAcquisitionResult,
  ContextSourceRejection,
} from '../sources/types.js';

export const CONTEXT_FRESHNESS_STATES = ['CURRENT', 'HISTORICAL', 'UNKNOWN'] as const;
export type ContextFreshnessState = (typeof CONTEXT_FRESHNESS_STATES)[number];

export const CONTEXT_CONFLICT_STATES = ['NONE', 'CONFLICTING'] as const;
export type ContextConflictState = (typeof CONTEXT_CONFLICT_STATES)[number];

export const CONTEXT_RETRIEVAL_UNCERTAINTIES = [
  'HISTORICAL_SOURCE',
  'FRESHNESS_UNKNOWN',
  'SOURCE_REVISION_UNKNOWN',
  'CONFLICTING_FACT',
] as const;
export type ContextRetrievalUncertainty = (typeof CONTEXT_RETRIEVAL_UNCERTAINTIES)[number];

/**
 * W06-B trust is explicit configured evidence. A trust value is never a
 * permission, approval, PolicyToken or execution-authority signal.
 */
export interface ContextRetrievalPolicy {
  readonly evaluatedAt: Rfc3339Timestamp;
  readonly minimumTrustBps: number;
  readonly trustBpsByAdapter: Readonly<Record<string, number>>;
  readonly maxAgeMsBySourceClass: Readonly<Partial<Record<ContextSourceClass, number>>>;
  /**
   * Optional semantic conflict grouping supplied by the caller. When absent,
   * sourceReference is the conservative conflict key.
   */
  readonly conflictKeyBySourceReference?: Readonly<Record<string, string>>;
}

export interface ContextRetrievalRequest {
  readonly query: ContextQuery;
  readonly acquisition: ContextAcquisitionResult;
  readonly policy: ContextRetrievalPolicy;
}

export interface ContextTrustEvaluation {
  readonly scoreBps: number;
  readonly basis: 'ADAPTER_CONFIG';
  readonly adapterId: string;
}

export interface ContextFreshnessEvaluation {
  readonly state: ContextFreshnessState;
  readonly evaluatedAt: Rfc3339Timestamp;
  readonly observedAt: Rfc3339Timestamp;
  readonly ageMs: number;
  readonly maxAgeMs?: number;
}

export interface ContextConflictEvaluation {
  readonly state: ContextConflictState;
  readonly key: string;
  readonly peerSourceReferences: readonly string[];
}

export interface RankedContextItem extends AcquiredContextItem {
  readonly retrieval: {
    readonly rank: number;
    readonly trust: ContextTrustEvaluation;
    readonly freshness: ContextFreshnessEvaluation;
    readonly conflict: ContextConflictEvaluation;
    readonly uncertainty: readonly ContextRetrievalUncertainty[];
  };
}

export const CONTEXT_RETRIEVAL_REJECTION_REASONS = [
  'QUERY_INVALID',
  'ACQUISITION_INVALID',
  'POLICY_INVALID',
  'INVALID_SOURCE_ITEM',
  'UNREQUESTED_SOURCE_ITEM',
  'CROSS_TENANT_ITEM',
  'SUBJECT_MISMATCH',
  'CLASSIFICATION_INVALID',
  'CLASSIFICATION_EXCEEDED',
  'MISSING_PROVENANCE',
  'INVALID_OBSERVED_AT',
  'FUTURE_OBSERVATION',
  'FRESHNESS_RULE_MISSING',
  'STALE_CURRENT_REQUIRED',
  'TRUST_UNKNOWN',
  'TRUST_BELOW_MINIMUM',
  'PAYLOAD_UNRANKABLE',
  'SOURCE_IDENTITY_CONFLICT',
  'DUPLICATE_SOURCE_ITEM',
] as const;
export type ContextRetrievalRejectionReason = (typeof CONTEXT_RETRIEVAL_REJECTION_REASONS)[number];

export interface ContextRetrievalRejection {
  readonly sourceReference?: string;
  readonly adapterId?: string;
  readonly reason: ContextRetrievalRejectionReason;
}

export interface ContextRetrievalResult {
  readonly kind: 'ContextRetrievalResult';
  readonly evaluatedAt: Rfc3339Timestamp;
  readonly items: readonly RankedContextItem[];
  readonly rejections: readonly ContextRetrievalRejection[];
  readonly upstreamRejections: readonly ContextSourceRejection[];
  readonly authorizesExecution: false;
}
