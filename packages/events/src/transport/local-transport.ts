import type { EventEnvelope } from '@aurora/contracts/envelopes';
import { SubscriptionRegistry } from './subscription-registry';
import type {
  DeliveryRecord,
  LocalTransportLimits,
  PublishResult,
  SubscriptionKey,
} from './types';

const DEFAULT_LIMITS: LocalTransportLimits = {
  maxFanout: 32,
  maxPendingPerSubscription: 128,
  maxPullBatch: 32,
};

function positiveInteger(value: number, name: string): number {
  if (!Number.isInteger(value) || value < 1) throw new Error(`${name} must be a positive integer`);
  return value;
}

/**
 * Deterministic local/test transport only. Production durability is provided by
 * W03 Postgres/outbox infrastructure and a transport adapter implementing the same semantics.
 */
export class LocalEventTransport {
  readonly #registry: SubscriptionRegistry;
  readonly #limits: LocalTransportLimits;
  readonly #queues = new Map<SubscriptionKey, Map<string, DeliveryRecord>>();

  constructor(registry: SubscriptionRegistry, limits: Partial<LocalTransportLimits> = {}) {
    this.#registry = registry;
    this.#limits = {
      maxFanout: positiveInteger(limits.maxFanout ?? DEFAULT_LIMITS.maxFanout, 'maxFanout'),
      maxPendingPerSubscription: positiveInteger(
        limits.maxPendingPerSubscription ?? DEFAULT_LIMITS.maxPendingPerSubscription,
        'maxPendingPerSubscription',
      ),
      maxPullBatch: positiveInteger(
        limits.maxPullBatch ?? DEFAULT_LIMITS.maxPullBatch,
        'maxPullBatch',
      ),
    };
  }

  publish(envelope: EventEnvelope, enqueuedAt: string): PublishResult {
    const subscriptions = this.#registry.matching(envelope);
    if (subscriptions.length > this.#limits.maxFanout) {
      throw new Error('fan-out limit exceeded');
    }

    const planned: { subscriptionKey: SubscriptionKey; deliveryKey: string; duplicate: boolean }[] = [];
    for (const subscription of subscriptions) {
      const queue = this.#queue(subscription.subscriptionKey);
      const deliveryKey = `${envelope.eventId}:${subscription.subscriptionKey}`;
      const duplicate = queue.has(deliveryKey);
      const pendingCount = [...queue.values()].filter((record) => record.status === 'pending').length;
      if (!duplicate && pendingCount >= this.#limits.maxPendingPerSubscription) {
        throw new Error(`pending delivery capacity exceeded for ${subscription.subscriptionKey}`);
      }
      planned.push({ subscriptionKey: subscription.subscriptionKey, deliveryKey, duplicate });
    }

    let enqueuedDeliveries = 0;
    let duplicateDeliveries = 0;
    for (const item of planned) {
      if (item.duplicate) {
        duplicateDeliveries += 1;
        continue;
      }
      this.#queue(item.subscriptionKey).set(item.deliveryKey, {
        deliveryKey: item.deliveryKey,
        subscriptionKey: item.subscriptionKey,
        envelope,
        status: 'pending',
        enqueuedAt,
      });
      enqueuedDeliveries += 1;
    }

    return {
      matchedSubscriptions: subscriptions.length,
      enqueuedDeliveries,
      duplicateDeliveries,
    };
  }

  pull(subscriptionKey: SubscriptionKey, requestedLimit = this.#limits.maxPullBatch): readonly DeliveryRecord[] {
    this.#registry.get(subscriptionKey) ?? (() => { throw new Error(`unknown subscription: ${subscriptionKey}`); })();
    const limit = Math.min(positiveInteger(requestedLimit, 'requestedLimit'), this.#limits.maxPullBatch);
    return [...this.#queue(subscriptionKey).values()]
      .filter((record) => record.status === 'pending')
      .sort((left, right) => left.deliveryKey.localeCompare(right.deliveryKey))
      .slice(0, limit);
  }

  ack(subscriptionKey: SubscriptionKey, deliveryKey: string, ackedAt: string): DeliveryRecord {
    const queue = this.#queue(subscriptionKey);
    const current = queue.get(deliveryKey);
    if (!current) throw new Error(`unknown delivery: ${deliveryKey}`);
    if (current.status === 'acked') return current;
    const acked: DeliveryRecord = { ...current, status: 'acked', ackedAt };
    queue.set(deliveryKey, acked);
    return acked;
  }

  pendingCount(subscriptionKey: SubscriptionKey): number {
    return [...this.#queue(subscriptionKey).values()].filter((record) => record.status === 'pending').length;
  }

  private #queue(subscriptionKey: SubscriptionKey): Map<string, DeliveryRecord> {
    let queue = this.#queues.get(subscriptionKey);
    if (!queue) {
      queue = new Map<string, DeliveryRecord>();
      this.#queues.set(subscriptionKey, queue);
    }
    return queue;
  }
}
