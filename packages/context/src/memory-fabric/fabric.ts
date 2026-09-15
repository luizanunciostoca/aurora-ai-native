import type { DataClassification, TenantContext } from '@aurora/contracts/context';

import { validateMemoryBoundaryCandidate } from '../memory-boundaries/model.js';
import type { MemoryBoundaryKind } from '../memory-boundaries/types.js';
import {
  MEMORY_CONTENT_KINDS,
  MEMORY_PRODUCER_KINDS,
  MEMORY_PROJECTION_SELECTOR_KEYS,
} from './types.js';
import type {
  MemoryFabricSnapshot,
  MemoryLifecycleState,
  MemoryLifecycleTransitionRequest,
  MemoryLifecycleTransitionResult,
  MemoryProjectionReadRequest,
  MemoryProjectionReadResult,
  MemoryProjectionRecord,
  MemoryProposalRejectionReason,
  MemoryStageRequest,
  MemoryStageResult,
  MemoryTransitionRejectionReason,
  MemoryWriteProposal,
} from './types.js';

const MAX_REFERENCE_LENGTH = 512;
const MAX_MEMORY_KEY_LENGTH = 512;
const MAX_DIGEST_LENGTH = 256;
const MAX_READ_LIMIT = 100;

const TERMINAL_STATES = new Set<MemoryLifecycleState>(['SUPERSEDED', 'REVOKED']);
const READ_ELIGIBLE_STATES = new Set<MemoryLifecycleState>([
  'TRANSIENT',
  'VALIDATED',
  'CANONICAL',
]);

function nonEmptyBounded(value: unknown, maxLength: number): value is string {
  return typeof value === 'string' && value.trim().length > 0 && value.length <= maxLength;
}

function sameTenant(left: TenantContext | undefined, right: TenantContext | undefined): boolean {
  return Boolean(left?.tenantId && right?.tenantId && left.tenantId === right.tenantId);
}

function validSnapshot(snapshot: MemoryFabricSnapshot | undefined): snapshot is MemoryFabricSnapshot {
  return Boolean(
    snapshot &&
      snapshot.kind === 'MemoryFabricSnapshot' &&
      snapshot.tenant?.tenantId &&
      Number.isInteger(snapshot.revision) &&
      snapshot.revision >= 0 &&
      Array.isArray(snapshot.records) &&
      snapshot.authorizesExecution === false,
  );
}

function validProposalShape(proposal: MemoryWriteProposal | undefined): MemoryProposalRejectionReason[] {
  const reasons: MemoryProposalRejectionReason[] = [];
  if (!proposal || proposal.kind !== 'MemoryWriteProposal') reasons.push('INVALID_PROPOSAL_KIND');
  if (!nonEmptyBounded(proposal?.proposalReference, MAX_REFERENCE_LENGTH)) {
    reasons.push('INVALID_PROPOSAL_REFERENCE');
  }
  if (!nonEmptyBounded(proposal?.memoryKey, MAX_MEMORY_KEY_LENGTH)) {
    reasons.push('INVALID_MEMORY_KEY');
  }
  if (
    !proposal?.producer ||
    !MEMORY_PRODUCER_KINDS.includes(proposal.producer.kind) ||
    !nonEmptyBounded(proposal.producer.producerReference, MAX_REFERENCE_LENGTH) ||
    (proposal.producer.providerReference !== undefined &&
      !nonEmptyBounded(proposal.producer.providerReference, MAX_REFERENCE_LENGTH)) ||
    (proposal.producer.modelReference !== undefined &&
      !nonEmptyBounded(proposal.producer.modelReference, MAX_REFERENCE_LENGTH))
  ) {
    reasons.push('INVALID_PRODUCER');
  }
  if (!proposal?.content || !MEMORY_CONTENT_KINDS.includes(proposal.content.kind)) {
    reasons.push('INVALID_CONTENT_KIND');
  }
  if (!nonEmptyBounded(proposal?.content?.digest, MAX_DIGEST_LENGTH)) {
    reasons.push('INVALID_CONTENT_DIGEST');
  }
  return reasons;
}

