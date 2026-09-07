import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

import { validateW15JGovernedExecutionBinding } from './w15j-governed-execution-binding.mjs';

function digest(bytes) {
  return createHash('sha256').update(bytes).digest('hex');
}

function fixture() {
  const directory = mkdtempSync(join(tmpdir(), 'w15j-semantic-binding-'));
  const sourceNames = {
    authority: 'authority-proof.txt',
    session: 'w14-session-proof.txt',
    delivery: 'w14-delivery-proof.txt',
    w03: 'w03-durable-proof.txt',
    native: 'native-effect-proof.txt',
    receipt: 'receipt-ingress-proof.txt',
    reconciliation: 'w07-reconciliation-proof.txt',
  };
  const manifestFiles = {};
  for (const [role, name] of Object.entries(sourceNames)) {
    const bytes = Buffer.from(`${role}-source-evidence\n`);
    writeFileSync(join(directory, name), bytes);
    manifestFiles[name] = { sha256: digest(bytes), sizeBytes: bytes.length };
  }

  const binding = {
    schemaVersion: 'w15j-governed-execution-binding-v1',
    authorityInvariant: 'INTELLIGENCE != AUTHORITY != EXECUTION',
    actionIntentId: 'intent-1',
    authority: {
      actionIntentId: 'intent-1',
      authorityReferenceKind: 'POLICY_AND_OWNER_DECISION',
      policyTokenId: 'token-1',
      decisionId: 'decision-1',
      currentAuthorityValidated: true,
      executionEligible: true,
      w07ExecutionAuthorizationExecutionId: 'execution-1',
      w07ExecutionAuthorizationSource: 'W07_CURRENT_EXECUTION_AUTHORITY',
      w07ExecutionAuthorizationAuthorizesExecution: true,
      w07ExecutionAuthorizationCancelled: false,
      bindingAuthorizesExecution: false,
      sourceEvidenceReference: sourceNames.authority,
      sourceEvidenceSha256: manifestFiles[sourceNames.authority].sha256,
    },
    w14Session: {
      deviceSessionId: 'device-session-1',
      trustState: 'ACTIVE',
      executionPreconditionSatisfied: true,
      bindingAuthorizesExecution: false,
      sourceEvidenceReference: sourceNames.session,
      sourceEvidenceSha256: manifestFiles[sourceNames.session].sha256,
    },
    w14Delivery: {
      commandId: 'command-1',
      executionId: 'execution-1',
      deviceSessionId: 'device-session-1',
      deliveryReference: 'delivery-1',
      durableIdempotencyReference: 'command-durable-1',
      bindingAuthorizesExecution: false,
      sourceEvidenceReference: sourceNames.delivery,
      sourceEvidenceSha256: manifestFiles[sourceNames.delivery].sha256,
    },
    w03DurableState: {
      commandDurableReference: 'command-durable-1',
      receiptDurableReference: 'receipt-durable-1',
      bindingAuthorizesExecution: false,
      sourceEvidenceReference: sourceNames.w03,
      sourceEvidenceSha256: manifestFiles[sourceNames.w03].sha256,
    },
    nativeExecution: {
      executionId: 'execution-1',
      deviceSessionId: 'device-session-1',
      capabilityId: 'device.media.volume',
      actionId: 'device.media.volume.step-up',
      outcome: 'SUCCEEDED',
      requiresReconciliation: false,
      retryEligible: false,
      bindingAuthorizesExecution: false,
      sourceEvidenceReference: sourceNames.native,
      sourceEvidenceSha256: manifestFiles[sourceNames.native].sha256,
    },
    receiptIngress: {
      receiptId: 'receipt-1',
      evidenceId: 'evidence-1',
      commandId: 'command-1',
      executionId: 'execution-1',
      deviceSessionId: 'device-session-1',
      deliveryReference: 'delivery-1',
      durableReference: 'receipt-durable-1',
      reportedState: 'COMPLETED',
      requiresW07Reconciliation: true,
      authoritySemantics: 'EVIDENCE_INPUT_ONLY_W07_OWNS_OUTCOME_AND_RETRY',
      bindingAuthorizesExecution: false,
      provesExecutionSuccess: false,
      retryAuthorized: false,
      sourceEvidenceReference: sourceNames.receipt,
      sourceEvidenceSha256: manifestFiles[sourceNames.receipt].sha256,
    },
    w07OutcomeReconciliation: {
      actionIntentId: 'intent-1',
      executionId: 'execution-1',
      receiptId: 'receipt-1',
      state: 'EFFECT_OBSERVED',
      reconciliationRequired: false,
      retryEligibleAfterFreshGuards: false,
      bindingAuthorizesExecution: false,
      sourceEvidenceReference: sourceNames.reconciliation,
      sourceEvidenceSha256: manifestFiles[sourceNames.reconciliation].sha256,
    },
    semantics: {
      kind: 'EVIDENCE_BINDING_ONLY',
      authorizesExecution: false,
      provesExecutionSuccess: false,
      retryAuthorized: false,
      physicalAcceptance: false,
      w16BuildUnblocked: false,
    },
  };
  const bindingBytes = Buffer.from(`${JSON.stringify(binding, null, 2)}\n`);
  writeFileSync(join(directory, 'governed-execution-binding.json'), bindingBytes);
  manifestFiles['governed-execution-binding.json'] = {
    sha256: digest(bindingBytes),
    sizeBytes: bindingBytes.length,
  };

  const refs = sourceNames;
  const dossier = {
    authorityInvariant: 'INTELLIGENCE != AUTHORITY != EXECUTION',
    scenarios: {
      governedNativeExecution: {
        currentDeviceAuthorizationDispatchesExactlyOnce: {
          status: 'PASS',
          evidenceReferences: [refs.authority, refs.session, refs.delivery, refs.native],
        },
        verifiedOutcomeProducesEvidenceWithoutRetryAuthority: {
          status: 'PASS',
          evidenceReferences: [refs.native, refs.receipt, refs.reconciliation],
        },
      },
      voiceAndPresence: {
        validDeterministicCommonCommand: {
          status: 'PASS',
          evidenceReferences: [refs.authority, refs.delivery, refs.native, refs.receipt],
        },
      },
    },
    riskGates: {
      A_AUTHORITY: { status: 'PASS', evidenceReferences: [refs.authority] },
      B_RUNTIME_RECONCILIATION: {
        status: 'PASS',
        evidenceReferences: [refs.native, refs.reconciliation],
      },
      C_REPLAY_IDEMPOTENCY: {
        status: 'PASS',
        evidenceReferences: [refs.delivery, refs.w03],
      },
      D_EVIDENCE_OBSERVABILITY: {
        status: 'PASS',
        evidenceReferences: [refs.receipt, refs.reconciliation],
      },
    },
  };
  const trusted = {
    schemaVersion: 'w15j-tablet-loopback-trusted-preflight-v1',
    evidenceManifest: { files: manifestFiles },
    physicallyAccepted: false,
  };
  return { binding, directory, dossier, trusted, sourceNames };
}

