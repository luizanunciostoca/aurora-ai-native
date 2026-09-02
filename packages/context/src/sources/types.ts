import type { ConsentRecordReference } from '@aurora/contracts/consent';
import type {
  ActorRef,
  CorrelationContext,
  DataClassification,
  Deadline,
  Rfc3339Timestamp,
  SubjectRef,
  TenantContext,
} from '@aurora/contracts/context';
import type { JurisdictionContext } from '@aurora/contracts/jurisdiction';
import type { PurposeContext } from '@aurora/contracts/purpose';
import type { ContractVersion } from '@aurora/contracts/versioning';

import type {
  ContextCurrentnessMode,
  ContextQuery,
  ContextSelector,
  ContextSourceClass,
} from '../query/types.js';

export interface ContextSourceDescriptor {
  readonly adapterId: string;
  readonly sourceClass: ContextSourceClass;
  readonly readOnly: true;
  readonly supportedSelectorKeys: readonly string[];
  readonly maxItemsPerRead: number;
}

/**
 * Every adapter receives the canonical query constraints explicitly. Possession
 * of these values is informational/precondition context and never authority.
 */
export interface ContextSourceReadRequest {
  readonly schemaVersion: ContractVersion;
  readonly tenant: TenantContext;
  readonly correlation: CorrelationContext;
  readonly actor: ActorRef;
  readonly subject?: SubjectRef;
  readonly purpose: PurposeContext;
  readonly jurisdiction: JurisdictionContext;
  readonly consent?: ConsentRecordReference;
  readonly maxDataClassification: DataClassification;
  readonly currentness: ContextCurrentnessMode;
  readonly selector: ContextSelector;
  readonly requestedFields?: readonly string[];
  readonly deadline?: Deadline;
  readonly limit: number;
}

/** W06-A acquisition candidate. Trust/ranking/freshness evaluation belongs to W06-B. */
export interface ContextSourceItem {
  readonly sourceReference: string;
  readonly sourceRevision?: string;
  readonly tenant: TenantContext;
  readonly subject?: SubjectRef;
  readonly classification: DataClassification;
  readonly observedAt: Rfc3339Timestamp;
  readonly provenanceReference: string;
  readonly payload: unknown;
}

export interface ContextSourceReadResult {
  readonly items: readonly ContextSourceItem[];
  readonly truncated?: boolean;
}

export interface ContextSourceAdapter {
  readonly descriptor: ContextSourceDescriptor;
  readonly read: (request: ContextSourceReadRequest) => Promise<ContextSourceReadResult>;
}

export interface AcquiredContextItem extends ContextSourceItem {
  readonly adapterId: string;
  readonly sourceClass: ContextSourceClass;
}

export const CONTEXT_SOURCE_REJECTION_REASONS = [
  'QUERY_INVALID',
  'ADAPTER_NOT_FOUND',
  'ADAPTER_AMBIGUOUS',
  'ADAPTER_NOT_READ_ONLY',
  'SOURCE_CLASS_MISMATCH',
  'SELECTOR_UNSUPPORTED',
  'ADAPTER_LIMIT_INVALID',
  'ADAPTER_LIMIT_EXCEEDED',
  'ADAPTER_ERROR',
  'ITEM_LIMIT_EXCEEDED',
  'TOTAL_ITEM_LIMIT_EXCEEDED',
  'INVALID_SOURCE_ITEM',
  'CROSS_TENANT_ITEM',
  'SUBJECT_MISMATCH',
  'CLASSIFICATION_EXCEEDED',
  'MISSING_PROVENANCE',
] as const;

export type ContextSourceRejectionReason = (typeof CONTEXT_SOURCE_REJECTION_REASONS)[number];

export interface ContextSourceRejection {
  readonly selector?: ContextSelector;
  readonly adapterId?: string;
  readonly sourceReference?: string;
  readonly reason: ContextSourceRejectionReason;
}

export interface ContextAcquisitionRequest {
  readonly query: ContextQuery;
  readonly adapters: readonly ContextSourceAdapter[];
}

export interface ContextAcquisitionResult {
  readonly kind: 'ContextAcquisitionResult';
  readonly items: readonly AcquiredContextItem[];
  readonly rejections: readonly ContextSourceRejection[];
  readonly attemptedSelectors: number;
  readonly invokedAdapters: readonly string[];
  readonly authorizesExecution: false;
}
