const SHA256 = /^[a-f0-9]{64}$/u;
const SAFE_TEXT = /^[A-Za-z0-9._:/+ -]+$/u;
const MAX_TEXT = 512;
const MAX_ENTRIES = 64;
const MAX_PHRASES = 64;
const TARGET_KINDS = new Set(['PROVIDER', 'DEVICE', 'WORKFLOW', 'LOCAL_SERVICE', 'GATEWAY']);
const AVAILABILITY = new Set([
  'CURRENT_AVAILABLE',
  'CURRENT_DEGRADED',
  'UNAVAILABLE',
  'UNKNOWN',
  'STALE',
]);
const RISK_CLASSES = new Set(['LOW', 'MEDIUM', 'HIGH', 'CRITICAL']);

export const VOICE_PROJECTION_DEVICE_ROUTE = '/v1/device/voice/projection' as const;

export interface VoiceProjectionSocketContext {
  readonly tenantId: string;
  readonly actorIdentityId: string;
  readonly correlationId: string;
  readonly gatewaySessionId: string;
  readonly connectionId: string;
  readonly deviceSessionId: string;
  readonly deviceId: string;
  readonly registrationVersion: number;
}

export interface VoiceProjectionProvenance {
  readonly sourceRef: string;
  readonly contentSha256: string;
}

export interface VoiceCapabilityProjectionEntry {
  readonly capabilityId: string;
  readonly tenantId?: string;
  readonly supportedTargetKinds: readonly string[];
  readonly currentAvailability: string;
  readonly riskClass: string;
  readonly observedAtMs: number;
  readonly expiresAtMs: number;
}

export interface VoiceCommandProjectionBinding {
  readonly commandId: string;
  readonly phrases: readonly string[];
  readonly capabilityId: string;
}

export interface NativeCapabilityProjectionBinding {
  readonly capabilityId: string;
  readonly minApiLevel: number;
  readonly requiredFeatures: readonly string[];
  readonly requiredPermissions: readonly string[];
  readonly maxSnapshotAgeMs: number;
}

export interface GovernedVoiceProjection {
  readonly kind: 'GOVERNED_VOICE_PROJECTION';
  readonly activeTenantId: string;
  readonly registry: Readonly<{
    readonly registryKind: 'AURORA_CANONICAL_CAPABILITY_REGISTRY';
    readonly registryVersion: string;
    readonly observedAtMs: number;
    readonly expiresAtMs: number;
    readonly provenance: VoiceProjectionProvenance;
    readonly entries: readonly VoiceCapabilityProjectionEntry[];
  }>;
  readonly vocabulary: Readonly<{
    readonly vocabularyVersion: string;
    readonly observedAtMs: number;
    readonly expiresAtMs: number;
    readonly provenance: VoiceProjectionProvenance;
    readonly bindings: readonly VoiceCommandProjectionBinding[];
  }>;
  readonly nativeBindings: readonly NativeCapabilityProjectionBinding[];
  readonly authorizesExecution: false;
  readonly provesExecutionSuccess: false;
  readonly retryAuthorized: false;
}

export interface GovernedVoiceProjectionSource {
  current(input: {
    readonly context: VoiceProjectionSocketContext;
    readonly nowMs: number;
  }): GovernedVoiceProjection | null;
}

export interface VoiceProjectionNetworkResponse {
  readonly statusCode: number;
  readonly body: Readonly<Record<string, unknown>>;
}

function boundedText(value: unknown, maximum = MAX_TEXT): value is string {
  return (
    typeof value === 'string' &&
    value.length > 0 &&
    value.length <= maximum &&
    value === value.trim() &&
    SAFE_TEXT.test(value)
  );
}

function nonNegativeInteger(value: unknown): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0;
}

function positiveInteger(value: unknown): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value > 0;
}

function unique(values: readonly string[]): boolean {
  return new Set(values).size === values.length;
}

function validProvenance(value: VoiceProjectionProvenance): boolean {
  return boundedText(value.sourceRef) && SHA256.test(value.contentSha256);
}

function validCapability(
  entry: VoiceCapabilityProjectionEntry,
  activeTenantId: string,
  nowMs: number,
): boolean {
  return (
    boundedText(entry.capabilityId, 256) &&
    (entry.tenantId === undefined || entry.tenantId === activeTenantId) &&
    Array.isArray(entry.supportedTargetKinds) &&
    entry.supportedTargetKinds.length > 0 &&
    entry.supportedTargetKinds.length <= TARGET_KINDS.size &&
    unique(entry.supportedTargetKinds) &&
    entry.supportedTargetKinds.every((value) => TARGET_KINDS.has(value)) &&
    AVAILABILITY.has(entry.currentAvailability) &&
    RISK_CLASSES.has(entry.riskClass) &&
    nonNegativeInteger(entry.observedAtMs) &&
    positiveInteger(entry.expiresAtMs) &&
    entry.observedAtMs <= nowMs &&
    nowMs < entry.expiresAtMs
  );
}

function validCommand(binding: VoiceCommandProjectionBinding): boolean {
  return (
    boundedText(binding.commandId, 256) &&
    boundedText(binding.capabilityId, 256) &&
    Array.isArray(binding.phrases) &&
    binding.phrases.length > 0 &&
    binding.phrases.length <= MAX_PHRASES &&
    unique(binding.phrases) &&
    binding.phrases.every((value) => boundedText(value.toLowerCase(), 256) && value === value.trim())
  );
}

