import type {
  CorrelationContext,
  DataClassification,
  Deadline,
  ActorRef,
  TenantContext,
} from '../context/index';
import type { CommandId } from '../ids/types';
import type { ContractVersion } from '../versioning/types';
import type { EnvelopeMetadata } from './envelope-metadata';
import type { JsonValue } from './json-value';

export const COMMAND_ENVELOPE_KIND = 'COMMAND' as const;

export type CommandEnvelopeKind = typeof COMMAND_ENVELOPE_KIND;

declare const commandTypeBrand: unique symbol;

/**
 * Governed, namespaced command type. The wire value is a non-empty namespaced
 * string validated by the runtime schema; it is not a business-specific enum.
 */
export type CommandType = string & { readonly [commandTypeBrand]: true };

export interface CommandEnvelope<TPayload extends JsonValue = JsonValue> {
  readonly kind: CommandEnvelopeKind;
  readonly schemaVersion: ContractVersion;
  readonly commandId: CommandId;
  readonly commandType: CommandType;
  /** RFC3339 timestamp representing when the command was requested. */
  readonly requestedAt: string;
  /**
   * Canonical W01-D propagation context. It carries correlationId and, when
   * applicable, causation/reference information without redefining those
   * primitives in the envelope package.
   */
  readonly correlation: CorrelationContext;
  readonly tenant: TenantContext;
  readonly actor: ActorRef;
  readonly deadline?: Deadline;
  readonly dataClassification?: DataClassification;
  readonly payload: TPayload;
  readonly metadata?: EnvelopeMetadata;
}
