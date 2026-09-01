import type { EventEnvelope, EventType } from '@aurora/contracts';

/** Internal transport key only. This is not a new Aurora canonical ID namespace. */
export type SubscriptionKey = string;

export interface SubscriptionInterest {
  readonly eventTypes?: readonly EventType[];
  /** Opaque EventEnvelope metadata labels. No W04 Capability Registry is inferred here. */
  readonly requiredLabels?: Readonly<Record<string, string>>;
}

export interface SubscriptionDefinition {
  readonly subscriptionKey: SubscriptionKey;
  readonly subscriber: string;
  readonly interest: SubscriptionInterest;
  readonly active: boolean;
}

export interface RegisterSubscriptionInput {
  readonly subscriptionKey: SubscriptionKey;
  readonly subscriber: string;
  readonly interest: SubscriptionInterest;
}

export interface DeliveryRecord {
  readonly deliveryKey: string;
  readonly subscriptionKey: SubscriptionKey;
  readonly envelope: EventEnvelope;
  readonly status: 'pending' | 'acked';
  readonly enqueuedAt: string;
  readonly ackedAt?: string;
}

export interface PublishResult {
  readonly matchedSubscriptions: number;
  readonly enqueuedDeliveries: number;
  readonly duplicateDeliveries: number;
}

export interface LocalTransportLimits {
  readonly maxFanout: number;
  readonly maxPendingPerSubscription: number;
  readonly maxPullBatch: number;
}
