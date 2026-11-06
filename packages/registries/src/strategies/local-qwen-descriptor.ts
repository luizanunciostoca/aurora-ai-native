import {
  evaluateStrategyAvailability,
  type StrategyAvailabilityObservation,
  type StrategyDescriptor,
} from './registry.js';

// Readiness-only leaf: deliberately absent from package barrels and exports.

/**
 * W05-E readiness for the W05-F local inference candidate. W05-E consumes
 * observed health; it never probes Android/Termux, verifies GGUF bytes, or
 * grants a model permission to invoke a tool. The separate W05-F verifier and
 * Android endpoint-identity boundary are not implemented by this descriptor.
 */
export interface LocalQwenHealthProjection {
  readonly source: 'W05F_VERIFIED_LOCAL_MODEL_HEALTH';
  readonly state: 'AVAILABLE' | 'DEGRADED' | 'UNAVAILABLE';
  readonly observedAt: string;
  readonly maxAgeMs: number;
  readonly modelIntegrityVerified: true;
  readonly endpointIdentityVerified: true;
  readonly authorizesExecution: false;
}

export interface LocalQwenDescriptorRequest {
  readonly nowEpochMs: number;
  readonly health?: LocalQwenHealthProjection;
  readonly fallbackStrategyIds?: readonly string[];
}

const LOCAL_QWEN_MAX_AGE_MS = 10_000;
const LOCAL_QWEN_UNVERIFIED_OBSERVATION: StrategyAvailabilityObservation = {
  state: 'UNKNOWN',
  observedAt: '1970-01-01T00:00:00.000Z',
  maxAgeMs: 0,
  source: 'W05F_LOCAL_MODEL_NOT_VERIFIED',
};

/** Consume only the projection's data fields, never accessors or extra metadata. */
function snapshotLocalQwenData(
  value: unknown,
  fields: readonly string[],
): Record<string, unknown> | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const snapshot = Object.create(null) as Record<string, unknown>;
  for (const field of fields) {
    const descriptor = Object.getOwnPropertyDescriptor(value, field);
    if (!descriptor) continue;
    if (!('value' in descriptor)) return null;
    snapshot[field] = descriptor.value as unknown;
  }
  return snapshot;
}

/** Preserve explicit fallback order without retaining a caller-owned array or iterator. */
function snapshotLocalQwenFallbacks(value: unknown): string[] | null {
  if (value === undefined) return [];
  if (!Array.isArray(value)) return null;
  const lengthDescriptor = Object.getOwnPropertyDescriptor(value, 'length');
  if (!lengthDescriptor || !('value' in lengthDescriptor)) return null;
  const length: unknown = lengthDescriptor.value;
  if (typeof length !== 'number' || !Number.isSafeInteger(length) || length < 0) return null;

  // Refuse sparse input before iterating an attacker-controlled length. Extra
  // methods/metadata are not consumed, including Symbol.iterator accessors.
  const indices = Reflect.ownKeys(value).filter(
    (key) => typeof key === 'string' && /^(0|[1-9][0-9]*)$/.test(key) && Number(key) < length,
  );
  if (indices.length !== length) return null;
  const copied: string[] = [];
  for (let index = 0; index < length; index += 1) {
    const descriptor = Object.getOwnPropertyDescriptor(value, String(index));
    if (!descriptor || !('value' in descriptor) || typeof descriptor.value !== 'string')
      return null;
    copied.push(descriptor.value);
  }
  return copied;
}

function snapshotLocalQwenRequest(value: unknown): {
  nowEpochMs: unknown;
  health: Record<string, unknown> | undefined;
  fallbackStrategyIds: readonly string[];
} | null {
  try {
    const request = snapshotLocalQwenData(value, ['nowEpochMs', 'health', 'fallbackStrategyIds']);
    if (!request) return null;
    const fallbackStrategyIds = snapshotLocalQwenFallbacks(request.fallbackStrategyIds);
    if (!fallbackStrategyIds) return null;
    const health =
      request.health === undefined
        ? undefined
        : snapshotLocalQwenData(request.health, [
            'source',
            'state',
            'observedAt',
            'maxAgeMs',
            'modelIntegrityVerified',
            'endpointIdentityVerified',
            'authorizesExecution',
          ]);
    if (health === null) return null;
    return { nowEpochMs: request.nowEpochMs, health, fallbackStrategyIds };
  } catch {
    // Reflection can fail on revoked/hostile proxies. Invalid ingress must not
    // preserve selectable health or expose private exception details.
    return null;
  }
}

/**
 * Create one optional descriptor in the canonical W05-E registry. Without a
 * current, separately attested runtime projection it remains unselectable.
 * The projection is a caller assertion, not a cryptographic attestation; the
 * consuming host must prove it before the strategy can be activated.
 */
export function createLocalQwenStrategyDescriptor(
  request: LocalQwenDescriptorRequest,
): StrategyDescriptor {
  const snapshot = snapshotLocalQwenRequest(request);
  const health = snapshot?.health;
  let observation = LOCAL_QWEN_UNVERIFIED_OBSERVATION;
  if (
    snapshot &&
    health &&
    typeof snapshot.nowEpochMs === 'number' &&
    Number.isSafeInteger(snapshot.nowEpochMs) &&
    typeof health.observedAt === 'string' &&
    typeof health.maxAgeMs === 'number' &&
    Number.isSafeInteger(health.maxAgeMs) &&
    health.maxAgeMs >= 0 &&
    health.maxAgeMs <= LOCAL_QWEN_MAX_AGE_MS &&
    health.modelIntegrityVerified === true &&
    health.endpointIdentityVerified === true &&
    health.authorizesExecution === false &&
    health.source === 'W05F_VERIFIED_LOCAL_MODEL_HEALTH' &&
    (health.state === 'AVAILABLE' || health.state === 'DEGRADED' || health.state === 'UNAVAILABLE')
  ) {
    const healthObservation: StrategyAvailabilityObservation = {
      state: health.state,
      observedAt: health.observedAt,
      maxAgeMs: health.maxAgeMs,
      source: health.source,
    };
    const currentState = evaluateStrategyAvailability(healthObservation, snapshot.nowEpochMs);
    if (
      currentState === 'CURRENT_AVAILABLE' ||
      currentState === 'CURRENT_DEGRADED' ||
      currentState === 'UNAVAILABLE'
    ) {
      observation = healthObservation;
    }
  }

  return {
    strategyId: 'aurora.local.qwen35.2b',
    semanticVersion: '1',
    kind: 'MODEL',
    name: 'Local Qwen3.5-2B candidate',
    description: 'Bounded text/code inference; informational output only.',
    compatibility: {
      modalities: ['TEXT', 'CODE'],
      taskClasses: ['INFORMATIONAL', 'GENERATIVE'],
      reasoningLevels: ['L1', 'L2', 'L3'],
    },
    // Never let a consumer mutate the shared UNKNOWN default for later calls.
    availability: { ...observation },
    fallbackStrategyIds: snapshot?.fallbackStrategyIds ?? [],
  };
}
