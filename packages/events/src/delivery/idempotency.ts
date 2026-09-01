import type { IdempotencyDecision, IdempotencyRecord, IdempotencyRequest } from './types';
import { assertCanonicalPayloadHash } from './canonical-json';

export function decideIdempotency(
  existing: IdempotencyRecord | null,
  request: IdempotencyRequest,
): IdempotencyDecision {
  assertCanonicalPayloadHash(request.canonicalPayloadHash);
  if (existing === null) return { kind: 'NEW' };

  if (existing.tenantId !== request.tenantId || existing.key !== request.key) {
    throw new Error('existing idempotency record does not match requested tenant/key');
  }
  if (existing.operationName !== request.operationName) {
    return { kind: 'CONFLICT', reason: 'OPERATION_MISMATCH' };
  }
  if (existing.canonicalPayloadHash !== request.canonicalPayloadHash) {
    return { kind: 'CONFLICT', reason: 'PAYLOAD_MISMATCH' };
  }
  if ((existing.eventId ?? null) !== (request.eventId ?? null)) {
    return { kind: 'CONFLICT', reason: 'EVENT_MISMATCH' };
  }
  return { kind: 'REPLAY', status: existing.status };
}

export function boundedBackoffSeconds(attemptCount: number, capSeconds = 300): number {
  if (!Number.isInteger(attemptCount) || attemptCount < 1) {
    throw new Error('attemptCount must be a positive integer');
  }
  if (!Number.isInteger(capSeconds) || capSeconds < 1) {
    throw new Error('capSeconds must be a positive integer');
  }
  return Math.min(2 ** Math.min(attemptCount - 1, 20), capSeconds);
}
