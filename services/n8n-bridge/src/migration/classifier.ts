import type {
  W09CanonicalMigrationStep,
  W09CuratedMigrationResult,
  W09SanitizedNodeKind,
  W09SanitizedWorkflowCandidate,
  W09WorkflowMigrationCategory,
  W09WorkflowMigrationClassification,
} from './types.js';

const HASH_PATTERN = /^sha256:[0-9a-f]{64}$/i;
const HIGH_RISK_NODE_KINDS: readonly W09SanitizedNodeKind[] = ['SHELL', 'SSH', 'EXECUTE_COMMAND'];

function nonEmpty(value: string): boolean {
  return value.trim().length > 0;
}

function hasNodeKind(candidate: W09SanitizedWorkflowCandidate, kind: W09SanitizedNodeKind): boolean {
  return candidate.topology.some((node) => node.kind === kind);
}

function classification(
  candidate: W09SanitizedWorkflowCandidate,
  category: W09WorkflowMigrationCategory,
  reasons: readonly string[],
): W09WorkflowMigrationClassification {
  return {
    candidateId: candidate.candidateId,
    category,
    reasons,
    sourceReference: candidate.sourceReference,
    sourceHash: candidate.sourceHash,
    licenseStatus: candidate.licenseStatus,
    authorizesExecution: false,
    canGrantPermission: false,
  };
}

function safeTopology(sideEffecting: boolean): readonly W09CanonicalMigrationStep[] {
  if (!sideEffecting) {
    return [
      'W03_GOVERNED_TRIGGER_CONTEXT',
      'W04_CAPABILITY_BINDING',
      'W08_READ_ONLY_PROVIDER_PATH',
      'W07_RECEIPT_READBACK_EVIDENCE',
    ];
  }

  return [
    'W03_GOVERNED_TRIGGER_CONTEXT',
    'W04_CAPABILITY_BINDING',
    'CURRENT_POLICY_AUTHORITY',
    'W07_GOVERNED_EXECUTOR',
    'W08_PROVIDER_ADAPTER',
    'W07_RECEIPT_READBACK_EVIDENCE',
  ];
}

export function classifyW09WorkflowCandidate(
  candidate: W09SanitizedWorkflowCandidate,
): W09WorkflowMigrationClassification {
  if (
    !candidate.validStructure ||
    candidate.topology.length === 0 ||
    candidate.duplicateOfCandidateId !== null ||
    !nonEmpty(candidate.candidateId) ||
    !nonEmpty(candidate.tenantId) ||
    !nonEmpty(candidate.capabilityId) ||
    !nonEmpty(candidate.domain) ||
    !nonEmpty(candidate.sourceReference) ||
    !nonEmpty(candidate.sanitizerVersion) ||
    !HASH_PATTERN.test(candidate.sourceHash) ||
    candidate.topology.some((node) => !nonEmpty(node.nodeReference))
  ) {
    return classification(candidate, 'REJECT_DUPLICATE_OR_INVALID', [
      'Candidate is invalid, structurally empty, duplicated, or missing canonical sanitized provenance.',
    ]);
  }

  if (candidate.containsSensitiveMaterial || candidate.containsPrivateStaticIdentifier) {
    return classification(candidate, 'REJECT_SECRET_OR_ID_LEAK', [
      'Sanitized candidate still contains sensitive material or a private static identifier.',
    ]);
  }

  if (
    candidate.licenseStatus === 'PROVENANCE_HOLD' ||
    (candidate.verbatimReuseRequested && candidate.licenseStatus !== 'AURORA_OWNED' && candidate.licenseStatus !== 'PROVENANCE_ACCEPTED')
  ) {
    return classification(candidate, 'LICENSE_PROVENANCE_HOLD', [
      'Verbatim reuse is not permitted until provenance and license acceptance are explicit.',
    ]);
  }

  if (candidate.topology.some((node) => HIGH_RISK_NODE_KINDS.includes(node.kind))) {
    return classification(candidate, 'HIGH_RISK_INDEX_ONLY', [
      'Shell, SSH, and Execute Command patterns remain index-only without a future governed LOCAL_SERVICE capability.',
    ]);
  }

  if (hasNodeKind(candidate, 'PROVIDER_DIRECT_WRITE')) {
    return classification(candidate, 'REFERENCE_ONLY_PROVIDER_PATTERN', [
      'Direct provider mutation must be re-owned behind the accepted W07/W08 execution path.',
    ]);
  }

  if (hasNodeKind(candidate, 'DOMAIN_DECISION')) {
    return classification(candidate, 'REFERENCE_ONLY_DOMAIN_PATTERN', [
      'Business/domain decision logic remains owned by the applicable Aurora domain wave.',
    ]);
  }

  if (candidate.sideEffecting && !hasNodeKind(candidate, 'AURORA_ACTION_REQUEST') && !hasNodeKind(candidate, 'W07_GOVERNED_EXECUTION')) {
    return classification(candidate, 'REFERENCE_ONLY_PROVIDER_PATTERN', [
      'Side-effecting topology lacks an Aurora governed action/execution boundary and cannot be promoted as-is.',
    ]);
  }

  return classification(candidate, 'RE_SPECIFY_SAFE_CANDIDATE', [
    'Candidate can be semantically re-specified against current Aurora contracts without importing raw workflow truth.',
  ]);
}

export function prepareW09CuratedMigration(
  candidate: W09SanitizedWorkflowCandidate,
): W09CuratedMigrationResult {
  const result = classifyW09WorkflowCandidate(candidate);

  if (result.category !== 'RE_SPECIFY_SAFE_CANDIDATE') {
    const status = result.category.startsWith('REFERENCE_ONLY') || result.category === 'HIGH_RISK_INDEX_ONLY'
      ? 'REFERENCE_ONLY'
      : 'BLOCKED';
    return { status, classification: result };
  }

  return {
    status: 'READY',
    classification: result,
    plan: {
      planKind: 'W09_CURATED_WORKFLOW_MIGRATION_PLAN',
      candidateId: candidate.candidateId,
      tenantId: candidate.tenantId,
      capabilityId: candidate.capabilityId,
      domain: candidate.domain,
      sourceReference: candidate.sourceReference,
      sourceHash: candidate.sourceHash,
      sanitizerVersion: candidate.sanitizerVersion,
      licenseStatus: candidate.licenseStatus,
      sideEffecting: candidate.sideEffecting,
      topology: safeTopology(candidate.sideEffecting),
      maxProviderMutationAttempts: 1,
      retryBoundary: 'W07_RECONCILE_BEFORE_RETRY',
      rawCorpusPromotionAllowed: false,
      localServiceExecutionAllowed: false,
      authorizesExecution: false,
      canGrantPermission: false,
    },
  };
}
