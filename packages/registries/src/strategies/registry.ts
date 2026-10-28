export const STRATEGY_KINDS = [
  'DETERMINISTIC',
  'MODEL',
  'SPECIALIST',
  'COMPUTER_USE_PLANNING',
  'HUMAN',
] as const;
export type StrategyKind = (typeof STRATEGY_KINDS)[number];

export const STRATEGY_AVAILABILITY_STATES = [
  'AVAILABLE',
  'DEGRADED',
  'UNAVAILABLE',
  'UNKNOWN',
] as const;
export type StrategyAvailabilityState = (typeof STRATEGY_AVAILABILITY_STATES)[number];
export type StrategyCurrentAvailability =
  'CURRENT_AVAILABLE' | 'CURRENT_DEGRADED' | 'UNAVAILABLE' | 'UNKNOWN' | 'STALE';

export interface StrategyAvailabilityObservation {
  readonly state: StrategyAvailabilityState;
  readonly observedAt: string;
  readonly maxAgeMs: number;
  readonly source: string;
}

/**
 * Compatibility is planning metadata only. It cannot grant tool, provider,
 * approval, policy, target or execution authority.
 */
export interface StrategyCompatibility {
  readonly modalities: readonly string[];
  readonly taskClasses: readonly string[];
  readonly reasoningLevels: readonly string[];
}

export interface StrategyDescriptor {
  readonly strategyId: string;
  readonly semanticVersion: string;
  readonly kind: StrategyKind;
  readonly name: string;
  readonly description: string;
  readonly compatibility: StrategyCompatibility;
  readonly availability: StrategyAvailabilityObservation;
  readonly fallbackStrategyIds: readonly string[];
}

export interface StrategyRegistrySnapshot {
  readonly registryKind: 'AURORA_INTELLIGENCE_STRATEGY_REGISTRY';
  readonly registryVersion: string;
  readonly entries: readonly StrategyDescriptor[];
}

export type StrategyRegistryCreateResult =
  | { readonly status: 'CREATED'; readonly registry: StrategyRegistrySnapshot }
  | {
      readonly status: 'REJECTED';
      readonly code:
        | 'INVALID_REGISTRY_VERSION'
        | 'INVALID_STRATEGY'
        | 'DUPLICATE_STRATEGY_ID'
        | 'UNKNOWN_FALLBACK_STRATEGY'
        | 'FALLBACK_CYCLE';
      readonly strategyId?: string;
      readonly fallbackStrategyId?: string;
    };

export interface StrategySelectionRequest {
  readonly preferredStrategyId: string;
  readonly modality: string;
  readonly taskClass: string;
  readonly reasoningLevel: string;
  readonly nowEpochMs: number;
}

export type StrategySelectionResult =
  | {
      readonly status: 'SELECTED';
      readonly strategy: StrategyDescriptor;
      readonly selectedVia: 'PREFERRED' | 'FALLBACK';
      readonly currentAvailability: 'CURRENT_AVAILABLE' | 'CURRENT_DEGRADED';
      readonly authorizesExecution: false;
    }
  | {
      readonly status: 'NOT_SELECTED';
      readonly code: 'NOT_FOUND' | 'NO_COMPATIBLE_AVAILABLE_STRATEGY';
      readonly authorizesExecution: false;
    };

function nonEmpty(value: string): boolean {
  return value.trim().length > 0;
}

function nonEmptyUnique(values: readonly string[]): boolean {
  if (values.length === 0 || values.some((value) => !nonEmpty(value))) return false;
  return new Set(values).size === values.length;
}

function validObservation(observation: StrategyAvailabilityObservation): boolean {
  return (
    STRATEGY_AVAILABILITY_STATES.includes(observation.state) &&
    nonEmpty(observation.source) &&
    Number.isFinite(observation.maxAgeMs) &&
    observation.maxAgeMs >= 0 &&
    Number.isFinite(Date.parse(observation.observedAt))
  );
}

