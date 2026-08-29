import type { ActionIntentId, EvidenceId, ExecutionId, ReceiptId } from '../ids/index.js';
import type {
  CorrelationContext,
  DataClassification,
  IdentityReference,
} from '../context/index.js';
import type { ContractVersion } from '../versioning/index.js';
import type { ExternalReference, JsonObject, RestrictedMetadata } from '../actions/index.js';

export type EvidenceSubject =
  | Readonly<{ kind: 'ACTION_INTENT'; actionIntentId: ActionIntentId }>
  | Readonly<{ kind: 'RECEIPT'; receiptId: ReceiptId }>
  | Readonly<{ kind: 'EXECUTION'; executionId: ExecutionId }>
  | Readonly<{ kind: 'EXTERNAL_REFERENCE'; reference: ExternalReference }>;

export type EvidenceType =
  | 'READBACK'
  | 'PROVIDER_RECEIPT'
  | 'STATE_SNAPSHOT'
  | 'SIGNED_ATTESTATION'
  | 'REFERENCE';

export type EvidenceVerificationState = 'UNVERIFIED' | 'VERIFIED' | 'REJECTED';

export interface EvidenceSource {
  readonly sourceType: 'PROVIDER_READBACK' | 'EXECUTOR' | 'SYSTEM' | 'HUMAN';
  readonly capturedBy?: IdentityReference;
  readonly provider?: string;
  readonly reference?: ExternalReference;
}

export interface EvidenceVerification {
  readonly state: EvidenceVerificationState;
  readonly verifiedAt?: string;
  readonly verifier?: IdentityReference;
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
  readonly capturedBy?: IdentityReference;
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
  readonly capturedAt: string;
  readonly source: EvidenceSource;
  readonly correlation: CorrelationContext;
  readonly verification: EvidenceVerification;
  readonly readback?: EvidenceReadback;
  readonly integrity?: EvidenceIntegrity;
  readonly provenance: EvidenceProvenance;
  readonly dataClassification: DataClassification;
  readonly metadata?: RestrictedMetadata;
}
