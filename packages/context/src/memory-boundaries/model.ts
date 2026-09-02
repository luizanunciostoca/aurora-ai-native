import type { DataClassification } from '@aurora/contracts/context';

import type {
  MemoryBoundaryDescriptor,
  MemoryBoundaryKind,
  MemoryBoundaryValidationReason,
  MemoryBoundaryValidationRequest,
  MemoryBoundaryValidationResult,
} from './types.js';

const CLASSIFICATION_ORDER: Readonly<Record<DataClassification, number>> = {
  PUBLIC: 0,
  INTERNAL: 1,
  CONFIDENTIAL: 2,
  RESTRICTED: 3,
};

const RFC3339_PATTERN = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,9})?(?:Z|[+-]\d{2}:\d{2})$/;

export const MEMORY_BOUNDARY_DESCRIPTORS: Readonly<
  Record<MemoryBoundaryKind, MemoryBoundaryDescriptor>
> = Object.freeze({
  WORKING: Object.freeze({
    kind: 'WORKING',
    sourceOfTruthOwner: 'TASK_RUNTIME',
    readProjectionOwner: 'W06_CONTEXT_ENGINE',
    retentionMode: 'EPHEMERAL_SESSION',
    freshnessSemantics: 'CURRENT_REQUIRED',
    conflictSemantics: 'PRESERVE_EXPLICIT_CONFLICT',
    tenantScoped: true,
    requiresProvenance: true,
    authorizesExecution: false,
  }),
  EPISODIC: Object.freeze({
    kind: 'EPISODIC',
    sourceOfTruthOwner: 'EVENT_HISTORY',
    readProjectionOwner: 'W06_CONTEXT_ENGINE',
    retentionMode: 'GOVERNED_RETENTION_REQUIRED',
    freshnessSemantics: 'HISTORICAL_EXPLICIT',
    conflictSemantics: 'PRESERVE_EXPLICIT_CONFLICT',
    tenantScoped: true,
    requiresProvenance: true,
    authorizesExecution: false,
  }),
  SEMANTIC: Object.freeze({
    kind: 'SEMANTIC',
    sourceOfTruthOwner: 'SEMANTIC_KNOWLEDGE',
    readProjectionOwner: 'W06_CONTEXT_ENGINE',
    retentionMode: 'GOVERNED_RETENTION_REQUIRED',
    freshnessSemantics: 'SOURCE_DEFINED',
    conflictSemantics: 'PRESERVE_EXPLICIT_CONFLICT',
    tenantScoped: true,
    requiresProvenance: true,
    authorizesExecution: false,
  }),
  COMPANY: Object.freeze({
    kind: 'COMPANY',
    sourceOfTruthOwner: 'COMPANY_KNOWLEDGE',
    readProjectionOwner: 'W06_CONTEXT_ENGINE',
    retentionMode: 'SOURCE_LIFECYCLE',
    freshnessSemantics: 'SOURCE_DEFINED',
    conflictSemantics: 'PRESERVE_EXPLICIT_CONFLICT',
    tenantScoped: true,
    requiresProvenance: true,
    authorizesExecution: false,
  }),
  USER: Object.freeze({
    kind: 'USER',
    sourceOfTruthOwner: 'USER_PROFILE',
    readProjectionOwner: 'W06_CONTEXT_ENGINE',
    retentionMode: 'GOVERNED_RETENTION_REQUIRED',
    freshnessSemantics: 'SOURCE_DEFINED',
    conflictSemantics: 'PRESERVE_EXPLICIT_CONFLICT',
    tenantScoped: true,
    requiresProvenance: true,
    authorizesExecution: false,
  }),
  TEMPORAL: Object.freeze({
    kind: 'TEMPORAL',
    sourceOfTruthOwner: 'TEMPORAL_FACT_SOURCE',
    readProjectionOwner: 'W06_CONTEXT_ENGINE',
    retentionMode: 'SOURCE_LIFECYCLE',
    freshnessSemantics: 'HISTORICAL_EXPLICIT',
    conflictSemantics: 'PRESERVE_EXPLICIT_CONFLICT',
    tenantScoped: true,
    requiresProvenance: true,
    authorizesExecution: false,
  }),
  OPERATIONAL: Object.freeze({
    kind: 'OPERATIONAL',
    sourceOfTruthOwner: 'OPERATIONAL_STATE_SOURCE',
    readProjectionOwner: 'W06_CONTEXT_ENGINE',
    retentionMode: 'SOURCE_LIFECYCLE',
    freshnessSemantics: 'CURRENT_REQUIRED',
    conflictSemantics: 'PRESERVE_EXPLICIT_CONFLICT',
    tenantScoped: true,
    requiresProvenance: true,
    authorizesExecution: false,
  }),
  EVIDENCE: Object.freeze({
    kind: 'EVIDENCE',
    sourceOfTruthOwner: 'EVIDENCE_SOURCE',
    readProjectionOwner: 'W06_CONTEXT_ENGINE',
    retentionMode: 'IMMUTABLE_EVIDENCE_REFERENCE',
    freshnessSemantics: 'CAPTURE_TIME_FIXED',
    conflictSemantics: 'PRESERVE_EXPLICIT_CONFLICT',
    tenantScoped: true,
    requiresProvenance: true,
    authorizesExecution: false,
  }),
});

