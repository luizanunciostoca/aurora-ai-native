import type { DataClassification } from '../context';
import type { ContractVersion } from '../versioning';

export const PURPOSE_STATUSES = ['ACTIVE', 'DISABLED'] as const;
export type PurposeStatus = (typeof PURPOSE_STATUSES)[number];

export interface PurposeReference {
  readonly purposeId: string;
  readonly version: ContractVersion;
}

export interface PurposeContext extends PurposeReference {
  readonly kind: 'PurposeContext';
  readonly status: PurposeStatus;
  readonly description?: string;
  readonly allowedDataClassifications?: readonly DataClassification[];
}

export interface PurposeMismatch {
  readonly kind: 'PurposeMismatch';
  readonly requested: PurposeReference;
  readonly allowedPurposeIds: readonly string[];
}
