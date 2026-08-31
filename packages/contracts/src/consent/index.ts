import type { SubjectRef, DataClassification, Rfc3339Timestamp } from '../context/index.js';
import type { CorrelationId, TenantId } from '../ids/types.js';
import type { CanonicalError } from '../results/error-semantics.js';
import type { ContractVersion } from '../versioning/types.js';
import type { JurisdictionContext } from '../jurisdiction/index.js';
import type { PurposeContext } from '../purpose/index.js';

export const CONSENT_STATUSES = ['ACTIVE', 'EXPIRED', 'REVOKED'] as const;
export type ConsentStatus = (typeof CONSENT_STATUSES)[number];

export interface ConsentRecordReference {
  readonly kind: 'CONSENT_RECORD';
  readonly reference: string;
  readonly version: ContractVersion;
}

export interface ConsentProvenanceReference {
  readonly source: string;
  readonly reference: string;
  readonly capturedAt: Rfc3339Timestamp;
}

export interface ConsentScope {
  readonly purposeIds: readonly string[];
  readonly jurisdictions?: readonly string[];
  readonly dataCategories?: readonly string[];
}

export interface ConsentRecord {
  readonly kind: 'ConsentRecord';
  readonly schemaVersion: ContractVersion;
  readonly reference: ConsentRecordReference;
  readonly tenantId: TenantId;
  readonly subject: SubjectRef;
  readonly status: ConsentStatus;
  readonly grantedAt: Rfc3339Timestamp;
  readonly expiresAt?: Rfc3339Timestamp;
  readonly revokedAt?: Rfc3339Timestamp;
  readonly scope: ConsentScope;
  readonly provenance: ConsentProvenanceReference;
  readonly classification?: DataClassification;
}

export const CONSENT_EVALUATION_REASONS = [
  'ACTIVE_CONSENT',
  'CONSENT_REQUIRED',
  'CONSENT_EXPIRED',
  'CONSENT_REVOKED',
  'PURPOSE_MISMATCH',
  'JURISDICTION_MISMATCH',
  'SUBJECT_MISMATCH',
  'MISSING_PROVENANCE',
] as const;
export type ConsentEvaluationReason = (typeof CONSENT_EVALUATION_REASONS)[number];

export interface ConsentEvaluationRequest {
  readonly schemaVersion: ContractVersion;
  readonly correlationId: CorrelationId;
  readonly tenantId: TenantId;
  readonly subject: SubjectRef;
  readonly purpose: PurposeContext;
  readonly jurisdiction: JurisdictionContext;
  readonly evaluatedAt: Rfc3339Timestamp;
  readonly consent?: ConsentRecord;
}

export type ConsentEvaluationResult =
  | {
      readonly kind: 'ConsentEvaluationResult';
      readonly satisfied: true;
      readonly reason: 'ACTIVE_CONSENT';
      readonly consent: ConsentRecordReference;
    }
  | {
      readonly kind: 'ConsentEvaluationResult';
      readonly satisfied: false;
      readonly reason: Exclude<ConsentEvaluationReason, 'ACTIVE_CONSENT'>;
      readonly error: CanonicalError<ContractVersion, CorrelationId, DataClassification>;
    };

function sameSubject(a: SubjectRef, b: SubjectRef): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

function fail(
  request: ConsentEvaluationRequest,
  reason: Exclude<ConsentEvaluationReason, 'ACTIVE_CONSENT'>,
): ConsentEvaluationResult {
  return {
    kind: 'ConsentEvaluationResult',
    satisfied: false,
    reason,
    error: {
      kind: 'CanonicalError',
      schemaVersion: request.schemaVersion,
      code: 'PRECONDITION_FAILED',
      category: 'PRECONDITION_FAILED',
      message: 'Data processing preconditions were not satisfied.',
      retryability: 'DO_NOT_RETRY',
      correlationId: request.correlationId,
      timestamp: request.evaluatedAt,
      details: { reason },
    },
  };
}

/** Deterministic consent validity check only. This is not authority-to-act evaluation. */
export function evaluateConsent(request: ConsentEvaluationRequest): ConsentEvaluationResult {
  const consent = request.consent;
  if (!consent) return fail(request, 'CONSENT_REQUIRED');
  if (!consent.provenance?.source || !consent.provenance.reference) return fail(request, 'MISSING_PROVENANCE');
  if (consent.tenantId !== request.tenantId || !sameSubject(consent.subject, request.subject)) {
    return fail(request, 'SUBJECT_MISMATCH');
  }
  if (consent.status === 'REVOKED' || consent.revokedAt) return fail(request, 'CONSENT_REVOKED');
  if (consent.status === 'EXPIRED' || (consent.expiresAt && consent.expiresAt <= request.evaluatedAt)) {
    return fail(request, 'CONSENT_EXPIRED');
  }
  if (!consent.scope.purposeIds.includes(request.purpose.purposeId)) return fail(request, 'PURPOSE_MISMATCH');
  if (
    consent.scope.jurisdictions &&
    !consent.scope.jurisdictions.includes(request.jurisdiction.jurisdiction)
  ) {
    return fail(request, 'JURISDICTION_MISMATCH');
  }
  return {
    kind: 'ConsentEvaluationResult',
    satisfied: true,
    reason: 'ACTIVE_CONSENT',
    consent: consent.reference,
  };
}
