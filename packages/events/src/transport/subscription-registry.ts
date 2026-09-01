import type { EventEnvelope } from '@aurora/contracts/envelopes';
import type {
  RegisterSubscriptionInput,
  SubscriptionDefinition,
  SubscriptionInterest,
  SubscriptionKey,
} from './types';

function nonEmpty(value: string, name: string): string {
  if (!value.trim()) throw new Error(`${name} must be non-empty`);
  return value;
}

function normalizedInterest(interest: SubscriptionInterest): SubscriptionInterest {
  const eventTypes = interest.eventTypes ? [...new Set(interest.eventTypes)].sort() : undefined;
  const requiredLabels = interest.requiredLabels
    ? Object.fromEntries(
        Object.entries(interest.requiredLabels).sort(([left], [right]) =>
          left.localeCompare(right),
        ),
      )
    : undefined;
  return {
    ...(eventTypes ? { eventTypes } : {}),
    ...(requiredLabels ? { requiredLabels } : {}),
  };
}

function interestFingerprint(interest: SubscriptionInterest): string {
  return JSON.stringify(normalizedInterest(interest));
}

export function matchesSubscription(
  envelope: EventEnvelope,
  interest: SubscriptionInterest,
): boolean {
  if (interest.eventTypes?.length && !interest.eventTypes.includes(envelope.eventType))
    return false;
  if (interest.requiredLabels) {
    const labels = envelope.metadata?.labels ?? {};
    for (const [key, value] of Object.entries(interest.requiredLabels)) {
      if (labels[key] !== value) return false;
    }
  }
  return true;
}

export class SubscriptionRegistry {
  readonly #subscriptions = new Map<SubscriptionKey, SubscriptionDefinition>();
  readonly #maxSubscriptions: number;

  constructor(maxSubscriptions = 1024) {
    if (!Number.isInteger(maxSubscriptions) || maxSubscriptions < 1) {
      throw new Error('maxSubscriptions must be a positive integer');
    }
    this.#maxSubscriptions = maxSubscriptions;
  }

  register(input: RegisterSubscriptionInput): SubscriptionDefinition {
    const key = nonEmpty(input.subscriptionKey, 'subscriptionKey');
    const subscriber = nonEmpty(input.subscriber, 'subscriber');
    const interest = normalizedInterest(input.interest);
    const existing = this.#subscriptions.get(key);
    if (existing) {
      if (
        existing.subscriber !== subscriber ||
        interestFingerprint(existing.interest) !== interestFingerprint(interest)
      ) {
        throw new Error(`subscription key conflict: ${key}`);
      }
      return existing;
    }
    if (this.#subscriptions.size >= this.#maxSubscriptions) {
      throw new Error('subscription registry capacity exceeded');
    }
    const definition: SubscriptionDefinition = {
      subscriptionKey: key,
      subscriber,
      interest,
      active: true,
    };
    this.#subscriptions.set(key, definition);
    return definition;
  }

  setActive(subscriptionKey: SubscriptionKey, active: boolean): SubscriptionDefinition {
    const existing = this.require(subscriptionKey);
    const next: SubscriptionDefinition = { ...existing, active };
    this.#subscriptions.set(subscriptionKey, next);
    return next;
  }

  remove(subscriptionKey: SubscriptionKey): boolean {
    return this.#subscriptions.delete(subscriptionKey);
  }

  get(subscriptionKey: SubscriptionKey): SubscriptionDefinition | undefined {
    return this.#subscriptions.get(subscriptionKey);
  }

  matching(envelope: EventEnvelope): readonly SubscriptionDefinition[] {
    return [...this.#subscriptions.values()]
      .filter(
        (definition) => definition.active && matchesSubscription(envelope, definition.interest),
      )
      .sort((left, right) => left.subscriptionKey.localeCompare(right.subscriptionKey));
  }

  list(): readonly SubscriptionDefinition[] {
    return [...this.#subscriptions.values()].sort((left, right) =>
      left.subscriptionKey.localeCompare(right.subscriptionKey),
    );
  }

  private require(subscriptionKey: SubscriptionKey): SubscriptionDefinition {
    const existing = this.#subscriptions.get(subscriptionKey);
    if (!existing) throw new Error(`unknown subscription: ${subscriptionKey}`);
    return existing;
  }
}
