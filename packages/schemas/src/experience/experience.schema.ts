import {
  AURORA_EXPERIENCE_STATES,
  INTERACTION_INPUT_SOURCES,
  VOICE_RUNTIME_COMPONENTS,
  VOICE_RUNTIME_HEALTH_STATES,
  type AuroraExperienceState,
  type AuroraExperienceStateSnapshot,
  type InteractionInputSource,
  type UnifiedInteractionInput,
  type VoiceRuntimeComponent,
  type VoiceRuntimeComponentHealth,
  type VoiceRuntimeHealthSnapshot,
  type VoiceRuntimeHealthState,
} from '@aurora/contracts/experience';
import { DataClassificationSchema } from '../context/data-classification.schema';
import { Rfc3339TimestampSchema } from '../context/deadline.schema';
import { asRecord, assertExactKeys, createRuntimeSchema } from '../context/internal';
import { CorrelationIdSchema, InteractionSessionIdSchema, TenantIdSchema } from '../ids/id.schemas';
import {
  InteractionModalitySchema,
  InteractionTextContentSchema,
} from '../interaction-session/interaction-session.schema';

const EXPERIENCE_STATES = new Set<string>(AURORA_EXPERIENCE_STATES);
const INPUT_SOURCES = new Set<string>(INTERACTION_INPUT_SOURCES);
const VOICE_HEALTH_STATES = new Set<string>(VOICE_RUNTIME_HEALTH_STATES);
const VOICE_COMPONENTS = new Set<string>(VOICE_RUNTIME_COMPONENTS);
const MAX_REASON_CHARS = 512;
const MAX_COMPONENTS = VOICE_RUNTIME_COMPONENTS.length;

function parseEnum<T extends string>(
  value: unknown,
  allowed: ReadonlySet<string>,
  label: string,
): T {
  if (typeof value !== 'string' || !allowed.has(value)) {
    throw new TypeError(`${label} is invalid`);
  }
  return value as T;
}

function parseOptionalBoundedString(value: unknown, label: string): string | undefined {
  if (value === undefined) return undefined;
  if (typeof value !== 'string' || value.trim().length === 0 || value.length > MAX_REASON_CHARS) {
    throw new TypeError(
      `${label} must be a non-empty string of at most ${MAX_REASON_CHARS} characters`,
    );
  }
  return value;
}

function requireNonAuthority(record: Record<string, unknown>, label: string): void {
  if (
    record.authorizesExecution !== false ||
    record.provesExecutionSuccess !== false ||
    record.retryAuthorized !== false
  ) {
    throw new TypeError(
      `${label} cannot carry authority, verified outcome, or retry authorization`,
    );
  }
}

export const InteractionInputSourceSchema = createRuntimeSchema<InteractionInputSource>((value) =>
  parseEnum<InteractionInputSource>(value, INPUT_SOURCES, 'InteractionInputSource'),
);

export const AuroraExperienceStateSchema = createRuntimeSchema<AuroraExperienceState>((value) =>
  parseEnum<AuroraExperienceState>(value, EXPERIENCE_STATES, 'AuroraExperienceState'),
);

export const VoiceRuntimeHealthStateSchema = createRuntimeSchema<VoiceRuntimeHealthState>((value) =>
  parseEnum<VoiceRuntimeHealthState>(value, VOICE_HEALTH_STATES, 'VoiceRuntimeHealthState'),
);

export const VoiceRuntimeComponentSchema = createRuntimeSchema<VoiceRuntimeComponent>((value) =>
  parseEnum<VoiceRuntimeComponent>(value, VOICE_COMPONENTS, 'VoiceRuntimeComponent'),
);

