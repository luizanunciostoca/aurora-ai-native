import type {
  DataClassification,
  Rfc3339Timestamp,
  SubjectRef,
  TenantContext,
} from '@aurora/contracts/context';

import type {
  MemoryBoundaryCandidate,
  MemoryBoundaryKind,
  MemoryBoundaryValidationReason,
  MemorySourceOwner,
} from '../memory-boundaries/types.js';

export const MEMORY_LIFECYCLE_STATES = [
  'TRANSIENT',
  'CANDIDATE',
  'VALIDATED',
  'CANONICAL',
  'SUPERSEDED',
  'REVOKED',
] as const;
export type MemoryLifecycleState = (typeof MEMORY_LIFECYCLE_STATES)[number];

export const MEMORY_PRODUCER_KINDS = ['USER', 'MODEL', 'AGENT', 'SYSTEM', 'SOURCE_ADAPTER'] as const;
export type MemoryProducerKind = (typeof MEMORY_PRODUCER_KINDS)[number];

export const MEMORY_CONTENT_KINDS = ['TEXT', 'STRUCTURED', 'REFERENCE'] as const;
export type MemoryContentKind = (typeof MEMORY_CONTENT_KINDS)[number];

/**
 * Origin metadata is provenance only. A producer, model or provider never owns
 * the target memory boundary merely because it proposed an observation.
 */
export interface MemoryProducerDescriptor {
  readonly kind: MemoryProducerKind;
  readonly producerReference: string;
  readonly providerReference?: string;
  readonly modelReference?: string;
}

/** Raw audio and credential material are intentionally not valid content kinds. */
export interface MemoryContentEnvelope {
  readonly kind: MemoryContentKind;
  readonly digest: string;
  readonly payload: unknown;
}

/**
 * A proposal stages information for W06 consolidation. It never writes an
 * owning domain source of truth and can never mint authority.
 */
export interface MemoryWriteProposal {
  readonly kind: 'MemoryWriteProposal';
  readonly proposalReference: string;
  readonly memoryKey: string;
  readonly boundaryCandidate: MemoryBoundaryCandidate;
  readonly producer: MemoryProducerDescriptor;
  readonly content: MemoryContentEnvelope;
}

/**
 * W06 read projection. CANONICAL means canonical for the memory projection
 * only; source-of-truth ownership remains with the accepted boundary owner.
 */
export interface MemoryProjectionRecord {
  readonly kind: 'MemoryProjectionRecord';
  readonly projectionReference: string;
  readonly memoryKey: string;
  readonly boundary: MemoryBoundaryKind;
  readonly tenant: TenantContext;
  readonly subject?: SubjectRef;
  readonly classification: DataClassification;
  readonly sourceOwner: MemorySourceOwner;
  readonly sourceReference: string;
  readonly sourceRevision?: string;
  readonly provenanceReference: string;
  readonly observedAt: Rfc3339Timestamp;
  readonly retentionPolicyReference?: string;
  readonly conflictState: 'NONE' | 'CONFLICTING' | 'UNRESOLVED';
  readonly conflictsWithProjectionReferences: readonly string[];
  readonly producer: MemoryProducerDescriptor;
  readonly content: MemoryContentEnvelope;
  readonly lifecycle: MemoryLifecycleState;
  readonly lifecycleRevision: number;
  readonly sourceCommitReference?: string;
  readonly sourceCommitRevision?: string;
  readonly validationReference?: string;
  readonly promotionReference?: string;
  readonly supersededByProjectionReference?: string;
  readonly supersedeReference?: string;
  readonly revocationReference?: string;
  readonly authorizesExecution: false;
}

/** Tenant-scoped replayable projection state. Persistence is supplied by W03-owned adapters. */
export interface MemoryFabricSnapshot {
  readonly kind: 'MemoryFabricSnapshot';
  readonly tenant: TenantContext;
  readonly revision: number;
  readonly records: readonly MemoryProjectionRecord[];
  readonly authorizesExecution: false;
}

