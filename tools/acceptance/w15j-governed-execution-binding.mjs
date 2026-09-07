import { createHash } from 'node:crypto';
import { lstatSync, readFileSync, realpathSync } from 'node:fs';
import { basename, dirname, join } from 'node:path';

const SHA256 = /^[a-f0-9]{64}$/u;
const SAFE_ID = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,255}$/u;
const BINDING_FILE = 'governed-execution-binding.json';
const MAX_BINDING_BYTES = 1024 * 1024;
const AUTHORITY_KINDS = new Set(['POLICY_TOKEN', 'OWNER_DECISION', 'POLICY_AND_OWNER_DECISION']);

const SCENARIO_EVIDENCE_REQUIREMENTS = Object.freeze({
  'governedNativeExecution.currentDeviceAuthorizationDispatchesExactlyOnce': [
    'authority',
    'session',
    'delivery',
    'native',
  ],
  'governedNativeExecution.verifiedOutcomeProducesEvidenceWithoutRetryAuthority': [
    'native',
    'receipt',
    'reconciliation',
  ],
  'voiceAndPresence.validDeterministicCommonCommand': [
    'authority',
    'delivery',
    'native',
    'receipt',
  ],
});

const RISK_GATE_EVIDENCE_REQUIREMENTS = Object.freeze({
  A_AUTHORITY: ['authority'],
  B_RUNTIME_RECONCILIATION: ['native', 'reconciliation'],
  C_REPLAY_IDEMPOTENCY: ['delivery', 'w03'],
  D_EVIDENCE_OBSERVABILITY: ['receipt', 'reconciliation'],
});

function requiredString(value, label) {
  if (typeof value !== 'string' || value.trim() === '' || value === 'REQUIRED') {
    throw new Error(`${label} is required`);
  }
  return value;
}

function boundedId(value, label) {
  const text = requiredString(value, label);
  if (!SAFE_ID.test(text)) throw new Error(`${label} has invalid bounded identifier format`);
  return text;
}

function exactKeys(value, keys, label) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error(`${label} must be an object`);
  }
  if (Object.keys(value).sort().join(',') !== keys.slice().sort().join(',')) {
    throw new Error(`${label} must contain exactly the canonical keys`);
  }
}

function digest(bytes) {
  return createHash('sha256').update(bytes).digest('hex');
}

function safeTopLevelName(value, label) {
  const name = requiredString(value, label);
  if (name !== basename(name) || name === '.' || name === '..') {
    throw new Error(`${label} must be a bounded top-level evidence reference`);
  }
  if (
    name === 'evidence-manifest.sha256' ||
    name === 'evidence-manifest-preflight.sha256' ||
    name === 'reviewer-attestation.json'
  ) {
    throw new Error(`${label} cannot reference acceptance-control material`);
  }
  return name;
}

function readBoundFile(evidenceDirectory, name, expectedSha256, maxBytes, label) {
  const safe = safeTopLevelName(name, `${label}.reference`);
  const path = join(evidenceDirectory, safe);
  const entry = lstatSync(path);
  if (!entry.isFile() || entry.isSymbolicLink() || entry.nlink !== 1) {
    throw new Error(`${label} must be a regular single-link non-symlink file`);
  }
  if (dirname(realpathSync(path)) !== realpathSync(evidenceDirectory)) {
    throw new Error(`${label} escapes evidence root`);
  }
  if (entry.size <= 0 || entry.size > maxBytes) throw new Error(`${label} size is invalid`);
  const bytes = readFileSync(path);
  const actual = digest(bytes);
  if (actual !== expectedSha256) throw new Error(`${label} digest drift`);
  return bytes;
}

function manifestEvidence(bindingRole, label, manifestFiles, evidenceDirectory, usedReferences) {
  const reference = safeTopLevelName(
    bindingRole?.sourceEvidenceReference,
    `${label}.sourceEvidenceReference`,
  );
  const sha256 = requiredString(bindingRole?.sourceEvidenceSha256, `${label}.sourceEvidenceSha256`);
  if (!SHA256.test(sha256)) throw new Error(`${label}.sourceEvidenceSha256 has invalid format`);
  if (usedReferences.has(reference))
    throw new Error(`${label} reuses another semantic evidence file`);
  usedReferences.add(reference);
  const manifest = manifestFiles?.[reference];
  if (!manifest || manifest.sizeBytes <= 0 || manifest.sha256 !== sha256) {
    throw new Error(`${label} is not hash-bound to the trusted final manifest`);
  }
  readBoundFile(evidenceDirectory, reference, sha256, 8 * 1024 * 1024, label);
  return reference;
}