export const UnifiedInteractionInputSchema = createRuntimeSchema<UnifiedInteractionInput>(
  (value) => {
    const record = asRecord(value, 'UnifiedInteractionInput');
    assertExactKeys(
      record,
      [
        'kind',
        'schemaVersion',
        'tenantId',
        'correlationId',
        'interactionSessionId',
        'source',
        'modality',
        'content',
        'observedAt',
        'dataClassification',
        'authorizesExecution',
        'provesExecutionSuccess',
        'retryAuthorized',
      ],
      [
        'kind',
        'schemaVersion',
        'tenantId',
        'correlationId',
        'source',
        'modality',
        'content',
        'observedAt',
        'dataClassification',
        'authorizesExecution',
        'provesExecutionSuccess',
        'retryAuthorized',
      ],
      'UnifiedInteractionInput',
    );
    if (record.kind !== 'UNIFIED_INTERACTION_INPUT' || record.schemaVersion !== 1) {
      throw new TypeError('UnifiedInteractionInput kind/schemaVersion is invalid');
    }
    requireNonAuthority(record, 'UnifiedInteractionInput');
    const source = InteractionInputSourceSchema.parse(record.source);
    const modality = InteractionModalitySchema.parse(record.modality);
    if ((source === 'WAKE_WORD' || source === 'MANUAL_MIC') && modality === 'TEXT') {
      throw new TypeError('voice activation source cannot declare TEXT-only modality');
    }
    if (source === 'TEXT_INPUT' && modality === 'VOICE') {
      throw new TypeError('text input source cannot declare VOICE-only modality');
    }
    return Object.freeze({
      kind: 'UNIFIED_INTERACTION_INPUT',
      schemaVersion: 1,
      tenantId: TenantIdSchema.parse(record.tenantId),
      correlationId: CorrelationIdSchema.parse(record.correlationId),
      ...(record.interactionSessionId === undefined
        ? {}
        : {
            interactionSessionId: InteractionSessionIdSchema.parse(record.interactionSessionId),
          }),
      source,
      modality,
      content: InteractionTextContentSchema.parse(record.content),
      observedAt: Rfc3339TimestampSchema.parse(record.observedAt),
      dataClassification: DataClassificationSchema.parse(record.dataClassification),
      authorizesExecution: false,
      provesExecutionSuccess: false,
      retryAuthorized: false,
    });
  },
);

export const AuroraExperienceStateSnapshotSchema =
  createRuntimeSchema<AuroraExperienceStateSnapshot>((value) => {
    const record = asRecord(value, 'AuroraExperienceStateSnapshot');
    assertExactKeys(
      record,
      [
        'kind',
        'schemaVersion',
        'tenantId',
        'correlationId',
        'interactionSessionId',
        'state',
        'observedAt',
        'staleAfter',
        'reasonCode',
        'reasonReference',
        'dataClassification',
        'authorizesExecution',
        'provesExecutionSuccess',
        'retryAuthorized',
      ],
      [
        'kind',
        'schemaVersion',
        'tenantId',
        'correlationId',
        'state',
        'observedAt',
        'dataClassification',
        'authorizesExecution',
        'provesExecutionSuccess',
        'retryAuthorized',
      ],
      'AuroraExperienceStateSnapshot',
    );
    if (record.kind !== 'AURORA_EXPERIENCE_STATE' || record.schemaVersion !== 1) {
      throw new TypeError('AuroraExperienceStateSnapshot kind/schemaVersion is invalid');
    }
    requireNonAuthority(record, 'AuroraExperienceStateSnapshot');
    const reasonCode = parseOptionalBoundedString(record.reasonCode, 'reasonCode');
    const reasonReference = parseOptionalBoundedString(record.reasonReference, 'reasonReference');
    return Object.freeze({
      kind: 'AURORA_EXPERIENCE_STATE',
      schemaVersion: 1,
      tenantId: TenantIdSchema.parse(record.tenantId),
      correlationId: CorrelationIdSchema.parse(record.correlationId),
      ...(record.interactionSessionId === undefined
        ? {}
        : {
            interactionSessionId: InteractionSessionIdSchema.parse(record.interactionSessionId),
          }),
      state: AuroraExperienceStateSchema.parse(record.state),
      observedAt: Rfc3339TimestampSchema.parse(record.observedAt),
      ...(record.staleAfter === undefined
        ? {}
        : { staleAfter: Rfc3339TimestampSchema.parse(record.staleAfter) }),
      ...(reasonCode === undefined ? {} : { reasonCode }),
      ...(reasonReference === undefined ? {} : { reasonReference }),
      dataClassification: DataClassificationSchema.parse(record.dataClassification),
      authorizesExecution: false,
      provesExecutionSuccess: false,
      retryAuthorized: false,
    });
  });

