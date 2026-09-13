import type { CorrelationId, TenantId } from '../../../contracts/src/ids/types.ts';
import {
  evaluateCapabilityAvailability,
  findCapability,
  type CapabilityCurrentAvailability,
  type CapabilityRegistrySnapshot,
} from '../../../registries/src/capabilities/registry.ts';

const MAX_SHORTCUTS = 256;
const MAX_ALIASES_PER_SHORTCUT = 16;
const MAX_ALIAS_CHARS = 128;
const MAX_REFERENCE_CHARS = 512;

export const USER_SHORTCUT_TARGET_KINDS = ['CAPABILITY', 'CAPABILITY_BINDING'] as const;
export type UserShortcutTargetKind = (typeof USER_SHORTCUT_TARGET_KINDS)[number];

export type UserShortcutTarget =
  | {
      readonly kind: 'CAPABILITY';
      readonly capabilityId: string;
    }
  | {
      readonly kind: 'CAPABILITY_BINDING';
      readonly capabilityId: string;
      readonly bindingId: string;
    };

export interface UserShortcutEntry {
  readonly shortcutId: string;
  readonly tenantId: TenantId;
  readonly aliases: readonly string[];
  readonly target: UserShortcutTarget;
  readonly enabled: boolean;
  readonly provenance: {
    readonly sourceKind: 'USER' | 'ADMIN' | 'AURORA_NATIVE';
    readonly sourceRef: string;
  };
}

export interface UserShortcutRegistrySnapshot {
  readonly registryKind: 'AURORA_USER_SHORTCUT_REGISTRY';
  readonly registryVersion: string;
  readonly entries: readonly UserShortcutEntry[];
}

export type UserShortcutRegistryCreateResult =
  | {
      readonly status: 'CREATED';
      readonly registry: UserShortcutRegistrySnapshot;
    }
  | {
      readonly status: 'REJECTED';
      readonly code:
        | 'INVALID_REGISTRY_VERSION'
        | 'TOO_MANY_SHORTCUTS'
        | 'INVALID_SHORTCUT'
        | 'DUPLICATE_SHORTCUT_ID'
        | 'DUPLICATE_ALIAS'
        | 'UNKNOWN_CAPABILITY'
        | 'UNKNOWN_BINDING'
        | 'TENANT_MISMATCH';
      readonly shortcutId?: string;
      readonly alias?: string;
    };

export type UserShortcutResolveResult =
  | { readonly status: 'NOT_FOUND'; readonly authorizesExecution: false }
  | {
      readonly status: 'RESOLVED';
      readonly tenantId: TenantId;
      readonly correlationId: CorrelationId;
      readonly shortcutId: string;
      readonly matchedAlias: string;
      readonly capabilityId: string;
      readonly bindingId?: string;
      readonly currentAvailability: CapabilityCurrentAvailability;
      readonly authorizesExecution: false;
      readonly provesExecutionSuccess: false;
      readonly retryAuthorized: false;
    };

function nonEmptyBounded(value: string, maxLength = MAX_REFERENCE_CHARS): boolean {
  return value.trim().length > 0 && value.length <= maxLength;
}

export function normalizeShortcutAlias(value: string): string {
  return value.normalize('NFKC').trim().toLocaleLowerCase('en-US').replace(/\s+/gu, ' ');
}

function validAlias(value: string): boolean {
  const normalized = normalizeShortcutAlias(value);
  return normalized.length > 0 && normalized.length <= MAX_ALIAS_CHARS;
}

function validShortcutShape(entry: UserShortcutEntry): boolean {
  if (
    !nonEmptyBounded(entry.shortcutId, 128) ||
    entry.aliases.length === 0 ||
    entry.aliases.length > MAX_ALIASES_PER_SHORTCUT ||
    !entry.aliases.every(validAlias) ||
    !nonEmptyBounded(entry.target.capabilityId) ||
    !nonEmptyBounded(entry.provenance.sourceRef)
  ) {
    return false;
  }
  return entry.target.kind === 'CAPABILITY' || nonEmptyBounded(entry.target.bindingId);
}

function targetExistsForTenant(
  entry: UserShortcutEntry,
  capabilities: CapabilityRegistrySnapshot,
): 'OK' | 'UNKNOWN_CAPABILITY' | 'UNKNOWN_BINDING' | 'TENANT_MISMATCH' {
  const capability = findCapability(capabilities, entry.target.capabilityId);
  if (capability === undefined) return 'UNKNOWN_CAPABILITY';
  if (capability.tenantId !== undefined && capability.tenantId !== entry.tenantId) {
    return 'TENANT_MISMATCH';
  }
  if (entry.target.kind === 'CAPABILITY') return 'OK';
  const targetBindingId = entry.target.bindingId;
  const binding = capability.bindings.find((candidate) => candidate.bindingId === targetBindingId);
  if (binding === undefined) return 'UNKNOWN_BINDING';
  if (binding.tenantId !== undefined && binding.tenantId !== entry.tenantId) {
    return 'TENANT_MISMATCH';
  }
  return 'OK';
}

