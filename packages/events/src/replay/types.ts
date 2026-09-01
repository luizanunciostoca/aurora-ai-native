import type { EventEnvelope } from '@aurora/contracts';

export type ReplaySafety = 'READ_ONLY' | 'IDEMPOTENT_INTERNAL' | 'EXTERNAL_SIDE_EFFECT';

export interface OrderingRequirement {
  readonly streamKey: string;
  readonly sequence: number;
}

export interface ReplayInput {
  readonly envelope: EventEnvelope;
  readonly safety: ReplaySafety;
  readonly ordering?: OrderingRequirement;
}

export type DeadLetterReason =
  'SEQUENCE_GAP' | 'STALE_OR_OUT_OF_ORDER' | 'FRESH_AUTHORITY_REQUIRED';

export interface DeadLetterRecord {
  readonly deadLetterId: string;
  readonly envelope: EventEnvelope;
  readonly reason: DeadLetterReason;
  readonly ordering?: OrderingRequirement;
  readonly safety: ReplaySafety;
  readonly firstQuarantinedAt: string;
  readonly lastQuarantinedAt: string;
  readonly attempts: number;
  readonly executionAuthorized: false;
}

export type ReplayDecision =
  | {
      readonly status: 'ACCEPTED';
      readonly eventId: string;
      readonly checkpoint?: number;
    }
  | {
      readonly status: 'DUPLICATE';
      readonly eventId: string;
      readonly checkpoint?: number;
    }
  | {
      readonly status: 'QUARANTINED';
      readonly eventId: string;
      readonly deadLetter: DeadLetterRecord;
    };

export interface ReplayRelease {
  readonly envelope: EventEnvelope;
  readonly reason: DeadLetterReason;
  readonly ordering?: OrderingRequirement;
  readonly safety: ReplaySafety;
  readonly executionAuthorized: false;
  readonly requiresFreshAuthorityValidation: boolean;
}
