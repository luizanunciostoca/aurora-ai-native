import type { ActionIntent } from '@aurora/contracts/actions';
import type { CausationId, CommandId, ExecutionId } from '@aurora/contracts/ids';

import type { FailureContainmentSnapshot } from '../failure-containment/types.js';
import type { ExecutionQuotaSnapshot } from '../safeguards/types.js';
import type { ExecutableTargetBinding } from '../target-resolution/types.js';
import type {
  TrustedVoiceExecutionState,
  TrustedVoiceExecutionStateLookup,
  TrustedVoiceExecutionStateSource,
} from './dispatching-intake.js';

const MAX_ENTRIES = 256;
const MAX_BINDINGS = 32;
const MAX_KEY_LENGTH = 256;
const COMMAND_ID = /^cmd_[0-9A-HJKMNP-TV-Z]{26}$/u;
const EXECUTION_ID = /^exe_[0-9A-HJKMNP-TV-Z]{26}$/u;
const CAUSATION_ID = /^cau_[0-9A-HJKMNP-TV-Z]{26}$/u;
const SAFE_REFERENCE = /^[A-Za-z0-9._:/+-]{1,512}$/u;
const SHA256 = /^sha256:[a-f0-9]{64}$/u;

export interface PreissuedVoiceExecutionIdentity {
  readonly commandId: CommandId;
  readonly capabilityId: string;
  readonly executionId: ExecutionId;
  readonly causationId: CausationId;
  readonly orderingKey: string;
  readonly orderingSequence: number;
  readonly canonicalPayloadHash: string;
  readonly authorizesExecution: false;
}

export interface CurrentVoiceTargetBindingSource {
  resolve(request: {
    readonly actionIntent: ActionIntent;
    readonly tenantId: string;
    readonly actorIdentityId: string;
    readonly deviceId: string;
    readonly evaluatedAt: string;
  }): readonly ExecutableTargetBinding[] | null;
}

export interface CurrentVoiceSafeguardState {
  readonly attemptNumber: number;
  readonly maxAttempts: number;
  readonly quota?: ExecutionQuotaSnapshot;
  readonly authorizesExecution: false;
}

export interface CurrentVoiceSafeguardStateSource {
  resolve(request: {
    readonly actionIntent: ActionIntent;
    readonly tenantId: string;
    readonly evaluatedAt: string;
  }): CurrentVoiceSafeguardState | null;
}

export interface CurrentVoiceContainmentStateSource {
  resolve(request: {
    readonly actionIntent: ActionIntent;
    readonly tenantId: string;
    readonly evaluatedAt: string;
  }): FailureContainmentSnapshot | null;
}

export interface OwnerBackedVoiceExecutionStateSourceConfig {
  readonly identities: readonly PreissuedVoiceExecutionIdentity[];
  readonly targetBindings: CurrentVoiceTargetBindingSource;
  readonly safeguards: CurrentVoiceSafeguardStateSource;
  readonly containment: CurrentVoiceContainmentStateSource;
}

function key(commandId: string, capabilityId: string): string {
  return `${commandId}\u0000${capabilityId}`;
}

function boundedText(value: unknown, maximum = MAX_KEY_LENGTH): value is string {
  return (
    typeof value === 'string' &&
    value.length > 0 &&
    value.length <= maximum &&
    value === value.trim()
  );
}

function validIdentity(identity: PreissuedVoiceExecutionIdentity): boolean {
  return (
    identity.authorizesExecution === false &&
    COMMAND_ID.test(identity.commandId) &&
    boundedText(identity.capabilityId) &&
    EXECUTION_ID.test(identity.executionId) &&
    CAUSATION_ID.test(identity.causationId) &&
    SAFE_REFERENCE.test(identity.orderingKey) &&
    Number.isSafeInteger(identity.orderingSequence) &&
    identity.orderingSequence > 0 &&
    SHA256.test(identity.canonicalPayloadHash)
  );
}

function validSafeguardState(state: CurrentVoiceSafeguardState): boolean {
  if (
    state.authorizesExecution !== false ||
    !Number.isSafeInteger(state.attemptNumber) ||
    state.attemptNumber < 1 ||
    !Number.isSafeInteger(state.maxAttempts) ||
    state.maxAttempts < 1
  ) {
    return false;
  }
  if (state.quota === undefined) return true;
  return (
    Number.isSafeInteger(state.quota.limit) &&
    state.quota.limit > 0 &&
    Number.isSafeInteger(state.quota.used) &&
    state.quota.used >= 0
  );
}