function rewriteBinding(value, directory, trusted) {
  const bytes = Buffer.from(`${JSON.stringify(value, null, 2)}\n`);
  writeFileSync(join(directory, 'governed-execution-binding.json'), bytes);
  trusted.evidenceManifest.files['governed-execution-binding.json'] = {
    sha256: digest(bytes),
    sizeBytes: bytes.length,
  };
}

test('semantic binding accepts exact cross-owner evidence chain but never physical acceptance', () => {
  const value = fixture();
  try {
    const result = validateW15JGovernedExecutionBinding(
      value.dossier,
      value.trusted,
      value.directory,
    );
    assert.equal(result.evidenceRoleCount, 7);
    assert.equal(result.readyForIndependentReview, true);
    assert.equal(result.physicallyAccepted, false);
    assert.equal(result.authorizesExecution, false);
    assert.equal(result.retryAuthorized, false);
    assert.equal(result.w16BuildUnblocked, false);
  } finally {
    rmSync(value.directory, { recursive: true, force: true });
  }
});

test('semantic binding rejects source evidence digest substitution', () => {
  const value = fixture();
  try {
    value.binding.authority.sourceEvidenceSha256 = 'f'.repeat(64);
    rewriteBinding(value.binding, value.directory, value.trusted);
    assert.throws(
      () => validateW15JGovernedExecutionBinding(value.dossier, value.trusted, value.directory),
      /authority evidence is not hash-bound to the trusted final manifest/,
    );
  } finally {
    rmSync(value.directory, { recursive: true, force: true });
  }
});

test('semantic binding rejects execution identity drift across W14 and Android', () => {
  const value = fixture();
  try {
    value.binding.nativeExecution.executionId = 'execution-other';
    rewriteBinding(value.binding, value.directory, value.trusted);
    assert.throws(
      () => validateW15JGovernedExecutionBinding(value.dossier, value.trusted, value.directory),
      /native executionId drift/,
    );
  } finally {
    rmSync(value.directory, { recursive: true, force: true });
  }
});

test('semantic binding rejects critical PASS without the owner evidence role', () => {
  const value = fixture();
  try {
    value.dossier.scenarios.governedNativeExecution.currentDeviceAuthorizationDispatchesExactlyOnce.evidenceReferences =
      [value.sourceNames.authority, value.sourceNames.delivery, value.sourceNames.native];
    assert.throws(
      () => validateW15JGovernedExecutionBinding(value.dossier, value.trusted, value.directory),
      /must reference semantic evidence w14-session-proof.txt/,
    );
  } finally {
    rmSync(value.directory, { recursive: true, force: true });
  }
});

test('semantic binding cannot mint execution or acceptance authority', () => {
  const value = fixture();
  try {
    value.binding.semantics.authorizesExecution = true;
    rewriteBinding(value.binding, value.directory, value.trusted);
    assert.throws(
      () => validateW15JGovernedExecutionBinding(value.dossier, value.trusted, value.directory),
      /binding.semantics.authorizesExecution must remain false/,
    );
  } finally {
    rmSync(value.directory, { recursive: true, force: true });
  }
});