function nonEmpty(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

function validTimestamp(value: unknown): boolean {
  return (
    typeof value === 'string' && RFC3339_PATTERN.test(value) && Number.isFinite(Date.parse(value))
  );
}

function classificationRank(value: unknown): number | undefined {
  if (
    typeof value !== 'string' ||
    !Object.prototype.hasOwnProperty.call(CLASSIFICATION_ORDER, value)
  ) {
    return undefined;
  }
  return CLASSIFICATION_ORDER[value as DataClassification];
}

function pushUnique(
  reasons: MemoryBoundaryValidationReason[],
  reason: MemoryBoundaryValidationReason,
): void {
  if (!reasons.includes(reason)) reasons.push(reason);
}

function unknownBoundaryResult(): MemoryBoundaryValidationResult {
  return {
    kind: 'MEMORY_BOUNDARY_VALIDATION_RESULT',
    valid: false,
    reasons: ['BOUNDARY_UNKNOWN'],
    preservesConflict: true,
    requiresDownstreamFreshnessEvaluation: true,
    authorizesExecution: false,
  };
}

/**
 * W06-E validates memory-domain ownership and isolation only. Freshness/trust
 * ranking remains W06-B-owned and this result can never authorize execution.
 */
export function validateMemoryBoundaryCandidate(
  request: MemoryBoundaryValidationRequest,
): MemoryBoundaryValidationResult {
  const candidate = request?.candidate;
  const boundary = candidate?.boundary as unknown;
  if (
    !candidate ||
    typeof boundary !== 'string' ||
    !Object.prototype.hasOwnProperty.call(MEMORY_BOUNDARY_DESCRIPTORS, boundary)
  ) {
    return unknownBoundaryResult();
  }

  const descriptor = MEMORY_BOUNDARY_DESCRIPTORS[boundary as MemoryBoundaryKind];
  if (!descriptor) return unknownBoundaryResult();

  const reasons: MemoryBoundaryValidationReason[] = [];
  if (
    !candidate.tenant ||
    !request.tenant ||
    !nonEmpty(candidate.tenant.tenantId) ||
    !nonEmpty(request.tenant.tenantId) ||
    candidate.tenant.tenantId !== request.tenant.tenantId
  ) {
    pushUnique(reasons, 'TENANT_MISMATCH');
  }
  if (candidate.sourceOwner !== descriptor.sourceOfTruthOwner) {
    pushUnique(reasons, 'SOURCE_OWNER_MISMATCH');
  }

  const candidateClassificationRank = classificationRank(candidate.classification);
  const maxClassificationRank = classificationRank(request.maxDataClassification);
  if (candidateClassificationRank === undefined || maxClassificationRank === undefined) {
    pushUnique(reasons, 'CLASSIFICATION_INVALID');
  } else if (candidateClassificationRank > maxClassificationRank) {
    pushUnique(reasons, 'CLASSIFICATION_EXCEEDED');
  }

  if (!nonEmpty(candidate.sourceReference)) {
    pushUnique(reasons, 'SOURCE_REFERENCE_REQUIRED');
  }
  if (!nonEmpty(candidate.provenanceReference)) {
    pushUnique(reasons, 'PROVENANCE_REQUIRED');
  }
  if (!validTimestamp(candidate.observedAt)) {
    pushUnique(reasons, 'OBSERVED_AT_INVALID');
  }
  if (
    descriptor.retentionMode === 'GOVERNED_RETENTION_REQUIRED' &&
    !nonEmpty(candidate.retentionPolicyReference)
  ) {
    pushUnique(reasons, 'RETENTION_POLICY_REQUIRED');
  }
  if (!['NONE', 'CONFLICTING', 'UNRESOLVED'].includes(candidate.conflictState)) {
    pushUnique(reasons, 'CONFLICT_STATE_INVALID');
  }

  return {
    kind: 'MEMORY_BOUNDARY_VALIDATION_RESULT',
    valid: reasons.length === 0,
    reasons,
    descriptor,
    preservesConflict: true,
    requiresDownstreamFreshnessEvaluation: descriptor.freshnessSemantics !== 'CAPTURE_TIME_FIXED',
    authorizesExecution: false,
  };
}
