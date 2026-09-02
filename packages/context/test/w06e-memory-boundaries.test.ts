// @ts-expect-error -- context harness has no @types/node; Node 22 provides this built-in.
import assert from 'node:assert/strict';
// @ts-expect-error -- context harness has no @types/node; Node 22 provides this built-in.
import test from 'node:test';

import type { Rfc3339Timestamp, TenantContext } from '@aurora/contracts/context';
import type { IdentityId, TenantId } from '@aurora/contracts/ids';

import {
  MEMORY_BOUNDARY_DESCRIPTORS,
  MEMORY_BOUNDARY_KINDS,
  validateMemoryBoundaryCandidate,
} from '../src/memory-boundaries/index.js';
import type {
  MemoryBoundaryCandidate,
  MemoryBoundaryKind,
  MemorySourceOwner,
} from '../src/memory-boundaries/index.js';

const tenant: TenantContext = { tenantId: 'tenant:alpha' as TenantId };
const otherTenant: TenantContext = { tenantId: 'tenant:beta' as TenantId };
const at = (value: string) => value as Rfc3339Timestamp;

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

function candidate(
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
    provenanceReference: `evidence:${boundary.toLowerCase()}:1`,
    observedAt: at('2026-09-02T05:00:00Z'),
    ...(MEMORY_BOUNDARY_DESCRIPTORS[boundary].retentionMode === 'GOVERNED_RETENTION_REQUIRED'
      ? { retentionPolicyReference: 'retention:default:1' }
      : {}),
    conflictState: 'NONE',
    ...overrides,
  };
}

function validate(item: MemoryBoundaryCandidate) {
  return validateMemoryBoundaryCandidate({
    tenant,
    maxDataClassification: 'CONFIDENTIAL',
    candidate: item,
  });
}

test('W06-E freezes all eight memory boundaries with explicit ownership and non-authority', () => {
  assert.deepEqual(
    Object.keys(MEMORY_BOUNDARY_DESCRIPTORS).sort(),
    [...MEMORY_BOUNDARY_KINDS].sort(),
  );
  for (const boundary of MEMORY_BOUNDARY_KINDS) {
    const descriptor = MEMORY_BOUNDARY_DESCRIPTORS[boundary];
    assert.equal(descriptor.sourceOfTruthOwner, ownerByBoundary[boundary]);
    assert.equal(descriptor.readProjectionOwner, 'W06_CONTEXT_ENGINE');
    assert.equal(descriptor.tenantScoped, true);
    assert.equal(descriptor.requiresProvenance, true);
    assert.equal(descriptor.conflictSemantics, 'PRESERVE_EXPLICIT_CONFLICT');
    assert.equal(descriptor.authorizesExecution, false);
  }
});

test('W06-E accepts correctly owned tenant-scoped candidates without granting execution authority', () => {
  for (const boundary of MEMORY_BOUNDARY_KINDS) {
    const result = validate(candidate(boundary));
    assert.equal(result.valid, true, `${boundary} should be valid`);
    assert.deepEqual(result.reasons, []);
    assert.equal(result.preservesConflict, true);
    assert.equal(result.authorizesExecution, false);
  }
});

test('W06-E fails closed for cross-tenant and over-classified memory candidates', () => {
  const crossTenant = validate(candidate('USER', { tenant: otherTenant }));
  const overClassified = validate(candidate('COMPANY', { classification: 'RESTRICTED' }));

  assert.equal(crossTenant.valid, false);
  assert.deepEqual(crossTenant.reasons, ['TENANT_MISMATCH']);
  assert.equal(overClassified.valid, false);
  assert.deepEqual(overClassified.reasons, ['CLASSIFICATION_EXCEEDED']);
});

test('W06-E prevents one boundary source owner from silently writing another boundary', () => {
  const result = validate(candidate('SEMANTIC', { sourceOwner: 'USER_PROFILE' }));
  assert.equal(result.valid, false);
  assert.deepEqual(result.reasons, ['SOURCE_OWNER_MISMATCH']);
});

test('W06-E requires source identity, provenance and valid observed time', () => {
  const result = validate(
    candidate('OPERATIONAL', {
      sourceReference: '',
      provenanceReference: '',
      observedAt: at('not-a-time'),
    }),
  );
  assert.equal(result.valid, false);
  assert.deepEqual(result.reasons, [
    'SOURCE_REFERENCE_REQUIRED',
    'PROVENANCE_REQUIRED',
    'OBSERVED_AT_INVALID',
  ]);
});

test('W06-E requires governed retention references only for boundaries that own governed retention', () => {
  for (const boundary of ['EPISODIC', 'SEMANTIC', 'USER'] as const) {
    const base = candidate(boundary);
    const { retentionPolicyReference, ...withoutRetention } = base;
    assert.equal(typeof retentionPolicyReference, 'string');
    const result = validate(withoutRetention as MemoryBoundaryCandidate);
    assert.equal(result.valid, false);
    assert.deepEqual(result.reasons, ['RETENTION_POLICY_REQUIRED']);
  }

  for (const boundary of ['WORKING', 'COMPANY', 'TEMPORAL', 'OPERATIONAL', 'EVIDENCE'] as const) {
    assert.equal(validate(candidate(boundary)).valid, true);
  }
});

test('W06-E preserves conflicting and unresolved state instead of choosing a winner', () => {
  for (const conflictState of ['CONFLICTING', 'UNRESOLVED'] as const) {
    const result = validate(candidate('SEMANTIC', { conflictState }));
    assert.equal(result.valid, true);
    assert.equal(result.preservesConflict, true);
    assert.equal(result.descriptor?.conflictSemantics, 'PRESERVE_EXPLICIT_CONFLICT');
    assert.equal(result.authorizesExecution, false);
  }
});

test('W06-E delegates freshness evaluation to W06-B except immutable evidence capture time', () => {
  for (const boundary of MEMORY_BOUNDARY_KINDS) {
    const result = validate(candidate(boundary));
    assert.equal(
      result.requiresDownstreamFreshnessEvaluation,
      boundary !== 'EVIDENCE',
      `${boundary} freshness delegation mismatch`,
    );
  }
});

test('W06-E contains no legacy MemoryManager runtime dependency', async () => {
  // This leaf is intentionally defined from Aurora contracts/governance only.
  const module = await import('../src/memory-boundaries/index.js');
  assert.equal(typeof module.validateMemoryBoundaryCandidate, 'function');
  assert.equal('MemoryManager' in module, false);
});
