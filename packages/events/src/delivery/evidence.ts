import { canonicalJsonString } from './canonical-json';
import type { DeliveryEvidence } from './types';

function nonEmpty(value: string, name: string): string {
  if (!value.trim()) throw new Error(`${name} must be non-empty`);
  return value;
}

/**
 * Produce a deterministic, secret-agnostic delivery transition record that can
 * be forwarded to W17 observability/evidence storage without creating authority.
 */
export function buildDeliveryEvidence(input: DeliveryEvidence): DeliveryEvidence {
  const details = input.details
    ? (JSON.parse(canonicalJsonString(input.details)) as Readonly<Record<string, unknown>>)
    : undefined;

  return {
    tenantId: input.tenantId,
    eventId: input.eventId,
    ...(input.correlationId ? { correlationId: input.correlationId } : {}),
    transition: nonEmpty(input.transition, 'transition'),
    at: nonEmpty(input.at, 'at'),
    ...(details ? { details } : {}),
  };
}