function validStrategy(strategy: StrategyDescriptor): boolean {
  return (
    nonEmpty(strategy.strategyId) &&
    nonEmpty(strategy.semanticVersion) &&
    STRATEGY_KINDS.includes(strategy.kind) &&
    nonEmpty(strategy.name) &&
    nonEmpty(strategy.description) &&
    nonEmptyUnique(strategy.compatibility.modalities) &&
    nonEmptyUnique(strategy.compatibility.taskClasses) &&
    nonEmptyUnique(strategy.compatibility.reasoningLevels) &&
    new Set(strategy.fallbackStrategyIds).size === strategy.fallbackStrategyIds.length &&
    strategy.fallbackStrategyIds.every(nonEmpty) &&
    !strategy.fallbackStrategyIds.includes(strategy.strategyId) &&
    validObservation(strategy.availability)
  );
}

function hasFallbackCycle(entries: readonly StrategyDescriptor[]): string | undefined {
  const byId = new Map(entries.map((entry) => [entry.strategyId, entry]));
  const visiting = new Set<string>();
  const visited = new Set<string>();

  function visit(strategyId: string): string | undefined {
    if (visiting.has(strategyId)) return strategyId;
    if (visited.has(strategyId)) return undefined;
    visiting.add(strategyId);
    const entry = byId.get(strategyId);
    for (const fallbackId of entry?.fallbackStrategyIds ?? []) {
      const cycleAt = visit(fallbackId);
      if (cycleAt) return cycleAt;
    }
    visiting.delete(strategyId);
    visited.add(strategyId);
    return undefined;
  }

  for (const entry of entries) {
    const cycleAt = visit(entry.strategyId);
    if (cycleAt) return cycleAt;
  }
  return undefined;
}

export function createStrategyRegistry(
  registryVersion: string,
  entries: readonly StrategyDescriptor[],
): StrategyRegistryCreateResult {
  if (!nonEmpty(registryVersion)) {
    return { status: 'REJECTED', code: 'INVALID_REGISTRY_VERSION' };
  }

  const byId = new Map<string, StrategyDescriptor>();
  for (const entry of entries) {
    if (!validStrategy(entry)) {
      return {
        status: 'REJECTED',
        code: 'INVALID_STRATEGY',
        strategyId: entry.strategyId,
      };
    }
    if (byId.has(entry.strategyId)) {
      return {
        status: 'REJECTED',
        code: 'DUPLICATE_STRATEGY_ID',
        strategyId: entry.strategyId,
      };
    }
    byId.set(entry.strategyId, entry);
  }

  for (const entry of entries) {
    for (const fallbackStrategyId of entry.fallbackStrategyIds) {
      if (!byId.has(fallbackStrategyId)) {
        return {
          status: 'REJECTED',
          code: 'UNKNOWN_FALLBACK_STRATEGY',
          strategyId: entry.strategyId,
          fallbackStrategyId,
        };
      }
    }
  }

  const cycleAt = hasFallbackCycle(entries);
  if (cycleAt) {
    return { status: 'REJECTED', code: 'FALLBACK_CYCLE', strategyId: cycleAt };
  }

  return {
    status: 'CREATED',
    registry: {
      registryKind: 'AURORA_INTELLIGENCE_STRATEGY_REGISTRY',
      registryVersion,
      entries: [...entries].sort((left, right) => left.strategyId.localeCompare(right.strategyId)),
    },
  };
}

export function findStrategy(
  registry: StrategyRegistrySnapshot,
  strategyId: string,
): StrategyDescriptor | undefined {
  return registry.entries.find((entry) => entry.strategyId === strategyId);
}

export function evaluateStrategyAvailability(
  observation: StrategyAvailabilityObservation,
  nowEpochMs: number,
): StrategyCurrentAvailability {
  const observedAt = Date.parse(observation.observedAt);
  if (!Number.isFinite(observedAt) || !Number.isFinite(nowEpochMs)) return 'UNKNOWN';
  if (nowEpochMs < observedAt || nowEpochMs - observedAt > observation.maxAgeMs) return 'STALE';

  switch (observation.state) {
    case 'AVAILABLE':
      return 'CURRENT_AVAILABLE';
    case 'DEGRADED':
      return 'CURRENT_DEGRADED';
    case 'UNAVAILABLE':
      return 'UNAVAILABLE';
    case 'UNKNOWN':
      return 'UNKNOWN';
  }
}

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