export function createUserShortcutRegistry(
  registryVersion: string,
  entries: readonly UserShortcutEntry[],
  capabilities: CapabilityRegistrySnapshot,
): UserShortcutRegistryCreateResult {
  if (!nonEmptyBounded(registryVersion, 128)) {
    return { status: 'REJECTED', code: 'INVALID_REGISTRY_VERSION' };
  }
  if (entries.length > MAX_SHORTCUTS) {
    return { status: 'REJECTED', code: 'TOO_MANY_SHORTCUTS' };
  }

  const shortcutIds = new Set<string>();
  const aliasesByTenant = new Set<string>();
  const frozenEntries: UserShortcutEntry[] = [];

  for (const entry of entries) {
    if (!validShortcutShape(entry)) {
      return {
        status: 'REJECTED',
        code: 'INVALID_SHORTCUT',
        shortcutId: entry.shortcutId,
      };
    }
    if (shortcutIds.has(entry.shortcutId)) {
      return {
        status: 'REJECTED',
        code: 'DUPLICATE_SHORTCUT_ID',
        shortcutId: entry.shortcutId,
      };
    }
    shortcutIds.add(entry.shortcutId);

    const targetStatus = targetExistsForTenant(entry, capabilities);
    if (targetStatus !== 'OK') {
      return {
        status: 'REJECTED',
        code: targetStatus,
        shortcutId: entry.shortcutId,
      };
    }

    const normalizedAliases = entry.aliases.map(normalizeShortcutAlias);
    const localAliases = new Set<string>();
    for (const alias of normalizedAliases) {
      if (localAliases.has(alias)) {
        return {
          status: 'REJECTED',
          code: 'DUPLICATE_ALIAS',
          shortcutId: entry.shortcutId,
          alias,
        };
      }
      localAliases.add(alias);
      const tenantAliasKey = `${entry.tenantId}\u0000${alias}`;
      if (aliasesByTenant.has(tenantAliasKey)) {
        return {
          status: 'REJECTED',
          code: 'DUPLICATE_ALIAS',
          shortcutId: entry.shortcutId,
          alias,
        };
      }
      aliasesByTenant.add(tenantAliasKey);
    }

    frozenEntries.push(
      Object.freeze({
        ...entry,
        aliases: Object.freeze(normalizedAliases),
        target: Object.freeze({ ...entry.target }),
        provenance: Object.freeze({ ...entry.provenance }),
      }),
    );
  }

  return {
    status: 'CREATED',
    registry: Object.freeze({
      registryKind: 'AURORA_USER_SHORTCUT_REGISTRY',
      registryVersion,
      entries: Object.freeze(
        frozenEntries.sort((left, right) => left.shortcutId.localeCompare(right.shortcutId)),
      ),
    }),
  };
}

export function resolveUserShortcut(
  registry: UserShortcutRegistrySnapshot,
  capabilities: CapabilityRegistrySnapshot,
  tenantId: TenantId,
  correlationId: CorrelationId,
  utterance: string,
  nowEpochMs: number,
): UserShortcutResolveResult {
  const normalized = normalizeShortcutAlias(utterance);
  if (!validAlias(normalized)) return { status: 'NOT_FOUND', authorizesExecution: false };

  const entry = registry.entries.find(
    (candidate) =>
      candidate.enabled &&
      candidate.tenantId === tenantId &&
      candidate.aliases.some((alias) => alias === normalized),
  );
  if (entry === undefined) return { status: 'NOT_FOUND', authorizesExecution: false };

  const capability = findCapability(capabilities, entry.target.capabilityId);
  if (
    capability === undefined ||
    (capability.tenantId !== undefined && capability.tenantId !== tenantId)
  ) {
    return { status: 'NOT_FOUND', authorizesExecution: false };
  }

  let currentAvailability = evaluateCapabilityAvailability(capability.availability, nowEpochMs);
  let bindingId: string | undefined;
  if (entry.target.kind === 'CAPABILITY_BINDING') {
    const targetBindingId = entry.target.bindingId;
    const binding = capability.bindings.find(
      (candidate) =>
        candidate.bindingId === targetBindingId &&
        (candidate.tenantId === undefined || candidate.tenantId === tenantId),
    );
    if (binding === undefined) return { status: 'NOT_FOUND', authorizesExecution: false };
    bindingId = binding.bindingId;
    currentAvailability = evaluateCapabilityAvailability(binding.availability, nowEpochMs);
  }

  return Object.freeze({
    status: 'RESOLVED',
    tenantId,
    correlationId,
    shortcutId: entry.shortcutId,
    matchedAlias: normalized,
    capabilityId: capability.capabilityId,
    ...(bindingId === undefined ? {} : { bindingId }),
    currentAvailability,
    authorizesExecution: false,
    provesExecutionSuccess: false,
    retryAuthorized: false,
  });
}
