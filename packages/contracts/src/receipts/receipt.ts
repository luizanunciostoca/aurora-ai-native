import type { ExternalReference, RestrictedMetadata } from '../actions';
import type { CorrelationContext, Rfc3339Timestamp } from '../context';
import type { ExecutionTargetReference } from '../execution-target';
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

interface ReceiptBase {
  readonly kind: 'RECEIPT';
  readonly schemaVersion: ContractVersion;
  readonly receiptId: ReceiptId;
  readonly actionIntentId: ActionIntentId;
  readonly executionId?: ExecutionId;
  readonly executor: ReceiptExecutorReference;
  readonly attempt: number;
  readonly attemptedAt: Rfc3339Timestamp;
  readonly acknowledgedAt?: Rfc3339Timestamp;
  readonly returnedAt?: Rfc3339Timestamp;
  readonly executionOutcome?: ExecutionOutcome;
  readonly correlation: CorrelationContext;
  readonly metadata?: RestrictedMetadata;
}

export type LegacyProviderReceipt = ReceiptBase &
  Readonly<{
    readonly executionTarget?: undefined;
    readonly provider: ReceiptProviderReference;
    readonly providerReference?: ExternalReference;
    readonly rawProviderDataReference?: ExternalReference;
  }>;

export type TargetedReceipt = ReceiptBase &
  Readonly<{
    readonly executionTarget: ExecutionTargetReference;
    /** Optional provider provenance is valid only for PROVIDER execution targets. */
    readonly provider?: ReceiptProviderReference;
    readonly providerReference?: ExternalReference;
    readonly rawProviderDataReference?: ExternalReference;
  }>;

/**
 * Executor attempt record. Receipt existence/acknowledgement is never proof that
 * intended external state is correct; verified outcome requires readback/evidence.
 * Runtime schemas fail closed on target/provider mismatches and provider metadata
 * attached to non-PROVIDER targets.
 */
export type Receipt = LegacyProviderReceipt | TargetedReceipt;