function validNativeBinding(binding: NativeCapabilityProjectionBinding): boolean {
  return (
    boundedText(binding.capabilityId, 256) &&
    Number.isSafeInteger(binding.minApiLevel) &&
    binding.minApiLevel >= 26 &&
    Array.isArray(binding.requiredFeatures) &&
    binding.requiredFeatures.length <= 32 &&
    unique(binding.requiredFeatures) &&
    binding.requiredFeatures.every((value) => boundedText(value, 256)) &&
    Array.isArray(binding.requiredPermissions) &&
    binding.requiredPermissions.length <= 32 &&
    unique(binding.requiredPermissions) &&
    binding.requiredPermissions.every((value) => boundedText(value, 256)) &&
    positiveInteger(binding.maxSnapshotAgeMs) &&
    binding.maxSnapshotAgeMs <= 300_000
  );
}

function validProjection(
  projection: GovernedVoiceProjection,
  context: VoiceProjectionSocketContext,
  nowMs: number,
): boolean {
  if (
    projection.kind !== 'GOVERNED_VOICE_PROJECTION' ||
    projection.activeTenantId !== context.tenantId ||
    projection.authorizesExecution !== false ||
    projection.provesExecutionSuccess !== false ||
    projection.retryAuthorized !== false ||
    projection.registry.registryKind !== 'AURORA_CANONICAL_CAPABILITY_REGISTRY' ||
    !boundedText(projection.registry.registryVersion, 128) ||
    !nonNegativeInteger(projection.registry.observedAtMs) ||
    !positiveInteger(projection.registry.expiresAtMs) ||
    projection.registry.observedAtMs > nowMs ||
    nowMs >= projection.registry.expiresAtMs ||
    !validProvenance(projection.registry.provenance) ||
    !Array.isArray(projection.registry.entries) ||
    projection.registry.entries.length === 0 ||
    projection.registry.entries.length > MAX_ENTRIES ||
    !boundedText(projection.vocabulary.vocabularyVersion, 128) ||
    !nonNegativeInteger(projection.vocabulary.observedAtMs) ||
    !positiveInteger(projection.vocabulary.expiresAtMs) ||
    projection.vocabulary.observedAtMs > nowMs ||
    nowMs >= projection.vocabulary.expiresAtMs ||
    !validProvenance(projection.vocabulary.provenance) ||
    !Array.isArray(projection.vocabulary.bindings) ||
    projection.vocabulary.bindings.length === 0 ||
    projection.vocabulary.bindings.length > MAX_ENTRIES ||
    !Array.isArray(projection.nativeBindings) ||
    projection.nativeBindings.length === 0 ||
    projection.nativeBindings.length > MAX_ENTRIES
  ) {
    return false;
  }

  const capabilities = projection.registry.entries.map((entry) => entry.capabilityId);
  const commands = projection.vocabulary.bindings.map((binding) => binding.commandId);
  const nativeCapabilities = projection.nativeBindings.map((binding) => binding.capabilityId);
  if (!unique(capabilities) || !unique(commands) || !unique(nativeCapabilities)) return false;
  if (!projection.registry.entries.every((entry) => validCapability(entry, context.tenantId, nowMs))) {
    return false;
  }
  if (!projection.vocabulary.bindings.every(validCommand)) return false;
  if (!projection.nativeBindings.every(validNativeBinding)) return false;
  const capabilitySet = new Set(capabilities);
  if (projection.vocabulary.bindings.some((binding) => !capabilitySet.has(binding.capabilityId))) {
    return false;
  }
  if (projection.nativeBindings.some((binding) => !capabilitySet.has(binding.capabilityId))) {
    return false;
  }
  return true;
}

function error(code: string, statusCode = 503): VoiceProjectionNetworkResponse {
  return {
    statusCode,
    body: {
      ok: false,
      voiceProjectionError: { code },
      authorizesExecution: false,
      provesExecutionSuccess: false,
      retryAuthorized: false,
    },
  };
}

/**
 * Authenticated W14 transport boundary for current W04/W15-G projections.
 *
 * The source is server-controlled and tenant-bound. The projection only says which command/capability
 * vocabulary is current and locally eligible; it never carries PolicyToken/OwnerDecision/W07
 * execution authority, outcome truth or retry permission.
 */
export class VoiceProjectionNetworkBoundary {
  readonly #source: GovernedVoiceProjectionSource;

  constructor(source: GovernedVoiceProjectionSource) {
    this.#source = source;
  }

  current(context: VoiceProjectionSocketContext, nowMs: number): VoiceProjectionNetworkResponse {
    let projection: GovernedVoiceProjection | null;
    try {
      projection = this.#source.current({ context, nowMs });
    } catch {
      return error('VOICE_PROJECTION_SOURCE_UNAVAILABLE');
    }
    if (projection === null) return error('VOICE_PROJECTION_UNAVAILABLE', 409);
    if (!validProjection(projection, context, nowMs)) {
      return error('VOICE_PROJECTION_PROTOCOL_VIOLATION');
    }
    return {
      statusCode: 200,
      body: {
        ok: true,
        value: projection,
        authorizesExecution: false,
        provesExecutionSuccess: false,
        retryAuthorized: false,
      },
    };
  }
}