function cloneSnapshot(
  snapshot: MemoryFabricSnapshot,
  records: readonly MemoryProjectionRecord[],
): MemoryFabricSnapshot {
  return {
    kind: 'MemoryFabricSnapshot',
    tenant: snapshot.tenant,
    revision: snapshot.revision + 1,
    records,
    authorizesExecution: false,
  };
}

function recordIdentityEquivalent(
  record: MemoryProjectionRecord,
  proposal: MemoryWriteProposal,
): boolean {
  return (
    record.boundary === proposal.boundaryCandidate.boundary &&
    record.memoryKey === proposal.memoryKey &&
    record.content.digest === proposal.content.digest &&
    record.sourceReference === proposal.boundaryCandidate.sourceReference
  );
}

function activeForConflict(record: MemoryProjectionRecord): boolean {
  return !TERMINAL_STATES.has(record.lifecycle);
}

function detectedConflictReferences(
  snapshot: MemoryFabricSnapshot,
  proposal: MemoryWriteProposal,
): readonly string[] {
  return snapshot.records
    .filter(
      (record) =>
        activeForConflict(record) &&
        record.boundary === proposal.boundaryCandidate.boundary &&
        record.memoryKey === proposal.memoryKey &&
        record.content.digest !== proposal.content.digest,
    )
    .map((record) => record.projectionReference)
    .sort();
}

function mergeConflictState(
  proposal: MemoryWriteProposal,
  detectedConflicts: readonly string[],
): MemoryProjectionRecord['conflictState'] {
  if (proposal.boundaryCandidate.conflictState === 'UNRESOLVED') return 'UNRESOLVED';
  if (
    proposal.boundaryCandidate.conflictState === 'CONFLICTING' ||
    detectedConflicts.length > 0
  ) {
    return 'CONFLICTING';
  }
  return 'NONE';
}

function initialLifecycle(boundary: MemoryBoundaryKind): MemoryLifecycleState {
  return boundary === 'WORKING' ? 'TRANSIENT' : 'CANDIDATE';
}

export function createMemoryFabricSnapshot(tenant: TenantContext): MemoryFabricSnapshot {
  return {
    kind: 'MemoryFabricSnapshot',
    tenant,
    revision: 0,
    records: [],
    authorizesExecution: false,
  };
}

/**
 * Stages a proposal without writing any owning source of truth. Model/agent
 * proposals are never promoted automatically; non-working memory begins as a
 * CANDIDATE and must pass explicit source-owner validation later.
 */
