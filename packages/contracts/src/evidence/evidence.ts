import type {
  ActorRef,
  CorrelationContext,
  DataClassification,
  Rfc3339Timestamp,
} from '../context';
import type { ExecutionTargetReference } from '../execution-target';
import type { ActionIntentId, EvidenceId, ExecutionId, ReceiptId } from '../ids';
import type { ContractVersion } from '../versioning';
import type { ExternalReference, JsonObject, RestrictedMetadata } from '../actions';

export type EvidenceSubject =
  | Readonly<{ kind: 'ACTION_INTENT'; actionIntentId: ActionIntentId }>
  | Readonly<{ kind: 'RECEIPT'; receiptId: ReceiptId }>
  | Readonly<{ kind: 'EXECUTION'; executionId: ExecutionId }>
  | Readonly<{ kind: 'EXTERNAL_REFERENCE'; reference: ExternalReference }>;

export type EvidenceType =
  | 'READBACK'
  | 'EXECUTION_RECEIPT'
  | 'PROVIDER_RECEIPT'
  | 'STATE_SNAPSHOT'
  | 'SIGNED_ATTESTATION'
  | 'REFERENCE';

export type EvidenceVerificationState = 'UNVERIFIED' | 'VERIFIED' | 'REJECTED';

export interface EvidenceSource {
  readonly sourceType: 'TARGET_READBACK' | 'PROVIDER_READBACK' | 'EXECUTOR' | 'SYSTEM' | 'HUMAN';
  readonly capturedBy?: ActorRef;
  /** Legacy provider provenance retained for provider-specific historical evidence. */
  readonly provider?: string;
  /** Generic target provenance; target identity/availability is never authority. */
  readonly executionTarget?: ExecutionTargetReference;
  readonly reference?: ExternalReference;
}

export interface EvidenceVerification {
  readonly state: EvidenceVerificationState;
  readonly verifiedAt?: Rfc3339Timestamp;
  readonly verifier?: ActorRef;
  readonly method?: string;
}

export interface EvidenceReadback {
  readonly reference: ExternalReference;
  readonly observedState?: JsonObject;
}

export interface EvidenceIntegrity {
  readonly algorithm: string;
  readonly digest: string;
  readonly signatureReference?: ExternalReference;
}

export interface EvidenceProvenance {
  readonly capturedBy?: ActorRef;
  readonly sourceReference?: ExternalReference;
  readonly parentEvidenceReferences?: readonly ExternalReference[];
}

/**
 * Governed proof material. Evidence verification concerns provenance/integrity of
 * the evidence item itself and does not automatically promote execution outcome.
 */
export interface Evidence {
  readonly kind: 'EVIDENCE';
  readonly schemaVersion: ContractVersion;
  readonly evidenceId: EvidenceId;
  readonly subject: EvidenceSubject;
  readonly evidenceType: EvidenceType;
  readonly capturedAt: Rfc3339Timestamp;
  readonly source: EvidenceSource;
  readonly correlation: CorrelationContext;
  readonly verification: EvidenceVerification;
  readonly readback?: EvidenceReadback;
  readonly integrity?: EvidenceIntegrity;
  readonly provenance: EvidenceProvenance;
  readonly dataClassification: DataClassification;
  readonly metadata?: RestrictedMetadata;
}
