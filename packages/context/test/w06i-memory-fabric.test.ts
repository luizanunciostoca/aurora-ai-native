// @ts-expect-error -- context harness has no @types/node; Node 22 provides this built-in.
import assert from 'node:assert/strict';
// @ts-expect-error -- context harness has no @types/node; Node 22 provides this built-in.
import test from 'node:test';

import type { CorrelationContext, Rfc3339Timestamp, TenantContext } from '@aurora/contracts/context';
import type { CorrelationId, IdentityId, TenantId } from '@aurora/contracts/ids';
import type { JurisdictionContext } from '@aurora/contracts/jurisdiction';
import type { PurposeContext } from '@aurora/contracts/purpose';
import type { ContractVersion } from '@aurora/contracts/versioning';

import type {
  MemoryBoundaryCandidate,
  MemoryBoundaryKind,
  MemorySourceOwner,
} from '../src/memory-boundaries/index.js';
import {
  createMemoryFabricSnapshot,
  createMemoryFabricSourceAdapter,
  readMemoryProjection,
  stageMemoryProposal,
  transitionMemoryProjection,
} from '../src/memory-fabric/index.js';
import type {
  MemoryFabricSnapshot,
  MemoryWriteProposal,
} from '../src/memory-fabric/index.js';
import type { ContextSourceReadRequest } from '../src/sources/types.js';

const version = '1.0.0' as ContractVersion;
const tenant: TenantContext = { tenantId: 'tenant:alpha' as TenantId };
const otherTenant: TenantContext = { tenantId: 'tenant:beta' as TenantId };
const correlation: CorrelationContext = { correlationId: 'corr:memory:1' as CorrelationId };
const at = (value: string) => value as Rfc3339Timestamp;

const purpose: PurposeContext = {
  kind: 'PurposeContext',
  purposeId: 'assistant.shared-context',
  version,
  status: 'ACTIVE',
  allowedDataClassifications: ['PUBLIC', 'INTERNAL', 'CONFIDENTIAL'],
};
const jurisdiction: JurisdictionContext = {
  kind: 'JurisdictionContext',
  jurisdiction: 'BR',
  version,
};

const ownerByBoundary: Readonly<Record<MemoryBoundaryKind, MemorySourceOwner>> = {
  WORKING: 'TASK_RUNTIME',
  EPISODIC: 'EVENT_HISTORY',
  SEMANTIC: 'SEMANTIC_KNOWLEDGE',
  COMPANY: 'COMPANY_KNOWLEDGE',
  USER: 'USER_PROFILE',
  TEMPORAL: 'TEMPORAL_FACT_SOURCE',
  OPERATIONAL: 'OPERATIONAL_STATE_SOURCE',
  EVIDENCE: 'EVIDENCE_SOURCE',
};

function boundaryCandidate(
  boundary: MemoryBoundaryKind,
  overrides: Partial<MemoryBoundaryCandidate> = {},
): MemoryBoundaryCandidate {
  return {
    boundary,
    tenant,
    subject: { kind: 'IDENTITY', identityId: 'identity:subject' as IdentityId },
    classification: 'INTERNAL',
    sourceOwner: ownerByBoundary[boundary],
    sourceReference: `source:${boundary.toLowerCase()}:1`,
    provenanceReference: `provenance:${boundary.toLowerCase()}:1`,
    observedAt: at('2026-09-15T01:00:00Z'),
    ...(boundary === 'EPISODIC' || boundary === 'SEMANTIC' || boundary === 'USER'
      ? { retentionPolicyReference: 'retention:default:1' }
      : {}),
    conflictState: 'NONE',
    ...overrides,
  };
}

function proposal(
  reference: string,
  boundary: MemoryBoundaryKind = 'SEMANTIC',
  digest = `sha256:${reference}`,
  overrides: Partial<MemoryWriteProposal> = {},
): MemoryWriteProposal {
  return {
    kind: 'MemoryWriteProposal',
    proposalReference: reference,
    memoryKey: 'project:aurora:memory-fabric',
    boundaryCandidate: boundaryCandidate(boundary),
    producer: {
      kind: 'MODEL',
      producerReference: 'agent:planner',
      providerReference: 'provider:frontier',
      modelReference: 'model:reasoning',
    },
    content: {
      kind: 'STRUCTURED',
      digest,
      payload: { fact: 'Aurora owns shared memory; models are interchangeable consumers.' },
    },
    ...overrides,
  };
}