function requireFalse(value, label) {
  if (value !== false) throw new Error(`${label} must remain false`);
}

function scenario(dossier, path) {
  const [group, name] = path.split('.');
  return dossier.scenarios?.[group]?.[name];
}

function requireRecordReferences(record, label, references) {
  if (!record || record.status !== 'PASS' || !Array.isArray(record.evidenceReferences)) {
    throw new Error(`${label} must be PASS with evidenceReferences`);
  }
  for (const reference of references) {
    if (!record.evidenceReferences.includes(reference)) {
      throw new Error(`${label} must reference semantic evidence ${reference}`);
    }
  }
}

function validateAuthority(authority, rootActionIntentId, executionId) {
  exactKeys(
    authority,
    [
      'actionIntentId',
      'authorityReferenceKind',
      'policyTokenId',
      'decisionId',
      'currentAuthorityValidated',
      'executionEligible',
      'w07ExecutionAuthorizationExecutionId',
      'w07ExecutionAuthorizationSource',
      'w07ExecutionAuthorizationAuthorizesExecution',
      'w07ExecutionAuthorizationCancelled',
      'bindingAuthorizesExecution',
      'sourceEvidenceReference',
      'sourceEvidenceSha256',
    ],
    'authority',
  );
  if (boundedId(authority.actionIntentId, 'authority.actionIntentId') !== rootActionIntentId) {
    throw new Error('authority actionIntentId drift');
  }
  if (!AUTHORITY_KINDS.has(authority.authorityReferenceKind)) {
    throw new Error('authority.authorityReferenceKind is invalid');
  }
  const policyTokenId = authority.policyTokenId;
  const decisionId = authority.decisionId;
  if (authority.authorityReferenceKind === 'POLICY_TOKEN') {
    boundedId(policyTokenId, 'authority.policyTokenId');
    if (decisionId !== null) throw new Error('POLICY_TOKEN authority must not carry decisionId');
  } else if (authority.authorityReferenceKind === 'OWNER_DECISION') {
    boundedId(decisionId, 'authority.decisionId');
    if (policyTokenId !== null)
      throw new Error('OWNER_DECISION authority must not carry policyTokenId');
  } else {
    boundedId(policyTokenId, 'authority.policyTokenId');
    boundedId(decisionId, 'authority.decisionId');
  }
  if (authority.currentAuthorityValidated !== true || authority.executionEligible !== true) {
    throw new Error('authority must prove current W02/W07 eligibility');
  }
  if (
    boundedId(
      authority.w07ExecutionAuthorizationExecutionId,
      'authority.w07ExecutionAuthorizationExecutionId',
    ) !== executionId
  ) {
    throw new Error('W07 execution authorization executionId drift');
  }
  if (authority.w07ExecutionAuthorizationSource !== 'W07_CURRENT_EXECUTION_AUTHORITY') {
    throw new Error('W07 execution authorization source drift');
  }
  if (
    authority.w07ExecutionAuthorizationAuthorizesExecution !== true ||
    authority.w07ExecutionAuthorizationCancelled !== false
  ) {
    throw new Error('binding must prove one current non-cancelled W07 execution authorization');
  }
  requireFalse(authority.bindingAuthorizesExecution, 'authority.bindingAuthorizesExecution');
}

