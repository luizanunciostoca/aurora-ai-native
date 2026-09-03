export const W09_WORKFLOW_MIGRATION_CATEGORIES = [
  'RE_SPECIFY_SAFE_CANDIDATE',
  'REFERENCE_ONLY_DOMAIN_PATTERN',
  'REFERENCE_ONLY_PROVIDER_PATTERN',
  'HIGH_RISK_INDEX_ONLY',
  'REJECT_SECRET_OR_ID_LEAK',
  'REJECT_DUPLICATE_OR_INVALID',
  'LICENSE_PROVENANCE_HOLD',
] as const;

export type W09WorkflowMigrationCategory = (typeof W09_WORKFLOW_MIGRATION_CATEGORIES)[number];

export const W09_SANITIZED_NODE_KINDS = [
  'EVENT_TRIGGER',
  'WEBHOOK_TRIGGER',
  'SCHEDULE_TRIGGER',
  'READ_ONLY_INTEGRATION',
  'AURORA_ACTION_REQUEST',
  'DOMAIN_DECISION',
  'PROVIDER_DIRECT_WRITE',
  'W07_GOVERNED_EXECUTION',
  'W08_PROVIDER_ADAPTER',
  'SHELL',
  'SSH',
  'EXECUTE_COMMAND',
] as const;

export type W09SanitizedNodeKind = (typeof W09_SANITIZED_NODE_KINDS)[number];

export type W09WorkflowLicenseStatus =
  'AURORA_OWNED' | 'REFERENCE_ONLY' | 'PROVENANCE_ACCEPTED' | 'PROVENANCE_HOLD';

export interface W09SanitizedTopologyNode {
  readonly nodeReference: string;
  readonly kind: W09SanitizedNodeKind;
}

/**
 * Sanitized migration input. It intentionally excludes raw n8n JSON, pinData,
 * credential values and provider/environment identifiers.
 */
export interface W09SanitizedWorkflowCandidate {
  readonly candidateId: string;
  readonly tenantId: string;
  readonly capabilityId: string;
  readonly domain: string;
  readonly sourceReference: string;
  readonly sourceHash: string;
  readonly sanitizerVersion: string;
  readonly licenseStatus: W09WorkflowLicenseStatus;
  readonly topology: readonly W09SanitizedTopologyNode[];
  readonly sideEffecting: boolean;
  readonly validStructure: boolean;
  readonly duplicateOfCandidateId: string | null;
  readonly containsSensitiveMaterial: boolean;
  readonly containsPrivateStaticIdentifier: boolean;
  readonly verbatimReuseRequested: boolean;
}

export interface W09WorkflowMigrationClassification {
  readonly candidateId: string;
  readonly category: W09WorkflowMigrationCategory;
  readonly reasons: readonly string[];
  readonly sourceReference: string;
  readonly sourceHash: string;
  readonly licenseStatus: W09WorkflowLicenseStatus;
  readonly authorizesExecution: false;
  readonly canGrantPermission: false;
}

export type W09CanonicalMigrationStep =
  | 'W03_GOVERNED_TRIGGER_CONTEXT'
  | 'W04_CAPABILITY_BINDING'
  | 'CURRENT_POLICY_AUTHORITY'
  | 'W07_GOVERNED_EXECUTOR'
  | 'W08_PROVIDER_ADAPTER'
  | 'W08_READ_ONLY_PROVIDER_PATH'
  | 'W07_RECEIPT_READBACK_EVIDENCE';

export interface W09CuratedMigrationPlan {
  readonly planKind: 'W09_CURATED_WORKFLOW_MIGRATION_PLAN';
  readonly candidateId: string;
  readonly tenantId: string;
  readonly capabilityId: string;
  readonly domain: string;
  readonly sourceReference: string;
  readonly sourceHash: string;
  readonly sanitizerVersion: string;
  readonly licenseStatus: W09WorkflowLicenseStatus;
  readonly sideEffecting: boolean;
  readonly topology: readonly W09CanonicalMigrationStep[];
  readonly maxProviderMutationAttempts: 1;
  readonly retryBoundary: 'W07_RECONCILE_BEFORE_RETRY';
  readonly rawCorpusPromotionAllowed: false;
  readonly localServiceExecutionAllowed: false;
  readonly authorizesExecution: false;
  readonly canGrantPermission: false;
}

export type W09CuratedMigrationResult =
  | Readonly<{
      status: 'READY';
      classification: W09WorkflowMigrationClassification;
      plan: W09CuratedMigrationPlan;
    }>
  | Readonly<{
      status: 'REFERENCE_ONLY' | 'BLOCKED';
      classification: W09WorkflowMigrationClassification;
    }>;
