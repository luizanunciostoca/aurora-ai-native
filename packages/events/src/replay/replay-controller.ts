import type { EventEnvelope, EventId, TenantId } from '@aurora/contracts';

import type {
  ReplayBatchInput,
  ReplayCheckpoint,
  ReplayCursor,
  ReplayDecision,
  ReplayOrderingScope,
  ReplayPolicy,
} from './types.js';

function eventTime(value: string): number {
  const parsed = Date.parse(value);
  if (!Number.isFinite(parsed)) throw new Error(`INVALID_EVENT_TIME ${value}`);
  return parsed;
}

export function compareReplayCursor(left: ReplayCursor, right: ReplayCursor): number {
  const timeDifference = eventTime(left.occurredAt) - eventTime(right.occurredAt);
  if (timeDifference !== 0) return timeDifference;
  return String(left.eventId).localeCompare(String(right.eventId));
}

export function cursorFromEnvelope(envelope: EventEnvelope): ReplayCursor {
  return { occurredAt: envelope.occurredAt, eventId: envelope.eventId };
}

export function replayStreamKey(
  envelope: EventEnvelope,
  orderingScope: ReplayOrderingScope,
): string {
  const tenantId = String(envelope.tenant.tenantId);
  switch (orderingScope) {
    case 'TENANT':
      return `tenant:${tenantId}`;
    case 'SUBJECT':
      if (!envelope.subject) throw new Error('REPLAY_SUBJECT_REQUIRED');
      return `tenant:${tenantId}:subject:${envelope.subject}`;
    case 'CORRELATION':
      return `tenant:${tenantId}:correlation:${String(envelope.correlation.correlationId)}`;
  }
}

function validatePolicy(policy: ReplayPolicy): void {
  if (!Number.isInteger(policy.maxRecentEventIds) || policy.maxRecentEventIds < 1) {
    throw new Error('REPLAY_MAX_RECENT_EVENT_IDS_MUST_BE_POSITIVE');
  }
}

export function evaluateReplay(
  envelope: EventEnvelope,
  checkpoint: ReplayCheckpoint | undefined,
  policy: ReplayPolicy,
): ReplayDecision {
  validatePolicy(policy);
  const streamKey = replayStreamKey(envelope, policy.orderingScope);
  const cursor = cursorFromEnvelope(envelope);

  if (!checkpoint) {
    return { action: 'PROCESS', reason: 'FIRST_EVENT', streamKey, cursor };
  }

  if (String(checkpoint.tenantId) !== String(envelope.tenant.tenantId)) {
    return { action: 'QUARANTINE', reason: 'TENANT_MISMATCH', streamKey, cursor };
  }
  if (checkpoint.streamKey !== streamKey) {
    return { action: 'QUARANTINE', reason: 'STREAM_MISMATCH', streamKey, cursor };
  }
  if (checkpoint.recentEventIds.some((eventId) => eventId === envelope.eventId)) {
    return { action: 'DUPLICATE', reason: 'DUPLICATE_EVENT_ID', streamKey, cursor };
  }

  if (checkpoint.cursor && compareReplayCursor(cursor, checkpoint.cursor) <= 0) {
    if (policy.outOfOrder === 'QUARANTINE') {
      return { action: 'QUARANTINE', reason: 'OUT_OF_ORDER', streamKey, cursor };
    }
  }

  return { action: 'PROCESS', reason: 'AFTER_CHECKPOINT', streamKey, cursor };
}

export function advanceReplayCheckpoint(
  checkpoint: ReplayCheckpoint | undefined,
  envelope: EventEnvelope,
  policy: ReplayPolicy,
): ReplayCheckpoint {
  validatePolicy(policy);
  const streamKey = replayStreamKey(envelope, policy.orderingScope);
  if (checkpoint && String(checkpoint.tenantId) !== String(envelope.tenant.tenantId)) {
    throw new Error('REPLAY_CHECKPOINT_TENANT_MISMATCH');
  }
  if (checkpoint && checkpoint.streamKey !== streamKey) {
    throw new Error('REPLAY_CHECKPOINT_STREAM_MISMATCH');
  }

  const recent = [
    ...(checkpoint?.recentEventIds.filter((eventId) => eventId !== envelope.eventId) ?? []),
    envelope.eventId,
  ];
  const bounded = recent.slice(-policy.maxRecentEventIds);

  return {
    tenantId: envelope.tenant.tenantId,
    streamKey,
    cursor: cursorFromEnvelope(envelope),
    recentEventIds: bounded,
    revision: (checkpoint?.revision ?? 0) + 1,
  };
}

export function selectReplayBatch(input: ReplayBatchInput): readonly EventEnvelope[] {
  if (!Number.isInteger(input.limit) || input.limit < 1) {
    throw new Error('REPLAY_BATCH_LIMIT_MUST_BE_POSITIVE');
  }

  return input.envelopes
    .filter((envelope) => String(envelope.tenant.tenantId) === String(input.tenantId))
    .filter((envelope) =>
      input.after ? compareReplayCursor(cursorFromEnvelope(envelope), input.after) > 0 : true,
    )
    .sort((left, right) =>
      compareReplayCursor(cursorFromEnvelope(left), cursorFromEnvelope(right)),
    )
    .slice(0, input.limit);
}

export function createInitialReplayCheckpoint(
  tenantId: TenantId,
  streamKey: string,
): ReplayCheckpoint {
  if (!streamKey) throw new Error('REPLAY_STREAM_KEY_REQUIRED');
  return { tenantId, streamKey, recentEventIds: [], revision: 0 };
}

export function containsRecentEvent(checkpoint: ReplayCheckpoint, eventId: EventId): boolean {
  return checkpoint.recentEventIds.some((candidate) => candidate === eventId);
}