function stage(
  snapshot: MemoryFabricSnapshot,
  item: MemoryWriteProposal,
) {
  return stageMemoryProposal({
    snapshot,
    proposal: item,
    maxDataClassification: 'CONFIDENTIAL',
  });
}

function validateCandidate(snapshot: MemoryFabricSnapshot, reference: string, revision = 0) {
  return transitionMemoryProjection({
    snapshot,
    tenant,
    projectionReference: reference,
    expectedLifecycleRevision: revision,
    to: 'VALIDATED',
    evidenceReference: `validation:${reference}`,
    sourceCommitReference: `semantic-kb:${reference}`,
    sourceCommitRevision: 'rev:1',
  });
}

function promoteCanonical(
  snapshot: MemoryFabricSnapshot,
  reference: string,
  revision = 1,
  supersedesProjectionReference?: string,
) {
  return transitionMemoryProjection({
    snapshot,
    tenant,
    projectionReference: reference,
    expectedLifecycleRevision: revision,
    to: 'CANONICAL',
    evidenceReference: `promotion:${reference}`,
    ...(supersedesProjectionReference === undefined ? {} : { supersedesProjectionReference }),
  });
}

test('W06-I stages model memory as candidate and never lets a proposal mint authority', () => {
  const initial = createMemoryFabricSnapshot(tenant);
  const result = stage(initial, proposal('mem:proposal:1'));

  assert.equal(result.status, 'STAGED');
  assert.equal(result.authorizesExecution, false);
  assert.equal(result.snapshot.authorizesExecution, false);
  assert.equal(result.record?.lifecycle, 'CANDIDATE');
  assert.equal(result.record?.producer.kind, 'MODEL');
  assert.equal(result.record?.authorizesExecution, false);
  assert.equal(result.snapshot.revision, 1);
});

test('W06-I keeps working memory transient while durable boundaries require explicit validation', () => {
  const initial = createMemoryFabricSnapshot(tenant);
  const working = stage(initial, proposal('mem:working:1', 'WORKING'));
  assert.equal(working.record?.lifecycle, 'TRANSIENT');

  const workingRead = readMemoryProjection({
    snapshot: working.snapshot,
    tenant,
    boundary: 'WORKING',
    key: 'memoryKey',
    value: 'project:aurora:memory-fabric',
    limit: 10,
  });
  assert.equal(workingRead.records.length, 1);
  assert.equal(workingRead.records[0]?.lifecycle, 'TRANSIENT');

  const semantic = stage(working.snapshot, proposal('mem:semantic:1'));
  const semanticRead = readMemoryProjection({
    snapshot: semantic.snapshot,
    tenant,
    boundary: 'SEMANTIC',
    key: 'memoryKey',
    value: 'project:aurora:memory-fabric',
    limit: 10,
  });
  assert.equal(semanticRead.records.length, 0, 'candidate memory must not reach model context');
});

test('W06-I rejects lifecycle skipping and requires a source commit before validation', () => {
  const staged = stage(createMemoryFabricSnapshot(tenant), proposal('mem:lifecycle:1'));

  const skipped = promoteCanonical(staged.snapshot, 'mem:lifecycle:1', 0);
  assert.equal(skipped.applied, false);
  assert.deepEqual(skipped.reasons, ['TRANSITION_NOT_ALLOWED']);

  const missingCommit = transitionMemoryProjection({
    snapshot: staged.snapshot,
    tenant,
    projectionReference: 'mem:lifecycle:1',
    expectedLifecycleRevision: 0,
    to: 'VALIDATED',
    evidenceReference: 'validation:missing-commit',
  });
  assert.equal(missingCommit.applied, false);
  assert.deepEqual(missingCommit.reasons, ['SOURCE_COMMIT_REQUIRED']);

  const validated = validateCandidate(staged.snapshot, 'mem:lifecycle:1');
  assert.equal(validated.applied, true);
  assert.equal(validated.record?.lifecycle, 'VALIDATED');
  assert.equal(validated.record?.sourceCommitReference, 'semantic-kb:mem:lifecycle:1');

  const promoted = promoteCanonical(validated.snapshot, 'mem:lifecycle:1');
  assert.equal(promoted.applied, true);
  assert.equal(promoted.record?.lifecycle, 'CANONICAL');
  assert.equal(promoted.record?.authorizesExecution, false);
});

