// @ts-expect-error -- context harness has no @types/node; Node 22 provides this built-in.
import assert from 'node:assert/strict';
// @ts-expect-error -- context harness has no @types/node; Node 22 provides this built-in.
import test from 'node:test';

import { validateMemoryBoundaryCandidate } from '../src/memory-boundaries/index.js';
import type { MemoryBoundaryValidationRequest } from '../src/memory-boundaries/index.js';

function requestWithCandidate(candidateOverrides: Record<string, unknown>): MemoryBoundaryValidationRequest {
  return {
    tenant: { tenantId: 'tenant:alpha' },
    maxDataClassification: 'CONFIDENTIAL',
    candidate: {
      boundary: 'COMPANY',
      tenant: { tenantId: 'tenant:alpha' },
      classification: 'INTERNAL',
      sourceOwner: 'COMPANY_KNOWLEDGE',
      sourceReference: 'source:company:1',
      provenanceReference: 'evidence:company:1',
      observedAt: '2026-09-02T05:00:00Z',
      conflictState: 'NONE',
      ...candidateOverrides,
    },
  } as unknown as MemoryBoundaryValidationRequest;
}

test('W06-E rejects inherited Object prototype keys as unknown memory boundaries', () => {
  const result = validateMemoryBoundaryCandidate(requestWithCandidate({ boundary: '__proto__' }));

  assert.equal(result.valid, false);
  assert.deepEqual(result.reasons, ['BOUNDARY_UNKNOWN']);
  assert.equal(result.descriptor, undefined);
  assert.equal(result.authorizesExecution, false);
});

test('W06-E timestamp validation does not coerce attacker-controlled objects', () => {
  let coercions = 0;
  const observedAt = {
    toString() {
      coercions += 1;
      return '2026-09-02T05:00:00Z';
    },
  };

  const result = validateMemoryBoundaryCandidate(requestWithCandidate({ observedAt }));

  assert.equal(result.valid, false);
  assert.equal(result.reasons.includes('OBSERVED_AT_INVALID'), true);
  assert.equal(coercions, 0);
  assert.equal(result.authorizesExecution, false);
});