export function stageMemoryProposal(request: MemoryStageRequest): MemoryStageResult {
  const { snapshot, proposal } = request;
  if (!validSnapshot(snapshot)) {
    return {
      kind: 'MEMORY_STAGE_RESULT',
      status: 'REJECTED',
      snapshot,
      reasons: ['INVALID_SNAPSHOT'],
      authorizesExecution: false,
    };
  }

  const reasons = validProposalShape(proposal);
  if (!sameTenant(snapshot.tenant, proposal?.boundaryCandidate?.tenant)) {
    reasons.push('SNAPSHOT_TENANT_MISMATCH');
  }
  if (reasons.length > 0) {
    return {
      kind: 'MEMORY_STAGE_RESULT',
      status: 'REJECTED',
      snapshot,
      reasons,
      authorizesExecution: false,
    };
  }

  const boundaryValidation = validateMemoryBoundaryCandidate({
    tenant: snapshot.tenant,
    maxDataClassification: request.maxDataClassification,
    candidate: proposal.boundaryCandidate,
  });
  if (!boundaryValidation.valid) {
    return {
      kind: 'MEMORY_STAGE_RESULT',
      status: 'REJECTED',
      snapshot,
      reasons: [...boundaryValidation.reasons],
      authorizesExecution: false,
    };
  }

  const sameProposalReference = snapshot.records.find(
    (record) => record.projectionReference === proposal.proposalReference,
  );
  if (sameProposalReference) {
    if (recordIdentityEquivalent(sameProposalReference, proposal)) {
      return {
        kind: 'MEMORY_STAGE_RESULT',
        status: 'DUPLICATE',
        snapshot,
        record: sameProposalReference,
        reasons: [],
        authorizesExecution: false,
      };
    }
    return {
      kind: 'MEMORY_STAGE_RESULT',
      status: 'REJECTED',
      snapshot,
      reasons: ['PROPOSAL_REFERENCE_CONFLICT'],
      authorizesExecution: false,
    };
  }

  const sameContent = snapshot.records.find(
    (record) =>
      activeForConflict(record) &&
      recordIdentityEquivalent(record, proposal),
  );
  if (sameContent) {
    return {
      kind: 'MEMORY_STAGE_RESULT',
      status: 'DUPLICATE',
      snapshot,
      record: sameContent,
      reasons: [],
      authorizesExecution: false,
    };
  }

  const conflicts = detectedConflictReferences(snapshot, proposal);
  const candidate = proposal.boundaryCandidate;
  const record: MemoryProjectionRecord = {
    kind: 'MemoryProjectionRecord',
    projectionReference: proposal.proposalReference,
    memoryKey: proposal.memoryKey,
    boundary: candidate.boundary,
    tenant: candidate.tenant,
    ...(candidate.subject === undefined ? {} : { subject: candidate.subject }),
    classification: candidate.classification,
    sourceOwner: candidate.sourceOwner,
    sourceReference: candidate.sourceReference,
    provenanceReference: candidate.provenanceReference,
    observedAt: candidate.observedAt,
    ...(candidate.retentionPolicyReference === undefined
      ? {}
      : { retentionPolicyReference: candidate.retentionPolicyReference }),
    conflictState: mergeConflictState(proposal, conflicts),
    conflictsWithProjectionReferences: conflicts,
    producer: { ...proposal.producer },
    content: { ...proposal.content },
    lifecycle: initialLifecycle(candidate.boundary),
    lifecycleRevision: 0,
    authorizesExecution: false,
  };

  return {
    kind: 'MEMORY_STAGE_RESULT',
    status: 'STAGED',
    snapshot: cloneSnapshot(snapshot, [...snapshot.records, record]),
    record,
    reasons: [],
    authorizesExecution: false,
  };
}

function replaceRecord(
  records: readonly MemoryProjectionRecord[],
  replacement: MemoryProjectionRecord,
): readonly MemoryProjectionRecord[] {
  return records.map((record) =>
    record.projectionReference === replacement.projectionReference ? replacement : record,
  );
}

function updateLifecycle(
  record: MemoryProjectionRecord,
  lifecycle: MemoryLifecycleState,
  additions: Partial<MemoryProjectionRecord>,
): MemoryProjectionRecord {
  return {
    ...record,
    ...additions,
    lifecycle,
    lifecycleRevision: record.lifecycleRevision + 1,
    authorizesExecution: false,
  };
}

function transitionRejected(
  snapshot: MemoryFabricSnapshot,
  reason: MemoryTransitionRejectionReason,
): MemoryLifecycleTransitionResult {
  return {
    kind: 'MEMORY_LIFECYCLE_TRANSITION_RESULT',
    applied: false,
    snapshot,
    reasons: [reason],
    authorizesExecution: false,
  };
}

function activeCanonicalForKey(
  snapshot: MemoryFabricSnapshot,
  record: MemoryProjectionRecord,
): MemoryProjectionRecord | undefined {
  return snapshot.records.find(
    (candidate) =>
      candidate.projectionReference !== record.projectionReference &&
      candidate.boundary === record.boundary &&
      candidate.memoryKey === record.memoryKey &&
      candidate.lifecycle === 'CANONICAL',
  );
}

/**
 * Applies an explicit lifecycle transition. This reducer does not authenticate
 * the evidence reference itself; upstream W02/W03/source-owner controls own that
 * truth. It only enforces W06 lifecycle, conflict and no-silent-overwrite rules.
 */
