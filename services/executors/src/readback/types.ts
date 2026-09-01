import type { ActionIntent, ExternalReference, JsonObject } from '@aurora/contracts/actions';
import type { Rfc3339Timestamp } from '@aurora/contracts/context';
import type { Evidence } from '@aurora/contracts/evidence';
import type { TargetedReceipt } from '@aurora/contracts/receipts';
import type { ContractVersion } from '@aurora/contracts/versioning';

export interface CreateTargetedReceiptRequest {
  readonly schemaVersion: ContractVersion;
  readonly actionIntent: ActionIntent;
  readonly receiptId: TargetedReceipt['receiptId'];
  readonly executionId?: TargetedReceipt['executionId'];
  readonly executor: TargetedReceipt['executor'];
  readonly attempt: number;
  readonly attemptedAt: Rfc3339Timestamp;
  readonly acknowledgedAt?: Rfc3339Timestamp;
  readonly returnedAt?: Rfc3339Timestamp;
  readonly executionOutcome?: TargetedReceipt['executionOutcome'];
}

export type ReceiptCreationReason =
  | 'RECEIPT_SCHEMA_MISMATCH'
  | 'EXECUTION_TARGET_REQUIRED'
  | 'RECEIPT_ATTEMPT_INVALID'
  | 'RECEIPT_TIME_INVALID'
  | 'RECEIPT_TIME_ORDER_INVALID';

export type ReceiptCreationResult =
  | Readonly<{
      status: 'CREATED';
      receipt: TargetedReceipt;
      acknowledgementIsVerifiedExternalState: false;
      authorizesExecution: false;
    }>
  | Readonly<{
      status: 'REJECTED';
      reasons: readonly ReceiptCreationReason[];
      authorizesExecution: false;
    }>;

export interface TargetReadbackRequest {
  readonly schemaVersion: ContractVersion;
  readonly actionIntent: ActionIntent;
  readonly receipt: TargetedReceipt;
}

export interface TargetReadbackObservation {
  readonly capturedAt: Rfc3339Timestamp;
  readonly reference: ExternalReference;
  readonly observedState?: JsonObject;
}

/** Generic W07 port. Concrete provider/device/workflow/local readback remains consumer-wave owned. */
export type TargetReadbackPort = (request: TargetReadbackRequest) => TargetReadbackObservation;

export interface CaptureReadbackEvidenceRequest {
  readonly schemaVersion: ContractVersion;
  readonly evidenceId: Evidence['evidenceId'];
  readonly actionIntent: ActionIntent;
  readonly receipt: TargetedReceipt;
  readonly readback: TargetReadbackPort;
}

export type ReadbackVerificationState = 'MATCH' | 'MISMATCH' | 'UNKNOWN';

export type ReadbackReason =
  | 'READBACK_SCHEMA_MISMATCH'
  | 'READBACK_ACTION_INTENT_MISMATCH'
  | 'READBACK_CORRELATION_MISMATCH'
  | 'READBACK_TARGET_MISMATCH'
  | 'READBACK_PORT_FAILED'
  | 'READBACK_TIME_INVALID'
  | 'READBACK_TIME_ORDER_INVALID'
  | 'READBACK_SENSITIVE_DATA_REJECTED'
  | 'EXPECTED_STATE_NOT_DECLARED'
  | 'OBSERVED_STATE_NOT_RETURNED'
  | 'READBACK_MISMATCH';

export interface ReadbackAssessment {
  readonly state: ReadbackVerificationState;
  readonly reasons: readonly ReadbackReason[];
  readonly receiptAcknowledged: boolean;
  readonly verifiedExternalState: boolean;
  readonly authorizesExecution: false;
}

export type CaptureReadbackEvidenceResult =
  | Readonly<{
      status: 'CAPTURED';
      evidence: Evidence;
      assessment: ReadbackAssessment;
      authorizesExecution: false;
    }>
  | Readonly<{
      status: 'REJECTED';
      reasons: readonly ReadbackReason[];
      authorizesExecution: false;
    }>;
