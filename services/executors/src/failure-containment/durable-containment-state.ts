import type { ActionIntent } from '@aurora/contracts/actions';
import type { Rfc3339Timestamp } from '@aurora/contracts/context';
import type { TenantId } from '@aurora/contracts/ids';

import type { FailureContainmentSnapshot } from './types.js';

const CIRCUIT_KEY = /^[A-Za-z0-9._:/+-]{1,180}$/u;
const ACTION_INTENT_ID = /^act_[0-9A-HJKMNP-TV-Z]{26}$/u;

export interface DurableContainmentStateLookup {
  readonly tenantId: TenantId;
  readonly circuitKey: string;
  readonly evaluatedAt: Rfc3339Timestamp;
}

export interface DurableContainmentStateRecord {
  readonly tenantId: TenantId;
  readonly circuitKey: string;
  readonly version: number;
  readonly updatedAt: Rfc3339Timestamp;
  /**
   * Current W07 snapshot. A W03 adapter may project HALF_OPEN probe ownership from the separate
   * canonical lease fence; the full snapshot is never encoded into lease text fields.
   */
  readonly snapshot: FailureContainmentSnapshot;
  readonly authorizesExecution: false;
}

export interface DurableContainmentStateSource {
  resolveCurrent(lookup: DurableContainmentStateLookup): DurableContainmentStateRecord | null;
}

export type DurableContainmentStateResolution =
  | Readonly<{
      status: 'RESOLVED';
      record: DurableContainmentStateRecord;
      authorizesExecution: false;
    }>
  | Readonly<{
      status: 'REJECTED';
      code: 'LOOKUP_INVALID' | 'SOURCE_UNAVAILABLE' | 'STATE_MALFORMED' | 'STATE_MISMATCH';
      authorizesExecution: false;
    }>;

function timestamp(value: unknown): number | null {
  if (typeof value !== 'string' || value.length === 0 || value.length > 128) return null;
  const parsed = Date.parse(value);
  if (!Number.isFinite(parsed) || new Date(parsed).toISOString() !== value) return null;
  return parsed;
}

function nonNegativeInteger(value: unknown): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0;
}

function positiveInteger(value: unknown): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= 1;
}

function validCircuit(snapshot: FailureContainmentSnapshot['circuit']): boolean {
  if (!nonNegativeInteger(snapshot.consecutiveFailures)) return false;
  if (snapshot.state === 'OPEN') {
    if (snapshot.openedAt === undefined || timestamp(snapshot.openedAt) === null) return false;
  } else if (snapshot.openedAt !== undefined) {
    return false;
  }

  if (snapshot.state !== 'HALF_OPEN') {
    return !snapshot.halfOpenProbeInFlight && snapshot.halfOpenProbeActionIntentId === undefined;
  }
  if (snapshot.halfOpenProbeInFlight) {
    return (
      typeof snapshot.halfOpenProbeActionIntentId === 'string' &&
      ACTION_INTENT_ID.test(snapshot.halfOpenProbeActionIntentId)
    );
  }
  return snapshot.halfOpenProbeActionIntentId === undefined;
}

function validSnapshot(snapshot: FailureContainmentSnapshot, evaluatedAtMs: number): boolean {
  const killChangedAt = timestamp(snapshot.killSwitch.changedAt);
  return (
    validCircuit(snapshot.circuit) &&
    (snapshot.killSwitch.state === 'ACTIVE' || snapshot.killSwitch.state === 'INACTIVE') &&
    killChangedAt !== null &&
    killChangedAt <= evaluatedAtMs &&
    (snapshot.dependencyHealth === 'HEALTHY' ||
      snapshot.dependencyHealth === 'DEGRADED' ||
      snapshot.dependencyHealth === 'UNAVAILABLE') &&
    typeof snapshot.cancellationRequested === 'boolean' &&
    nonNegativeInteger(snapshot.currentInFlight) &&
    positiveInteger(snapshot.maxInFlight) &&
    snapshot.currentInFlight <= snapshot.maxInFlight &&
    nonNegativeInteger(snapshot.retryDepth) &&
    nonNegativeInteger(snapshot.maxRetryDepth) &&
    snapshot.retryDepth <= snapshot.maxRetryDepth
  );
}

function rejected(
  code: Extract<DurableContainmentStateResolution, { status: 'REJECTED' }>['code'],
): DurableContainmentStateResolution {
  return { status: 'REJECTED', code, authorizesExecution: false };
}

/**
 * Fail-closed current containment read used by W07 composition.
 *
 * The source must re-read server-owned durable state. This resolver never fabricates CLOSED,
 * INACTIVE, HEALTHY, zero retry depth or any other permissive default. Passing this read is only a
 * prerequisite for W07-G evaluation and never grants execution authority or retry permission.
 */
export function resolveDurableContainmentState(
  lookup: DurableContainmentStateLookup,
  source: DurableContainmentStateSource | undefined,
): DurableContainmentStateResolution {
  const evaluatedAtMs = timestamp(lookup.evaluatedAt);
  if (
    evaluatedAtMs === null ||
    typeof lookup.tenantId !== 'string' ||
    lookup.tenantId.length === 0 ||
    !CIRCUIT_KEY.test(lookup.circuitKey)
  ) {
    return rejected('LOOKUP_INVALID');
  }
  if (source === undefined) return rejected('SOURCE_UNAVAILABLE');

  let record: DurableContainmentStateRecord | null;
  try {
    record = source.resolveCurrent(lookup);
  } catch {
    return rejected('SOURCE_UNAVAILABLE');
  }
  if (record === null) return rejected('SOURCE_UNAVAILABLE');

  const updatedAtMs = timestamp(record.updatedAt);
  if (
    record.authorizesExecution !== false ||
    !positiveInteger(record.version) ||
    updatedAtMs === null ||
    updatedAtMs > evaluatedAtMs ||
    !validSnapshot(record.snapshot, evaluatedAtMs)
  ) {
    return rejected('STATE_MALFORMED');
  }
  if (record.tenantId !== lookup.tenantId || record.circuitKey !== lookup.circuitKey) {
    return rejected('STATE_MISMATCH');
  }

  return { status: 'RESOLVED', record, authorizesExecution: false };
}

export interface ActionIntentContainmentKeySource {
  resolveCircuitKey(input: {
    readonly actionIntent: ActionIntent;
    readonly tenantId: TenantId;
  }): string | null;
}
