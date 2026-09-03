import type { N8nWorkflowBinding } from '../bindings/index.js';

export const N8N_WORKFLOW_CREDENTIAL_STATES = ['ACTIVE', 'ROTATED', 'REVOKED', 'STALE'] as const;
export type N8nWorkflowCredentialState = (typeof N8N_WORKFLOW_CREDENTIAL_STATES)[number];

/**
 * Opaque W09-C credential-reference metadata.
 *
 * This record points at credential material owned by an external secret/provider boundary. It never
 * contains the credential itself and never grants Aurora execution authority.
 */
export interface N8nWorkflowCredentialReference {
  readonly kind: 'N8N_WORKFLOW_CREDENTIAL_REFERENCE';
  readonly schemaVersion: string;
  readonly credentialReference: string;
  readonly tenantId: string;
  readonly bindingId: string;
  readonly bindingVersion: string;
  readonly workflowReference: string;
  readonly workflowVersion: string;
  readonly workflowHash: string;
  readonly integration: string;
  readonly provider: string | null;
  readonly state: N8nWorkflowCredentialState;
  readonly credentialVersion: number;
  readonly updatedAt: string;
  readonly expiresAt: string | null;
  readonly authorizesExecution: false;
  readonly canGrantPermission: false;
}

export interface N8nWorkflowCredentialResolutionRequest {
  readonly tenantId: string;
  /** Must be an ACTIVE W09-A binding resolved from the current governed registry. */
  readonly binding: N8nWorkflowBinding;
  /** Runtime input is unknown so secret-bearing/accessor/extra-field objects fail closed. */
  readonly credentialReference: unknown;
  readonly expectedIntegration: string;
  readonly expectedProvider: string | null;
  readonly now: string;
}

/** Safe metadata passed to the existing secret/provider owner. No secret value is present. */
export interface N8nWorkflowCredentialBackendLookup {
  readonly credentialReference: string;
  readonly tenantId: string;
  readonly bindingId: string;
  readonly bindingVersion: string;
  readonly workflowReference: string;
  readonly workflowVersion: string;
  readonly workflowHash: string;
  readonly integration: string;
  readonly provider: string | null;
  readonly credentialVersion: number;
}

export type N8nTransientCredentialConsumer = (credential: string) => void | Promise<void>;

/**
 * Adapter port to the existing credential owner. Implementations expose plaintext only inside the
 * transient callback and must not return it to W09-C.
 */
export interface N8nWorkflowCredentialBackend {
  withCredential(
    lookup: N8nWorkflowCredentialBackendLookup,
    consumeTransientCredential: N8nTransientCredentialConsumer,
  ): Promise<void>;
}

export const N8N_WORKFLOW_CREDENTIAL_ERRORS = [
  'REQUEST_MALFORMED',
  'BINDING_MALFORMED',
  'BINDING_UNAVAILABLE',
  'REFERENCE_MALFORMED',
  'SENSITIVE_MATERIAL_PROHIBITED',
  'TENANT_MISMATCH',
  'BINDING_MISMATCH',
  'WORKFLOW_MISMATCH',
  'INTEGRATION_MISMATCH',
  'PROVIDER_MISMATCH',
  'REFERENCE_NOT_REQUIRED',
  'CREDENTIAL_REVOKED',
  'CREDENTIAL_ROTATED',
  'CREDENTIAL_STALE',
  'CREDENTIAL_EXPIRED',
  'CREDENTIAL_UNAVAILABLE',
  'CREDENTIAL_CONSUMPTION_UNCERTAIN',
  'BACKEND_PROTOCOL_VIOLATION',
  'CONSUMER_FAILED',
] as const;
export type N8nWorkflowCredentialError = (typeof N8N_WORKFLOW_CREDENTIAL_ERRORS)[number];

export interface N8nWorkflowCredentialResolutionSuccess {
  readonly ok: true;
  readonly credentialReference: string;
  readonly credentialVersion: number;
  readonly consumedAt: string;
  readonly authorizesExecution: false;
  readonly canGrantPermission: false;
}

export interface N8nWorkflowCredentialResolutionFailure {
  readonly ok: false;
  readonly error: N8nWorkflowCredentialError;
  readonly authorizesExecution: false;
  readonly canGrantPermission: false;
}

export type N8nWorkflowCredentialResolutionResult =
  | N8nWorkflowCredentialResolutionSuccess
  | N8nWorkflowCredentialResolutionFailure;
