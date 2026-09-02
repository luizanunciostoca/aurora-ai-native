import type { ConsentRecordReference } from '@aurora/contracts/consent';
import type {
  ActorRef,
  CorrelationContext,
  DataClassification,
  Deadline,
  SubjectRef,
  TenantContext,
} from '@aurora/contracts/context';
import type { JurisdictionContext } from '@aurora/contracts/jurisdiction';
import type { PurposeContext } from '@aurora/contracts/purpose';
import type { ContractVersion } from '@aurora/contracts/versioning';

export const CONTEXT_SOURCE_CLASSES = [
  'WORKING',
  'EPISODIC',
  'SEMANTIC',
  'COMPANY_KNOWLEDGE',
  'USER_CONTEXT',
  'TEMPORAL_FACT',
  'OPERATIONAL_STATE',
  'EVIDENCE',
] as const;

export type ContextSourceClass = (typeof CONTEXT_SOURCE_CLASSES)[number];

export const CONTEXT_CURRENTNESS_MODES = ['CURRENT_REQUIRED', 'HISTORICAL_ALLOWED'] as const;
export type ContextCurrentnessMode = (typeof CONTEXT_CURRENTNESS_MODES)[number];

/**
 * A selector is intentionally narrow and adapter-specific. W06-A forbids an
 * implicit whole-store query when a selector is absent or ambiguous.
 */
export interface ContextSelector {
  readonly adapterId: string;
  readonly sourceClass: ContextSourceClass;
  readonly key: string;
  readonly value: string;
}

export interface ContextQueryLimits {
  readonly maxSourceFanout: number;
  readonly maxItemsPerSource: number;
  readonly maxTotalItems: number;
}

/**
 * Internal W06 query semantic contract. It reuses W01/W02 primitives and does
 * not define a new canonical ID, permission token, approval or authority type.
 */
export interface ContextQuery {
  readonly kind: 'ContextQuery';
  readonly schemaVersion: ContractVersion;
  readonly tenant: TenantContext;
  readonly correlation: CorrelationContext;
  readonly actor: ActorRef;
  readonly subject?: SubjectRef;
  readonly purpose: PurposeContext;
  readonly jurisdiction: JurisdictionContext;
  readonly consent?: ConsentRecordReference;
  readonly requiresConsent?: boolean;
  readonly maxDataClassification: DataClassification;
  readonly currentness: ContextCurrentnessMode;
  readonly selectors: readonly ContextSelector[];
  readonly requestedFields?: readonly string[];
  readonly deadline?: Deadline;
  readonly limits: ContextQueryLimits;
}

export const CONTEXT_QUERY_VALIDATION_REASONS = [
  'VALID',
  'INVALID_KIND',
  'INVALID_SCHEMA_VERSION',
  'INVALID_TENANT',
  'INVALID_CORRELATION',
  'INVALID_ACTOR',
  'INVALID_PURPOSE',
  'PURPOSE_DISABLED',
  'PURPOSE_CLASSIFICATION_MISMATCH',
  'INVALID_JURISDICTION',
  'CONSENT_REQUIRED',
  'INVALID_CURRENTNESS',
  'INVALID_LIMITS',
  'NO_SELECTORS',
  'SOURCE_FANOUT_LIMIT_EXCEEDED',
  'INVALID_SELECTOR',
  'WHOLE_STORE_SELECTOR_FORBIDDEN',
  'DUPLICATE_SELECTOR',
  'INVALID_REQUESTED_FIELDS',
] as const;

export type ContextQueryValidationReason = (typeof CONTEXT_QUERY_VALIDATION_REASONS)[number];

export type ContextQueryValidationResult =
  | {
      readonly valid: true;
      readonly reasons: readonly ['VALID'];
    }
  | {
      readonly valid: false;
      readonly reasons: readonly Exclude<ContextQueryValidationReason, 'VALID'>[];
    };
