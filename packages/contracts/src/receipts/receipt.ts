import type { ExternalReference, RestrictedMetadata } from '../actions';
import type { CorrelationContext, Rfc3339Timestamp } from '../context';
import type { ActionIntentId, ExecutionId, ReceiptId } from '../ids';
import type { ExecutionOutcome } from '../results';
import type { ContractVersion } from '../versioning';

export interface ReceiptExecutorReference {
  readonly executor: string;
  readonly instanceReference?: string;
}

export interface ReceiptProviderReference {
  readonly provider: string;
  readonly accountReference?: string;
}

/**
 * Executor/provider attempt record. Receipt existence is never proof that the
 * intended external state is correct; verified outcome requires readback/evidence.
 */
export interface Receipt {
  readonly kind: 'RECEIPT';
  readonly schemaVersion: ContractVersion;
  readonly receiptId: ReceiptId;
  readonly actionIntentId: ActionIntentId;
  readonly executionId?: ExecutionId;
  readonly executor: ReceiptExecutorReference;
  readonly provider: ReceiptProviderReference;
  readonly attempt: number;
  readonly attemptedAt: Rfc3339Timestamp;
  readonly acknowledgedAt?: Rfc3339Timestamp;
  readonly returnedAt?: Rfc3339Timestamp;
  readonly providerReference?: ExternalReference;
  readonly executionOutcome?: ExecutionOutcome;
  readonly correlation: CorrelationContext;
  readonly rawProviderDataReference?: ExternalReference;
  readonly metadata?: RestrictedMetadata;
}
