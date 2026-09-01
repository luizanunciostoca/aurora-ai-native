import type { EventEnvelope } from '@aurora/contracts';

import type {
  DeadLetterReason,
  DeadLetterRecord,
  DeadLetterRecoveryDecision,
  DeadLetterRecoveryPlan,
} from './types.js';

export function quarantineEvent(input: {
  readonly envelope: EventEnvelope;
  readonly reason: DeadLetterReason;
  readonly quarantinedAt: string;
  readonly detail?: string;
}): DeadLetterRecord {
  if (!Number.isFinite(Date.parse(input.quarantinedAt))) {
    throw new Error('DLQ_QUARANTINE_TIME_INVALID');
  }

  return {
    tenantId: input.envelope.tenant.tenantId,
    eventId: input.envelope.eventId,
    envelope: input.envelope,
    reason: input.reason,
    quarantinedAt: input.quarantinedAt,
    ...(input.detail ? { detail: input.detail } : {}),
    requiresCurrentAuthorityValidation: true,
  };
}

export function planDeadLetterRecovery(
  record: DeadLetterRecord,
  decision: DeadLetterRecoveryDecision,
): DeadLetterRecoveryPlan {
  if (!decision.reason.trim()) throw new Error('DLQ_RECOVERY_REASON_REQUIRED');

  if (decision.action === 'DISCARD') {
    return {
      action: 'DISCARD',
      eventId: record.eventId,
      tenantId: record.tenantId,
      reason: decision.reason,
      requiresCurrentAuthorityValidation: true,
    };
  }

  if (!decision.authorityRevalidated) {
    throw new Error('DLQ_REQUEUE_REQUIRES_CURRENT_AUTHORITY_VALIDATION');
  }

  return {
    action: 'REQUEUE',
    eventId: record.eventId,
    tenantId: record.tenantId,
    reason: decision.reason,
    envelope: record.envelope,
    requiresCurrentAuthorityValidation: true,
  };
}