export function validateW15JGovernedExecutionBinding(dossier, trusted, evidenceDirectory) {
  if (!dossier || typeof dossier !== 'object') throw new Error('W15-J dossier is required');
  if (dossier.authorityInvariant !== 'INTELLIGENCE != AUTHORITY != EXECUTION') {
    throw new Error('dossier authority invariant drift');
  }
  if (
    trusted?.schemaVersion !== 'w15j-tablet-loopback-trusted-preflight-v1' ||
    trusted.physicallyAccepted !== false
  ) {
    throw new Error('trusted tablet-loopback preflight NOT_ACCEPTED state is required');
  }
  const manifestFiles = trusted.evidenceManifest?.files;
  const bindingManifest = manifestFiles?.[BINDING_FILE];
  if (!bindingManifest || bindingManifest.sizeBytes <= 0 || !SHA256.test(bindingManifest.sha256)) {
    throw new Error(`trusted final manifest must contain ${BINDING_FILE}`);
  }
  const bindingBytes = readBoundFile(
    evidenceDirectory,
    BINDING_FILE,
    bindingManifest.sha256,
    MAX_BINDING_BYTES,
    'governed execution binding',
  );
  let binding;
  try {
    binding = JSON.parse(bindingBytes.toString('utf8'));
  } catch {
    throw new Error('governed execution binding must be valid JSON');
  }
  exactKeys(
    binding,
    [
      'schemaVersion',
      'authorityInvariant',
      'actionIntentId',
      'authority',
      'w14Session',
      'w14Delivery',
      'w03DurableState',
      'nativeExecution',
      'receiptIngress',
      'w07OutcomeReconciliation',
      'semantics',
    ],
    'governed execution binding',
  );
  if (binding.schemaVersion !== 'w15j-governed-execution-binding-v1') {
    throw new Error('governed execution binding schema drift');
  }
  if (binding.authorityInvariant !== 'INTELLIGENCE != AUTHORITY != EXECUTION') {
    throw new Error('governed execution binding authority invariant drift');
  }
  const actionIntentId = boundedId(binding.actionIntentId, 'binding.actionIntentId');

  exactKeys(
    binding.w14Session,
    [
      'deviceSessionId',
      'trustState',
      'executionPreconditionSatisfied',
      'bindingAuthorizesExecution',
      'sourceEvidenceReference',
      'sourceEvidenceSha256',
    ],
    'w14Session',
  );
  const deviceSessionId = boundedId(
    binding.w14Session.deviceSessionId,
    'w14Session.deviceSessionId',
  );
  if (
    binding.w14Session.trustState !== 'ACTIVE' ||
    binding.w14Session.executionPreconditionSatisfied !== true
  ) {
    throw new Error('W14 session must prove current ACTIVE execution precondition');
  }
  requireFalse(
    binding.w14Session.bindingAuthorizesExecution,
    'w14Session.bindingAuthorizesExecution',
  );

  exactKeys(
    binding.w14Delivery,
    [
      'commandId',
      'executionId',
      'deviceSessionId',
      'deliveryReference',
      'durableIdempotencyReference',
      'bindingAuthorizesExecution',
      'sourceEvidenceReference',
      'sourceEvidenceSha256',
    ],
    'w14Delivery',
  );
  const commandId = boundedId(binding.w14Delivery.commandId, 'w14Delivery.commandId');
  const executionId = boundedId(binding.w14Delivery.executionId, 'w14Delivery.executionId');
  if (
    boundedId(binding.w14Delivery.deviceSessionId, 'w14Delivery.deviceSessionId') !==
    deviceSessionId
  ) {
    throw new Error('W14 delivery deviceSessionId drift');
  }
  const deliveryReference = boundedId(
    binding.w14Delivery.deliveryReference,
    'w14Delivery.deliveryReference',
  );
  const commandDurableReference = boundedId(
    binding.w14Delivery.durableIdempotencyReference,
    'w14Delivery.durableIdempotencyReference',
  );
  requireFalse(
    binding.w14Delivery.bindingAuthorizesExecution,
    'w14Delivery.bindingAuthorizesExecution',
  );

  validateAuthority(binding.authority, actionIntentId, executionId);

  exactKeys(
    binding.w03DurableState,
    [
      'commandDurableReference',
      'receiptDurableReference',
      'bindingAuthorizesExecution',
      'sourceEvidenceReference',
      'sourceEvidenceSha256',
    ],
    'w03DurableState',
  );
  if (
    boundedId(
      binding.w03DurableState.commandDurableReference,
      'w03DurableState.commandDurableReference',
    ) !== commandDurableReference
  ) {
    throw new Error('W03 command durable reference drift');
  }
  const receiptDurableReference = boundedId(
    binding.w03DurableState.receiptDurableReference,
    'w03DurableState.receiptDurableReference',
  );
  requireFalse(
    binding.w03DurableState.bindingAuthorizesExecution,
    'w03DurableState.bindingAuthorizesExecution',
  );

  exactKeys(
    binding.nativeExecution,
    [
      'executionId',
      'deviceSessionId',
      'capabilityId',
      'actionId',
      'outcome',
      'requiresReconciliation',
      'retryEligible',
      'bindingAuthorizesExecution',
      'sourceEvidenceReference',
      'sourceEvidenceSha256',
    ],
    'nativeExecution',
  );
  if (
    boundedId(binding.nativeExecution.executionId, 'nativeExecution.executionId') !== executionId
  ) {
    throw new Error('native executionId drift');
  }
  if (
    boundedId(binding.nativeExecution.deviceSessionId, 'nativeExecution.deviceSessionId') !==
    deviceSessionId
  ) {
    throw new Error('native deviceSessionId drift');
  }
  boundedId(binding.nativeExecution.capabilityId, 'nativeExecution.capabilityId');
  boundedId(binding.nativeExecution.actionId, 'nativeExecution.actionId');
  if (
    binding.nativeExecution.outcome !== 'SUCCEEDED' ||
    binding.nativeExecution.requiresReconciliation !== false ||
    binding.nativeExecution.retryEligible !== false
  ) {
    throw new Error('native execution must prove one verified success without retry authority');
  }
  requireFalse(
    binding.nativeExecution.bindingAuthorizesExecution,
    'nativeExecution.bindingAuthorizesExecution',
  );

  exactKeys(
    binding.receiptIngress,
    [
      'receiptId',
      'evidenceId',
      'commandId',
      'executionId',
      'deviceSessionId',
      'deliveryReference',
      'durableReference',
      'reportedState',
      'requiresW07Reconciliation',
      'authoritySemantics',
      'bindingAuthorizesExecution',
      'provesExecutionSuccess',
      'retryAuthorized',
      'sourceEvidenceReference',
      'sourceEvidenceSha256',
    ],
    'receiptIngress',
  );
  const receiptId = boundedId(binding.receiptIngress.receiptId, 'receiptIngress.receiptId');
  boundedId(binding.receiptIngress.evidenceId, 'receiptIngress.evidenceId');
  if (boundedId(binding.receiptIngress.commandId, 'receiptIngress.commandId') !== commandId) {
    throw new Error('receipt commandId drift');
  }
  if (boundedId(binding.receiptIngress.executionId, 'receiptIngress.executionId') !== executionId) {
    throw new Error('receipt executionId drift');
  }
  if (
    boundedId(binding.receiptIngress.deviceSessionId, 'receiptIngress.deviceSessionId') !==
    deviceSessionId
  ) {
    throw new Error('receipt deviceSessionId drift');
  }
  if (
    boundedId(binding.receiptIngress.deliveryReference, 'receiptIngress.deliveryReference') !==
    deliveryReference
  ) {
    throw new Error('receipt deliveryReference drift');
  }
  if (
    boundedId(binding.receiptIngress.durableReference, 'receiptIngress.durableReference') !==
    receiptDurableReference
  ) {
    throw new Error('receipt durable reference drift');
  }
  if (
    binding.receiptIngress.reportedState !== 'COMPLETED' ||
    binding.receiptIngress.requiresW07Reconciliation !== true ||
    binding.receiptIngress.authoritySemantics !== 'EVIDENCE_INPUT_ONLY_W07_OWNS_OUTCOME_AND_RETRY'
  ) {
    throw new Error('receipt ingress must remain evidence-only and reconciliation-owned by W07');
  }
  for (const field of ['bindingAuthorizesExecution', 'provesExecutionSuccess', 'retryAuthorized']) {
    requireFalse(binding.receiptIngress[field], `receiptIngress.${field}`);
  }

  exactKeys(
    binding.w07OutcomeReconciliation,
    [
      'actionIntentId',
      'executionId',
      'receiptId',
      'state',
      'reconciliationRequired',
      'retryEligibleAfterFreshGuards',
      'bindingAuthorizesExecution',
      'sourceEvidenceReference',
      'sourceEvidenceSha256',
    ],
    'w07OutcomeReconciliation',
  );
  if (
    boundedId(
      binding.w07OutcomeReconciliation.actionIntentId,
      'w07OutcomeReconciliation.actionIntentId',
    ) !== actionIntentId ||
    boundedId(
      binding.w07OutcomeReconciliation.executionId,
      'w07OutcomeReconciliation.executionId',
    ) !== executionId ||
    boundedId(binding.w07OutcomeReconciliation.receiptId, 'w07OutcomeReconciliation.receiptId') !==
      receiptId
  ) {
    throw new Error('W07 reconciliation identity drift');
  }
  if (
    binding.w07OutcomeReconciliation.state !== 'EFFECT_OBSERVED' ||
    binding.w07OutcomeReconciliation.reconciliationRequired !== false ||
    binding.w07OutcomeReconciliation.retryEligibleAfterFreshGuards !== false
  ) {
    throw new Error('W07 reconciliation must prove observed effect with no equivalent retry');
  }
  requireFalse(
    binding.w07OutcomeReconciliation.bindingAuthorizesExecution,
    'w07OutcomeReconciliation.bindingAuthorizesExecution',
  );

  exactKeys(
    binding.semantics,
    [
      'kind',
      'authorizesExecution',
      'provesExecutionSuccess',
      'retryAuthorized',
      'physicalAcceptance',
      'w16BuildUnblocked',
    ],
    'binding semantics',
  );
  if (binding.semantics.kind !== 'EVIDENCE_BINDING_ONLY') {
    throw new Error('binding semantics kind drift');
  }
  for (const field of [
    'authorizesExecution',
    'provesExecutionSuccess',
    'retryAuthorized',
    'physicalAcceptance',
    'w16BuildUnblocked',
  ]) {
    requireFalse(binding.semantics[field], `binding.semantics.${field}`);
  }

  const usedReferences = new Set();
  const references = Object.freeze({
    authority: manifestEvidence(
      binding.authority,
      'authority evidence',
      manifestFiles,
      evidenceDirectory,
      usedReferences,
    ),
    session: manifestEvidence(
      binding.w14Session,
      'W14 session evidence',
      manifestFiles,
      evidenceDirectory,
      usedReferences,
    ),
    delivery: manifestEvidence(
      binding.w14Delivery,
      'W14 delivery evidence',
      manifestFiles,
      evidenceDirectory,
      usedReferences,
    ),
    w03: manifestEvidence(
      binding.w03DurableState,
      'W03 durable evidence',
      manifestFiles,
      evidenceDirectory,
      usedReferences,
    ),
    native: manifestEvidence(
      binding.nativeExecution,
      'native execution evidence',
      manifestFiles,
      evidenceDirectory,
      usedReferences,
    ),
    receipt: manifestEvidence(
      binding.receiptIngress,
      'receipt ingress evidence',
      manifestFiles,
      evidenceDirectory,
      usedReferences,
    ),
    reconciliation: manifestEvidence(
      binding.w07OutcomeReconciliation,
      'W07 reconciliation evidence',
      manifestFiles,
      evidenceDirectory,
      usedReferences,
    ),
  });

  for (const [path, roles] of Object.entries(SCENARIO_EVIDENCE_REQUIREMENTS)) {
    requireRecordReferences(
      scenario(dossier, path),
      `scenario ${path}`,
      roles.map((role) => references[role]),
    );
  }
  for (const [gate, roles] of Object.entries(RISK_GATE_EVIDENCE_REQUIREMENTS)) {
    requireRecordReferences(
      dossier.riskGates?.[gate],
      `riskGate ${gate}`,
      roles.map((role) => references[role]),
    );
  }

  return Object.freeze({
    schemaVersion: binding.schemaVersion,
    actionIntentId,
    executionId,
    commandId,
    receiptId,
    deviceSessionId,
    evidenceRoleCount: usedReferences.size,
    readyForIndependentReview: true,
    physicallyAccepted: false,
    authorizesExecution: false,
    retryAuthorized: false,
    w16BuildUnblocked: false,
  });
}