test('W06-I preserves conflicts and requires explicit supersession instead of silent overwrite', () => {
  const firstStage = stage(createMemoryFabricSnapshot(tenant), proposal('mem:conflict:a', 'SEMANTIC', 'sha256:a'));
  const firstValidated = validateCandidate(firstStage.snapshot, 'mem:conflict:a');
  const firstCanonical = promoteCanonical(firstValidated.snapshot, 'mem:conflict:a');
  assert.equal(firstCanonical.applied, true);

  const secondStage = stage(
    firstCanonical.snapshot,
    proposal('mem:conflict:b', 'SEMANTIC', 'sha256:b'),
  );
  assert.equal(secondStage.record?.conflictState, 'CONFLICTING');
  assert.deepEqual(secondStage.record?.conflictsWithProjectionReferences, ['mem:conflict:a']);

  const secondValidated = validateCandidate(secondStage.snapshot, 'mem:conflict:b');
  const unsafePromotion = promoteCanonical(secondValidated.snapshot, 'mem:conflict:b');
  assert.equal(unsafePromotion.applied, false);
  assert.deepEqual(unsafePromotion.reasons, ['ACTIVE_CANONICAL_EXISTS']);

  const explicitPromotion = promoteCanonical(
    secondValidated.snapshot,
    'mem:conflict:b',
    1,
    'mem:conflict:a',
  );
  assert.equal(explicitPromotion.applied, true);
  assert.equal(explicitPromotion.record?.lifecycle, 'CANONICAL');

  const oldRecord = explicitPromotion.snapshot.records.find(
    (record) => record.projectionReference === 'mem:conflict:a',
  );
  assert.equal(oldRecord?.lifecycle, 'SUPERSEDED');
  assert.equal(oldRecord?.supersededByProjectionReference, 'mem:conflict:b');

  const read = readMemoryProjection({
    snapshot: explicitPromotion.snapshot,
    tenant,
    boundary: 'SEMANTIC',
    key: 'memoryKey',
    value: 'project:aurora:memory-fabric',
    limit: 10,
  });
  assert.deepEqual(
    read.records.map((record) => record.projectionReference),
    ['mem:conflict:b'],
  );
});

test('W06-I is idempotent for the same source/content and rejects reused proposal references with different content', () => {
  const first = stage(createMemoryFabricSnapshot(tenant), proposal('mem:idempotent:1'));
  const duplicateReference = stage(first.snapshot, proposal('mem:idempotent:1'));
  assert.equal(duplicateReference.status, 'DUPLICATE');
  assert.equal(duplicateReference.snapshot.revision, first.snapshot.revision);

  const sameSourceNewReference = stage(
    first.snapshot,
    proposal('mem:idempotent:2', 'SEMANTIC', 'sha256:mem:idempotent:1'),
  );
  assert.equal(sameSourceNewReference.status, 'DUPLICATE');

  const referenceConflict = stage(
    first.snapshot,
    proposal('mem:idempotent:1', 'SEMANTIC', 'sha256:different'),
  );
  assert.equal(referenceConflict.status, 'REJECTED');
  assert.deepEqual(referenceConflict.reasons, ['PROPOSAL_REFERENCE_CONFLICT']);
});

