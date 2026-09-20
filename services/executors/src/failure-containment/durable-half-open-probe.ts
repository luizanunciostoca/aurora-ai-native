import type { ActionIntent } from '@aurora/contracts/actions';
import type { Rfc3339Timestamp } from '@aurora/contracts/context';
import type { TenantId } from '@aurora/contracts/ids';

const SAFE_KEY = /^[A-Za-z0-9._:/+-]{1,256}$/u;

export interface DurableHalfOpenProbeRequest {
  readonly tenantId: TenantId;
  /** Server-owned stable circuit/dependency key. It is never derived from voice text. */
  readonly circuitKey: string;
  readonly probeActionIntentId: ActionIntent['actionIntentId'];
  readonly observedAt: Rfc3339Timestamp;
  readonly leaseExpiresAt: Rfc3339Timestamp;
  readonly authorizesExecution: false;
}

export interface DurableHalfOpenProbeReleaseRequest {
  readonly tenantId: TenantId;
  readonly circuitKey: string;
  readonly probeActionIntentId: ActionIntent['actionIntentId'];
  readonly observedAt: Rfc3339Timestamp;
  readonly authorizesExecution: false;
}

export type DurableHalfOpenProbePortResult =
  | Readonly<{
      ok: true;
      disposition: 'ACQUIRED' | 'ALREADY_OWNED' | 'RENEWED' | 'RELEASED';
      circuitKey: string;
      probeActionIntentId: ActionIntent['actionIntentId'];
      leaseReference: string;
      expiresAt?: Rfc3339Timestamp;
      authorizesExecution: false;
      provesExecutionSuccess: false;
      retryAuthorized: false;
    }>
  | Readonly<{
      ok: false;
      code: 'OWNED_BY_OTHER' | 'NOT_CURRENT_OWNER' | 'UNAVAILABLE' | 'MALFORMED';
      authorizesExecution: false;
      provesExecutionSuccess: false;
      retryAuthorized: false;
    }>;

export interface DurableHalfOpenProbePort {
  reserve(input: DurableHalfOpenProbeRequest): DurableHalfOpenProbePortResult;
  heartbeat(input: DurableHalfOpenProbeRequest): DurableHalfOpenProbePortResult;
  release(input: DurableHalfOpenProbeReleaseRequest): DurableHalfOpenProbePortResult;
}

export type DurableHalfOpenProbeFenceResult = DurableHalfOpenProbePortResult;

function validTimestamp(value: unknown): value is Rfc3339Timestamp {
  if (typeof value !== 'string' || value.length === 0 || value.length > 128) return false;
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) && new Date(parsed).toISOString() === value;
}

function validRequest(input: DurableHalfOpenProbeRequest): boolean {
  const observedAt = Date.parse(input.observedAt);
  const expiresAt = Date.parse(input.leaseExpiresAt);
  return (
    SAFE_KEY.test(input.tenantId) &&
    SAFE_KEY.test(input.circuitKey) &&
    SAFE_KEY.test(input.probeActionIntentId) &&
    validTimestamp(input.observedAt) &&
    validTimestamp(input.leaseExpiresAt) &&
    expiresAt > observedAt &&
    input.authorizesExecution === false
  );
}

function validReleaseRequest(input: DurableHalfOpenProbeReleaseRequest): boolean {
  return (
    SAFE_KEY.test(input.tenantId) &&
    SAFE_KEY.test(input.circuitKey) &&
    SAFE_KEY.test(input.probeActionIntentId) &&
    validTimestamp(input.observedAt) &&
    input.authorizesExecution === false
  );
}

function failed(code: 'UNAVAILABLE' | 'MALFORMED'): DurableHalfOpenProbeFenceResult {
  return {
    ok: false,
    code,
    authorizesExecution: false,
    provesExecutionSuccess: false,
    retryAuthorized: false,
  };
}

function normalizePortResult(
  result: DurableHalfOpenProbePortResult,
  request: Pick<DurableHalfOpenProbeRequest, 'circuitKey' | 'probeActionIntentId'>,
  mode: 'RESERVE' | 'HEARTBEAT' | 'RELEASE',
): DurableHalfOpenProbeFenceResult {
  if (!result.ok) {
    if (
      result.authorizesExecution !== false ||
      result.provesExecutionSuccess !== false ||
      result.retryAuthorized !== false
    ) {
      return failed('UNAVAILABLE');
    }
    return result;
  }

  if (
    result.authorizesExecution !== false ||
    result.provesExecutionSuccess !== false ||
    result.retryAuthorized !== false ||
    result.circuitKey !== request.circuitKey ||
    result.probeActionIntentId !== request.probeActionIntentId ||
    !SAFE_KEY.test(result.leaseReference)
  ) {
    return failed('UNAVAILABLE');
  }

  if (mode === 'RESERVE') {
    if (
      (result.disposition !== 'ACQUIRED' && result.disposition !== 'ALREADY_OWNED') ||
      result.expiresAt === undefined ||
      !validTimestamp(result.expiresAt)
    ) {
      return failed('UNAVAILABLE');
    }
    return result;
  }

  if (mode === 'HEARTBEAT') {
    if (
      result.disposition !== 'RENEWED' ||
      result.expiresAt === undefined ||
      !validTimestamp(result.expiresAt)
    ) {
      return failed('UNAVAILABLE');
    }
    return result;
  }

  if (result.disposition !== 'RELEASED' || result.expiresAt !== undefined) {
    return failed('UNAVAILABLE');
  }
  return result;
}

/**
 * W07-G/H durable HALF_OPEN owner fence.
 *
 * A successful lease is only serialized ownership of the one HALF_OPEN probe. It never grants
 * execution authority, proves an external effect, or creates retry permission. The caller still
 * must use the canonical W07-G circuit transition with the same probeActionIntentId.
 */
export function reserveDurableHalfOpenProbe(
  request: DurableHalfOpenProbeRequest,
  port: DurableHalfOpenProbePort,
): DurableHalfOpenProbeFenceResult {
  if (!validRequest(request)) return failed('MALFORMED');
  let result: DurableHalfOpenProbePortResult;
  try {
    result = port.reserve(request);
  } catch {
    return failed('UNAVAILABLE');
  }
  return normalizePortResult(result, request, 'RESERVE');
}

export function heartbeatDurableHalfOpenProbe(
  request: DurableHalfOpenProbeRequest,
  port: DurableHalfOpenProbePort,
): DurableHalfOpenProbeFenceResult {
  if (!validRequest(request)) return failed('MALFORMED');
  let result: DurableHalfOpenProbePortResult;
  try {
    result = port.heartbeat(request);
  } catch {
    return failed('UNAVAILABLE');
  }
  return normalizePortResult(result, request, 'HEARTBEAT');
}

export function releaseDurableHalfOpenProbe(
  request: DurableHalfOpenProbeReleaseRequest,
  port: DurableHalfOpenProbePort,
): DurableHalfOpenProbeFenceResult {
  if (!validReleaseRequest(request)) return failed('MALFORMED');
  let result: DurableHalfOpenProbePortResult;
  try {
    result = port.release(request);
  } catch {
    return failed('UNAVAILABLE');
  }
  return normalizePortResult(result, request, 'RELEASE');
}