function canonicalLookupMatches(lookup: TrustedVoiceExecutionStateLookup): boolean {
  const intent = lookup.actionIntent;
  const target = intent.executionTarget;
  return (
    lookup.candidate.commandId.length > 0 &&
    lookup.candidate.capabilityId === intent.capability.capability &&
    intent.tenant.tenantId === lookup.context.tenantId &&
    intent.actor.identityId === lookup.context.actorIdentityId &&
    intent.correlation.correlationId === lookup.context.correlationId &&
    target?.kind === 'DEVICE' &&
    target.bindingReference === lookup.context.deviceId &&
    Number.isFinite(Date.parse(lookup.evaluatedAt))
  );
}

/**
 * W07 server-side composition source over immutable command identity plus current owner snapshots.
 *
 * It has no default target, quota, attempt, circuit, kill-switch or dependency-health state. Every
 * resolve call re-reads those owners; missing/throwing state fails closed. This class never evaluates
 * authority itself and cannot turn W14/Android context into execution permission.
 */
export class OwnerBackedVoiceExecutionStateSource implements TrustedVoiceExecutionStateSource {
  readonly #identities: ReadonlyMap<string, PreissuedVoiceExecutionIdentity>;
  readonly #targetBindings: CurrentVoiceTargetBindingSource;
  readonly #safeguards: CurrentVoiceSafeguardStateSource;
  readonly #containment: CurrentVoiceContainmentStateSource;

  constructor(config: OwnerBackedVoiceExecutionStateSourceConfig) {
    if (config.identities.length === 0 || config.identities.length > MAX_ENTRIES) {
      throw new Error('Preissued voice execution identity count is invalid.');
    }
    const identities = new Map<string, PreissuedVoiceExecutionIdentity>();
    for (const identity of config.identities) {
      if (!validIdentity(identity)) throw new Error('Preissued voice execution identity is invalid.');
      const identityKey = key(identity.commandId, identity.capabilityId);
      if (identities.has(identityKey)) throw new Error('Duplicate preissued voice execution identity.');
      identities.set(identityKey, Object.freeze({ ...identity }));
    }
    this.#identities = identities;
    this.#targetBindings = config.targetBindings;
    this.#safeguards = config.safeguards;
    this.#containment = config.containment;
  }

  resolve(lookup: TrustedVoiceExecutionStateLookup): TrustedVoiceExecutionState | null {
    if (!canonicalLookupMatches(lookup)) return null;
    const identity = this.#identities.get(
      key(lookup.candidate.commandId, lookup.candidate.capabilityId),
    );
    if (identity === undefined) return null;

    let bindings: readonly ExecutableTargetBinding[] | null;
    let safeguards: CurrentVoiceSafeguardState | null;
    let containment: FailureContainmentSnapshot | null;
    try {
      bindings = this.#targetBindings.resolve({
        actionIntent: lookup.actionIntent,
        tenantId: lookup.context.tenantId,
        actorIdentityId: lookup.context.actorIdentityId,
        deviceId: lookup.context.deviceId,
        evaluatedAt: lookup.evaluatedAt,
      });
      safeguards = this.#safeguards.resolve({
        actionIntent: lookup.actionIntent,
        tenantId: lookup.context.tenantId,
        evaluatedAt: lookup.evaluatedAt,
      });
      containment = this.#containment.resolve({
        actionIntent: lookup.actionIntent,
        tenantId: lookup.context.tenantId,
        evaluatedAt: lookup.evaluatedAt,
      });
    } catch {
      return null;
    }
    if (
      bindings === null ||
      bindings.length === 0 ||
      bindings.length > MAX_BINDINGS ||
      safeguards === null ||
      !validSafeguardState(safeguards) ||
      containment === null
    ) {
      return null;
    }

    return {
      commandId: identity.commandId,
      executionId: identity.executionId,
      causationId: identity.causationId,
      orderingKey: identity.orderingKey,
      orderingSequence: identity.orderingSequence,
      canonicalPayloadHash: identity.canonicalPayloadHash,
      targetBindings: bindings,
      attemptNumber: safeguards.attemptNumber,
      maxAttempts: safeguards.maxAttempts,
      ...(safeguards.quota === undefined ? {} : { quota: safeguards.quota }),
      containment,
      authorizesExecution: false,
    };
  }
}
