import type {
  CorrelationContext,
  DataClassification,
  ActorRef,
  TenantContext,
} from '../context/index.js';
import type { EventId } from '../ids/types.js';
import type { ContractVersion } from '../versioning/types.js';
import type { EnvelopeMetadata } from './envelope-metadata.js';
import type { EnvelopeSource } from './envelope-source.js';
import type { JsonValue } from './json-value.js';

export const EVENT_ENVELOPE_KIND = 'EVENT' as const;

export type EventEnvelopeKind = typeof EVENT_ENVELOPE_KIND;

declare const eventTypeBrand: unique symbol;

/**
 * Governed, namespaced event type. The wire value is a non-empty namespaced
 * string validated by the runtime schema; it is not a business-specific enum.
 */
export type EventType = string & { readonly [eventTypeBrand]: true };

export interface EventEnvelope<TPayload extends JsonValue = JsonValue> {
  readonly kind: EventEnvelopeKind;
  readonly schemaVersion: ContractVersion;
  readonly eventId: EventId;
  readonly eventType: EventType;
  /** RFC3339 timestamp representing when the fact occurred. */
  readonly occurredAt: string;
  readonly producer: ActorRef;
  readonly source: EnvelopeSource;
  /**
   * Canonical W01-D propagation context. It carries correlationId and, when
   * applicable, causation/reference information without redefining those
   * primitives in the envelope package.
   */
  readonly correlation: CorrelationContext;
  readonly tenant: TenantContext;
  readonly subject?: string;
  readonly dataClassification?: DataClassification;
  readonly payload: TPayload;
  readonly metadata?: EnvelopeMetadata;
}
