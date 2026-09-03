// @ts-expect-error -- W09 harness intentionally has no @types/node; Node 22 provides this built-in.
import assert from 'node:assert/strict';
// @ts-expect-error -- W09 harness intentionally has no @types/node; Node 22 provides this built-in.
import test from 'node:test';

import {
  classifyW09WorkflowCandidate,
  prepareW09CuratedMigration,
  type W09SanitizedWorkflowCandidate,
} from '../src/migration/index.js';

const SOURCE_HASH = `sha256:${'a'.repeat(64)}`;

function candidate(overrides: Partial<W09SanitizedWorkflowCandidate> = {}): W09SanitizedWorkflowCandidate {
  return {
    candidateId: 'w09e.candidate.lead-sync',
    tenantId: 'ten_01JW09ETENANTA000000000',
    capabilityId: 'crm.lead.sync',
    domain: 'CRM',
    sourceReference: 'sanitized-corpus:w09e:lead-sync',
    sourceHash: SOURCE_HASH,
    sanitizerVersion: '1.0.0',
    licenseStatus: 'REFERENCE_ONLY',
    topology: [
      { nodeReference: 'trigger:1', kind: 'WEBHOOK_TRIGGER' },
      { nodeReference: 'request:1', kind: 'AURORA_ACTION_REQUEST' },
    ],
    sideEffecting: true,
    validStructure: true,
    duplicateOfCandidateId: null,
    containsSensitiveMaterial: false,
    containsPrivateStaticIdentifier: false,
    verbatimReuseRequested: false,
    ...overrides,
  };
}

test('W09-E re-specifies a safe side-effecting candidate through W07/W08 without granting authority', () => {
  const result = prepareW09CuratedMigration(candidate());
  assert.equal(result.status, 'READY');
  if (result.status !== 'READY') return;
  assert.equal(result.classification.category, 'RE_SPECIFY_SAFE_CANDIDATE');
  assert.deepEqual(result.plan.topology, [
    'W03_GOVERNED_TRIGGER_CONTEXT',
    'W04_CAPABILITY_BINDING',
    'CURRENT_POLICY_AUTHORITY',
    'W07_GOVERNED_EXECUTOR',
    'W08_PROVIDER_ADAPTER',
    'W07_RECEIPT_READBACK_EVIDENCE',
  ]);
  assert.equal(result.plan.maxProviderMutationAttempts, 1);
  assert.equal(result.plan.retryBoundary, 'W07_RECONCILE_BEFORE_RETRY');
  assert.equal(result.plan.rawCorpusPromotionAllowed, false);
  assert.equal(result.plan.localServiceExecutionAllowed, false);
  assert.equal(result.plan.authorizesExecution, false);
  assert.equal(result.plan.canGrantPermission, false);
});

test('W09-E keeps shell, SSH and Execute Command patterns index-only', () => {
  for (const kind of ['SHELL', 'SSH', 'EXECUTE_COMMAND'] as const) {
    const result = prepareW09CuratedMigration(
      candidate({ topology: [{ nodeReference: `node:${kind}`, kind }] }),
    );
    assert.equal(result.status, 'REFERENCE_ONLY');
    assert.equal(result.classification.category, 'HIGH_RISK_INDEX_ONLY');
  }
});

test('W09-E rejects sensitive/static-private material before any migration plan exists', () => {
  const sensitive = prepareW09CuratedMigration(candidate({ containsSensitiveMaterial: true }));
  assert.equal(sensitive.status, 'BLOCKED');
  assert.equal(sensitive.classification.category, 'REJECT_SECRET_OR_ID_LEAK');

  const privateId = prepareW09CuratedMigration(
    candidate({ containsPrivateStaticIdentifier: true }),
  );
  assert.equal(privateId.status, 'BLOCKED');
  assert.equal(privateId.classification.category, 'REJECT_SECRET_OR_ID_LEAK');
});

test('W09-E blocks duplicates, malformed provenance and empty topology fail-closed', () => {
  for (const input of [
    candidate({ duplicateOfCandidateId: 'w09e.other' }),
    candidate({ sourceHash: 'not-a-hash' }),
    candidate({ topology: [] }),
    candidate({ validStructure: false }),
  ]) {
    const result = prepareW09CuratedMigration(input);
    assert.equal(result.status, 'BLOCKED');
    assert.equal(result.classification.category, 'REJECT_DUPLICATE_OR_INVALID');
  }
});

test('W09-E holds verbatim reuse until provenance/license acceptance', () => {
  const held = prepareW09CuratedMigration(candidate({ verbatimReuseRequested: true }));
  assert.equal(held.status, 'BLOCKED');
  assert.equal(held.classification.category, 'LICENSE_PROVENANCE_HOLD');

  const accepted = prepareW09CuratedMigration(
    candidate({ verbatimReuseRequested: true, licenseStatus: 'PROVENANCE_ACCEPTED' }),
  );
  assert.equal(accepted.status, 'READY');
});

test('W09-E treats direct provider writes and domain decisions as reference-only', () => {
  const provider = classifyW09WorkflowCandidate(
    candidate({ topology: [{ nodeReference: 'write:1', kind: 'PROVIDER_DIRECT_WRITE' }] }),
  );
  assert.equal(provider.category, 'REFERENCE_ONLY_PROVIDER_PATTERN');

  const domain = classifyW09WorkflowCandidate(
    candidate({
      sideEffecting: false,
      topology: [{ nodeReference: 'decision:1', kind: 'DOMAIN_DECISION' }],
    }),
  );
  assert.equal(domain.category, 'REFERENCE_ONLY_DOMAIN_PATTERN');
});

test('W09-E uses a read-only provider topology when no side effect is requested', () => {
  const result = prepareW09CuratedMigration(
    candidate({
      sideEffecting: false,
      topology: [
        { nodeReference: 'schedule:1', kind: 'SCHEDULE_TRIGGER' },
        { nodeReference: 'read:1', kind: 'READ_ONLY_INTEGRATION' },
      ],
    }),
  );
  assert.equal(result.status, 'READY');
  if (result.status !== 'READY') return;
  assert.deepEqual(result.plan.topology, [
    'W03_GOVERNED_TRIGGER_CONTEXT',
    'W04_CAPABILITY_BINDING',
    'W08_READ_ONLY_PROVIDER_PATH',
    'W07_RECEIPT_READBACK_EVIDENCE',
  ]);
});