export function transitionMemoryProjection(
  request: MemoryLifecycleTransitionRequest,
): MemoryLifecycleTransitionResult {
  const snapshot = request.snapshot;
  if (!validSnapshot(snapshot)) return transitionRejected(snapshot, 'INVALID_SNAPSHOT');
  if (!sameTenant(snapshot.tenant, request.tenant)) {
    return transitionRejected(snapshot, 'SNAPSHOT_TENANT_MISMATCH');
  }
  if (!nonEmptyBounded(request.evidenceReference, MAX_REFERENCE_LENGTH)) {
    return transitionRejected(snapshot, 'INVALID_EVIDENCE_REFERENCE');
  }

  const current = snapshot.records.find(
    (record) => record.projectionReference === request.projectionReference,
  );
  if (!current) return transitionRejected(snapshot, 'RECORD_NOT_FOUND');
  if (current.lifecycleRevision !== request.expectedLifecycleRevision) {
    return transitionRejected(snapshot, 'REVISION_CONFLICT');
  }
  if (TERMINAL_STATES.has(current.lifecycle)) {
    return transitionRejected(snapshot, 'TRANSITION_NOT_ALLOWED');
  }

  if (request.to === 'VALIDATED') {
    if (current.lifecycle !== 'CANDIDATE') {
      return transitionRejected(snapshot, 'TRANSITION_NOT_ALLOWED');
    }
    if (!nonEmptyBounded(request.sourceCommitReference, MAX_REFERENCE_LENGTH)) {
      return transitionRejected(snapshot, 'SOURCE_COMMIT_REQUIRED');
    }
    const validated = updateLifecycle(current, 'VALIDATED', {
      sourceCommitReference: request.sourceCommitReference,
      ...(request.sourceCommitRevision === undefined
        ? {}
        : { sourceCommitRevision: request.sourceCommitRevision }),
      validationReference: request.evidenceReference,
    });
    return {
      kind: 'MEMORY_LIFECYCLE_TRANSITION_RESULT',
      applied: true,
      snapshot: cloneSnapshot(snapshot, replaceRecord(snapshot.records, validated)),
      record: validated,
      reasons: [],
      authorizesExecution: false,
    };
  }

  if (request.to === 'CANONICAL') {
    if (current.lifecycle !== 'VALIDATED') {
      return transitionRejected(snapshot, 'TRANSITION_NOT_ALLOWED');
    }
    const existingCanonical = activeCanonicalForKey(snapshot, current);
    let records = snapshot.records;
    if (existingCanonical) {
      if (!nonEmptyBounded(request.supersedesProjectionReference, MAX_REFERENCE_LENGTH)) {
        return transitionRejected(snapshot, 'ACTIVE_CANONICAL_EXISTS');
      }
      if (request.supersedesProjectionReference !== existingCanonical.projectionReference) {
        return transitionRejected(snapshot, 'SUPERSEDE_TARGET_INVALID');
      }
      const superseded = updateLifecycle(existingCanonical, 'SUPERSEDED', {
        supersededByProjectionReference: current.projectionReference,
        supersedeReference: request.evidenceReference,
      });
      records = replaceRecord(records, superseded);
    } else if (request.supersedesProjectionReference !== undefined) {
      return transitionRejected(snapshot, 'SUPERSEDE_TARGET_INVALID');
    }

    const promoted = updateLifecycle(current, 'CANONICAL', {
      promotionReference: request.evidenceReference,
    });
    records = replaceRecord(records, promoted);
    return {
      kind: 'MEMORY_LIFECYCLE_TRANSITION_RESULT',
      applied: true,
      snapshot: cloneSnapshot(snapshot, records),
      record: promoted,
      reasons: [],
      authorizesExecution: false,
    };
  }

  if (request.to === 'SUPERSEDED') {
    if (current.lifecycle !== 'CANONICAL') {
      return transitionRejected(snapshot, 'TRANSITION_NOT_ALLOWED');
    }
    if (!nonEmptyBounded(request.replacementProjectionReference, MAX_REFERENCE_LENGTH)) {
      return transitionRejected(snapshot, 'REPLACEMENT_REFERENCE_REQUIRED');
    }
    const replacement = snapshot.records.find(
      (record) => record.projectionReference === request.replacementProjectionReference,
    );
    if (
      !replacement ||
      replacement.projectionReference === current.projectionReference ||
      replacement.boundary !== current.boundary ||
      replacement.memoryKey !== current.memoryKey ||
      !['VALIDATED', 'CANONICAL'].includes(replacement.lifecycle)
    ) {
      return transitionRejected(snapshot, 'REPLACEMENT_INVALID');
    }
    const superseded = updateLifecycle(current, 'SUPERSEDED', {
      supersededByProjectionReference: replacement.projectionReference,
      supersedeReference: request.evidenceReference,
    });
    return {
      kind: 'MEMORY_LIFECYCLE_TRANSITION_RESULT',
      applied: true,
      snapshot: cloneSnapshot(snapshot, replaceRecord(snapshot.records, superseded)),
      record: superseded,
      reasons: [],
      authorizesExecution: false,
    };
  }

  if (request.to === 'REVOKED') {
    const revoked = updateLifecycle(current, 'REVOKED', {
      revocationReference: request.evidenceReference,
    });
    return {
      kind: 'MEMORY_LIFECYCLE_TRANSITION_RESULT',
      applied: true,
      snapshot: cloneSnapshot(snapshot, replaceRecord(snapshot.records, revoked)),
      record: revoked,
      reasons: [],
      authorizesExecution: false,
    };
  }

  return transitionRejected(snapshot, 'TRANSITION_NOT_ALLOWED');
}

