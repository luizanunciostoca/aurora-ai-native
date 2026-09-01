import type {
  DeadLetterReason,
  DeadLetterRecord,
  ReplayDecision,
  ReplayInput,
  ReplayRelease,
} from './types';

function positiveInteger(value: number, field: string): number {
  if (!Number.isInteger(value) || value < 1) {
    throw new Error(`${field} must be a positive integer`);
  }
  return value;
}

function nonEmpty(value: string, field: string): string {
  if (value.trim().length === 0) throw new Error(`${field} must not be empty`);
  return value;
}

/**
 * Deterministic replay bookkeeping for W03. It classifies replay safety and
 * ordering only; it never creates or widens execution authority.
 */
export class ReplayCoordinator {
  readonly #seenEventIds = new Set<string>();
  readonly #checkpoints = new Map<string, number>();
  readonly #deadLetters = new Map<string, DeadLetterRecord>();

  process(input: ReplayInput, observedAt: string): ReplayDecision {
    const eventId = nonEmpty(input.envelope.eventId, 'eventId');
    if (this.#seenEventIds.has(eventId)) {
      const checkpoint = input.ordering
        ? this.#checkpoints.get(input.ordering.streamKey)
        : undefined;
      return checkpoint === undefined
        ? { status: 'DUPLICATE', eventId }
        : { status: 'DUPLICATE', eventId, checkpoint };
    }

    if (input.ordering) {
      nonEmpty(input.ordering.streamKey, 'streamKey');
      positiveInteger(input.ordering.sequence, 'sequence');
    }

    if (input.safety === 'EXTERNAL_SIDE_EFFECT') {
      return this.#quarantine(input, observedAt, 'FRESH_AUTHORITY_REQUIRED');
    }

    if (input.ordering) {
      const current = this.#checkpoints.get(input.ordering.streamKey) ?? 0;
      if (input.ordering.sequence <= current) {
        return this.#quarantine(input, observedAt, 'STALE_OR_OUT_OF_ORDER');
      }
      if (input.ordering.sequence !== current + 1) {
        return this.#quarantine(input, observedAt, 'SEQUENCE_GAP');
      }

      this.#seenEventIds.add(eventId);
      this.#checkpoints.set(input.ordering.streamKey, input.ordering.sequence);
      return {
        status: 'ACCEPTED',
        eventId,
        checkpoint: input.ordering.sequence,
      };
    }

    this.#seenEventIds.add(eventId);
    return { status: 'ACCEPTED', eventId };
  }

  checkpoint(streamKey: string): number {
    nonEmpty(streamKey, 'streamKey');
    return this.#checkpoints.get(streamKey) ?? 0;
  }

  deadLetters(): readonly DeadLetterRecord[] {
    return [...this.#deadLetters.values()].sort((left, right) =>
      left.deadLetterId.localeCompare(right.deadLetterId),
    );
  }

  releaseForReconciliation(deadLetterId: string): ReplayRelease {
    const record = this.#deadLetters.get(deadLetterId);
    if (!record) throw new Error(`unknown dead letter: ${deadLetterId}`);
    return {
      envelope: record.envelope,
      reason: record.reason,
      ...(record.ordering ? { ordering: record.ordering } : {}),
      safety: record.safety,
      executionAuthorized: false,
      requiresFreshAuthorityValidation: record.reason === 'FRESH_AUTHORITY_REQUIRED',
    };
  }

  resolve(deadLetterId: string): void {
    if (!this.#deadLetters.delete(deadLetterId)) {
      throw new Error(`unknown dead letter: ${deadLetterId}`);
    }
  }

  #quarantine(
    input: ReplayInput,
    observedAt: string,
    reason: DeadLetterReason,
  ): ReplayDecision {
    const deadLetterId = `${input.envelope.eventId}:${reason}`;
    const existing = this.#deadLetters.get(deadLetterId);
    const fresh: DeadLetterRecord = input.ordering
      ? {
          deadLetterId,
          envelope: input.envelope,
          reason,
          ordering: input.ordering,
          safety: input.safety,
          firstQuarantinedAt: observedAt,
          lastQuarantinedAt: observedAt,
          attempts: 1,
          executionAuthorized: false,
        }
      : {
          deadLetterId,
          envelope: input.envelope,
          reason,
          safety: input.safety,
          firstQuarantinedAt: observedAt,
          lastQuarantinedAt: observedAt,
          attempts: 1,
          executionAuthorized: false,
        };
    const deadLetter: DeadLetterRecord = existing
      ? {
          ...existing,
          lastQuarantinedAt: observedAt,
          attempts: existing.attempts + 1,
        }
      : fresh;
    this.#deadLetters.set(deadLetterId, deadLetter);
    return {
      status: 'QUARANTINED',
      eventId: input.envelope.eventId,
      deadLetter,
    };
  }
}
