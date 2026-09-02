import type {
  DataClassification,
  Rfc3339Timestamp,
  SubjectRef,
  TenantContext,
} from '@aurora/contracts/context';

export const MEMORY_BOUNDARY_KINDS = [
  'WORKING',
  'EPISODIC',
  'SEMANTIC',
  'COMPANY',
  'USER',
  'TEMPORAL',
  'OPERATIONAL',
  'EVIDENCE',
] as const;
export type MemoryBoundaryKind = (typeof MEMORY_BOUNDARY_KINDS)[number];

export const MEMORY_SOURCE_OWNERS = [
  'TASK_RUNTIME',
  'EVENT_HISTORY',
  'SEMANTIC_KNOWLEDGE',
  'COMPANY_KNOWLEDGE',
  'USER_PROFILE',
  'TEMPORAL_FACT_SOURCE',
  'OPERATIONAL_STATE_SOURCE',
  'EVIDENCE_SOURCE',
] as const;
export type MemorySourceOwner = (typeof MEMORY_SOURCE_OWNERS)[number];

export type MemoryReadProjectionOwner = 'W06_CONTEXT_ENGINE';

export type MemoryRetentionMode =
  | 'EPHEMERAL_SESSION'
  | 'GOVERNED_RETENTION_REQUIRED'
  | 'SOURCE_LIFECYCLE'
  | 'IMMUTABLE_EVIDENCE_REFERENCE';

export type MemoryFreshnessSemantics =
  'CURRENT_REQUIRED' | 'SOURCE_DEFINED' | 'HISTORICAL_EXPLICIT' | 'CAPTURE_TIME_FIXED';

export type MemoryConflictSemantics = 'PRESERVE_EXPLICIT_CONFLICT';

export interface MemoryBoundaryDescriptor {
  readonly kind: MemoryBoundaryKind;
  readonly sourceOfTruthOwner: MemorySourceOwner;
  readonly readProjectionOwner: MemoryReadProjectionOwner;
  readonly retentionMode: MemoryRetentionMode;
  readonly freshnessSemantics: MemoryFreshnessSemantics;
  readonly conflictSemantics: MemoryConflictSemantics;
  readonly tenantScoped: true;
  readonly requiresProvenance: true;
  readonly authorizesExecution: false;
}

export interface MemoryBoundaryCandidate {
  readonly boundary: MemoryBoundaryKind;
  readonly tenant: TenantContext;
  readonly subject?: SubjectRef;
  readonly classification: DataClassification;
  readonly sourceOwner: MemorySourceOwner;
  readonly sourceReference: string;
  readonly provenanceReference: string;
  readonly observedAt: Rfc3339Timestamp;
  /** Required only when the boundary descriptor says governed retention is mandatory. */
  readonly retentionPolicyReference?: string;
  /** Conflict is information that must remain explicit for downstream resolution. */
  readonly conflictState: 'NONE' | 'CONFLICTING' | 'UNRESOLVED';
}

export type MemoryBoundaryValidationReason =
  | 'BOUNDARY_UNKNOWN'
  | 'TENANT_MISMATCH'
  | 'SOURCE_OWNER_MISMATCH'
  | 'CLASSIFICATION_EXCEEDED'
  | 'SOURCE_REFERENCE_REQUIRED'
  | 'PROVENANCE_REQUIRED'
  | 'OBSERVED_AT_INVALID'
  | 'RETENTION_POLICY_REQUIRED'
  | 'CONFLICT_STATE_INVALID';

export type MemoryBoundaryValidationResult = Readonly<{
  kind: 'MEMORY_BOUNDARY_VALIDATION_RESULT';
  valid: boolean;
  reasons: readonly MemoryBoundaryValidationReason[];
  descriptor?: MemoryBoundaryDescriptor;
  preservesConflict: boolean;
  requiresDownstreamFreshnessEvaluation: boolean;
  authorizesExecution: false;
}>;

export interface MemoryBoundaryValidationRequest {
  readonly tenant: TenantContext;
  readonly maxDataClassification: DataClassification;
  readonly candidate: MemoryBoundaryCandidate;
}
