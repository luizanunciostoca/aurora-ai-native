export type N8nWorkflowBindingStatus =
  | 'CANDIDATE'
  | 'ACTIVE'
  | 'SUPERSEDED'
  | 'DISABLED'
  | 'REVOKED';

export type N8nWorkflowBindingSourceKind =
  | 'AURORA_NATIVE'
  | 'SANITIZED_CORPUS'
  | 'GOVERNED_MIGRATION';

export type N8nWorkflowBindingLicenseStatus =
  | 'AURORA_OWNED'
  | 'REFERENCE_ONLY'
  | 'PROVENANCE_ACCEPTED'
  | 'PROVENANCE_HOLD';

export interface N8nExternalWorkflowReference {
  /** Opaque n8n-side workflow reference. It is never an Aurora authority identifier. */
  readonly workflowReference: string;
  readonly workflowVersion: string;
  readonly workflowHash: string;
}

export interface N8nWorkflowCapabilityBinding {
  /** Existing W04 Capability Registry identity; W09 never defines capability truth. */
  readonly capabilityId: string;
  readonly capabilityVersion: string;
  readonly registryVersion: string;
}

export interface N8nWorkflowSanitizedLineage {
  readonly corpusReference: string;
  readonly sourceEntryHash: string;
  readonly sanitizerVersion: string;
}

export interface N8nWorkflowBindingProvenance {
  readonly sourceKind: N8nWorkflowBindingSourceKind;
  readonly sourceReference: string;
  readonly sourceHash: string;
  readonly licenseStatus: N8nWorkflowBindingLicenseStatus;
  /** Sanitized provenance only. Raw workflow material, credentials and pinData are prohibited. */
  readonly sanitizedLineage: N8nWorkflowSanitizedLineage | null;
}

export interface N8nWorkflowCredentialRequirement {
  /** Opaque W09-C-resolvable reference. Secret values are never stored by W09-A. */
  readonly credentialReference: string;
  readonly integration: string;
}

export interface N8nWorkflowBindingCompatibility {
  readonly contractVersion: string;
  readonly requiredTargetClasses: readonly string[];
  readonly integrationPrerequisites: readonly string[];
}

/**
 * Canonical W09-A binding projection.
 *
 * Registration content is immutable. Lifecycle state may only change through append-only registry
 * transitions; a changed workflow topology must register a new bindingVersion/workflowHash.
 * The contract is deliberately non-authoritative.
 */
export interface N8nWorkflowBinding {
  readonly kind: 'N8N_WORKFLOW_BINDING';
  readonly bindingId: string;
  readonly bindingVersion: string;
  /** Opaque canonical W01 tenant reference consumed by W09; W09 does not mint tenant identity. */
  readonly tenantId: string;
  readonly workflow: N8nExternalWorkflowReference;
  readonly capability: N8nWorkflowCapabilityBinding;
  readonly provenance: N8nWorkflowBindingProvenance;
  readonly credentialRequirements: readonly N8nWorkflowCredentialRequirement[];
  readonly compatibility: N8nWorkflowBindingCompatibility;
  readonly status: N8nWorkflowBindingStatus;
  readonly registeredAt: string;
  /** Exact prior binding version expected to be superseded when this version becomes ACTIVE. */
  readonly supersedesVersion: string | null;
  readonly authorizesExecution: false;
  readonly canGrantPermission: false;
}

export interface N8nWorkflowBindingLookup {
  readonly tenantId: string;
  readonly bindingId: string;
  readonly bindingVersion: string;
  readonly expectedWorkflowReference?: string;
  readonly expectedWorkflowVersion?: string;
  readonly expectedWorkflowHash?: string;
  readonly expectedCapabilityId?: string;
  readonly expectedCapabilityVersion?: string;
  readonly expectedCapabilityRegistryVersion?: string;
  readonly expectedContractVersion?: string;
}

export type N8nWorkflowBindingValidationError =
  | 'INVALID_SCHEMA'
  | 'INVALID_IDENTIFIER'
  | 'INVALID_VERSION'
  | 'INVALID_HASH'
  | 'INVALID_TIMESTAMP'
  | 'INVALID_PROVENANCE'
  | 'INVALID_INITIAL_STATUS'
  | 'SENSITIVE_MATERIAL_PROHIBITED'
  | 'DUPLICATE_REQUIREMENT';

export type N8nWorkflowBindingRegistryError =
  | N8nWorkflowBindingValidationError
  | 'DUPLICATE_BINDING_VERSION'
  | 'UNKNOWN_BINDING'
  | 'CROSS_TENANT_BINDING'
  | 'STALE_BINDING'
  | 'SUPERSEDED_BINDING'
  | 'DISABLED_BINDING'
  | 'REVOKED_BINDING'
  | 'INCOMPATIBLE_WORKFLOW'
  | 'INCOMPATIBLE_CAPABILITY'
  | 'INCOMPATIBLE_CONTRACT'
  | 'INVALID_LIFECYCLE_TRANSITION'
  | 'INVALID_SUPERSESSION';

export type N8nWorkflowBindingResult<T> =
  | { readonly ok: true; readonly value: T }
  | { readonly ok: false; readonly error: N8nWorkflowBindingRegistryError };

export interface N8nWorkflowBindingLifecycleEvent {
  readonly sequence: number;
  readonly tenantId: string;
  readonly bindingId: string;
  readonly bindingVersion: string;
  readonly from: N8nWorkflowBindingStatus | null;
  readonly to: N8nWorkflowBindingStatus;
  readonly occurredAt: string;
  readonly reason: string;
}

export interface N8nWorkflowBindingRegistrySnapshot {
  readonly bindings: readonly N8nWorkflowBinding[];
  readonly lifecycle: readonly N8nWorkflowBindingLifecycleEvent[];
  readonly authorizesExecution: false;
  readonly canGrantPermission: false;
}