test('W06-I fails closed on cross-tenant, over-classified and unsupported raw-audio-like proposals', () => {
  const snapshot = createMemoryFabricSnapshot(tenant);
  const crossTenant = stage(
    snapshot,
    proposal('mem:tenant:1', 'SEMANTIC', 'sha256:tenant', {
      boundaryCandidate: boundaryCandidate('SEMANTIC', { tenant: otherTenant }),
    }),
  );
  assert.equal(crossTenant.status, 'REJECTED');
  assert.equal(crossTenant.reasons.includes('SNAPSHOT_TENANT_MISMATCH'), true);

  const restricted = stageMemoryProposal({
    snapshot,
    proposal: proposal('mem:classification:1', 'SEMANTIC', 'sha256:restricted', {
      boundaryCandidate: boundaryCandidate('SEMANTIC', { classification: 'RESTRICTED' }),
    }),
    maxDataClassification: 'CONFIDENTIAL',
  });
  assert.equal(restricted.status, 'REJECTED');
  assert.deepEqual(restricted.reasons, ['CLASSIFICATION_EXCEEDED']);

  const rawAudioLike = stage(
    snapshot,
    proposal('mem:audio:1', 'SEMANTIC', 'sha256:audio', {
      content: { kind: 'RAW_AUDIO' as never, digest: 'sha256:audio', payload: new Uint8Array([1, 2]) },
    }),
  );
  assert.equal(rawAudioLike.status, 'REJECTED');
  assert.equal(rawAudioLike.reasons.includes('INVALID_CONTENT_KIND'), true);
});

test('W06-I revocation immediately removes a previously eligible projection from context reads', () => {
  const staged = stage(createMemoryFabricSnapshot(tenant), proposal('mem:revoke:1'));
  const validated = validateCandidate(staged.snapshot, 'mem:revoke:1');
  assert.equal(
    readMemoryProjection({
      snapshot: validated.snapshot,
      tenant,
      boundary: 'SEMANTIC',
      key: 'projectionReference',
      value: 'mem:revoke:1',
      limit: 1,
    }).records.length,
    1,
  );

  const revoked = transitionMemoryProjection({
    snapshot: validated.snapshot,
    tenant,
    projectionReference: 'mem:revoke:1',
    expectedLifecycleRevision: 1,
    to: 'REVOKED',
    evidenceReference: 'revocation:user-request:1',
  });
  assert.equal(revoked.applied, true);
  assert.equal(revoked.record?.lifecycle, 'REVOKED');
  assert.equal(
    readMemoryProjection({
      snapshot: revoked.snapshot,
      tenant,
      boundary: 'SEMANTIC',
      key: 'projectionReference',
      value: 'mem:revoke:1',
      limit: 1,
    }).records.length,
    0,
  );
});

test('W06-I source adapter exposes validated/canonical Aurora memory to any model through the existing context path', async () => {
  const staged = stage(createMemoryFabricSnapshot(tenant), proposal('mem:adapter:1'));
  const validated = validateCandidate(staged.snapshot, 'mem:adapter:1');
  const candidateOnly = stage(validated.snapshot, proposal('mem:adapter:candidate', 'SEMANTIC', 'sha256:candidate'));

  const adapter = createMemoryFabricSourceAdapter({
    boundary: 'SEMANTIC',
    snapshotProvider: () => candidateOnly.snapshot,
    maxItemsPerRead: 8,
  });
  const request: ContextSourceReadRequest = {
    schemaVersion: version,
    tenant,
    correlation,
    actor: { kind: 'AGENT', identityId: 'identity:agent' as IdentityId },
    subject: { kind: 'IDENTITY', identityId: 'identity:subject' as IdentityId },
    purpose,
    jurisdiction,
    maxDataClassification: 'CONFIDENTIAL',
    currentness: 'CURRENT_REQUIRED',
    selector: {
      adapterId: adapter.descriptor.adapterId,
      sourceClass: adapter.descriptor.sourceClass,
      key: 'memoryKey',
      value: 'project:aurora:memory-fabric',
    },
    limit: 8,
  };

  const result = await adapter.read(request);
  assert.equal(adapter.descriptor.readOnly, true);
  assert.equal(result.items.length, 1, 'unvalidated candidate must stay hidden');
  assert.equal(result.items[0]?.sourceReference, 'semantic-kb:mem:adapter:1');
  assert.equal(result.items[0]?.provenanceReference, 'provenance:semantic:1');
  const payload = result.items[0]?.payload as Record<string, unknown>;
  assert.equal(payload.projectionReference, 'mem:adapter:1');
  assert.equal(payload.lifecycle, 'VALIDATED');

  await assert.rejects(
    () => adapter.read({ ...request, tenant: otherTenant }),
    /MEMORY_FABRIC_TENANT_MISMATCH/,
  );
});