export interface MemoryStageRequest {
  readonly snapshot: MemoryFabricSnapshot;
  readonly proposal: MemoryWriteProposal;
  readonly maxDataClassification: DataClassification;
}

export type MemoryProposalRejectionReason =
  | MemoryBoundaryValidationReason
  | 'INVALID_SNAPSHOT'
  | 'SNAPSHOT_TENANT_MISMATCH'
  | 'INVALID_PROPOSAL_KIND'
  | 'INVALID_PROPOSAL_REFERENCE'
  | 'INVALID_MEMORY_KEY'
  | 'INVALID_PRODUCER'
  | 'INVALID_CONTENT_KIND'
  | 'INVALID_CONTENT_DIGEST'
  | 'PROPOSAL_REFERENCE_CONFLICT';

export type MemoryStageStatus = 'STAGED' | 'DUPLICATE' | 'REJECTED';

export interface MemoryStageResult {
  readonly kind: 'MEMORY_STAGE_RESULT';
  readonly status: MemoryStageStatus;
  readonly snapshot: MemoryFabricSnapshot;
  readonly record?: MemoryProjectionRecord;
  readonly reasons: readonly MemoryProposalRejectionReason[];
  readonly authorizesExecution: false;
}

export interface MemoryLifecycleTransitionRequest {
  readonly snapshot: MemoryFabricSnapshot;
  readonly tenant: TenantContext;
  readonly projectionReference: string;
  readonly expectedLifecycleRevision: number;
  readonly to: Exclude<MemoryLifecycleState, 'TRANSIENT' | 'CANDIDATE'>;
  readonly evidenceReference: string;
  readonly sourceCommitReference?: string;
  readonly sourceCommitRevision?: string;
  /** Required when promotion replaces an already canonical projection for the same memory key. */
  readonly supersedesProjectionReference?: string;
  /** Required when directly marking a canonical projection superseded. */
  readonly replacementProjectionReference?: string;
}

export type MemoryTransitionRejectionReason =
  | 'INVALID_SNAPSHOT'
  | 'SNAPSHOT_TENANT_MISMATCH'
  | 'RECORD_NOT_FOUND'
  | 'REVISION_CONFLICT'
  | 'INVALID_EVIDENCE_REFERENCE'
  | 'TRANSITION_NOT_ALLOWED'
  | 'SOURCE_COMMIT_REQUIRED'
  | 'ACTIVE_CANONICAL_EXISTS'
  | 'SUPERSEDE_REFERENCE_REQUIRED'
  | 'SUPERSEDE_TARGET_INVALID'
  | 'REPLACEMENT_REFERENCE_REQUIRED'
  | 'REPLACEMENT_INVALID';

export interface MemoryLifecycleTransitionResult {
  readonly kind: 'MEMORY_LIFECYCLE_TRANSITION_RESULT';
  readonly applied: boolean;
  readonly snapshot: MemoryFabricSnapshot;
  readonly record?: MemoryProjectionRecord;
  readonly reasons: readonly MemoryTransitionRejectionReason[];
  readonly authorizesExecution: false;
}

export const MEMORY_PROJECTION_SELECTOR_KEYS = [
  'memoryKey',
  'sourceReference',
  'projectionReference',
] as const;
export type MemoryProjectionSelectorKey = (typeof MEMORY_PROJECTION_SELECTOR_KEYS)[number];

export interface MemoryProjectionReadRequest {
  readonly snapshot: MemoryFabricSnapshot;
  readonly tenant: TenantContext;
  readonly boundary: MemoryBoundaryKind;
  readonly key: MemoryProjectionSelectorKey;
  readonly value: string;
  readonly limit: number;
}

export interface MemoryProjectionReadResult {
  readonly kind: 'MEMORY_PROJECTION_READ_RESULT';
  readonly records: readonly MemoryProjectionRecord[];
  readonly truncated: boolean;
  readonly authorizesExecution: false;
}