/**
 * Create one optional descriptor in the canonical W05-E registry. Without a
 * current, separately attested runtime projection it remains unselectable.
 * The projection is a caller assertion, not a cryptographic attestation; the
 * consuming host must prove it before the strategy can be activated.
 */
export function createLocalQwenStrategyDescriptor(
  request: LocalQwenDescriptorRequest,
): StrategyDescriptor {
  const health = request?.health;
  const healthObservation: StrategyAvailabilityObservation | undefined = health
    ? {
        state: health.state,
        observedAt: health.observedAt,
        maxAgeMs: health.maxAgeMs,
        source: health.source,
      }
    : undefined;
  const currentState =
    health &&
    healthObservation &&
    Number.isSafeInteger(request?.nowEpochMs) &&
    Number.isSafeInteger(health.maxAgeMs) &&
    health.maxAgeMs >= 0 &&
    health.maxAgeMs <= LOCAL_QWEN_MAX_AGE_MS &&
    health.modelIntegrityVerified === true &&
    health.endpointIdentityVerified === true &&
    health.authorizesExecution === false &&
    health.source === 'W05F_VERIFIED_LOCAL_MODEL_HEALTH' &&
    (health.state === 'AVAILABLE' || health.state === 'DEGRADED' || health.state === 'UNAVAILABLE')
      ? evaluateStrategyAvailability(healthObservation, request.nowEpochMs)
      : null;
  const observation =
    currentState === 'CURRENT_AVAILABLE' ||
    currentState === 'CURRENT_DEGRADED' ||
    currentState === 'UNAVAILABLE'
      ? (healthObservation ?? LOCAL_QWEN_UNVERIFIED_OBSERVATION)
      : LOCAL_QWEN_UNVERIFIED_OBSERVATION;

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
    availability: observation,
    fallbackStrategyIds: request?.fallbackStrategyIds ?? [],
  };
}

export function isStrategyCompatible(
  strategy: StrategyDescriptor,
  request: Pick<StrategySelectionRequest, 'modality' | 'taskClass' | 'reasoningLevel'>,
): boolean {
  return (
    strategy.compatibility.modalities.includes(request.modality) &&
    strategy.compatibility.taskClasses.includes(request.taskClass) &&
    strategy.compatibility.reasoningLevels.includes(request.reasoningLevel)
  );
}

export function selectStrategy(
  registry: StrategyRegistrySnapshot,
  request: StrategySelectionRequest,
): StrategySelectionResult {
  const preferred = findStrategy(registry, request.preferredStrategyId);
  if (!preferred) {
    return {
      status: 'NOT_SELECTED',
      code: 'NOT_FOUND',
      authorizesExecution: false,
    };
  }

  const byId = new Map(registry.entries.map((entry) => [entry.strategyId, entry]));
  const queue: Array<{
    readonly id: string;
    readonly via: 'PREFERRED' | 'FALLBACK';
  }> = [{ id: preferred.strategyId, via: 'PREFERRED' }];
  const visited = new Set<string>();

  while (queue.length > 0) {
    const candidateRef = queue.shift();
    if (!candidateRef || visited.has(candidateRef.id)) continue;
    visited.add(candidateRef.id);
    const candidate = byId.get(candidateRef.id);
    if (!candidate) continue;

    const availability = evaluateStrategyAvailability(candidate.availability, request.nowEpochMs);
    if (
      (availability === 'CURRENT_AVAILABLE' || availability === 'CURRENT_DEGRADED') &&
      isStrategyCompatible(candidate, request)
    ) {
      return {
        status: 'SELECTED',
        strategy: candidate,
        selectedVia: candidateRef.via,
        currentAvailability: availability,
        authorizesExecution: false,
      };
    }

    for (const fallbackId of candidate.fallbackStrategyIds) {
      queue.push({ id: fallbackId, via: 'FALLBACK' });
    }
  }

  return {
    status: 'NOT_SELECTED',
    code: 'NO_COMPATIBLE_AVAILABLE_STRATEGY',
    authorizesExecution: false,
  };
}
