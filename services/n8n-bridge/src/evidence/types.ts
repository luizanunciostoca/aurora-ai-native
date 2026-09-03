import type { N8nWorkflowBinding } from '../bindings/index.js';

export const N8N_WORKFLOW_RUN_STATES = [
  'STARTED',
  'COMPLETED',
  'FAILED',
  'CANCELLED',
  'EXECUTION_UNCERTAIN',
] as const;
export type N8nWorkflowRunState = (typeof N8N_WORKFLOW_RUN_STATES)[number];

export const N8N_W07_FORWARDING_STATES = [
  'ACKNOWLEDGED',
  'READBACK_MATCH',
  'READBACK_MISMATCH',
  'READBACK_UNKNOWN',
  'EXECUTION_UNCERTAIN',
] as const;
export type N8nW07ForwardingState = (typeof N8N_W07_FORWARDING_STATES)[number];

export interface N8nWorkflowEvidenceProvenance {
  readonly bindingSourceKind: N8nWorkflowBinding['provenance']['sourceKind'];
  readonly bindingSourceReference: string;
  readonly bindingSourceHash: string;
  readonly bindingLicenseStatus: N8nWorkflowBinding['provenance']['licenseStatus'];
}

interface N8nWorkflowForwardingBase {
  readonly schemaVersion: string;
  readonly forwardingId: string;
  readonly sequence: number;
  readonly tenantId: string;
  readonly bindingId: string;
  readonly bindingVersion: string;
  readonly workflowReference: string;
  readonly workflowVersion: string;
  readonly workflowHash: string;
  readonly workflowRunReference: string;
  readonly correlationId: string;
  readonly causationId: string | null;
  readonly occurredAt: string;
  readonly provenance: N8nWorkflowEvidenceProvenance;
  readonly authorizesExecution: false;
  readonly verifiedExternalState: false;
  readonly canGrantRetry: false;
}

export interface N8nWorkflowStatusForwarding extends N8nWorkflowForwardingBase {
  readonly kind: 'N8N_WORKFLOW_STATUS_FORWARDING';
  readonly workflowState: N8nWorkflowRunState;
  /** Opaque references to sanitized/minimized output artifacts only. */
  readonly safeOutputReferences: readonly string[];
  /** Opaque sanitized failure reference; raw error text is prohibited. */
  readonly errorReference: string | null;
}

export interface N8nW07EvidenceReferenceForwarding extends N8nWorkflowForwardingBase {
  readonly kind: 'N8N_W07_EVIDENCE_REFERENCE_FORWARDING';
  readonly w07State: N8nW07ForwardingState;
  readonly receiptReference: string;
  readonly evidenceReference: string | null;
}

export type N8nWorkflowForwardingEvent =
  N8nWorkflowStatusForwarding | N8nW07EvidenceReferenceForwarding;

export interface N8nWorkflowForwardingRequest {
  readonly binding: N8nWorkflowBinding;
  readonly event: unknown;
}

export const N8N_WORKFLOW_FORWARDING_ERRORS = [
  'REQUEST_MALFORMED',
  'BINDING_MALFORMED',
  'BINDING_UNAVAILABLE',
  'EVENT_MALFORMED',
  'SENSITIVE_MATERIAL_PROHIBITED',
  'TENANT_MISMATCH',
  'BINDING_MISMATCH',
  'WORKFLOW_MISMATCH',
  'PROVENANCE_MISMATCH',
  'READBACK_EVIDENCE_REQUIRED',
  'ACKNOWLEDGEMENT_EVIDENCE_CONFLICT',
  'DUPLICATE_EVENT_CONFLICT',
  'SEQUENCE_CONFLICT',
  'SEQUENCE_GAP',
  'CHAIN_CONTEXT_MISMATCH',
  'WORKFLOW_STATE_REGRESSION',
  'EMPTY_CHAIN',
] as const;
export type N8nWorkflowForwardingError = (typeof N8N_WORKFLOW_FORWARDING_ERRORS)[number];

export type N8nWorkflowForwardingResult =
  | Readonly<{
      ok: true;
      event: N8nWorkflowForwardingEvent;
      authorizesExecution: false;
      verifiedExternalState: false;
      canGrantRetry: false;
    }>
  | Readonly<{
      ok: false;
      error: N8nWorkflowForwardingError;
      authorizesExecution: false;
      verifiedExternalState: false;
      canGrantRetry: false;
    }>;

export interface N8nWorkflowEvidenceChain {
  readonly tenantId: string;
  readonly bindingId: string;
  readonly bindingVersion: string;
  readonly workflowReference: string;
  readonly workflowVersion: string;
  readonly workflowHash: string;
  readonly workflowRunReference: string;
  readonly correlationId: string;
  readonly currentWorkflowState: N8nWorkflowRunState | null;
  readonly lastSequence: number;
  readonly events: readonly N8nWorkflowForwardingEvent[];
  readonly w07References: readonly N8nW07EvidenceReferenceForwarding[];
  readonly authorizesExecution: false;
  readonly verifiedExternalState: false;
  readonly canGrantRetry: false;
}

export type N8nWorkflowEvidenceChainResult =
  | Readonly<{ ok: true; chain: N8nWorkflowEvidenceChain }>
  | Readonly<{
      ok: false;
      error: N8nWorkflowForwardingError;
      authorizesExecution: false;
      verifiedExternalState: false;
      canGrantRetry: false;
    }>;
