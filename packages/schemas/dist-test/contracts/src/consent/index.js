'use strict';
Object.defineProperty(exports, '__esModule', { value: true });
exports.CONSENT_EVALUATION_REASONS = exports.CONSENT_STATUSES = void 0;
exports.evaluateConsent = evaluateConsent;
exports.CONSENT_STATUSES = ['ACTIVE', 'EXPIRED', 'REVOKED'];
exports.CONSENT_EVALUATION_REASONS = [
  'ACTIVE_CONSENT',
  'CONSENT_REQUIRED',
  'CONSENT_EXPIRED',
  'CONSENT_REVOKED',
  'PURPOSE_MISMATCH',
  'JURISDICTION_MISMATCH',
  'SUBJECT_MISMATCH',
  'MISSING_PROVENANCE',
];
function sameSubject(a, b) {
  return JSON.stringify(a) === JSON.stringify(b);
}
function fail(request, reason) {
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
function evaluateConsent(request) {
  const consent = request.consent;
  if (!consent) return fail(request, 'CONSENT_REQUIRED');
  if (!consent.provenance?.source || !consent.provenance.reference) {
    return fail(request, 'MISSING_PROVENANCE');
  }
  if (consent.tenantId !== request.tenantId || !sameSubject(consent.subject, request.subject)) {
    return fail(request, 'SUBJECT_MISMATCH');
  }
  if (consent.status === 'REVOKED' || consent.revokedAt) {
    return fail(request, 'CONSENT_REVOKED');
  }
  if (
    consent.status === 'EXPIRED' ||
    (consent.expiresAt && consent.expiresAt <= request.evaluatedAt)
  ) {
    return fail(request, 'CONSENT_EXPIRED');
  }
  if (!consent.scope.purposeIds.includes(request.purpose.purposeId)) {
    return fail(request, 'PURPOSE_MISMATCH');
  }
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
