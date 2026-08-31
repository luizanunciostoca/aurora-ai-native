import type { ContractVersion } from '../versioning/types.js';

export const JURISDICTION_RESTRICTION_EFFECTS = ['ALLOW', 'DENY'] as const;
export type JurisdictionRestrictionEffect = (typeof JURISDICTION_RESTRICTION_EFFECTS)[number];

export interface JurisdictionContext {
  readonly kind: 'JurisdictionContext';
  readonly jurisdiction: string;
  readonly version: ContractVersion;
}

export interface JurisdictionRestriction {
  readonly kind: 'JurisdictionRestriction';
  readonly jurisdiction: string;
  readonly effect: JurisdictionRestrictionEffect;
  readonly purposeIds?: readonly string[];
  readonly reasonReference: string;
  readonly version: ContractVersion;
}
