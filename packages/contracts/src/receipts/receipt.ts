import type { ActionIntentId, ExecutionId, ReceiptId } from '../ids/index.js';
import type { CorrelationContext } from '../context/index.js';
import type { ExecutionOutcome } from '../results/index.js';
import type { ContractVersion } from '../versioning/index.js';
import type { ExternalReference, RestrictedMetadata } from '../actions/index.js';


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
  readonly attemptedAt: string;
  readonly acknowledgedAt?: string;
  readonly returnedAt?: string;
  readonly providerReference?: ExternalReference;
  readonly executionOutcome?: ExecutionOutcome;
  readonly correlation: CorrelationContext;
  readonly rawProviderDataReference?: ExternalReference;
  readonly metadata?: RestrictedMetadata;
}
