import type {
  DataClassification,
  Rfc3339Timestamp,
  TenantContext,
} from '@aurora/contracts/context';

import type { MinimalContextPackage } from '../minimal-context/types.js';
import type { MemoryBoundaryKind } from '../memory-boundaries/types.js';

export type ContextSnapshotStatus = 'CURRENT' | 'INVALIDATED';

export interface ContextSnapshotSourceState {
  readonly sourceReference: string;
  readonly sourceRevision: string;
  readonly provenanceReference: string;
  readonly boundary: MemoryBoundaryKind;
  readonly classification: DataClassification;
  readonly observedAt: Rfc3339Timestamp;
  readonly pendingSourceRevision?: string;
  readonly lastInvalidationStreamKey?: string;
  readonly lastInvalidationSequence?: number;
  readonly lastInvalidationEventId?: string;
}

/**
 * W06-D snapshot state is a deterministic read projection over accepted W06
 * context. It is never a PolicyToken, OwnerDecision, approval or execution
 * authority and stale/invalidated state must fail closed downstream.
 */
export interface ContextSnapshot {
  readonly kind: 'ContextSnapshot';
  readonly snapshotHash: string;
  readonly contentHash: string;
  readonly version: number;
  readonly compiledAt: Rfc3339Timestamp;
  readonly retrievalEvaluatedAt: Rfc3339Timestamp;
  readonly tenant: TenantContext;
  readonly queryFingerprint: string;
  readonly sourceStates: readonly ContextSnapshotSourceState[];
  readonly includedSourceReferences: readonly string[];
  readonly excludedSourceReferences: readonly string[];
  readonly provenanceReferences: readonly string[];
  readonly status: ContextSnapshotStatus;
  readonly invalidatedSourceReferences: readonly string[];
  readonly authorizesExecution: false;
}

export const CONTEXT_SNAPSHOT_COMPILE_REASONS = [
  'INVALID_PACKAGE',
  'INVALID_COMPILED_AT',
  'SOURCE_REVISION_REQUIRED',
  'SOURCE_STATE_INVALID',
  'SNAPSHOT_CONTEXT_MISMATCH',
] as const;
export type ContextSnapshotCompileReason = (typeof CONTEXT_SNAPSHOT_COMPILE_REASONS)[number];

export interface ContextSnapshotCompileRequest {
  readonly package: MinimalContextPackage;
  readonly compiledAt: Rfc3339Timestamp;
}

export type ContextSnapshotCompileResult =
  | Readonly<{
      kind: 'ContextSnapshotCompileResult';
      valid: true;
      reasons: readonly [];
      snapshot: ContextSnapshot;
      authorizesExecution: false;
    }>
  | Readonly<{
      kind: 'ContextSnapshotCompileResult';
      valid: false;
      reasons: readonly ContextSnapshotCompileReason[];
      authorizesExecution: false;
    }>;

/**
 * Read-only projection of a W03-governed invalidation event. W06-D does not
 * own event persistence, ordering, replay or delivery.
 */
export interface ContextSnapshotInvalidationSignal {
  readonly kind: 'ContextSnapshotInvalidationSignal';
  readonly eventId: string;
  readonly tenant: TenantContext;
  readonly streamKey: string;
  readonly sequence: number;
  readonly occurredAt: Rfc3339Timestamp;
  readonly sourceReference: string;
  readonly previousSourceRevision?: string;
  readonly nextSourceRevision: string;
  readonly authorizesExecution: false;
}

export type ContextSnapshotInvalidationStatus =
  | 'APPLIED'
  | 'NO_CHANGE'
  | 'DUPLICATE'
  | 'OUT_OF_ORDER_REJECTED'
  | 'ALREADY_INVALIDATED'
  | 'SOURCE_NOT_PRESENT'
  | 'TENANT_REJECTED'
  | 'INVALID_SIGNAL';

export interface ContextSnapshotInvalidationResult {
  readonly kind: 'ContextSnapshotInvalidationResult';
  readonly status: ContextSnapshotInvalidationStatus;
  readonly snapshot: ContextSnapshot;
  readonly authorizesExecution: false;
}

export interface ContextSnapshotRecompileRequest {
  readonly previousSnapshot: ContextSnapshot;
  readonly package: MinimalContextPackage;
  readonly compiledAt: Rfc3339Timestamp;
}

export type ContextSnapshotRecompileResult =
  | Readonly<{
      kind: 'ContextSnapshotRecompileResult';
      valid: true;
      reasons: readonly [];
      snapshot: ContextSnapshot;
      recompiledSourceReferences: readonly string[];
      equivalentToFullRebuild: true;
      authorizesExecution: false;
    }>
  | Readonly<{
      kind: 'ContextSnapshotRecompileResult';
      valid: false;
      reasons: readonly ContextSnapshotCompileReason[];
      authorizesExecution: false;
    }>;