export const VoiceRuntimeComponentHealthSchema = createRuntimeSchema<VoiceRuntimeComponentHealth>(
  (value) => {
    const record = asRecord(value, 'VoiceRuntimeComponentHealth');
    assertExactKeys(
      record,
      ['component', 'state', 'reasonCode'],
      ['component', 'state'],
      'VoiceRuntimeComponentHealth',
    );
    const reasonCode = parseOptionalBoundedString(record.reasonCode, 'reasonCode');
    return Object.freeze({
      component: VoiceRuntimeComponentSchema.parse(record.component),
      state: VoiceRuntimeHealthStateSchema.parse(record.state),
      ...(reasonCode === undefined ? {} : { reasonCode }),
    });
  },
);

export const VoiceRuntimeHealthSnapshotSchema = createRuntimeSchema<VoiceRuntimeHealthSnapshot>(
  (value) => {
    const record = asRecord(value, 'VoiceRuntimeHealthSnapshot');
    assertExactKeys(
      record,
      [
        'kind',
        'schemaVersion',
        'tenantId',
        'correlationId',
        'interactionSessionId',
        'state',
        'components',
        'observedAt',
        'dataClassification',
        'authorizesExecution',
        'provesExecutionSuccess',
        'retryAuthorized',
      ],
      [
        'kind',
        'schemaVersion',
        'tenantId',
        'correlationId',
        'state',
        'components',
        'observedAt',
        'dataClassification',
        'authorizesExecution',
        'provesExecutionSuccess',
        'retryAuthorized',
      ],
      'VoiceRuntimeHealthSnapshot',
    );
    if (record.kind !== 'VOICE_RUNTIME_HEALTH' || record.schemaVersion !== 1) {
      throw new TypeError('VoiceRuntimeHealthSnapshot kind/schemaVersion is invalid');
    }
    requireNonAuthority(record, 'VoiceRuntimeHealthSnapshot');
    if (!Array.isArray(record.components) || record.components.length > MAX_COMPONENTS) {
      throw new TypeError(`components must contain at most ${MAX_COMPONENTS} entries`);
    }
    const components = record.components.map((entry) =>
      VoiceRuntimeComponentHealthSchema.parse(entry),
    );
    if (new Set(components.map((entry) => entry.component)).size !== components.length) {
      throw new TypeError('components must not contain duplicate component identities');
    }
    const state = VoiceRuntimeHealthStateSchema.parse(record.state);
    if (state === 'HEALTHY' && components.some((entry) => entry.state !== 'HEALTHY')) {
      throw new TypeError('HEALTHY aggregate state cannot contain an unhealthy component');
    }
    return Object.freeze({
      kind: 'VOICE_RUNTIME_HEALTH',
      schemaVersion: 1,
      tenantId: TenantIdSchema.parse(record.tenantId),
      correlationId: CorrelationIdSchema.parse(record.correlationId),
      ...(record.interactionSessionId === undefined
        ? {}
        : {
            interactionSessionId: InteractionSessionIdSchema.parse(record.interactionSessionId),
          }),
      state,
      components: Object.freeze(components),
      observedAt: Rfc3339TimestampSchema.parse(record.observedAt),
      dataClassification: DataClassificationSchema.parse(record.dataClassification),
      authorizesExecution: false,
      provesExecutionSuccess: false,
      retryAuthorized: false,
    });
  },
);
