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
  | 'CURRENT_AVAILABLE'
  | 'CURRENT_DEGRADED'
  | 'UNAVAILABLE'
  | 'UNKNOWN'
  | 'STALE';

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
      return { status: 'REJECTED', code: 'INVALID_STRATEGY', strategyId: entry.strategyId };
    }
    if (byId.has(entry.strategyId)) {
      return { status: 'REJECTED', code: 'DUPLICATE_STRATEGY_ID', strategyId: entry.strategyId };
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
    return { status: 'NOT_SELECTED', code: 'NOT_FOUND', authorizesExecution: false };
  }

  const byId = new Map(registry.entries.map((entry) => [entry.strategyId, entry]));
  const queue: Array<{ readonly id: string; readonly via: 'PREFERRED' | 'FALLBACK' }> = [
    { id: preferred.strategyId, via: 'PREFERRED' },
  ];
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