export function loadAndValidateW15JGovernedExecutionBinding(
  dossierPath,
  trustedPath,
  evidenceDirectory,
) {
  return validateW15JGovernedExecutionBinding(
    JSON.parse(readFileSync(dossierPath, 'utf8')),
    JSON.parse(readFileSync(trustedPath, 'utf8')),
    evidenceDirectory,
  );
}

if (process.argv[1]?.endsWith('w15j-governed-execution-binding.mjs')) {
  const dossierPath = process.argv[2];
  const trustedPath = process.argv[3];
  const evidenceDirectory = process.argv[4];
  if (!dossierPath || !trustedPath || !evidenceDirectory) {
    console.error(
      'Usage: node tools/acceptance/w15j-governed-execution-binding.mjs <w15j-evidence.json> <trusted-preflight.json> <finalized-evidence-directory>',
    );
    process.exitCode = 2;
  } else {
    try {
      const result = loadAndValidateW15JGovernedExecutionBinding(
        dossierPath,
        trustedPath,
        evidenceDirectory,
      );
      console.log(
        `W15J_GOVERNED_EXECUTION_BINDING_READY_NOT_ACCEPTED actionIntent=${result.actionIntentId} execution=${result.executionId} roles=${result.evidenceRoleCount}`,
      );
    } catch (error) {
      console.error(`W15J_GOVERNED_EXECUTION_BINDING_BLOCKED: ${error.message}`);
      process.exitCode = 1;
    }
  }
}