function selectorMatch(record: MemoryProjectionRecord, request: MemoryProjectionReadRequest): boolean {
  if (request.key === 'memoryKey') return record.memoryKey === request.value;
  if (request.key === 'sourceReference') {
    return (
      record.sourceReference === request.value || record.sourceCommitReference === request.value
    );
  }
  return record.projectionReference === request.value;
}

/**
 * Reads only memory states that are eligible to feed context. Candidate,
 * superseded and revoked records remain inspectable in the snapshot but are not
 * emitted to model/agent context through this path.
 */
export function readMemoryProjection(
  request: MemoryProjectionReadRequest,
): MemoryProjectionReadResult {
  if (
    !validSnapshot(request.snapshot) ||
    !sameTenant(request.snapshot.tenant, request.tenant) ||
    !MEMORY_PROJECTION_SELECTOR_KEYS.includes(request.key) ||
    !nonEmptyBounded(request.value, MAX_REFERENCE_LENGTH) ||
    !Number.isInteger(request.limit) ||
    request.limit <= 0 ||
    request.limit > MAX_READ_LIMIT
  ) {
    return {
      kind: 'MEMORY_PROJECTION_READ_RESULT',
      records: [],
      truncated: false,
      authorizesExecution: false,
    };
  }

  const matches = request.snapshot.records
    .filter(
      (record) =>
        sameTenant(record.tenant, request.tenant) &&
        record.boundary === request.boundary &&
        READ_ELIGIBLE_STATES.has(record.lifecycle) &&
        selectorMatch(record, request),
    )
    .sort((left, right) => left.projectionReference.localeCompare(right.projectionReference));

  return {
    kind: 'MEMORY_PROJECTION_READ_RESULT',
    records: matches.slice(0, request.limit),
    truncated: matches.length > request.limit,
    authorizesExecution: false,
  };
}

/** Convenience helper for callers that already hold a typed classification bound. */
export function stageMemoryProposalWithClassification(
  snapshot: MemoryFabricSnapshot,
  proposal: MemoryWriteProposal,
  maxDataClassification: DataClassification,
): MemoryStageResult {
  return stageMemoryProposal({ snapshot, proposal, maxDataClassification });
}
