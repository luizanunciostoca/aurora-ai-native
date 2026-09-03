import type { Rfc3339Timestamp } from '@aurora/contracts/context';

import type { ContextQuery } from '../query/types.js';
import type {
  ContextRetrievalRejection,
  ContextRetrievalResult,
  RankedContextItem,
} from '../retrieval/types.js';
import type { ContextSourceRejection } from '../sources/types.js';

export interface MinimalContextCompilerLimits {
  readonly maxItems: number;
  /**
   * Deterministic canonical units allowed for payload-bearing ranked items.
   * Package-level safety constraints and rejection metadata are never removed
   * to satisfy this budget.
   */
  readonly maxCanonicalUnits: number;
}

export const MINIMAL_CONTEXT_EXCLUSION_REASONS = [
  'ITEM_LIMIT',
  'CANONICAL_UNIT_LIMIT',
  'CONFLICT_GROUP_ITEM_LIMIT',
  'CONFLICT_GROUP_UNIT_LIMIT',
] as const;
export type MinimalContextExclusionReason = (typeof MINIMAL_CONTEXT_EXCLUSION_REASONS)[number];

export interface MinimalContextExcludedSource {
  readonly sourceReference: string;
  readonly rank: number;
  readonly reason: MinimalContextExclusionReason;
}

export interface MinimalContextMetrics {
  readonly inputItemCount: number;
  readonly outputItemCount: number;
  /** Canonical units across every valid ranked input item. */
  readonly inputCanonicalUnits: number;
  /** Canonical units across included ranked items only. */
  readonly outputCanonicalUnits: number;
  /** 10_000 means all ranked item material was retained. */
  readonly retainedRatioBps: number;
  readonly compressionSavingsBps: number;
}

/**
 * W06-C internal semantic package. It preserves the original ContextQuery as
 * the mandatory safety envelope and can never authorize execution.
 */
export interface MinimalContextPackage {
  readonly kind: 'MinimalContextPackage';
  readonly query: ContextQuery;
  readonly retrievalEvaluatedAt: Rfc3339Timestamp;
  readonly items: readonly RankedContextItem[];
  readonly includedSourceReferences: readonly string[];
  readonly excludedSources: readonly MinimalContextExcludedSource[];
  readonly retrievalRejections: readonly ContextRetrievalRejection[];
  readonly upstreamRejections: readonly ContextSourceRejection[];
  readonly metrics: MinimalContextMetrics;
  readonly authorizesExecution: false;
}

export const MINIMAL_CONTEXT_COMPILE_REASONS = [
  'INVALID_QUERY',
  'INVALID_RETRIEVAL',
  'INVALID_LIMITS',
  'INVALID_RANKED_ITEM',
  'CONFLICT_GROUP_INVALID',
] as const;
export type MinimalContextCompileReason = (typeof MINIMAL_CONTEXT_COMPILE_REASONS)[number];

export interface MinimalContextCompileRequest {
  readonly query: ContextQuery;
  readonly retrieval: ContextRetrievalResult;
  readonly limits: MinimalContextCompilerLimits;
}

export type MinimalContextCompileResult =
  | Readonly<{
      kind: 'MinimalContextCompileResult';
      valid: true;
      reasons: readonly [];
      package: MinimalContextPackage;
      authorizesExecution: false;
    }>
  | Readonly<{
      kind: 'MinimalContextCompileResult';
      valid: false;
      reasons: readonly MinimalContextCompileReason[];
      authorizesExecution: false;
    }>;
